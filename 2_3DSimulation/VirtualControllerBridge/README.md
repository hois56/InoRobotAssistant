# InoRobot Virtual Controller Bridge

Windows x64에서 시뮬레이터의 **브리지 다운로드** ZIP을 풀고 `InoRobotVirtualControllerBridge.exe`를 실행한다. 첫 실행 후에는 화면의 **실행** 버튼으로 열 수 있다. 창을 최소화하면 알림 영역에서 열거나 종료할 수 있다.

V2.1과 K14의 위치·출력 동기화 업데이트(`InoRobotLab_K14_Feedback.zip`)를 함께 사용하면 새 컨트롤러 스캔에서 관절·TCP·출력을 묶어 60 Hz를 목표로 전송한다. K14를 종료하고 업데이트 ZIP의 `Lab` 폴더를 K14 MultiVC 설치 폴더에 병합한 뒤 가상 컨트롤러와 브리지를 다시 실행한다. 출력이 프레임 사이에 바뀌면 해당 자세와 출력 상태를 즉시 전송한다. 연결 패널의 Hz는 최근 1초간 브라우저가 받은 정규 위치 프레임 수다. 이전 가상 컨트롤러와 실컨트롤러에는 기존 SDK 조회를 사용한다.

V2.2부터 웹 시뮬레이터의 가상 비전이 같은 브리지의 `/virtualvision/`에서 Socket·EtherNet/IP 서버와 클라이언트를 사용할 수 있다. ZIP에서 브리지 EXE 하나를 꺼내 실행한다.

브리지 주소는 `ws://127.0.0.1:5055/ws`다. 다른 웹 주소를 허용하려면 `INOROBOT_BRIDGE_ORIGINS`에 허용 주소를 쉼표로 구분해 지정한다. 업데이트된 K14의 스캔, 출력 전환 및 컨베이어 응답은 웹소켓에 순서대로 전달한다. 수신이 장시간 밀려 큐가 가득 차면 연결을 닫는다. 기존 SDK 경로는 대기 중인 관절 자세를 최신값으로 갱신하며 IO 변경과 응답 순서를 보존한다.

Windows용 Rust 도구 체인과 Windows 리소스 컴파일러를 준비한다. MSVC는 Windows SDK의 `rc.exe`, GNU는 MinGW의 `windres`를 사용한다. 저장소 루트에서 실행한다.

```powershell
cargo build --locked --release --manifest-path 2_3DSimulation/VirtualControllerBridge/Cargo.toml
npm run test:bridge
```

릴리스 빌드 후 `./2_3DSimulation/VirtualControllerBridge/package.ps1`을 실행하면 브리지 EXE 하나가 다운로드 ZIP에 담긴다.
