use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, io, net::Ipv4Addr, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::windows::named_pipe::{ClientOptions, NamedPipeClient},
    time::{sleep, timeout},
};

const CONVEYOR: u32 = 0x3431_4b43;
const MAX_INTEGER: i64 = 9_007_199_254_740_991;

async fn open(name: &str, ip: Ipv4Addr, wait_ms: u64) -> io::Result<NamedPipeClient> {
    if !ip.is_loopback() {
        return Err(io::Error::other(
            "K14 pipes require a local virtual controller.",
        ));
    }
    let path = format!(r"\\.\pipe\InoRobot.K14.{name}.{ip}");
    timeout(Duration::from_millis(wait_ms), async {
        loop {
            match ClientOptions::new().security_qos_flags(0x10000).open(&path) {
                Ok(pipe) => return Ok(pipe),
                Err(error) if matches!(error.raw_os_error(), Some(2 | 231)) => {
                    sleep(Duration::from_millis(20)).await
                }
                Err(error) => return Err(error),
            }
        }
    })
    .await?
}

async fn exchange<const N: usize>(
    pipe: &mut NamedPipeClient,
    request: &[u8],
) -> io::Result<[u8; N]> {
    pipe.write_all(request).await?;
    let mut reply = [0; N];
    pipe.read_exact(&mut reply).await?;
    Ok(reply)
}

async fn standard_exchange(
    ip: Ipv4Addr,
    mode: u32,
    address: u32,
    value: u32,
) -> io::Result<[u8; 32]> {
    timeout(Duration::from_millis(1000), async {
        let mut request = [0; 32];
        for (chunk, field) in request
            .chunks_mut(4)
            .zip([0x314f4944u32, 2, mode, address, value])
        {
            chunk.copy_from_slice(&field.to_le_bytes());
        }
        let mut pipe = open("StandardInput", ip, 750).await?;
        let reply = exchange::<32>(&mut pipe, &request).await?;
        if request[..16] != reply[..16]
            || u32_at(&reply, 20) != 0
            || u32_at(&reply, 16) > 1
            || (mode != 2 && u64_at(&reply, 24) != 0)
        {
            return Err(io::Error::other("Invalid K14 standard input reply."));
        }
        Ok(reply)
    })
    .await?
}

pub async fn standard_inputs(ip: Ipv4Addr, address: u32, value: Option<u32>) -> io::Result<Value> {
    if let Some(value) = value {
        standard_exchange(ip, 1, address, value).await?;
        sleep(Duration::from_millis(50)).await;
    }
    let reply = standard_exchange(ip, 2, 0, 0).await?;
    let bits = u64_at(&reply, 24) as u128 | ((u32_at(&reply, 16) as u128) << 64);
    let inputs: serde_json::Map<String, Value> = (0..=64)
        .map(|i| (i.to_string(), json!(((bits >> i) & 1) as u8)))
        .collect();
    Ok(json!({"address":address,"value":inputs[&address.to_string()],"inputs":inputs}))
}

