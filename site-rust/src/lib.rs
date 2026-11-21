//! Synchronous computations for the static site. No host imports or threads.
#[cfg(feature = "site")]
mod catalog;
#[cfg(feature = "controller")]
mod controller;
#[cfg(feature = "site")]
mod geometry;
#[cfg(feature = "site")]
mod history;
#[cfg(feature = "site")]
mod model;
#[cfg(feature = "site")]
mod project;
#[cfg(feature = "site")]
mod snap;
#[cfg(feature = "site")]
mod workbook;

#[cfg(feature = "site")]
mod memory;
#[cfg(feature = "site")]
use memory::{BYTES, NUMBERS, OUTPUT, WORDS};
