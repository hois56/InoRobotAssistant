# SolidWorks reader

The browser worker loads this WebAssembly module. The module reads the active configuration’s saved tessellation, component placement, and saved display colors. It requests referenced part files from the worker only when the assembly’s saved meshes do not cover them. The worker can open files from the folder provided by the user.

This is a port of the reader from InoRobot’s CAD_Lightweight V2.0. If a standalone SLDPRT has no readable display mesh, the reader reconstructs its active configuration from the saved Parasolid bodies and sends STEP data to the simulator’s existing tessellator. Assembly import uses saved meshes in the assembly and its referenced parts.

The Rust sources are licensed under AGPL-3.0-only. See [the license](SolidWorks-AGPL-3.0.txt). Format references include [sld2step](https://github.com/dsandall/sld2step) under AGPL-3.0 and [sldprt-export](https://github.com/XRTC5/sldprt-export) under [MIT](sldprt-export-MIT.txt).

Part reconstruction uses the original XT adapter from CAD_Lightweight. Its license is in [vendor/xt-step/LICENSE.md](vendor/xt-step/LICENSE.md).

Install wasm-bindgen-cli 0.2.130 before running the build.

    cargo install wasm-bindgen-cli --version 0.2.130 --locked
    node simulator-rust/build-engine.mjs
