mod cad;
mod collision;
mod conveyor;
mod inverse;
mod kinematics;
mod matrix;
mod motion;
#[cfg(target_arch = "wasm32")]
mod olp;
mod planner;
mod stl;
mod trajectory;
mod vision;

use std::cell::RefCell;

// Each call completes synchronously before control returns to JavaScript.
// Only numbers cross the boundary. Callers copy returned arrays before the
// next call, so independent robots and profiles never share mutable state.
thread_local! {
    static BUFFER: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn number_buffer(len: usize) -> *mut f64 {
    BUFFER.with_borrow_mut(|buffer| {
        buffer.resize(len, 0.0);
        buffer.as_mut_ptr()
    })
}

pub(crate) fn with_buffer<T>(f: impl FnOnce(&mut [f64]) -> T) -> T {
    BUFFER.with_borrow_mut(|buffer| f(buffer))
}
