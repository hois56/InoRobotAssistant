use super::*;
use std::net::SocketAddr;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::{broadcast, mpsc as channel, Semaphore},
    task::JoinSet,
};

mod eip;
static SESSIONS: Semaphore = Semaphore::const_new(16);
type Events = channel::Sender<Value>;
type Commands = broadcast::Receiver<Value>;
fn invalid() -> io::Error {
    io::Error::other("Invalid vision configuration or packet")
}
fn number(v: &Value, key: &str, default: u64, max: u64) -> u64 {
    v[key].as_u64().unwrap_or(default).min(max)
}
async fn emit(out: &Events, event: Value) -> io::Result<()> {
    out.send(event)
        .await
        .map_err(|_| io::Error::other("Session closed"))
}
async fn status(out: &Events, c: &Value, state: &str, message: &str) -> io::Result<()> {
    let mut s = c.clone();
    s["state"] = json!(state);
    s["message"] = json!(message);
    emit(out, json!({"type":"status","status":s})).await
}
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
        return;
    };
    let mut shutdown = app.shutdown.subscribe();
    let (commands, _) = broadcast::channel(128);
    let (mut sender, mut receiver) = socket.split();
    if sender
        .send(Message::Text(
            json!({"type":"ready","version":1,"protocol":"inorobot-virtual-vision"})
                .to_string()
                .into(),
        ))
        .await
        .is_err()
    {
        return;
    }
    let mut jobs = JoinSet::new();
    let (_, mut incoming) = channel::channel::<Value>(128);
    loop {
        tokio::select! {
            _=shutdown.changed()=>break,
            Some(v)=incoming.recv()=>if !matches!(timeout(Duration::from_secs(3),sender.send(Message::Text(v.to_string().into()))).await,Ok(Ok(()))){break},
            frame=receiver.next()=>{
                let raw=match frame{Some(Ok(Message::Text(raw)))=>raw,Some(Ok(Message::Ping(_)|Message::Pong(_)))=>continue,_=>break};
                let Ok(v)=serde_json::from_str::<Value>(&raw) else{break};
                match v["type"].as_str(){
                    Some("configure"|"stop")=>{
                        stop(&commands,&mut jobs).await;
                        let (events,new_incoming)=channel::channel::<Value>(128); incoming=new_incoming;
                        if v["type"]=="stop"{let _=status(&events,&json!({}),"stopped","").await;continue}
                        let c=v["config"].clone();let out=events.clone();let rx=commands.subscribe();let allow_real=app.allow_real;
                        jobs.spawn(async move{if let Err(e)=endpoint(&c,&out,rx,allow_real).await{let _=status(&out,&c,"error",&e.to_string()).await;}});
                    }
                    Some("results"|"text")=>{let _=commands.send(v);}
                    Some("goodbye")=>break,
                    _=>()
                }
            }
        }
    }
    stop(&commands, &mut jobs).await;
}
async fn stop(commands: &broadcast::Sender<Value>, jobs: &mut JoinSet<()>) {
    let _ = commands.send(json!({"type":"stop"}));
    let _ = timeout(Duration::from_millis(350), jobs.join_next()).await;
    jobs.shutdown().await;
}
async fn endpoint(c: &Value, out: &Events, rx: Commands, allow_real: bool) -> io::Result<()> {
    let server = match c["role"].as_str() {
        Some("server") => true,
        Some("client") => false,
        _ => return Err(invalid()),
    };
    let bind: Ipv4Addr = c["bindIp"]
        .as_str()
        .ok_or_else(invalid)?
        .parse()
        .map_err(|_| invalid())?;
    let target: Ipv4Addr = c["targetIp"]
        .as_str()
        .unwrap_or("127.0.0.1")
        .parse()
        .map_err(|_| invalid())?;
    if !allow_real && (!bind.is_loopback() || !server && !target.is_loopback()) {
        return Err(io::Error::other("Loopback addresses required"));
    }
    let port = number(
        c,
        if server { "port" } else { "targetPort" },
        if c["protocol"] == "socket" {
            5000
        } else {
            44818
        },
        65535,
    ) as u16;
    if c["protocol"] == "eip" {
        return eip::run(c, out, rx, bind, target, port, server).await;
    }
    if c["protocol"] != "socket" {
        return Err(invalid());
    }
    if !server {
        let peer = fieldbus::connect(Some(bind), target, port).await?;
        status(out, c, "connected", "").await?;
        text_peer(peer, out, rx, c["terminator"] == "lab").await?;
        return status(out, c, "stopped", "").await;
    }
    let listener = TcpListener::bind((bind, port)).await?;
    status(out, c, "listening", "").await?;
    let mut peers = JoinSet::new();
    loop {
        tokio::select! {
            pair=listener.accept(),if peers.len()<64=>{
                let (peer,_)=pair?;let out=out.clone();let lab=c["terminator"]=="lab";let rx=rx.resubscribe();
                status(&out,c,"connected","").await?;
                peers.spawn(async move{text_peer(peer,&out,rx,lab).await});
            }
            Some(_)=peers.join_next()=>if peers.is_empty(){status(out,c,"listening","").await?}
        }
    }
}
async fn text_peer(
    mut peer: TcpStream,
    out: &Events,
    mut rx: Commands,
    lab: bool,
) -> io::Result<()> {
    peer.set_nodelay(true)?;
    let id = peer.peer_addr()?.to_string();
    let mut buf = [0; 4096];
    let mut pending = Vec::new();
    let mut deadline = tokio::time::Instant::now();
    loop {
        tokio::select! {
            n=peer.read(&mut buf)=>{
                let n=n?;if n==0{return Ok(())}frame(out,"rx",&buf[..n]).await?;
                for &b in &buf[..n]{if b==13||b==10||lab&&b==b'V'{send_text(out,&id,&mut pending).await?}else{pending.push(b);if pending.len()>65536{return Err(invalid())}}}
                deadline=tokio::time::Instant::now()+Duration::from_millis(15);
            }
            _=tokio::time::sleep_until(deadline),if !pending.is_empty()=>send_text(out,&id,&mut pending).await?,
            msg=rx.recv()=>{let v=msg.map_err(|_|invalid())?;if v["type"]=="text" && v["peer"].as_str().is_none_or(|p|p==id){let payload=v["text"].as_str().unwrap_or("").as_bytes();peer.write_all(payload).await?;frame(out,"tx",payload).await?}}
        }
    }
}
async fn frame(out: &Events, direction: &str, data: &[u8]) -> io::Result<()> {
    let hex = data
        .iter()
        .take(80)
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join(" ");
    emit(out,json!({"type":"frame","frame":{"kind":"text","direction":direction,"summary":"","bytes":data.len(),"hex":hex}})).await
}
async fn send_text(out: &Events, id: &str, pending: &mut Vec<u8>) -> io::Result<()> {
    if !pending.is_empty() {
        let text = String::from_utf8_lossy(pending)
            .trim_end_matches('\0')
            .to_owned();
        pending.clear();
        if !text.trim().is_empty() {
            emit(out, json!({"type":"text","text":text,"peer":id})).await?
        }
    }
    Ok(())
}