fn invalid(key: &str) -> String {
    format!("Invalid conveyor {key}.")
}
fn integer(object: &Value, key: &str, min: i64, max: i64) -> Result<i64, String> {
    object[key]
        .as_i64()
        .filter(|v| (min..=max).contains(v))
        .ok_or_else(|| invalid(key))
}
fn number(object: &Value, key: &str, min: f64, max: f64) -> Result<f64, String> {
    object[key]
        .as_f64()
        .filter(|v| (min..=max).contains(v))
        .ok_or_else(|| invalid(key))
}
fn array<'a>(object: &'a Value, key: &str, max: usize) -> Result<&'a [Value], String> {
    object[key]
        .as_array()
        .filter(|a| a.len() <= max)
        .map(Vec::as_slice)
        .ok_or_else(|| invalid(key))
}
fn address(object: &Value) -> Result<u32, String> {
    let index = integer(object, "address", 0, 2559)? as u32;
    if (65..512).contains(&index) {
        Err(invalid("sensor address"))
    } else {
        Ok(index)
    }
}
fn encoder(object: &Value, position: f64, scale: f64) -> Result<i64, String> {
    let text = object["encoder"]
        .as_str()
        .ok_or_else(|| invalid("encoder"))?;
    let digits = text.strip_prefix('-').unwrap_or(text);
    let count = text
        .parse::<i64>()
        .ok()
        .filter(|value| (-MAX_INTEGER..=MAX_INTEGER).contains(value));
    count
        .filter(|value| {
            !digits.is_empty()
                && digits.bytes().all(|b| b.is_ascii_digit())
                && (digits == "0" || !digits.starts_with('0'))
                && (position * scale - *value as f64).abs() <= 1.01
        })
        .ok_or_else(|| "Conveyor encoder/position mismatch.".into())
}
fn coordinates(bytes: &mut Vec<u8>, object: &Value, key: &str) -> Result<(), String> {
    let values = array(object, key, 6)?;
    if values.len() != 6 {
        return Err(invalid(key));
    }
    for value in values {
        let coordinate = value
            .as_f64()
            .filter(|v| v.abs() <= 1e9)
            .ok_or_else(|| invalid(key))?;
        bytes.extend_from_slice(&coordinate.to_le_bytes());
    }
    Ok(())
}

