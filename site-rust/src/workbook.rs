use crate::{BYTES, WORDS};

const fn crc_table() -> [u32; 256] {
    let mut table = [0; 256];
    let mut i = 0;
    while i < table.len() {
        let mut crc = i as u32;
        let mut bit = 0;
        while bit < 8 {
            crc = (crc >> 1) ^ if crc & 1 == 1 { 0xedb88320 } else { 0 };
            bit += 1;
        }
        table[i] = crc;
        i += 1;
    }
    table
}
const CRC: [u32; 256] = crc_table();

// XLSX uses ZIP's stored method, UTF-8 filenames and a fixed DOS date.
#[no_mangle]
pub extern "C" fn workbook_zip() -> usize {
    WORDS.with_borrow(|lengths| {
        BYTES.with_borrow_mut(|bytes| {
            let mut local = Vec::with_capacity(bytes.len() + 30 * lengths.len() / 2);
            let mut directory = Vec::new();
            let mut remaining = &bytes[..];
            for entry in lengths.chunks_exact(2) {
                let (name, rest) = remaining.split_at(entry[0] as usize);
                let (data, rest) = rest.split_at(entry[1] as usize);
                remaining = rest;
                let crc = !data.iter().fold(u32::MAX, |crc, &b| {
                    (crc >> 8) ^ CRC[((crc as u8) ^ b) as usize]
                });
                let start = (local.len() as u32).to_le_bytes();
                local.extend(0x04034b50u32.to_le_bytes());
                directory.extend(0x02014b50u32.to_le_bytes());
                directory.extend(20u16.to_le_bytes());
                for header in [&mut local, &mut directory] {
                    for field in [20u16, 0x800, 0, 0, 0x21] {
                        header.extend(field.to_le_bytes());
                    }
                    for field in [crc, entry[1], entry[1]] {
                        header.extend(field.to_le_bytes());
                    }
                    header.extend((name.len() as u16).to_le_bytes());
                    header.extend([0; 2]);
                }
                local.extend(name);
                local.extend(data);
                directory.extend([0; 10]);
                directory.extend(start);
                directory.extend(name);
            }
            let offset = local.len() as u32;
            let size = directory.len() as u32;
            let count = (lengths.len() / 2) as u16;
            local.extend(directory);
            local.extend(0x06054b50u32.to_le_bytes());
            local.extend([0; 4]);
            local.extend(count.to_le_bytes());
            local.extend(count.to_le_bytes());
            local.extend(size.to_le_bytes());
            local.extend(offset.to_le_bytes());
            local.extend([0; 2]);
            *bytes = local;
            bytes.len()
        })
    })
}
