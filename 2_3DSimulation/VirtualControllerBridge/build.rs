use std::{env, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=Assets/bridge.rc");
    println!("cargo:rerun-if-changed=Assets/bridge.ico");
    println!("cargo:rerun-if-env-changed=WINDRES");
    println!("cargo:rerun-if-env-changed=CPP");
    println!("cargo:rerun-if-env-changed=RC");

    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo output directory"));
    let gnu = env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu");
    let (mut compiler, resource) = if gnu {
        let resource = out.join("bridge.o");
        let mut compiler = Command::new(env::var_os("WINDRES").unwrap_or_else(|| "windres".into()));
        compiler.args(["-O", "coff", "-i", "Assets/bridge.rc", "-o"]).arg(&resource);
        if let Some(preprocessor) = env::var_os("CPP") {
            compiler.arg("--preprocessor").arg(preprocessor);
        }
        (compiler, resource)
    } else {
        let resource = out.join("bridge.res");
        let mut compiler = Command::new(env::var_os("RC").unwrap_or_else(|| "rc.exe".into()));
        compiler.arg("/nologo").arg("/fo").arg(&resource).arg("Assets/bridge.rc");
        (compiler, resource)
    };

    let status = compiler.status().expect("Run the Windows resource compiler");
    assert!(status.success(), "Windows resource compilation failed");
    println!("cargo:rustc-link-arg={}", resource.display());
}
