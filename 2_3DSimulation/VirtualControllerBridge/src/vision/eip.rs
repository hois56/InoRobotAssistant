use super::*;
use tokio::net::UdpSocket;
use tokio::time::{interval, Instant};

fn word(b: &[u8], i: usize) -> io::Result<u16> {
    Ok(u16::from_le_bytes(
        b.get(i..i + 2).ok_or_else(invalid)?.try_into().unwrap(),
    ))
}
fn dword(b: &[u8], i: usize) -> io::Result<u32> {
    Ok(u32::from_le_bytes(
        b.get(i..i + 4).ok_or_else(invalid)?.try_into().unwrap(),
    ))
}
fn random() -> io::Result<u32> {
    let mut b = [0; 4];
    getrandom::fill(&mut b).map_err(|_| invalid())?;
    Ok(u32::from_le_bytes(b).max(1))
}
fn cpf(items: &[(u16, &[u8])]) -> Vec<u8> {
    let mut v = (items.len() as u16).to_le_bytes().to_vec();
    for &(kind, data) in items {
        v.extend(kind.to_le_bytes());
        v.extend((data.len() as u16).to_le_bytes());
        v.extend(data)
    }
    v
}
fn item(b: &[u8], kind: u16) -> Option<&[u8]> {
    let mut i = 2;
    for _ in 0..word(b, 0).ok()? {
        let k = word(b, i).ok()?;
        let n = word(b, i + 2).ok()? as usize;
        i += 4;
        let data = b.get(i..i + n)?;
        if k == kind {
            return Some(data);
        }
        i += n
    }
    None
}
fn rr(cip: &[u8], address: Option<(u16, &[u8])>) -> Vec<u8> {
    let mut v = vec![0; 6];
    let mut items = vec![(0, &[][..]), (0xb2, cip)];
    if let Some(a) = address {
        items.push(a)
    }
    v.extend(cpf(&items));
    v
}
fn identity() -> Vec<u8> {
    let name = b"InoRobot Virtual Vision";
    let mut data = vec![0, 4, 0x2b, 0, 1, 0, 1, 0, 0, 0];
    data.extend(0x56495331u32.to_le_bytes());
    data.push(name.len() as u8);
    data.extend(name);
    data
}
fn sockaddr(ip: Ipv4Addr, port: u16) -> [u8; 16] {
    let mut a = [0; 16];
    a[1] = 2;
    a[2..4].copy_from_slice(&port.to_be_bytes());
    a[4..8].copy_from_slice(&ip.octets());
    a
}
fn udp_port(cpf: &[u8], kind: u16) -> Option<u16> {
    let a = item(cpf, kind)?;
    Some(u16::from_be_bytes(a.get(2..4)?.try_into().ok()?))
}
struct Image {
    bytes: Vec<u8>,
    result: usize,
    command: usize,
    count: usize,
    previous: Vec<u16>,
}
impl Image {
    fn new(c: &Value) -> Self {
        Self {
            bytes: vec![0; (number(&c["eip"], "size", 256, 496) as usize).max(2) & !1],
            result: number(c, "resultIndex", 68, 128) as usize,
            command: number(c, "commandIndex", 68, 128) as usize,
            count: number(c, "commandWords", 8, 128) as usize,
            previous: Vec::new(),
        }
    }
    fn update(&mut self, v: &Value) {
        if let Some(words) = v["words"].as_array() {
            for (dst, w) in self.bytes.chunks_exact_mut(2).skip(self.result).zip(words) {
                dst.copy_from_slice(&(w.as_u64().unwrap_or(0) as u16).to_le_bytes())
            }
        }
    }
    async fn receive(&mut self, data: &[u8], out: &Events) -> io::Result<()> {
        let words: Vec<_> = data
            .chunks_exact(2)
            .skip(self.command)
            .take(self.count)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .collect();
        if self.previous != words {
            emit(out, json!({"type":"commands","words":words})).await?;
            self.previous = words
        }
        Ok(())
    }
}
struct Cycle {
    addr: SocketAddr,
    tx: u32,
    rx: u32,
    sequence: u32,
    last: Instant,
    timeout: Duration,
    header_rx: bool,
    header_tx: bool,
}
impl Cycle {
    async fn send(&mut self, udp: &UdpSocket, image: &Image) -> io::Result<()> {
        if self.last.elapsed() > self.timeout {
            return Err(io::Error::other("EtherNet/IP I/O timeout"));
        }
        self.sequence = self.sequence.wrapping_add(1);
        let mut a = self.tx.to_le_bytes().to_vec();
        a.extend(self.sequence.to_le_bytes());
        let mut data = (self.sequence as u16).to_le_bytes().to_vec();
        if self.header_tx {
            data.extend(1u32.to_le_bytes())
        }
        data.extend(&image.bytes);
        udp.send_to(&cpf(&[(0x8002, &a), (0xb1, &data)]), self.addr)
            .await?;
        Ok(())
    }
    async fn receive(
        &mut self,
        b: &[u8],
        addr: SocketAddr,
        image: &mut Image,
        out: &Events,
    ) -> io::Result<()> {
        if addr.ip() != self.addr.ip()
            || item(b, 0x8002).and_then(|a| dword(a, 0).ok()) != Some(self.rx)
        {
            return Ok(());
        }
        if let Some(data) = item(b, 0xb1) {
            let prefix = if self.header_rx { 6 } else { 2 };
            if data.len() == prefix + image.bytes.len() {
                self.last = Instant::now();
                if !self.header_rx || data[2] & 1 != 0 {
                    image.receive(&data[prefix..], out).await?
                }
            }
        }
        Ok(())
    }
}
pub(super) async fn run(
    c: &Value,
    out: &Events,
    mut rx: Commands,
    bind: Ipv4Addr,
    target: Ipv4Addr,
    port: u16,
    server: bool,
) -> io::Result<()> {
    let e = &c["eip"];
    let local_port = number(e, "udpPort", 2222, 65535) as u16;
    let udp = UdpSocket::bind((
        bind,
        if !server && e["mode"] == "explicit" {
            0
        } else {
            local_port
        },
    ))
    .await?;
    let mut image = Image::new(c);
    let input = number(e, "inputInstance", 100, 255) as u8;
    let output = number(e, "outputInstance", 101, 255) as u8;
    let config = number(e, "configInstance", 1, 255) as u8;
    let path = [0x20, 4, 0x24, config, 0x2c, input, 0x2c, output];
    if server {
        return adapter(c, out, &mut rx, bind, port, &udp, &mut image, &path).await;
    }
    let mut peer = fieldbus::connect(Some(bind), target, port).await?;
    let registration = fieldbus::exchange(&mut peer, 0x65, 0, &[1, 0, 0, 0]).await?;
    let session = dword(&registration, 4)?;
    if e["mode"] == "explicit" {
        let mut timer = interval(Duration::from_millis(number(c, "pollMs", 20, 5000).max(5)));
        status(out, c, "connected", "").await?;
        loop {
            tokio::select! {v=rx.recv()=>image.update(&v.map_err(|_|invalid())?),_=timer.tick()=>{
            let mut write=vec![0x10,3,0x20,4,0x24,input,0x30,3];write.extend(&image.bytes);request(&mut peer,session,&write,None).await?;
            let frame=request(&mut peer,session,&[0x0e,3,0x20,4,0x24,output,0x30,3],None).await?;image.receive(&item(&frame[30..],0xb2).ok_or_else(invalid)?[4..],out).await?;
            }}
        }
    }
    let ms = number(e, "rpiMs", 10, 1000).max(1);
    let rpi = (ms as u32 * 1000).to_le_bytes();
    let size = image.bytes.len() as u16;
    let mut open = vec![0x54, 2, 0x20, 6, 0x24, 1, 10, 14];
    open.extend(random()?.to_le_bytes());
    open.extend(random()?.to_le_bytes());
    let serial = random()?.to_le_bytes();
    open.extend(&serial[..2]);
    open.extend(1024u16.to_le_bytes());
    open.extend(random()?.to_le_bytes());
    open.extend([5, 0, 0, 0]);
    open.extend(rpi);
    open.extend((0x4800 | (size + 6)).to_le_bytes());
    open.extend(rpi);
    open.extend((0x4800 | (size + 2)).to_le_bytes());
    open.extend([1, 4]);
    open.extend(path);
    let a = sockaddr(bind, local_port);
    let frame = request(&mut peer, session, &open, Some((0x8001, &a))).await?;
    let packet = &frame[30..];
    let reply = item(packet, 0xb2).ok_or_else(invalid)?;
    let mut cycle = Cycle {
        addr: (target, udp_port(packet, 0x8000).unwrap_or(2222)).into(),
        tx: dword(reply, 4)?,
        rx: dword(reply, 8)?,
        sequence: 0,
        last: Instant::now(),
        timeout: Duration::from_millis((128 * ms).max(2000)),
        header_rx: false,
        header_tx: true,
    };
    status(out, c, "connected", "").await?;
    let mut timer = interval(Duration::from_millis(ms));
    let mut keep = interval(Duration::from_secs(5));
    let mut buf = [0; 2048];
    loop {
        tokio::select! {
        v=rx.recv()=>{let v=v.map_err(|_|invalid())?; if v["type"]=="stop"{let mut close=vec![0x4e,2,0x20,6,0x24,1,10,14];close.extend(&open[16..24]);close.extend([4,0]);close.extend(path);let _=request(&mut peer,session,&close,None).await;return Ok(())}image.update(&v)},_=timer.tick()=>cycle.send(&udp,&image).await?,p=udp.recv_from(&mut buf)=>{let(n,addr)=p?;cycle.receive(&buf[..n],addr,&mut image,out).await?},
        _=keep.tick()=>{let _=request(&mut peer,session,&[0x0e,3,0x20,1,0x24,1,0x30,1],None).await;}
        }
    }
}
async fn request(
    peer: &mut TcpStream,
    session: u32,
    cip: &[u8],
    a: Option<(u16, &[u8])>,
) -> io::Result<Vec<u8>> {
    let frame = fieldbus::exchange(peer, 0x6f, session, &rr(cip, a)).await?;
    let r = frame
        .get(30..)
        .and_then(|b| item(b, 0xb2))
        .ok_or_else(invalid)?;
    if r.len() < 4 || r[2] != 0 {
        return Err(io::Error::other(format!("CIP reply {:?}", r.get(..4))));
    }
    Ok(frame)
}
async fn adapter(
    c: &Value,
    out: &Events,
    rx: &mut Commands,
    bind: Ipv4Addr,
    port: u16,
    udp: &UdpSocket,
    image: &mut Image,
    path: &[u8; 8],
) -> io::Result<()> {
    let listener = TcpListener::bind((bind, port)).await?;
    status(out, c, "listening", "").await?;
    let mut cycle: Option<Cycle> = None;
    let mut timer = interval(Duration::from_millis(10));
    let mut buf = [0; 2048];
    let (frames, mut incoming) = channel::channel(32);
    let mut peers = JoinSet::new();
    let mut inputs = vec![0; image.bytes.len()];
    loop {
        tokio::select! {
               v=rx.recv()=>image.update(&v.map_err(|_|invalid())?),
               pair=listener.accept(),if peers.len()<32=>{let(peer,addr)=pair?;let tx=frames.clone();peers.spawn(adapter_peer(peer,addr,tx));status(out,c,"connected","").await?;}
               Some(_)=peers.join_next()=>if peers.is_empty()&&cycle.is_none(){status(out,c,"listening","").await?},
               Some((b,addr,reply))=incoming.recv()=>{
               let response=(async{
               let mut req=item(&b,0xb2).ok_or_else(invalid)?;
        if req.starts_with(&[0x52,2,0x20,6]){let size=word(req,8)? as usize;req=req.get(10..10+size).ok_or_else(invalid)?;}let service=*req.first().ok_or_else(invalid)?;let split=2+2*usize::from(*req.get(1).ok_or_else(invalid)?);let data=req.get(split..).ok_or_else(invalid)?;let mut result=vec![service|128,0,0,0];let a=sockaddr(bind,udp.local_addr()?.port());let mut extra=None;
               match service{
               0x54|0x5b=>{
               let large=service==0x5b;let rpi_pos=if large{30}else{28};let path_pos=if large{40}else{36};let size=image.bytes.len();let mask=if large{65535}else{511};let param=|pos|->io::Result<usize>{Ok(if large{dword(data,pos)? as usize}else{word(data,pos)? as usize}&mask)};
               let consumed=param(26)?;let produced=param(rpi_pos+4)?;
               if cycle.is_some() || !data.get(path_pos..).is_some_and(|p|p.ends_with(&path[4..])) || !(consumed==size+2||consumed==size+6)||produced!=size+2{result[2]=1;result[3]=1;result.extend(0x106u16.to_le_bytes());}else{
               let rxid=random()?;let requested=dword(data,6)?;let txid=if requested==0{random()?}else{requested};result.extend(rxid.to_le_bytes());result.extend(txid.to_le_bytes());result.extend(&data[10..18]);result.extend(dword(data,22)?.to_le_bytes());result.extend(dword(data,rpi_pos)?.to_le_bytes());result.extend([0,0]);
               cycle=Some(Cycle{addr:SocketAddr::new(addr.ip(),udp_port(&b,0x8001).unwrap_or(2222)),rx:rxid,tx:txid,sequence:0,last:Instant::now(),timeout:Duration::from_millis(((dword(data,22)? as u64/1000)*(4<<data[18].min(7))).max(100)),header_rx:consumed==size+6,header_tx:false});timer=interval(Duration::from_micros(u64::from(dword(data,rpi_pos)?).clamp(1000,1000000)));extra=Some((0x8000,&a[..]));}}
               0x4e=>{if cycle.as_ref().is_some_and(|x|x.addr.ip()==addr.ip()){cycle=None;}result.extend(data.get(2..10).ok_or_else(invalid)?);result.extend([0,0]);}
               0x01 if req.get(3)==Some(&1)=>result.extend(identity()),
        0x0e if req.get(3)==Some(&1)=>{let id=identity();let range=match req.get(7){Some(1)=>0..2,Some(2)=>2..4,Some(3)=>4..6,Some(4)=>6..8,Some(5)=>8..10,Some(6)=>10..14,Some(7)=>14..id.len(),_=>{result[2]=0x14;0..0}};result.extend(&id[range]);}
        0x0e|0x10 if req.get(3)==Some(&4)&&req.get(5)==Some(&path[3])=>(),
               0x0e if req.get(3)==Some(&4)&&req.get(5)==Some(&path[7])=>result.extend(&image.bytes),
               0x0e if req.get(3)==Some(&4)&&req.get(5)==Some(&path[5])=>result.extend(&inputs),
               0x10 if req.get(3)==Some(&4)&&req.get(5)==Some(&path[5])&&data.len()==inputs.len()=>{inputs.copy_from_slice(data);image.receive(data,out).await?;}
               _=>result[2]=8,
               } Ok::<_,io::Error>(rr(&result,extra))
               }).await;let _=reply.send(response);
               }
               _=timer.tick(),if cycle.is_some()=>if cycle.as_mut().unwrap().send(udp,image).await.is_err(){cycle=None;if peers.is_empty(){status(out,c,"listening","").await?}},
               p=udp.recv_from(&mut buf)=>{let(n,addr)=p?;if let Some(link)=cycle.as_mut(){link.receive(&buf[..n],addr,image,out).await?}}
               }
    }
}
type Frame = (
    Vec<u8>,
    SocketAddr,
    tokio::sync::oneshot::Sender<io::Result<Vec<u8>>>,
);
async fn adapter_peer(
    mut peer: TcpStream,
    addr: SocketAddr,
    frames: channel::Sender<Frame>,
) -> io::Result<()> {
    let mut session = 0;
    loop {
        let mut h = [0; 24];
        peer.read_exact(&mut h).await?;
        let n = word(&h, 2)? as usize;
        if n > 4096 {
            return Err(invalid());
        }
        let mut b = vec![0; n];
        peer.read_exact(&mut b).await?;
        let body = match word(&h, 0)? {
            0x65 => {
                session = random()?;
                h[4..8].copy_from_slice(&session.to_le_bytes());
                vec![1, 0, 0, 0]
            }
            0x63 => {
                let local = peer.local_addr()?;
                let std::net::IpAddr::V4(ip) = local.ip() else {
                    return Err(invalid());
                };
                let mut id = 1u16.to_le_bytes().to_vec();
                id.extend(sockaddr(ip, local.port()));
                id.extend(identity());
                id.push(3);
                cpf(&[(0x0c, &id)])
            }
            4 => {
                let mut service = vec![1, 0, 0x20, 1];
                service.extend(b"Communications");
                service.resize(20, 0);
                cpf(&[(0x100, &service)])
            }
            0x66 => return Ok(()),
            0x6f if session != 0 && session == dword(&h, 4)? => {
                let (tx, rx) = tokio::sync::oneshot::channel();
                frames
                    .send((b.get(6..).ok_or_else(invalid)?.to_vec(), addr, tx))
                    .await
                    .map_err(|_| invalid())?;
                rx.await.map_err(|_| invalid())??
            }
            _ => {
                h[8..12].copy_from_slice(&1u32.to_le_bytes());
                vec![]
            }
        };
        h[2..4].copy_from_slice(&(body.len() as u16).to_le_bytes());
        peer.write_all(&h).await?;
        peer.write_all(&body).await?;
    }
}
