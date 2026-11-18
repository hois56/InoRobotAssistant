# Rust 컨트롤러 브리지

Windows x64에서 실행한다. 시뮬레이터의 **브리지 다운로드** ZIP을 풀고 `start-rust-bridge.cmd`를 실행한다. 첫 실행 후에는 시뮬레이터에서도 **실행** 버튼을 사용할 수 있다. **전용 브리지**에서 로봇과 컨트롤러 주소를 선택한다. Rust 브리지는 실행 파일 옆의 제조사 `IMC100API.dll`과 VC++ 런타임을 사용한다. 기본 주소는 `127.0.0.1:5055`다.

C# 브리지로 돌아가려면 Rust 브리지를 종료하고 기존 **InoRobotVirtualControllerBridge.exe**를 실행한다. 두 프로그램은 같은 연결 주소를 사용한다. 독립판의 기본 주소인 `http://127.0.0.1:8775`를 C#에서 허용하려면 실행 전에 `INOROBOT_BRIDGE_ORIGINS`에 그 주소를 포함한다.

Rust 브리지의 기본 허용 주소는 기존 웹사이트와 localhost의 8765, 5173, 8775 포트다. 다른 주소에서 시뮬레이터를 사용한다면 `INOROBOT_BRIDGE_ORIGINS`에 주소를 쉼표로 구분해 지정한다.

각 세션에서 컨트롤러 읽기는 WebSocket 송신과 별도로 진행된다. 송신이 밀리면 아직 보내지 않은 관절 자세는 최신 자세로 교체한다. 관측한 IO 변경과 명령 응답은 순서대로 전달하며, 이 응답을 보관할 공간이 부족하면 연결을 닫는다. 접속 장애 판정과 재접속 대기는 기존과 같은 기준을 사용한다.

저장소 루트에서 Rust 도구 체인을 사용해 빌드한다.

```powershell
cargo build --locked --release --manifest-path 2_3DSimulation/RustControllerBridge/Cargo.toml
```

실행 파일 옆에 `start-rust-bridge.cmd`와 아래 DLL을 둔다.

- `7_DebuggingTool/Trace/IMC100API.dll`
- `2_3DSimulation/VirtualControllerBridge/Native/MSVCR120.dll`
