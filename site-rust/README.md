# 웹 도구의 Rust 엔진

홈, 로봇 모델 선정, 툴 선정, 프로젝트 생성, 소프트웨어, 문서, 디버깅 화면은 Rust를 WebAssembly로 컴파일한 모듈을 사용한다. 브라우저의 입력 이벤트, 화면 표시, 파일 선택과 다운로드는 JavaScript에서 연결한다. Servo는 이미지와 설명을 제공하는 정적 페이지다.

| 기능 | Rust 소스 |
| --- | --- |
| 홈·디버깅 버전 기록, 소프트웨어 필터, 엔코더 영점 보정 | `src/history.rs`, `src/memory.rs` |
| 홈 도구의 업무별 필터, 로봇·문서의 복합 필터와 다국어 검색 | `src/catalog.rs` |
| 모델별 호환 케이블·액세서리, 차단기, 납기와 구성표의 XLSX 압축 | `src/model.rs`, `src/workbook.rs` |
| 재질·형상별 질량, 무게중심, 관성, 허용 부하 판정, STEP 삼각망 적분 및 좌표 변환 | `src/geometry.rs` |
| STEP 스냅 점의 정점 병합, 삼각형 법선·면적, 특징 모서리, B-rep 면 중심 (툴 선정·3D 시뮬레이션) | `src/snap.rs` |
| 프로젝트 파일의 줄 단위 비교, 로봇 프로그램·라벨·포인트·프로젝트 파일 생성 | `src/project.rs`, `src/controller/` |
| 툴 선정 부품 외곽선 (three.js `EdgesGeometry`와 같은 결과) | `src/edges.rs` |

## 빌드

저장소 루트에서 Rust의 WebAssembly 타깃과 Node.js를 사용한다.

```sh
rustup target add wasm32-unknown-unknown
node site-rust/build.mjs
```

빌드는 일반 도구용 `shared/site-engine.js`, 프로젝트 생성용 `4_ProjectGenerator/generator.js`, 툴 선정 전용 `3_ToolSelector/tool-engine.mjs`를 만든다. 각 파일에는 해당 모듈이 들어 있어 별도의 WASM 다운로드 없이 첫 호출 시 초기화한다. 툴 선정 전용 기능은 모든 화면이 불러오는 `site-engine.js`에 넣지 않는다. Rust 원본 또는 연결 코드인 `browser.js`, `controller.js`, `tool.js`를 수정한 후 배포 파일을 다시 생성한다.

프로젝트 생성 결과를 기존 구현과 대조하려면 이전 소스의 `generator.js`를 인수로 넘긴다. 같은 로봇 데이터와 고정한 시각으로 공정 11종과 옵션 조합 64개를 실행해 프로그램과 데이터 파일의 내용을 2,176회 비교한다.

```sh
node site-rust/compare-controller.mjs ../before/4_ProjectGenerator/generator.js
```

## 성능 비교 재현

변환 전 소스에서 `node tools/static-server.mjs`를 실행한다. 기본 포트는 4173이다. 변환 후 소스에서 다음 명령을 실행하면 현재 소스용 로컬 서버를 시작하고, 같은 Chromium에서 두 버전을 번갈아 측정한다.

```sh
node tools/benchmark-site.mjs --baseline-url=http://127.0.0.1:4173 --save=after.json
```

각 작업을 두 번 예열한 뒤 9개 구간의 작업당 평균을 구하고 중앙값을 비교한다. 매 구간에서 먼저 실행하는 버전을 바꾼다. 외부 CDN 요청을 차단하고, 각 구간의 처리 결과도 대조한다. 결과가 달라지거나 처리 시간이 줄지 않은 항목이 있으면 명령이 실패한다. `--case=generate`나 `--case=tool-inputs`로 개별 작업을 측정할 수 있다.

두 버전을 동시에 실행하기 어려우면 기존 서버에서 `node tools/benchmark-site.mjs http://127.0.0.1:4173 --save=before.json`으로 기준을 기록한다. 변환 후 소스에서 `node tools/benchmark-site.mjs --compare=before.json --save=after.json`을 실행한다. 저장된 기록을 비교할 때는 같은 버전의 Chromium이 필요하다.

## 측정 결과

2026년 11월 19일, Windows의 Intel Core Ultra X7 358H와 Chromium 151.0.7922.34에서 작업 시작 전 JavaScript 소스와 변환 후 소스를 비교했다. 시간은 예열 후 사용자 조작 또는 계산 한 묶음의 중앙값이다. 최초 페이지 로딩과 네트워크 전송 시간은 측정 범위에서 제외했다. 배수는 반올림 전 시간으로 계산했다.

| 작업 한 묶음 | 기존 (ms) | 변환 후 (ms) | 속도 배수 |
| --- | ---: | ---: | ---: |
| 홈에서 프로젝트 버전 기록 열기·닫기 | 4.243 | 3.267 | 1.30배 |
| 모델 선정에서 SCARA 필터 적용·초기화 | 6.138 | 3.600 | 1.70배 |
| STEP 삼각형 80,000개의 체적·무게중심·관성 계산 | 2.520 | 1.260 | 2.00배 |
| 툴 A·B·C 입력 변경 후 다관절·SCARA 판정표 5개 표시 | 12.480 | 11.200 | 1.11배 |
| 프로젝트 파일 900줄 비교 | 11.983 | 1.067 | 11.23배 |
| 12공정·3레시피 프로젝트 파일 생성 및 바이트 변환 | 1.100 | 0.700 | 1.57배 |
| 소프트웨어 제품 필터 적용·초기화 | 0.013 | 0.009 | 1.39배 |
| 문서에 검색어 3개를 입력해 결과 갱신 | 5.100 | 1.900 | 2.68배 |
| 영점 보정 티칭값 입력 후 결과 표시 | 0.078 | 0.018 | 4.33배 |

STEP 스냅 점 계산은 `3_ToolSelector/snap-geometry.mjs`가 `shared/site-engine.js`를 불러온 화면에서 Rust 결과를 사용하고, 엔진이 없거나 입력 형식이 예외적이면 같은 동작의 JavaScript 경로로 계산한다. `tests/fast/snap-topology-rust.test.mjs`가 두 경로의 후보 점과 순서가 완전히 같은지 비교한다. 2026년 11월 21일 같은 PC의 Node.js 26.13.1에서 B-rep 면이 있는 원통 400개(삼각형 499,200개)의 스냅 후보 계산 중앙값은 839.2 ms에서 120.2 ms로 6.98배, 면 정보 없는 같은 모델은 1,046.0 ms에서 152.1 ms로 6.88배 빨라졌다.
