mod fieldbus;
mod outbox;
mod pipes;
mod sdk;
mod worker;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Request, State,
    },
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use outbox::Outbox;
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    env,
    error::Error,
    io,
    net::Ipv4Addr,
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::{net::TcpListener, sync::watch, time::timeout};
use worker::{Command, Connection, Worker, DEFAULT_INTERVAL};

const SERVICE: &str = "InoRobotVirtualControllerBridge";
const VERSION: &str = "2.0";
const MAX_MESSAGE: usize = 64 * 1024;

type Slots = Mutex<[Option<Arc<Mutex<Connection>>>; 64]>;

struct App {
    sdk: Arc<sdk::Sdk>,
    token: String,
    origins: HashSet<String>,
    allow_real: bool,
    slots: Arc<Slots>,
    shutdown: watch::Sender<bool>,
}

struct Slot {
    slots: Arc<Slots>,
    id: usize,
}
impl Drop for Slot {
    fn drop(&mut self) {
        self.slots.lock().unwrap()[self.id] = None;
    }
}
impl App {
    fn reserve(&self, connection: Arc<Mutex<Connection>>) -> Option<Slot> {
        let mut slots = self.slots.lock().unwrap();
        let id = slots.iter().position(Option::is_none)?;
        slots[id] = Some(connection);
        Some(Slot {
            slots: Arc::clone(&self.slots),
            id,
        })
    }
    fn allows(&self, origin: &str) -> bool {
        self.origins
            .contains(&origin.trim_end_matches('/').to_ascii_lowercase())
    }
}

