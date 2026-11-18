use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    io,
    net::{Ipv4Addr, SocketAddr},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpSocket, TcpStream},
    time::{sleep, timeout},
};

#[derive(Clone, Default, PartialEq)]
pub struct Snapshot {
    pub inputs: Option<String>,
    pub outputs: Option<String>,
}

pub async fn poll(ip: Ipv4Addr, latest: Arc<Mutex<Snapshot>>) {
    loop {
        let _ = read_session(ip, &latest).await;
        sleep(Duration::from_secs(2)).await;
    }
}

async fn read_session(ip: Ipv4Addr, latest: &Mutex<Snapshot>) -> io::Result<()> {
    let socket = TcpSocket::new_v4()?;
    if ip.is_loopback() {
        socket.bind(SocketAddr::from((ip, 0)))?;
    }
    let mut peer = timeout(
        Duration::from_secs(2),
        socket.connect(SocketAddr::from((ip, 44818))),
    )
    .await??;
    peer.set_nodelay(true)?;
    let registration = exchange(&mut peer, 0x65, 0, &[1, 0, 0, 0]).await?;
    let session = u32::from_le_bytes(registration[4..8].try_into().unwrap());
    if session == 0 {
        return Err(io::Error::other("Empty EtherNet/IP session"));
    }
    loop {
        let inputs = read_assembly(&mut peer, session, 100).await?;
        let outputs = read_assembly(&mut peer, session, 101).await?;
        let interval = if inputs.is_none() && outputs.is_none() {
            2000
        } else {
            50
        };
        {
            let mut snapshot = latest.lock().unwrap();
            if let Some(value) = inputs {
                snapshot.inputs = Some(value);
            }
            if let Some(value) = outputs {
                snapshot.outputs = Some(value);
            }
        }
        sleep(Duration::from_millis(interval)).await;
    }
}

// Get Attribute Single only. The existing PLC retains ownership of the assemblies.
async fn read_assembly(
    peer: &mut TcpStream,
    session: u32,
    instance: u8,
) -> io::Result<Option<String>> {
    let body = [
        0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0xb2, 0, 8, 0, 0x0e, 3, 0x20, 4, 0x24, instance, 0x30,
        3,
    ];
    let reply = exchange(peer, 0x6f, session, &body).await?;
    let Some(items) = reply.get(30..32) else {
        return Ok(None);
    };
    let mut offset = 32;
    for _ in 0..u16::from_le_bytes(items.try_into().unwrap()) {
        let Some(header) = reply.get(offset..offset + 4) else {
            break;
        };
        let kind = u16::from_le_bytes(header[..2].try_into().unwrap());
        let length = u16::from_le_bytes(header[2..].try_into().unwrap()) as usize;
        offset += 4;
        let Some(data) = reply.get(offset..offset + length) else {
            break;
        };
        if kind == 0xb2 {
            return Ok(match data {
                [0x8e, _, 0, extra, payload @ ..] => payload
                    .get(2 * *extra as usize..)
                    .filter(|bytes| bytes.len() == 256)
                    .map(|bytes| STANDARD.encode(bytes)),
                _ => None,
            });
        }
        offset += length;
    }
    Ok(None)
}

async fn exchange(
    peer: &mut TcpStream,
    command: u16,
    session: u32,
    body: &[u8],
) -> io::Result<Vec<u8>> {
    timeout(Duration::from_secs(1), async {
        let mut request = vec![0; 24];
        request[..2].copy_from_slice(&command.to_le_bytes());
        request[2..4].copy_from_slice(&(body.len() as u16).to_le_bytes());
        request[4..8].copy_from_slice(&session.to_le_bytes());
        request.extend_from_slice(body);
        peer.write_all(&request).await?;
        let mut reply = vec![0; 24];
        peer.read_exact(&mut reply).await?;
        let length = u16::from_le_bytes(reply[2..4].try_into().unwrap()) as usize;
        if reply[..2] != command.to_le_bytes() || reply[8..12] != [0; 4] || length > 4096 {
            return Err(io::Error::other("Invalid EtherNet/IP response"));
        }
        reply.resize(24 + length, 0);
        peer.read_exact(&mut reply[24..]).await?;
        Ok(reply)
    })
    .await?
}
