# Rust 3D 시뮬레이터

웹사이트의 `/2_3DSimulation/`과 독립 실행판은 이 Cargo 패키지를 WebAssembly로 빌드해 초기 화면과 시뮬레이션 계산을 실행한다. 배포 도구는 Rust 소스, 로봇 모델, 번역, 공용 모듈, 로컬 비전·가상 버스·협업 서버와 브리지 다운로드를 한 폴더로 모은다.

## 실행

독립 배포 ZIP을 받았다면 압축을 푼 폴더에서 `node start.cjs`를 실행한다. 배포본의 Rust 소스는 `simulator-rust/src`에 있다. 코드를 수정한 뒤 `rustup target add wasm32-unknown-unknown`과 `node simulator-rust/build-engine.mjs`를 실행하고 브라우저를 새로 고치면 반영된다.

저장소 루트에서 다음 명령을 실행한다. 준비된 Wasm을 사용하므로 이 과정에는 Node.js만 필요하다.

```sh
node simulator-rust/build.mjs --package-only
node simulator-rust/target/standalone/start.cjs
```

브라우저에서 [로컬 시뮬레이터](http://127.0.0.1:8775/2_3DSimulation/)를 연다. 생성된 `standalone` 폴더 전체를 다른 위치로 옮겨도 그 안에서 `node start.cjs`로 실행할 수 있다. Three.js, STEP 변환기 등 기존 화면이 CDN에서 불러오는 라이브러리에는 인터넷 연결이 필요하다. 기존 사이트와 다른 포트에서 실행하면 브라우저의 작업공간 저장소도 분리된다. 기존 작업은 시뮬레이터의 작업공간 파일로 옮길 수 있다.

상단의 **60 FPS** 체크박스는 화면 렌더링 상한을 켠다. 기본값은 꺼짐이며, 브라우저와 디스플레이가 제공하는 화면 갱신 주기로 그린다. 선택은 같은 브라우저 주소에서 다시 열어도 유지된다. 현재 FPS는 왼쪽 하단 상태 표시 아래에서 확인할 수 있다.

컨트롤러 연결 패널에서 **브리지 다운로드**를 선택해 Rust 브리지를 받은 다음 압축을 풀고 `start-rust-bridge.cmd`를 실행한다. 실행 및 원복 방법은 `2_3DSimulation/RustControllerBridge/README.md`에 있다.

## 빌드와 검사

독립 실행판은 열린 페이지와 같은 포트의 `/collaboration`에 협업 방을 연결한다. 포트를 바꾸려면 `node start.cjs 8776`처럼 실행한다.

```sh
rustup target add wasm32-unknown-unknown
node simulator-rust/build.mjs
node node_modules/@playwright/test/cli.js test --config=simulator-rust/playwright.config.mjs
```

독립 실행판은 웹사이트의 브리지 다운로드를 포함한다. 별도로 빌드한 브리지 ZIP을 넣으려면 `build.mjs`에 `--rust-bridge-zip=<브리지 ZIP 경로>`를 전달한다.

빌드는 저장소의 `2_3DSimulation/wasm/simulation.wasm`도 갱신한다. Windows에서 소스를 빌드하려면 Cargo의 호스트 빌드 스크립트를 링크할 수 있는 환경이 필요하다. MSVC 도구 체인은 Visual Studio C++ 빌드 도구를, GNU 도구 체인은 MinGW 링커를 사용한다. SPC25 행렬 연산을 재생성해야 할 때는 저장소의 펌웨어 레지스터 명령 목록을 갱신한 뒤 `node simulator-rust/generate-matrix.mjs`를 실행한다.

## 구현 범위

Rust 엔진은 6축 플랜지·TCP 순기구학, SCARA 해석 역기구학, 직교 조그의 감쇠 최소자승 관절 보정, 6축·SCARA SPC25 동역학 행렬, S자 가감속 궤적을 계산한다. 장애물 우회에는 Rust에서 구현한 양방향 RRT와 웨이포인트 최단 경로를 사용한다. OLP 수식의 해석·산술 연산과 Tool·Wobj 오프셋의 자세 합성도 Rust로 실행한다.

삼각형 교차 판정, ASCII·바이너리 STL 읽기와 대형 메시 충돌 형상 생성, CAD 원호·타원·폴리라인 샘플링, 폐곡선 연결과 구멍 판별, CAD 곡선의 로봇 궤적 생성, 컨베이어 이송·공급과 센서 통과 구간, 비전의 아핀·호모그래피 및 회전 중심 보정도 Rust에서 실행한다.

ASCII DXF의 레이어, 선종류, 문자, 중첩 블록과 삽입 변환은 Rust에서 읽는다. 기존 CAD 엔티티 ID와 단위를 유지하며, 지원하지 않는 엔티티와 순환 블록은 가져오기 경고에 표시한다.

필름 박리 설비는 Rust에서 파지변과 박리 길이를 구하고, 격자 입자의 거리·굽힘 제약, 중력, 제품 표면과 바닥 접촉을 계산한다.

초기 화면과 설비·컨베이어 추적·비전 설정 양식은 각각 `src/ui/views`와 `src/ui/forms`의 Rust 구성 요소가 브라우저 DOM으로 만든다. 패널의 겹침 순서, 가장자리 판정, 드래그·크기 변경의 경계 계산은 `src/panels.rs`가 담당한다. 비전 설정 탭과 해상도·프로토콜별 입력 제어, 위치 목록의 번호 할당·셀 검증·범위 붙여넣기·키보드 탐색도 Rust에서 처리한다. 기존 프로젝트 파일 형식을 사용한다.

저장한 뷰 사이를 이동할 때 Rust에서 시선의 중심·카메라 자세·거리·확대율을 보간한다. 선택 물체를 따라가는 회전 중심과 직교 카메라의 창 크기 보정도 같은 모듈에서 계산한다.

OLP 프로그램의 If·For·While·Switch 분기, 중첩 반복, 레이블 이동과 논리식 단락 평가는 Rust에서 실행한다. 각 로봇은 별도 실행 상태를 유지하고, 명령 사이에 편집된 프로그램을 반영한다.

OLP 프로젝트의 P·LP·JP 위치 파일, IO·변수 라벨, 원격 IO 매핑을 읽고 포인트·오프셋 참조를 해석하는 코드도 Rust에 있다. 원본 위치 행, Arm 파라미터, 외부 축과 메모를 보존한다.

동적으로 갱신되는 설비·비전 편집 목록과 이벤트 처리, 3D 장면 조작, OLP 개별 장비 명령과 레지스터, 경로 탐색의 장면 조회, 작업공간 저장·열기, 비전·협업·외부 제어기 통신에는 JavaScript 또는 기존 네이티브 구성 요소가 남아 있다. STEP에는 Open CASCADE를, 실제 제어기 연결에는 제조사 IMC100API를 사용한다.

## 원복

이식 직전의 복원 커밋은 `d662c0e5`다. 별도 포트에서 연 작업공간을 원본으로 가져갈 때는 먼저 작업공간 파일을 내보낸다.