fn token() -> Result<String, io::Error> {
    if let Ok(token) = env::var("INOROBOT_BRIDGE_TOKEN") {
        if !token.trim().is_empty() {
            return Ok(token.trim().to_owned());
        }
    }
    let mut bytes = [0; 32];
    getrandom::fill(&mut bytes).map_err(|error| io::Error::other(error.to_string()))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
fn origins() -> HashSet<String> {
    let defaults = "https://inovancerobot.com,https://www.inovancerobot.com,http://127.0.0.1:8765,http://localhost:8765,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8775,http://localhost:8775";
    let configured = env::var("INOROBOT_BRIDGE_ORIGINS").unwrap_or_default();
    let list = if configured.trim().is_empty() {
        defaults
    } else {
        &configured
    };
    list.split(',')
        .map(|item| item.trim().trim_end_matches('/').to_ascii_lowercase())
        .filter(|item| !item.is_empty())
        .collect()
}

#[cfg(windows)]
fn register_launch_protocol(exe: &std::path::Path) -> io::Result<()> {
    use std::{ffi::OsString, os::windows::process::CommandExt, path::PathBuf};

    const KEY: &str = r"HKCU\Software\Classes\inorobot-vc-bridge";
    const COMMAND_KEY: &str = r"HKCU\Software\Classes\inorobot-vc-bridge\shell\open\command";
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let reg = PathBuf::from(
        env::var_os("SystemRoot").ok_or_else(|| io::Error::other("Missing Windows system directory."))?,
    )
    .join(r"System32\reg.exe");
    let mut command = OsString::from("\"");
    command.push(exe.as_os_str());
    command.push("\"");

    for (key, value, data) in [
        (KEY, &["/ve"][..], OsString::from("URL:InoRobot Controller Bridge")),
        (KEY, &["/v", "URL Protocol"][..], OsString::new()),
        (COMMAND_KEY, &["/ve"][..], command),
    ] {
        let output = std::process::Command::new(&reg)
            .creation_flags(CREATE_NO_WINDOW)
            .args(["add", key])
            .args(value)
            .arg("/d")
            .arg(data)
            .arg("/f")
            .output()?;
        if !output.status.success() {
            return Err(io::Error::other(String::from_utf8_lossy(&output.stderr).trim()));
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let headless = env::args().any(|arg| arg == "--headless");
    let port = match env::var("INOROBOT_BRIDGE_TEST_PORT") {
        Ok(value) if headless => value
            .parse::<u16>()
            .ok()
            .filter(|port| *port >= 1024)
            .ok_or_else(|| io::Error::other("Invalid local test bridge port."))?,
        _ => 5055,
    };
    let exe = env::current_exe()?;
    let sdk = sdk::Sdk::load(
        exe.parent()
            .ok_or_else(|| io::Error::other("Missing executable directory."))?,
    )?;
    let listen = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
    #[cfg(windows)]
    if !headless {
        if let Err(error) = register_launch_protocol(&exe) {
            eprintln!("Browser launch registration failed: {error}");
        }
    }
    let (shutdown, mut stopping) = watch::channel(false);
    let app = Arc::new(App {
        sdk: Arc::new(sdk),
        token: token()?,
        origins: origins(),
        allow_real: !env::var("INOROBOT_ALLOW_REAL_CONTROLLER")
            .is_ok_and(|value| value.trim().eq_ignore_ascii_case("false")),
        slots: Arc::new(Mutex::new(std::array::from_fn(|_| None))),
        shutdown,
    });
    let router = Router::new()
        .route("/api/health", get(health))
        .route("/ws", get(websocket))
        .layer(middleware::from_fn_with_state(
            Arc::clone(&app),
            origin_policy,
        ))
        .with_state(Arc::clone(&app));
    println!("InoRobot Rust Controller Bridge listening on 127.0.0.1:{port}");
    axum::serve(listen, router)
        .with_graceful_shutdown(async move {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => { app.shutdown.send_replace(true); },
                _ = stopping.wait_for(|value| *value) => (),
            }
            // Native calls cannot be cancelled mid-call. Give active sessions a
            // chance to close their SDK connections before finishing shutdown.
            let _ = timeout(Duration::from_secs(6), async {
                while app.slots.lock().unwrap().iter().any(Option::is_some) {
                    tokio::time::sleep(Duration::from_millis(20)).await;
                }
            })
            .await;
        })
        .await?;
    Ok(())
}

async fn origin_policy(State(app): State<Arc<App>>, request: Request, next: Next) -> Response {
    let origin = request.headers().get(header::ORIGIN).cloned();
    let allowed = origin
        .as_ref()
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| app.allows(value));
    if origin.is_some() && !allowed || request.method() == Method::OPTIONS && !allowed {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = if request.method() == Method::OPTIONS {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(request).await
    };
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    if let Some(origin) = origin {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, OPTIONS"),
        );
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("Content-Type"),
        );
        headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    }
    response
}

async fn health(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    if !headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| app.allows(value))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let slots = app.slots.lock().unwrap();
    Json(json!({"service":SERVICE,"version":VERSION,"implementation":"rust","configured":true,
        "connected":slots.iter().flatten().any(|connection| connection.lock().unwrap().connected),
        "connectionCount":slots.iter().flatten().count(),"controllerPort":2222,"sampleIntervalMs":DEFAULT_INTERVAL,
        "conveyorTrackingVersion":1,"pairingToken":app.token})).into_response()
}

async fn websocket(State(app): State<Arc<App>>, upgrade: WebSocketUpgrade) -> Response {
    upgrade
        .max_message_size(MAX_MESSAGE)
        .max_frame_size(MAX_MESSAGE)
        .on_upgrade(move |socket| session(socket, app))
}

fn authenticated(text: &str, token: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return false;
    };
    let Some(supplied) = value["token"].as_str() else {
        return false;
    };
    value["type"] == "hello"
        && token.len() == supplied.len()
        && token
            .bytes()
            .zip(supplied.bytes())
            .fold(0, |bits, (a, b)| bits | (a ^ b))
            == 0
}

