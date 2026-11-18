use crate::with_buffer;
use std::cell::RefCell;

#[allow(unused_parens, clippy::unnecessary_cast)]
mod arithmetic {
    include!("generated_matrix.rs");
}

struct Machine {
    ram: Vec<u32>,
    r: [u32; 16],
    v: [u32; 64],
    address: u32,
}

fn words_to_f64(low: u32, high: u32) -> f64 {
    f64::from_bits((u64::from(high) << 32) | u64::from(low))
}

impl Machine {
    fn single(&self, index: usize) -> f32 {
        f32::from_bits(self.v[index])
    }
    fn set_single(&mut self, index: usize, value: f32) {
        self.v[index] = value.to_bits();
    }
    fn double(&self, index: usize) -> f64 {
        words_to_f64(self.v[2 * index], self.v[2 * index + 1])
    }
    fn set_double(&mut self, index: usize, value: f64) {
        let bits = value.to_bits();
        self.v[2 * index] = bits as u32;
        self.v[2 * index + 1] = (bits >> 32) as u32;
    }
    fn load_double(&self, address: u32) -> f64 {
        let index = address as usize / 4;
        words_to_f64(self.ram[index], self.ram[index + 1])
    }
    fn store_double(&mut self, address: u32, value: f64) {
        let index = address as usize / 4;
        let bits = value.to_bits();
        self.ram[index] = bits as u32;
        self.ram[index + 1] = (bits >> 32) as u32;
    }
    fn trig(&mut self, function: fn(f64) -> f64) {
        let bits = function(words_to_f64(self.r[0], self.r[1])).to_bits();
        self.r[0] = bits as u32;
        self.r[1] = (bits >> 32) as u32;
    }
}

thread_local! {
    static MACHINE: RefCell<Machine> = RefCell::new(Machine {
        ram: vec![0; 0x20000 / 4], r: [0;16], v: [0;64], address: 0
    });
}

struct Layout {
    axes: usize,
    active: u32,
    gravity_in: u32,
    ranges: [(usize, usize); 4],
}
const SIX: Layout = Layout {
    axes: 6,
    active: 0xab0,
    gravity_in: 0xf30,
    ranges: [(0x774, 36), (0x804, 36), (0x894, 90), (0x9fc, 6)],
};
const SCARA: Layout = Layout {
    axes: 4,
    active: 0x670,
    gravity_in: 0x970,
    ranges: [(0x514, 16), (0x554, 16), (0x594, 12), (0x5c4, 4)],
};

#[no_mangle]
pub extern "C" fn native_matrix(scara: bool, j2_offset: f64) {
    let layout = if scara { &SCARA } else { &SIX };
    const MODEL: u32 = 0x1000;
    const JOINTS: u32 = 0x3000;
    with_buffer(|b| {
        MACHINE.with_borrow_mut(|m| {
            m.r.fill(0);
            m.v.fill(0);
            m.r[0] = MODEL;
            m.r[1] = JOINTS;
            m.r[13] = 0x1f000;
            let fields = layout.axes * 19;
            for (i, value) in b[..fields].iter().enumerate() {
                m.store_double(MODEL + layout.active + (8 * i) as u32, *value);
            }
            for i in 0..3 {
                m.store_double(MODEL + layout.gravity_in + 8 * i as u32, b[fields + i]);
            }
            for i in 0..layout.axes {
                m.store_double(JOINTS + 8 * i as u32, b[fields + 3 + i]);
            }
            if scara {
                m.r[2] = j2_offset.to_bits() as u32;
                m.r[3] = (j2_offset.to_bits() >> 32) as u32;
                arithmetic::scara(m);
            } else {
                arithmetic::six(m);
            }
            let mut offset = 0;
            for (start, len) in layout.ranges {
                let first = (MODEL as usize + start) / 4;
                for word in &m.ram[first..first + len] {
                    b[offset] = f32::from_bits(*word) as f64;
                    offset += 1;
                }
            }
        })
    });
}
