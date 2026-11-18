# 독립 3D 시뮬레이터

이 디렉터리의 Cargo 패키지는 브라우저에서 실행하는 Rust 계산 엔진이다. 배포 도구는 시뮬레이션 화면과 로봇 모델, 번역, 필요한 공용 모듈, 로컬 비전·가상 버스·협업 서버, 브리지 다운로드를 한 폴더로 모은다.

## 실행

저장소 루트에서 다음 명령을 실행한다. 준비된 Wasm을 사용하므로 이 과정에는 Node.js만 필요하다.

```sh
node simulator-rust/build.mjs --package-only
node simulator-rust/target/standalone/start.cjs
```

브라우저에서 [로컬 시뮬레이터](http://127.0.0.1:8775/2_3DSimulation/)를 연다. 생성된 `standalone` 폴더 전체를 다른 위치로 옮겨도 그 안에서 `node start.cjs`로 실행할 수 있다. Three.js, STEP 변환기 등 기존 화면이 CDN에서 불러오는 라이브러리에는 인터넷 연결이 필요하다. 기존 사이트와 다른 포트에서 실행하면 브라우저의 작업공간 저장소도 분리된다. 기존 작업은 시뮬레이터의 작업공간 파일로 옮길 수 있다.

## 빌드와 검사

```sh
rustup target add wasm32-unknown-unknown
node simulator-rust/build.mjs
node node_modules/@playwright/test/cli.js test --config=simulator-rust/playwright.config.mjs
```

빌드는 저장소의 `2_3DSimulation/wasm/simulation.wasm`도 갱신한다. SPC25 행렬 연산을 재생성해야 할 때는 저장소의 펌웨어 레지스터 명령 목록을 갱신한 뒤 `node simulator-rust/generate-matrix.mjs`를 실행한다.

## 구현 범위

Rust 엔진은 6축 플랜지·TCP 순기구학, SCARA 해석 역기구학, 직교 조그의 감쇠 최소자승 관절 보정, 6축·SCARA SPC25 동역학 행렬, S자 가감속 궤적을 계산한다. 장애물 우회에는 Rust에서 구현한 양방향 RRT와 웨이포인트 최단 경로를 사용한다.

삼각형 교차 판정, ASCII·바이너리 STL 읽기와 대형 메시 충돌 형상 생성, CAD 원호·타원·폴리라인 샘플링, 폐곡선 연결과 구멍 판별, CAD 곡선의 로봇 궤적 생성, 컨베이어 이송·공급과 센서 통과 구간, 비전의 아핀·호모그래피 및 회전 중심 보정도 Rust에서 실행한다.

현재 배포본은 기존 화면과 프로젝트 파일 형식을 사용한다. 화면과 3D 장면 조작, OLP 명령 실행, 경로 탐색의 장면 조회, CAD 파일 해석, 비전·협업·외부 제어기 통신에는 JavaScript 또는 기존 네이티브 구성 요소가 남아 있다.

## 원복

이식 직전의 복원 지점은 `main`의 `d662c0e5`다. 별도 포트에서 연 작업공간을 원본으로 가져갈 때는 먼저 작업공간 파일을 내보낸다.