async fn session(mut socket: WebSocket, app: Arc<App>) {
    if !matches!(timeout(Duration::from_secs(10), socket.recv()).await,
        Ok(Some(Ok(Message::Text(text)))) if authenticated(&text, &app.token))
    {
        let _ = timeout(
            Duration::from_secs(1),
            socket.send(Message::Close(Some(axum::extract::ws::CloseFrame {
                code: 1008,
                reason: "Pairing required".into(),
            }))),
        )
        .await;
        return;
    }
    let connection = Arc::new(Mutex::new(Connection::default()));
    let Some(slot) = app.reserve(Arc::clone(&connection)) else {
        let _ = socket
            .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                code: 1011,
                reason: "No controller session slots available".into(),
            })))
            .await;
        return;
    };
    let out = Arc::new(Outbox::default());
    let (commands, incoming) = mpsc::sync_channel(16);
    let engine = Worker {
        id: slot.id as i32,
        sdk: Arc::clone(&app.sdk),
        out: Arc::clone(&out),
        connection: Arc::clone(&connection),
        runtime: tokio::runtime::Handle::current(),
        allow_real: app.allow_real,
    };
    if std::thread::Builder::new()
        .name(format!("imc100-{}", slot.id))
        .spawn(move || {
            let _slot = slot;
            engine.run(incoming);
        })
        .is_err()
    {
        return;
    }
    out.send(
        json!({"type":"bridgeReady","version":VERSION,"sampleIntervalMs":DEFAULT_INTERVAL}),
        true,
    );

    let (mut sender, receiver) = socket.split();
    let mut shutdown = app.shutdown.subscribe();
    let writing = async {
        let mut heartbeat = tokio::time::interval_at(
            tokio::time::Instant::now() + Duration::from_secs(15),
            Duration::from_secs(15),
        );
        loop {
            let (message, stop) = tokio::select! {
                _ = heartbeat.tick() => (Message::Ping(Vec::new().into()), false),
                value = out.receive() => match value {
                    Some(value) => {
                        let stop = value["type"] == "shutdownResult" && value["success"] == true;
                        (Message::Text(value.to_string().into()), stop)
                    }
                    None => break,
                }
            };
            let result = timeout(Duration::from_secs(2), sender.send(message)).await;
            if stop {
                app.shutdown.send_replace(true);
                break;
            }
            if !matches!(result, Ok(Ok(()))) {
                break;
            }
        }
    };
    tokio::select! {
        _ = reading(receiver, commands, &out, &connection) => (),
        _ = writing => (),
        _ = shutdown.wait_for(|value| *value) => (),
    }
    out.close();
}

fn bounded(value: &Value, name: &str, max: u64) -> Result<u64, String> {
    value[name]
        .as_u64()
        .filter(|n| *n <= max)
        .ok_or_else(|| format!("Invalid {name}."))
}

async fn reading(
    mut receiver: futures_util::stream::SplitStream<WebSocket>,
    commands: mpsc::SyncSender<Command>,
    out: &Outbox,
    connection: &Mutex<Connection>,
) {
    let mut count = 0;
    let mut window = Instant::now();
    let mut conveyor = pipes::Conveyor::default();
    while let Some(Ok(message)) = receiver.next().await {
        let text = match message {
            Message::Text(text) => text,
            Message::Ping(_) | Message::Pong(_) => continue,
            _ => break,
        };
        if window.elapsed() >= Duration::from_secs(1) {
            window = Instant::now();
            count = 0;
        }
        count += 1;
        if count > 100 {
            out.send(
                json!({"type":"error","message":"Command rate limit exceeded."}),
                true,
            );
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            out.send(
                json!({"type":"error","message":"Invalid command JSON."}),
                true,
            );
            continue;
        };
        let ip = connection.lock().unwrap().local_virtual;
        let result = route_command(&value, ip, &mut conveyor, out).await;
        match result {
            Ok(Some(command)) => {
                if commands.try_send(command).is_err() {
                    out.send(
                        json!({"type":"error","message":"Controller command queue is full."}),
                        true,
                    );
                }
            }
            Ok(None) => (),
            Err(message) => out.send(json!({"type":"error","message":message}), true),
        }
    }
}

