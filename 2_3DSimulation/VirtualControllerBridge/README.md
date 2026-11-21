# InoRobot Virtual Controller Bridge

Windows x64에서 시뮬레이터의 **브리지 다운로드** ZIP을 풀고 `InoRobotVirtualControllerBridge.exe`를 실행한다. 첫 실행 후에는 화면의 **실행** 버튼으로 열 수 있다. 창을 최소화하면 알림 영역에서 열거나 종료할 수 있다.

브리지 주소는 `ws://127.0.0.1:5055/ws`다. 다른 웹 주소를 허용하려면 `INOROBOT_BRIDGE_ORIGINS`에 허용 주소를 쉼표로 구분해 지정한다. 제어기 읽기와 WebSocket 송신은 분리되어 있다. 송신이 밀리면 대기 중인 관절 자세를 최신값으로 갱신하며, 관측한 IO 변경과 응답은 순서대로 전송한다.

Windows용 Rust 도구 체인과 Windows 리소스 컴파일러를 준비한다. MSVC는 Windows SDK의 `rc.exe`, GNU는 MinGW의 `windres`를 사용한다. 저장소 루트에서 실행한다.

```powershell
cargo build --locked --release --manifest-path 2_3DSimulation/VirtualControllerBridge/Cargo.toml
npm run test:bridge
```

빌드된 `InoRobotVirtualControllerBridge.exe` 하나를 ZIP에 담는다. 제조사 `IMC100API.dll`과 VC++ 런타임은 실행 파일에 포함된다.
