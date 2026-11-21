use std::cell::RefCell;

thread_local! {
    pub(crate) static WORDS: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
    pub(crate) static NUMBERS: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
    pub(crate) static BYTES: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    pub(crate) static OUTPUT: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
}

// JS takes a fresh view after reserving. Each export completes before the next
// call, and no Rust slice is held while JavaScript accesses linear memory.
macro_rules! buffer {
    ($function:ident, $storage:ident, $element:ty, $zero:expr) => {
        #[no_mangle]
        pub extern "C" fn $function(len: usize) -> *mut $element {
            $storage.with_borrow_mut(|v| {
                v.resize(len, $zero);
                v.as_mut_ptr()
            })
        }
    };
}
buffer!(words, WORDS, u32, 0);
buffer!(numbers, NUMBERS, f64, 0.0);
buffer!(bytes, BYTES, u8, 0);

#[no_mangle]
pub extern "C" fn output_ptr() -> *const u32 {
    OUTPUT.with_borrow(|out| out.as_ptr())
}

#[no_mangle]
pub extern "C" fn zero_calibration(factory: f64, teaching: f64) -> f64 {
    const TURN: f64 = 1048576.0;
    let turns = (teaching - factory) / TURN;
    // JavaScript Math.round breaks ties toward positive infinity.
    let lower = turns.floor();
    let rounded = if turns - lower >= 0.5 {
        lower + 1.0
    } else {
        lower
    };
    factory + rounded * TURN
}

#[no_mangle]
pub extern "C" fn group_filter(selection: i32) -> usize {
    WORDS.with_borrow(|rows| {
        OUTPUT.with_borrow_mut(|out| {
            out.clear();
            out.push(0);
            for row in rows.chunks_exact(2) {
                let visible = selection == -1 || selection == row[0] as i32;
                out.push(visible as u32);
                if visible {
                    out[0] += row[1];
                }
            }
            out.len()
        })
    })
}