async fn route_command(
    value: &Value,
    local: Option<Ipv4Addr>,
    conveyor: &mut pipes::Conveyor,
    out: &Outbox,
) -> Result<Option<Command>, String> {
    let kind = value["type"].as_str().ok_or("Command type is required.")?;
    let command = match kind {
        "connect" => {
            let ip = value["ip"]
                .as_str()
                .and_then(|ip| ip.parse::<Ipv4Addr>().ok());
            let mode = value["controllerKind"]
                .as_str()
                .unwrap_or("virtual")
                .trim()
                .to_ascii_lowercase();
            if let Some(ip) = ip.filter(|_| matches!(mode.as_str(), "virtual" | "real")) {
                conveyor.release();
                Command::Connect {
                    ip,
                    real: mode == "real",
                }
            } else {
                out.send(json!({"type":"connectResult","success":false,"message":
                    if ip.is_none() { "A valid IPv4 controller address is required." } else { "Controller kind must be virtual or real." }}), true);
                return Ok(None);
            }
        }
        "startStream" | "startTrace" => {
            let interval = if value.get("interval").is_none() {
                DEFAULT_INTERVAL
            } else {
                bounded(value, "interval", 1000)?
            };
            if interval == 0 {
                return Err("Invalid interval.".into());
            }
            Command::Start(interval)
        }
        "stopStream" | "stopTrace" => Command::Stop,
        "disconnect" => {
            conveyor.release();
            Command::Disconnect
        }
        "status" => Command::Status,
        "readInterferenceZone" => Command::Zone(bounded(value, "zoneNumber", 255)? as i32),
        "readInterferenceTool" => Command::Tool(bounded(value, "toolNumber", 255)? as i32),
        "shutdown" if value["allowShutdown"] == true => {
            conveyor.release();
            Command::Shutdown
        }
        "shutdown" => {
            out.send(json!({"type":"shutdownResult","success":false,"message":"Explicit shutdown permission is required."}), true);
            return Ok(None);
        }
        "readStandardInput" | "readStandardInputs" | "setStandardInput" => {
            let request = value["requestId"].as_str().unwrap_or("");
            let result = async {
                let ip = local.ok_or("Connect a local K14 virtual controller first.")?;
                if !(1..=80).contains(&request.encode_utf16().count()) {
                    return Err("A bounded requestId is required.".into());
                }
                let address = bounded(value, "address", 64)? as u32;
                let next = if kind == "setStandardInput" {
                    Some(bounded(value, "value", 1)? as u32)
                } else {
                    None
                };
                pipes::standard_inputs(ip, address, next)
                    .await
                    .map_err(|error| error.to_string())
            }
            .await;
            let reply = match result {
                Ok(mut data) => {
                    data["type"] = json!("standardInputResult");
                    data["requestId"] = json!(request);
                    data["success"] = json!(true);
                    data
                }
                Err(message) => {
                    json!({"type":"standardInputResult","requestId":request,"success":false,"address":0,
                    "message":format!("K14 입력 연결 실패: {message}")})
                }
            };
            out.send(reply, true);
            return Ok(None);
        }
        "conveyorFrame" => {
            let reply = match local {
                Some(ip) => conveyor.send(ip, &value["frame"]).await,
                None => Err(
                    "Connect a local K14 virtual controller before sending conveyor inputs.".into(),
                ),
            };
            out.send(
                reply.unwrap_or_else(|message| {
                    conveyor.release();
                    json!({"type":"conveyorFrameResult","success":false,"message":message})
                }),
                true,
            );
            return Ok(None);
        }
        "conveyorRelease" => {
            conveyor.release();
            out.send(json!({"type":"conveyorReleaseResult","success":true}), true);
            return Ok(None);
        }
        _ => return Err(format!("Unsupported command: {kind}")),
    };
    Ok(Some(command))
}
