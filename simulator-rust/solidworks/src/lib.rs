// SPDX-License-Identifier: AGPL-3.0-only
mod configs;
mod part_geometry;
mod saved_display;

use std::{cell::RefCell, io::Cursor, path::Path};

#[derive(Default)]
struct Buffers {
    input: Vec<u8>,
    name: Vec<u8>,
    output: Vec<u8>,
    is_step: bool,
}

thread_local! {
    static BUFFERS: RefCell<Buffers> = RefCell::new(Buffers::default());
}

// The worker provides access only to files the user selected.
#[link(wasm_import_module = "./solidworks-host.mjs")]
unsafe extern "C" {
    fn reference_size(name: *const u8, name_len: usize) -> i32;
    fn copy_reference(destination: *mut u8, length: usize);
}

fn read_reference(name: &str) -> Option<Vec<u8>> {
    let length = unsafe { reference_size(name.as_ptr(), name.len()) };
    if length <= 0 {
        return None;
    }
    let mut data = vec![0; length as usize];
    unsafe { copy_reference(data.as_mut_ptr(), data.len()) };
    Some(data)
}

#[unsafe(no_mangle)]
pub extern "C" fn sw_input(length: usize) -> *mut u8 {
    BUFFERS.with_borrow_mut(|buffers| {
        buffers.input.resize(length, 0);
        buffers.input.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn sw_name(length: usize) -> *mut u8 {
    BUFFERS.with_borrow_mut(|buffers| {
        buffers.name.resize(length, 0);
        buffers.name.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn sw_read() -> usize {
    BUFFERS.with_borrow_mut(|buffers| {
        let input = std::mem::take(&mut buffers.input);
        let result = std::str::from_utf8(&buffers.name)
            .ok()
            .and_then(|name| {
                let path = Path::new(name);
                if let Some(display) = saved_display::load_display(path, Cursor::new(&input), read_reference).ok().flatten() {
                    let [mut header, bytes] = saved_display::encode(display).ok()?;
                    header.extend_from_slice(&bytes);
                    return Some((header, false));
                }
                if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("sldprt")) {
                    return part_geometry::reconstruct_part(path, &input).ok().map(|step| (step, true));
                }
                None
            })
            .unwrap_or_default();
        (buffers.output, buffers.is_step) = result;
        buffers.output.len()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn sw_is_step() -> bool {
    BUFFERS.with_borrow(|buffers| buffers.is_step)
}

#[unsafe(no_mangle)]
pub extern "C" fn sw_output() -> *const u8 {
    BUFFERS.with_borrow(|buffers| buffers.output.as_ptr())
}
