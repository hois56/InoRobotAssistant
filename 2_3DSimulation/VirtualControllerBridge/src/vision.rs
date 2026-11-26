use super::*;
use std::process::Stdio;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
    sync::Semaphore,
};

static SESSIONS: Semaphore = Semaphore::const_new(16);

pub async fn websocket(State(app): State<Arc<App>>, upgrade: WebSocketUpgrade) -> Response {
    upgrade
        .max_message_size(128 * 1024)
        .on_upgrade(move |socket| session(socket, app))
}

async fn session(mut socket: WebSocket, app: Arc<App>) {
    if !pair(&mut socket, &app).await {
        return;
    }
    let Ok(_slot) = SESSIONS.try_acquire() else {
        report(&mut socket, "Too many virtual vision sessions.").await;
        return;
    };
    let Ok(path) = env::current_exe() else { return };
    let vision = path.with_file_name("vision");
    let mut command = Command::new(vision.join("node.exe"));
    command.arg(vision.join("worker.cjs")).env_remove("NODE_OPTIONS").env_remove("NODE_PATH");
    if !app.allow_real {
        command.arg("--loopback-only");
    }
    let Ok(mut child) = command.creation_flags(0x08000000)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .kill_on_drop(true).spawn() else {
        report(&mut socket, "Extract the complete bridge ZIP and run the bridge again.").await;
        return;
    };
    let mut input = child.stdin.take().unwrap();
    let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
    let (mut sender, mut receiver) = socket.split();
    let mut shutdown = app.shutdown.subscribe();
    let receive = async {
        while let Some(Ok(message)) = receiver.next().await {
            match message {
                Message::Text(text) => {
                    // Compact valid JSON so each pipe record is exactly one line.
                    let Ok(message) = serde_json::from_str::<Value>(&text) else { break };
                    if message["type"] == "goodbye" { break; }
                    if input.write_all(format!("{message}\n").as_bytes()).await.is_err() { break; }
                }
                Message::Close(_) | Message::Binary(_) => break,
                _ => (),
            }
        }
    };
    let send = async {
        while let Ok(Some(line)) = lines.next_line().await {
            if !matches!(timeout(Duration::from_secs(3), sender.send(Message::Text(line.into()))).await, Ok(Ok(()))) {
                break;
            }
        }
    };
    tokio::select! {
        _ = receive => (),
        _ = send => (),
        _ = shutdown.wait_for(|value| *value) => (),
    }
    // EOF lets EtherNet/IP send Forward_Close before releasing its sockets.
    drop(input);
    let _ = timeout(Duration::from_secs(1), child.wait()).await;
}

async fn report(socket: &mut WebSocket, reason: &str) {
    let message = json!({"type":"status", "status":{"state":"error","message":reason}});
    let _ = socket.send(Message::Text(message.to_string().into())).await;
}
