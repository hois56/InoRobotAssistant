use std::{io, net::Ipv4Addr, time::Duration};
use tokio::{
    io::AsyncReadExt,
    net::windows::named_pipe::{ClientOptions, NamedPipeClient},
    time::timeout,
};

// K14's local, read-only feedback pipe. The controller writes one complete
// little-endian record per acquisition. Ordinary frames and output transitions
// share a sequence so a missing transition cannot silently become a new pose.
const SIZE: usize = 408;

pub struct Sample {
    pub edge: bool,
    pub sequence: u64,
    pub timestamp_us: u64,
    pub outputs: u64,
    pub cycle: u32,
    pub fieldbus_outputs: Option<[u8; 256]>,
    pub joints: [f64; 8],
    pub tcp: [f64; 6],
}

impl Sample {
    fn decode(bytes: &[u8; SIZE], previous: Option<u64>) -> io::Result<Self> {
        let word = |offset: usize| u64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap());
        let flags = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
        let sample = Self {
            edge: flags & 1 != 0,
            sequence: word(8),
            timestamp_us: word(16),
            outputs: word(24),
            cycle: u32::from_le_bytes(bytes[144..148].try_into().unwrap()),
            fieldbus_outputs: (flags & 2 != 0).then(|| bytes[152..].try_into().unwrap()),
            joints: std::array::from_fn(|i| f64::from_bits(word(32 + 8 * i))),
            tcp: std::array::from_fn(|i| f64::from_bits(word(96 + 8 * i))),
        };
        if &bytes[..4] != b"IVS2" || flags > 3 || bytes[148..152] != [0; 4] || sample.cycle == 0 || sample.timestamp_us == 0 || sample.sequence == 0
            || previous.is_some_and(|last| last.checked_add(1) != Some(sample.sequence))
            || !sample.joints.iter().chain(&sample.tcp).all(|n| n.is_finite()) {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "Invalid or interrupted K14 feedback"));
        }
        Ok(sample)
    }
}

pub struct Stream {
    pipe: NamedPipeClient,
    previous: Option<u64>,
}

impl Stream {
    pub fn open(ip: Ipv4Addr) -> io::Result<Self> {
        if !ip.is_loopback() {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Expected a local virtual controller"));
        }
        let path = format!(r"\\.\pipe\InoRobot.K14.Feedback.{ip}");
        let pipe = ClientOptions::new().write(false).security_qos_flags(0x10000).open(path)?;
        Ok(Self { pipe, previous: None })
    }

    pub async fn next(&mut self) -> io::Result<Sample> {
        let mut bytes = [0; SIZE];
        timeout(Duration::from_millis(250), self.pipe.read_exact(&mut bytes)).await??;
        let sample = Sample::decode(&bytes, self.previous)?;
        self.previous = Some(sample.sequence);
        Ok(sample)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coherent_values_edges_and_sequence_gaps() {
        let mut bytes = [0; SIZE];
        bytes[..4].copy_from_slice(b"IVS2");
        bytes[4..8].copy_from_slice(&3u32.to_le_bytes());
        bytes[8..16].copy_from_slice(&6u64.to_le_bytes());
        bytes[16..24].copy_from_slice(&1_234_567u64.to_le_bytes());
        bytes[24..32].copy_from_slice(&(1u64 << 63).to_le_bytes());
        bytes[48..56].copy_from_slice(&(-90.5f64).to_le_bytes());
        bytes[136..144].copy_from_slice(&123.25f64.to_le_bytes());
        bytes[144..148].copy_from_slice(&17u32.to_le_bytes());
        bytes[152] = 1;
        let sample = Sample::decode(&bytes, Some(5)).unwrap();
        assert!(sample.edge);
        assert_eq!(sample.fieldbus_outputs.unwrap()[0], 1);
        assert_eq!((sample.outputs, sample.joints[2], sample.tcp[5]), (1u64 << 63, -90.5, 123.25));
        assert!(Sample::decode(&bytes, Some(4)).is_err());
        assert!(Sample::decode(&bytes, Some(6)).is_err());
        bytes[96..104].copy_from_slice(&f64::NAN.to_le_bytes());
        assert!(Sample::decode(&bytes, None).is_err());
    }
}