fn encode(frame: &Value) -> Result<Vec<u8>, String> {
    integer(frame, "version", 1, 1)?;
    let session = frame["session"]
        .as_str()
        .filter(|s| {
            (1..=64).contains(&s.len())
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        })
        .ok_or_else(|| invalid("session"))?;
    let conveyor = integer(frame, "conveyor", 0, 3)? as u32;
    let sequence = integer(frame, "sequence", 1, MAX_INTEGER)? as u64;
    let time = number(frame, "time", 0., 1e9)?;
    let position = number(frame, "position", -1e9, 1e9)?;
    let scale = number(frame, "countsPerMm", 0.00001, 1e9)?;
    let velocity = number(frame, "velocity", -5000., 5000.)?;
    let sensors = array(frame, "sensors", 32)?;
    let events = array(frame, "events", 500)?;
    let mut bytes = Vec::with_capacity(152);
    bytes.extend_from_slice(&CONVEYOR.to_le_bytes());
    bytes.extend_from_slice(&[0, 0, 0, 0, 1, 0, 1, 0]);
    bytes.extend_from_slice(&conveyor.to_le_bytes());
    bytes.extend_from_slice(&Sha256::digest(session.as_bytes()));
    bytes.extend_from_slice(&sequence.to_le_bytes());
    for value in [time, position, scale, velocity] {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes.extend_from_slice(&encoder(frame, position, scale)?.to_le_bytes());
    bytes.extend_from_slice(&(events.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&(sensors.len() as u32).to_le_bytes());
    coordinates(&mut bytes, frame, "captureOffset")?;
    let mut addresses = HashSet::new();
    for sensor in sensors {
        let index = address(sensor)?;
        if !addresses.insert(index) {
            return Err("Duplicate sensor input.".into());
        }
        bytes.extend_from_slice(&index.to_le_bytes());
        bytes.extend_from_slice(&(integer(sensor, "value", 0, 1)? as u32).to_le_bytes());
    }
    let mut last_id = 0;
    for event in events {
        last_id = integer(event, "id", last_id + 1, MAX_INTEGER)?;
        let position = number(event, "position", -1e9, 1e9)?;
        let (kind, target, value, objects) = match event["kind"].as_str() {
            Some("sensor") => {
                let index = address(event)?;
                if !addresses.contains(&index) {
                    return Err("Unmapped sensor event.".into());
                }
                (1u32, index, integer(event, "value", 0, 1)? as u32, &[][..])
            }
            Some("vision") => (
                2,
                integer(event, "requestId", 0, i32::MAX as i64)? as u32,
                0,
                array(event, "objects", 500)?,
            ),
            _ => return Err("Unknown conveyor event.".into()),
        };
        bytes.extend_from_slice(&last_id.to_le_bytes());
        bytes.extend_from_slice(&kind.to_le_bytes());
        bytes.extend_from_slice(&(objects.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&number(event, "time", 0., time)?.to_le_bytes());
        bytes.extend_from_slice(&position.to_le_bytes());
        bytes.extend_from_slice(&encoder(event, position, scale)?.to_le_bytes());
        bytes.extend_from_slice(&target.to_le_bytes());
        bytes.extend_from_slice(&value.to_le_bytes());
        if bytes.len() + 56 * objects.len() > 60_000 {
            return Err("Conveyor frame exceeds transport capacity.".into());
        }
        for object in objects {
            bytes.extend_from_slice(&(integer(object, "type", 0, 15)? as u32).to_le_bytes());
            bytes.extend_from_slice(&[0; 4]);
            coordinates(&mut bytes, object, "pose")?;
        }
    }
    let size = bytes.len() as u32;
    bytes[4..8].copy_from_slice(&size.to_le_bytes());
    Ok(bytes)
}

fn u32_at(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())
}
fn u64_at(bytes: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(bytes[at..at + 8].try_into().unwrap())
}

fn rejection(status: u32, flags: u32) -> String {
    match (status, flags) {
        (0, _) => String::new(),
        (170, 1) => "로봇랩의 가상 컨베이어를 정지한 뒤 다시 연동하세요.".into(),
        (170, 2) => {
            "K14 컨베이어의 대기 물체 처리를 끝내거나 물체 큐를 비운 뒤 다시 연동하세요.".into()
        }
        (170, 3) => "로봇의 컨베이어 추종 동작을 끝낸 뒤 다시 연동하세요.".into(),
        (170, 4) => "다른 웹 연결의 컨베이어 연동을 해제한 뒤 다시 연결하세요.".into(),
        (170, 5) => "다른 컨베이어가 사용 중인 센서 입력 번호를 변경하세요.".into(),
        (170, 6) => "K14의 TCP 비전과 웹 센서 자동 촬영 설정을 확인하세요.".into(),
        _ => format!("K14 conveyor rejected the frame ({status})."),
    }
}

#[derive(Default)]
pub struct Conveyor(Option<(Ipv4Addr, NamedPipeClient)>);
impl Conveyor {
    pub fn release(&mut self) {
        self.0 = None;
    }
    pub async fn send(&mut self, ip: Ipv4Addr, frame: &Value) -> Result<Value, String> {
        let bytes = encode(frame)?;
        let result = timeout(Duration::from_millis(1500), async {
            if self.0.as_ref().is_none_or(|(peer, _)| *peer != ip) {
                self.0 = Some((ip, open("Conveyor", ip, 1000).await?));
            }
            exchange::<48>(&mut self.0.as_mut().unwrap().1, &bytes).await
        })
        .await
        .map_err(io::Error::from)
        .and_then(|result| result);
        let reply = match result {
            Ok(reply) if u32_at(&reply, 0) == CONVEYOR && u32_at(&reply, 4) == 1 => reply,
            Ok(_) => {
                self.release();
                return Err("K14 conveyor protocol mismatch.".into());
            }
            Err(error) => {
                self.release();
                return Err(error.to_string());
            }
        };
        let status = u32_at(&reply, 8);
        let flags = u32_at(&reply, 12);
        Ok(
            json!({"type":"conveyorFrameResult","success":status==0,"session":frame["session"],"conveyor":frame["conveyor"],
            "sequence":u64_at(&reply,16),"eventId":u64_at(&reply,24),"encoder":(u64_at(&reply,32) as i64).to_string(),
            "objects":u32_at(&reply,40),"sensorCount":u32_at(&reply,44),"status":status,"flags":flags,"message":rejection(status,flags)}),
        )
    }
}
