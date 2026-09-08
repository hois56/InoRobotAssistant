# 2D CAD DWG·DXF 가져오기 및 선 선택 기능 개발 계획서

- 작성일: 2026-09-07
- 대상: `2_3DSimulation`
- 기능명: 2D CAD Import and Entity Selection
- 목적: `.dwg`와 `.dxf` 2D CAD 도면을 3D 시뮬레이션 장면에 배치하고, 도면의 선·호·폴리라인 등의 CAD 엔티티를 직접 선택할 수 있도록 한다.
- 구현 방향: 사용자 요청의 1번 방식인 `원본 CAD → 변환/해석 → 공통 내부 데이터 → Three.js 선 geometry` 흐름을 사용한다.

## 1. 개발 목표

### 1.1 최종 사용자 기능

사용자가 3D Simulation의 모델 가져오기 기능에서 `.dwg` 또는 `.dxf` 파일을 선택하면 다음 흐름으로 처리한다.

```text
DWG/DXF 파일 선택
    ↓
파일 형식·크기·내부 구조 검사
    ↓
DXF 직접 해석 또는 DWG 변환 어댑터 실행
    ↓
공통 2D CAD 내부 데이터(CAD2D IR) 생성
    ↓
단위·좌표계·블록 변환·도면 범위 정규화
    ↓
3D 시뮬레이션의 X/Y 평면에 도면 표시
    ↓
마우스 호버·클릭으로 CAD 엔티티 선택
    ↓
선택 엔티티의 종류·레이어·좌표·길이·원본 식별자 표시
```

### 1.2 반드시 제공할 기능

1. `.dwg` 파일을 가져올 수 있어야 한다.
2. `.dxf` 파일을 가져올 수 있어야 한다.
3. DWG와 DXF가 같은 공통 데이터 구조로 렌더링되어야 한다.
4. 도면을 현재 3D 좌표계의 X/Y 평면에 표시해야 한다.
5. 도면의 `LINE`, `LWPOLYLINE`, `POLYLINE`, `ARC`, `CIRCLE`, `ELLIPSE`, `SPLINE`을 표시할 수 있어야 한다.
6. 선 또는 곡선 엔티티 위에 마우스를 올리면 호버 강조가 표시되어야 한다.
7. 선 또는 곡선 엔티티를 클릭하면 해당 엔티티만 선택되어야 한다.
8. 선택한 엔티티의 원본 CAD 식별자, 종류, 레이어, 좌표 및 주요 치수를 표시해야 한다.
9. 같은 도면에서 여러 엔티티를 선택하고 해제할 수 있어야 한다.
10. 도면 전체를 숨김·표시하고, 레이어별로 숨김·표시할 수 있어야 한다.
11. 원본 파일의 단위를 확인하여 시뮬레이션 내부 단위인 `mm`로 변환해야 한다.
12. 도면을 화면에 맞추기, 상부 보기, 선택 엔티티 중심 보기 기능을 제공해야 한다.
13. 도면 위치·회전·배율을 도면 루트 단위로 조정할 수 있어야 한다.
14. 작업 복구 시 원본 파일 또는 변환 결과를 이용해 도면을 다시 표시할 수 있어야 한다.
15. 지원하지 않는 CAD 엔티티가 있더라도 전체 파일을 무조건 실패시키지 않고, 누락된 엔티티와 원인을 사용자에게 알려야 한다.

### 1.3 완료 조건

다음 조건을 모두 만족해야 완료로 판정한다.

- 대표 DWG 파일과 대표 DXF 파일을 각각 가져와 3D 화면에 표시할 수 있다.
- 동일한 도면을 DXF로 저장한 결과와 DWG에서 변환한 결과의 선 위치와 크기가 허용 오차 안에서 일치한다.
- 선택 가능한 엔티티가 하나의 거대한 선 묶음으로만 선택되지 않고, 원본 CAD 엔티티 단위로 선택된다.
- 교차하거나 매우 가까운 선이 있을 때 가장 가까운 엔티티를 안정적으로 선택할 수 있다.
- 선택 엔티티의 시작점·끝점·중심점·반지름·길이 등 지원되는 속성이 정확하게 표시된다.
- 모델 트리에서 CAD 문서·레이어·엔티티의 표시 상태를 변경할 수 있다.
- 도면을 이동·회전·배율 조정해도 엔티티 선택 좌표와 표시 정보가 일관된다.
- 브라우저 새로 고침 또는 비정상 종료 후 작업 복구에서 CAD 도면이 복구된다.
- 대용량 도면은 메인 UI를 장시간 멈추지 않고 Worker 또는 변환 진행 상태를 표시한다.
- 한국어·영어·중국어·베트남어 화면에서 새 UI 문구가 누락되지 않는다.
- 지원하지 않는 버전, 손상 파일, 변환기 미설치 상태가 구분된 오류로 표시된다.
- `node --check`와 CAD 전용 검증 스크립트가 통과한다.
- 실제 브라우저에서 DWG·DXF 샘플을 가져오고 선택하는 수동 검증을 완료한다.

## 2. 현재 프로젝트 기준점

### 2.1 현재 구현 상태

현재 `2_3DSimulation`은 브라우저에서 Three.js를 사용해 3D 장면을 렌더링한다.

| 영역 | 현재 구현 | 이번 계획의 확장 방향 |
| --- | --- | --- |
| 3D 엔진 | `three@0.156.1`을 import map으로 로드 | 기존 Three.js 버전과 렌더링 흐름 유지 |
| 3D 파일 가져오기 | STL, FBX, OBJ, GLB, GLTF, STP, STEP | DWG·DXF를 별도 2D CAD 흐름으로 추가 |
| STEP 처리 | `step-import-worker.js`에서 메시로 변환 | DXF Worker와 DWG 변환 어댑터를 같은 비동기 구조로 추가 |
| 모델 등록 | 가져온 모델을 `state.models`와 장면에 등록 | CAD 문서도 루트 모델로 등록하고 하위 엔티티 정보를 유지 |
| 화면 선택 | `sceneSelectionRaycaster.intersectObjects(..., true)` 사용 | Line/LineSegments 선택과 CAD 엔티티 ID 반환 추가 |
| 모델 트리 | 가져온 모델 및 부품 선택·표시·숨김 지원 | CAD 문서·레이어·엔티티 계층 표시 추가 |
| 작업 복구 | IndexedDB에 원본 Blob을 저장하고 작업 스냅샷에는 asset ID 저장 | DWG·DXF 원본 및 변환 메타데이터를 기존 asset 흐름에 연결 |
| 장면 좌표 | Z축이 위쪽인 좌표계, 기본 도면 평면은 X/Y | CAD의 2D 좌표를 X/Y에 배치하고 Z 오프셋은 루트에서 관리 |
| 도형·스케치 | 2D 스케치 및 도형 생성 로직 존재 | CAD 선택 오버레이·치수 표시에서 재사용 |
| 협업 | 작업 스냅샷과 장면 명령을 WebSocket으로 전송 | CAD 원본 바이너리는 전송하지 않고 asset hash/변환 결과 정책을 별도로 정의 |

### 2.2 기존 코드에서 재사용할 지점

- `2_3DSimulation/main.js`
  - `SUPPORTED_IMPORT_EXTENSIONS`: 가져오기 확장자 등록
  - `openImportDialog()`: 파일 형식 검사와 가져오기 대화상자 진입
  - `parseUploaded3DFile()`: 파일별 비동기 파서 분기
  - `handle3DImport()`: 가져온 객체의 등록·배치·변환·저장
  - `getSceneModelAtPointer()`: 장면 Raycaster 선택 흐름
  - `state.models`, `selectedModel`, `selectedModelPart`: 모델 선택 상태
  - `serializeWorkspaceSceneModel()`, `serializeWorkspaceSnapshot()`: 작업 복구 데이터 생성
  - `persistImportedWorkspaceAsset()`, `restoreWorkspaceImportedModel()`: 원본 파일 저장·복구
  - 모델 트리 visibility와 TransformControls 처리
- `2_3DSimulation/step-import-worker.js`
  - 대용량 파일을 메인 스레드 밖에서 해석하는 Worker 패턴
  - ArrayBuffer 전송과 진행 상태 메시지 패턴
  - 파싱 실패 시 Worker 종료·재시작·사용자 오류 처리 패턴
- `2_3DSimulation/workspace-recovery-core.mjs`
  - IndexedDB asset 저장소와 quota 검사
  - 작업 스냅샷 schema와 asset ID 연결
- `2_3DSimulation/index.html`
  - 기존 가져오기 대화상자
  - 모델 트리와 패널 런처
  - 작업 복구·측정·도형 패널
- `2_3DSimulation/style.css`
  - 패널·트리·선택 상태·모바일 대응 스타일
- `Language/*/robot-3d-viewer.json`
  - 3D Simulation UI 번역 데이터

### 2.3 현재 지원하지 않는 사항

- 현재 모델 가져오기 입력 검사는 `.stl`, `.fbx`, `.obj`, `.glb`, `.gltf`, `.stp`, `.step`만 허용한다.
- 현재 `parseUploaded3DFile()`에는 DWG·DXF 분기가 없다.
- 현재 CAD 다운로드 기능에서 DWG는 다운로드 대상으로만 사용되며, 브라우저에서 도면 엔티티를 해석하지 않는다.
- 현재 장면 선택은 Mesh 또는 기존 3D 모델 부품을 중심으로 구성되어 있다. CAD 2D 엔티티별 속성 선택 모델은 없다.
- 현재 작업 복구 snapshot schema는 `1`이며, CAD 문서 전용 데이터 구조는 정의되어 있지 않다.
- 현재 일반 3D 파일 가져오기 제한은 `500 MiB`(`MAX_MODEL_IMPORT_SIZE_BYTES`)이며, DWG·DXF에도 동일 제한을 우선 적용하고 CAD 엔티티 수 제한은 별도로 둔다.

## 3. 범위와 비범위

### 3.1 이번 기능에 포함

#### 파일

- `.dwg`
- `.dxf`
- ASCII DXF
- Binary DXF
- CAD 파일의 원본 파일명, 확장자, 파일 크기, 수정 시각, 단위 정보

#### 엔티티

| 우선순위 | 엔티티 | 처리 방식 | 선택 | 비고 |
| --- | --- | --- | --- | --- |
| P0 | `LINE` | 시작점·끝점으로 렌더링 | 지원 | 기본 선 선택의 기준 |
| P0 | `LWPOLYLINE` | 정점·bulge를 선분/호로 변환 | 지원 | 닫힘 여부와 폭 정보 보존 |
| P0 | `POLYLINE` / `VERTEX` | 정점과 곡선 정보를 변환 | 지원 | 2D 경량 폴리라인 우선 |
| P0 | `ARC` | 중심·반지름·각도로 샘플링 | 지원 | 원본 각도와 중심 보존 |
| P0 | `CIRCLE` | 원형 선으로 샘플링 | 지원 | 선택 후 중심·반지름 표시 |
| P1 | `ELLIPSE` | 타원 파라미터를 샘플링 | 지원 | 회전된 타원 포함 |
| P1 | `SPLINE` | 허용오차 기반 곡선 샘플링 | 지원 | 원본 control point도 메타데이터로 보존 |
| P1 | `INSERT` | 블록 엔티티를 변환행렬로 전개 | 지원 | 원본 block name과 insert path 보존 |
| P1 | `POINT` | 점 마커로 표시 | 지원 | 선 선택과 별도 스타일 |
| P1 | `RAY` / `XLINE` | 화면 표시 범위를 정해 클리핑 | 지원 | 무한선은 도면 범위 내에서만 표시 |
| P2 | `TEXT` / `MTEXT` | HTML 또는 Sprite overlay | 제한적 | 선 선택과 별도 객체 |
| P2 | `DIMENSION` | 치수선과 텍스트를 재구성 | 제한적 | 최초 버전에서는 읽기 전용 표시 |
| P2 | `HATCH` | 외곽 경계 또는 반투명 면 | 제한적 | 선 선택 대상은 경계 엔티티로 한정 |
| P2 | `LEADER` / `MULTILEADER` | 선분·화살표로 표시 | 제한적 | 표시만 지원할 수 있음 |
| P3 | Proxy/custom object | 원본 정보와 누락 목록 기록 | 미지원 | 전체 파일 실패 사유로 사용하지 않음 |

P0는 첫 번째 동작 가능한 버전에 반드시 포함한다. P1은 2D CAD 사용성을 위해 우선 포함하고, P2는 첫 릴리스의 핵심 선 선택 기능을 지연시키지 않는 조건에서 추가한다.

#### 장면 동작

- CAD 문서 루트 선택
- 레이어별 표시·숨김
- 개별 엔티티 호버·선택·다중 선택
- 선택 해제
- 전체 도면 화면 맞춤
- 선택 엔티티 화면 맞춤
- 도면 루트 이동·회전·배율 변경
- 선 색상, 투명도, 표시 두께 변경
- 도면 표시 순서 및 바닥 평면과의 Z offset 조정
- CAD 문서 삭제·복사·붙여넣기

### 3.2 이번 범위에 포함하지 않음

- DWG/DXF 원본 내용을 편집해 저장하는 CAD 편집기 기능
- 선을 분할·연장·트림·필렛하는 CAD 명령
- DWG/DXF로 다시 내보내기
- 3D Solid, Surface, BREP를 3D 솔리드로 변환하는 기능
- AutoCAD 동적 블록의 완전한 파라미터 편집
- Civil 3D, Architecture, Mechanical 등 특수 객체의 완전한 의미 보존
- 외부 XREF 파일을 자동으로 인터넷이나 임의 경로에서 수집하는 기능
- 선택한 선을 바로 로봇 프로그램의 `MOVJ`·`MOVL` 명령으로 자동 생성하는 기능

선택한 선의 좌표와 곡선 정보를 이후 로봇 경로 생성 기능에서 사용할 수 있도록 데이터는 보존하지만, 경로 생성은 별도 기능으로 분리한다.

## 4. 기술적 결정

### 4.1 공통 변환 전략

DWG와 DXF를 렌더러에서 각각 별도로 처리하지 않는다. 두 파일을 아래의 공통 내부 데이터인 `CAD2D IR`로 변환한 뒤 같은 렌더링·선택·저장 코드를 사용한다.

```text
DXF ──> DXF Parser Worker ────────┐
                                   ├──> CAD2D IR ──> Coordinate Normalizer
DWG ──> DWG Converter Adapter ────┘                         ↓
                                                  CAD Scene Builder
                                                          ↓
                                              Hover / Pick / Selection
```

이 구조를 사용하는 이유는 다음과 같다.

- DWG와 DXF의 파일 형식 차이를 UI와 Three.js 코드에서 숨길 수 있다.
- DXF 파서가 반환하는 값과 DWG 변환기가 반환하는 값을 동일한 검증기로 검사할 수 있다.
- DWG 변환 엔진을 교체해도 화면·선택·저장 코드를 다시 작성하지 않아도 된다.
- 선택 결과에 원본 CAD의 `handle`, `layer`, `blockPath`를 공통으로 남길 수 있다.
- 이후 SVG, HPGL, JSON 기반 CAD 입력을 추가할 때도 변환 어댑터만 추가할 수 있다.

### 4.2 DXF 처리 방침

DXF는 가능한 경우 브라우저 Web Worker에서 직접 해석한다.

처리 순서는 다음과 같다.

1. 파일의 처음 바이트와 확장자를 확인한다.
2. ASCII DXF인지 Binary DXF인지 구분한다.
3. `HEADER`, `TABLES`, `BLOCKS`, `ENTITIES` 섹션을 읽는다.
4. `HEADER`에서 단위와 도면 변수 정보를 읽는다.
5. `TABLES`에서 레이어·색상·선종류 정보를 읽는다.
6. `BLOCKS`에서 블록 정의를 읽는다.
7. `ENTITIES`의 Model Space 기본 엔티티를 읽는다.
8. `INSERT`는 블록 변환행렬을 적용해 표시용 엔티티를 생성한다.
9. OCS 또는 Extrusion 방향이 있는 경우 WCS로 변환한다.
10. 곡선은 화면 품질에 맞는 허용오차로 점 목록을 만든다.
11. 공통 `CAD2D IR`로 직렬화하여 메인 스레드로 전달한다.

DXF 파서는 다음 원칙을 따른다.

- 원본 엔티티의 handle을 잃지 않는다.
- 파싱 중 생성되는 임시 객체는 Worker 안에서만 유지한다.
- 메인 스레드로는 JSON 호환 데이터와 Transferable ArrayBuffer만 전송한다.
- 대량 정점은 chunk 단위로 전송해 진행률을 표시한다.
- 알 수 없는 group code는 필요한 경우 보존하되 렌더링에 영향을 주지 않도록 한다.
- 손상된 엔티티 하나 때문에 전체 파일을 실패시키지 않고 해당 엔티티만 warning으로 기록한다.

### 4.3 DWG 처리 방침

DWG는 브라우저 Three.js가 직접 읽는 형식이 아니므로 `DWG Converter Adapter`를 둔다. 이 어댑터의 결과는 DXF 자체가 아니라 `CAD2D IR`로 반환하는 것을 기본으로 한다.

#### 권장 운영 구조

```text
Browser
  └─ DWG file
       └─ localhost CAD Converter Bridge
            ├─ DWG reader / converter SDK
            ├─ version and unit inspection
            ├─ supported entity extraction
            └─ CAD2D IR JSON response
```

현재 프로젝트가 Node 기반 로컬 서버로 실행되는 흐름을 가지고 있으므로, 최초 구현은 다음처럼 분리한다.

- 정적 웹 서버: 기존 `tools/serve-local.cjs` 유지
- CAD 변환 브리지: 별도 로컬 프로세스 또는 로컬 HTTP endpoint
- 브라우저: 브리지의 상태 확인, 파일 전송, 진행률 표시, 결과 검증
- 변환기: DWG 해석에 필요한 SDK 또는 실행 파일을 어댑터 뒤에 배치

DWG 변환 SDK는 반드시 다음 기준으로 선정한다.

1. 현재 필요한 DWG 버전 범위를 읽을 수 있어야 한다.
2. `LINE`, `LWPOLYLINE`, `POLYLINE`, `ARC`, `CIRCLE`, `ELLIPSE`, `SPLINE`, `INSERT`의 원본 속성을 얻을 수 있어야 한다.
3. 레이어, 색상, handle, block path를 얻을 수 있어야 한다.
4. 상업적 배포에 필요한 라이선스를 확인할 수 있어야 한다.
5. 변환 결과를 JSON 또는 자체 IPC로 안전하게 반환할 수 있어야 한다.
6. 변환기 미설치·버전 불일치·지원하지 않는 DWG 버전을 구분해 반환할 수 있어야 한다.

ODA Drawings SDK와 같은 상용 DWG 엔진은 DWG/DXF의 읽기와 시각화, 여러 표준 객체와 변환 기능을 제공하는 후보가 될 수 있다. 다만 SDK 비용·배포 권한·사용 가능한 언어 바인딩은 구현 착수 전에 별도 확인해야 하며, 라이선스가 확인되기 전에는 SDK 바이너리나 원본 라이브러리를 저장소에 포함하지 않는다.

#### DWG 변환 어댑터 계약

브라우저는 특정 DWG SDK의 함수명을 알지 않는다. 어댑터의 외부 계약만 사용한다.

```text
GET  /health
POST /convert/dwg
     request: binary DWG + options JSON
     response: CAD2D IR JSON 또는 chunk stream
```

필수 요청 옵션:

- `space`: `modelspace` 또는 선택된 layout
- `targetUnit`: 기본 `mm`
- `curveTolerance`: 곡선 샘플링 허용오차
- `includeText`: TEXT/MTEXT 포함 여부
- `includeDimensions`: DIMENSION 포함 여부
- `explodeInserts`: 블록 INSERT를 표시용 엔티티로 전개할지 여부
- `preserveSourceHandles`: 원본 handle 보존 여부

브리지의 응답은 다음을 포함한다.

- converter version
- DWG version
- source unit
- parsed entity count
- supported entity count
- skipped entity count
- warnings
- CAD2D IR 또는 chunk 참조

#### 배포 모드

| 모드 | DWG 처리 | 장점 | 주의점 | 적용 단계 |
| --- | --- | --- | --- | --- |
| 로컬 브리지 | 사용자 PC의 변환기 사용 | 파일이 외부 서버로 나가지 않음 | 설치·업데이트·라이선스 관리 필요 | 1차 권장 |
| 브라우저 WASM | 브라우저 안에서 DWG 해석 | 별도 서버가 적음 | WASM 크기·메모리·SDK 라이선스 검토 필요 | PoC 후 판단 |
| 사내 변환 서버 | 중앙 서버에서 DWG 변환 | 클라이언트 배포 단순 | 파일 보안·네트워크·서버 유지 필요 | 사내 배포 시 |
| 사용자 DXF 변환 | 사용자가 DXF로 저장 | 구현이 가장 단순 | DWG 직접 지원 요구를 만족하지 못함 | 대체 경로만 제공 |

최종 제품 요구사항이 `.dwg` 직접 지원이므로 사용자 변환만을 최종 구현으로 채택하지 않는다. 1차 구현은 로컬 브리지 계약을 확정하고, 실제 SDK 선정 이후 로컬 브리지 또는 WASM을 선택한다.

### 4.4 렌더링 전략

CAD 문서의 장면 계층은 다음과 같이 구성한다.

```text
CAD Document Root (THREE.Group)
├─ CAD Layer Group: Layer A
│  ├─ CAD Entity Group: LINE handle 10A
│  │  └─ THREE.Line
│  └─ CAD Entity Group: ARC handle 10B
│     └─ THREE.Line
├─ CAD Layer Group: Layer B
│  └─ CAD Entity Group: LWPOLYLINE handle 10C
│     └─ THREE.Line or THREE.LineSegments
└─ CAD Overlay / Selection Group
```

원칙:

- CAD 문서 루트는 `state.models`의 하나의 모델로 등록한다.
- 레이어 그룹은 표시 상태와 선택 필터를 소유한다.
- 엔티티 그룹은 원본 handle과 CAD2D IR의 entity ID를 `userData`에 가진다.
- 렌더링 선과 선택용 hit proxy를 분리할 수 있다.
- 선택 강조선은 원본 geometry를 복사하지 않고 별도 overlay로 표시한다.
- CAD 문서의 투명도·배율·회전·위치는 루트에 적용한다.
- 원본 엔티티의 2D 좌표는 로컬 X/Y 좌표로 두고 로컬 Z는 0으로 둔다.
- 현재 프로젝트의 Z-up 좌표계와 일치하도록 CAD 문서 루트의 기준 평면을 X/Y로 고정한다.

## 5. CAD2D IR 설계

### 5.1 설계 원칙

CAD2D IR은 렌더링을 위한 점 목록뿐 아니라, 원본 엔티티를 다시 식별하고 선택 결과를 해석할 수 있는 분석 데이터를 함께 보존한다.

- 원본 handle을 보존한다.
- 변환 전 원본 타입과 변환 후 렌더링 타입을 구분한다.
- 선·호·원·타원의 analytic parameter를 보존한다.
- 곡선 샘플은 렌더링용으로만 사용한다.
- 모든 좌표는 target unit인 mm로 정규화한다.
- 원본 파일 hash를 문서와 엔티티의 안정적인 기준으로 사용한다.
- 엔티티 ID는 파일을 다시 가져와도 가능한 한 동일해야 한다.
- 표시에서 생략된 엔티티와 원인은 warning으로 보존한다.

### 5.2 문서 구조 예시

```js
{
  schemaVersion: 1,
  documentId: "cad2d-<sha256>",
  source: {
    fileName: "layout.dwg",
    extension: "dwg",
    size: 1234567,
    lastModified: 0,
    sha256: "...",
    cadVersion: "AC1027",
    sourceUnit: "millimeter",
    targetUnit: "mm",
    unitScale: 1,
    parser: "dwg-bridge",
    parserVersion: "..."
  },
  drawing: {
    activeSpace: "modelspace",
    bounds: {
      min: [0, 0],
      max: [1000, 500]
    },
    layers: [
      {
        id: "layer-0",
        name: "0",
        color: "#ffffff",
        visible: true,
        entityCount: 10
      }
    ],
    blocks: []
  },
  entities: [
    {
      id: "<sha256>:10A:",
      handle: "10A",
      type: "LINE",
      renderType: "line",
      layerId: "layer-0",
      layerName: "0",
      color: "#ffffff",
      linetype: "Continuous",
      sourceSpace: "modelspace",
      blockPath: [],
      geometry: {
        kind: "line",
        start: [0, 0],
        end: [100, 0],
        points: [[0, 0], [100, 0]]
      },
      bounds: {
        min: [0, 0],
        max: [100, 0]
      },
      selectable: true,
      warningCodes: []
    }
  ],
  warnings: []
}
```

### 5.3 엔티티별 geometry 데이터

#### LINE

```js
geometry: {
  kind: 'line',
  start: [x1, y1],
  end: [x2, y2],
  points: [[x1, y1], [x2, y2]]
}
```

저장할 분석값:

- 시작점
- 끝점
- 길이
- 방향 벡터
- 도면 로컬 좌표
- 변환 이후 월드 좌표는 장면에서 계산

#### LWPOLYLINE / POLYLINE

```js
geometry: {
  kind: 'polyline',
  closed: true,
  elevation: 0,
  vertices: [
    { point: [0, 0], bulge: 0, startWidth: 0, endWidth: 0 },
    { point: [100, 0], bulge: 0.4142, startWidth: 0, endWidth: 0 }
  ],
  points: [[0, 0], [100, 0], [140, 40]]
}
```

- `vertices`는 원본 CAD 정보를 보존한다.
- `points`는 렌더링에 사용하는 선형화 결과다.
- bulge가 0이면 직선으로 처리한다.
- bulge가 0이 아니면 두 정점 사이를 원호로 변환한다.
- `closed`가 true이면 마지막 정점에서 첫 번째 정점까지 연결한다.
- 폭이 있는 폴리라인은 최초 버전에서 중심선으로 표시하고 warning을 남긴다.

#### ARC

```js
geometry: {
  kind: 'arc',
  center: [cx, cy],
  radius: r,
  startAngle: a0,
  endAngle: a1,
  clockwise: false,
  points: [[...], [...]]
}
```

- 원본 중심·반지름·각도를 보존한다.
- 각도는 내부적으로 radian, UI에서는 degree로 표시한다.
- start angle이 end angle보다 큰 경우에도 CAD 의미를 잃지 않도록 sweep을 별도 계산한다.

#### CIRCLE

```js
geometry: {
  kind: 'circle',
  center: [cx, cy],
  radius: r,
  points: [[...], [...], ...]
}
```

- 렌더링은 닫힌 선으로 처리한다.
- 선택 정보에는 중심·반지름·지름·둘레를 표시한다.
- 이후 스냅 기능에서 중심점과 사분점 후보를 생성할 수 있도록 한다.

#### ELLIPSE / SPLINE

- 원본 control point, major axis, ratio, knot, weight 등 해석 가능한 값을 보존한다.
- Three.js 렌더링을 위해 허용오차 기반으로 점을 샘플링한다.
- 샘플링 점 수에는 최대값을 둔다.
- 최대값을 초과하면 점 간격을 늘리고 warning을 기록한다.
- 선택 결과는 샘플 점이 아니라 원본 ELLIPSE 또는 SPLINE 엔티티를 반환한다.

### 5.4 ID 및 안정성

엔티티 ID 생성 우선순위:

1. `sha256 + handle + blockPath`
2. handle이 없으면 `sha256 + sourceIndex + blockPath`
3. 변환기가 제공하는 stable ID가 있으면 sourceIndex보다 우선 사용

예시:

```text
<document-sha256>:10A:
<document-sha256>:20F:DoorBlock/3
<document-sha256>:index-18:
```

엔티티 ID는 화면 선택, 모델 트리, undo/redo, 협업 명령, 로그에 사용한다. `THREE.Object3D.uuid`만을 영구 식별자로 사용하지 않는다.

## 6. 좌표계·단위·배치 정책

### 6.1 좌표계

현재 시뮬레이션의 기준 좌표계는 Z축이 위쪽이다. 2D CAD는 다음과 같이 배치한다.

```text
월드 Z
  ↑
  │   CAD 도면 평면: X/Y
  │   Z = cadPlaneOffset
  └──────────────→ 월드 X
       월드 Y는 CAD의 Y 방향
```

- CAD 문서의 로컬 X는 시뮬레이션 X에 매핑한다.
- CAD 문서의 로컬 Y는 시뮬레이션 Y에 매핑한다.
- CAD 문서의 로컬 Z는 기본적으로 0이다.
- 기본 `cadPlaneOffset`은 `0mm`이다.
- 로봇 베이스나 바닥과 겹칠 때는 사용자가 Z offset을 입력할 수 있다.
- 루트 회전은 기본값 `[0, 0, 0]`이며, 도면을 세워 배치하는 경우 TransformControls로 회전한다.

### 6.2 단위

단위 우선순위:

1. CAD 파일의 명시적 INSUNITS 또는 변환기 단위
2. 사용자가 가져오기 대화상자에서 지정한 단위
3. 프로젝트 기본값 `mm`
4. 위 정보가 없으면 사용자 확인 후 적용

지원 단위와 mm 환산값:

| 원본 단위 | mm 환산 |
| --- | ---: |
| millimeter | 1 |
| centimeter | 10 |
| meter | 1000 |
| inch | 25.4 |
| foot | 304.8 |
| mil | 0.0254 |
| unknown | 사용자 선택 필요 |

단위가 unknown인데 자동으로 1을 적용하지 않는다. 사용자에게 `mm`, `inch`, `cm`, `m` 중 하나를 선택하게 하고, 선택값을 작업 데이터에 저장한다.

### 6.3 원점과 화면 맞춤

- 기본 원점은 CAD 원본 좌표계의 `(0, 0)`을 유지한다.
- 원본 좌표가 매우 큰 경우 화면 맞춤은 별도의 표시 카메라 계산으로 처리하며, geometry 자체를 임의로 이동하지 않는다.
- 사용자가 `원점을 도면 중심으로 이동`을 선택하면 CAD 루트의 position만 이동한다.
- 원본 좌표와 시뮬레이션 월드 좌표의 관계를 패널에 표시한다.
- 화면 맞춤 시 도면 bounding box에 padding을 추가한다.
- 빈 도면 또는 폭·높이가 0인 도면은 자동 화면 맞춤을 수행하지 않고 오류를 표시한다.

## 7. 선택 및 호버 설계

### 7.1 선택 단위

선택 단위는 다음 우선순위로 정의한다.

1. 단일 CAD 엔티티
2. 같은 layer의 엔티티 묶음
3. CAD 문서 전체

기본 클릭은 단일 엔티티를 선택한다. 레이어 선택은 모델 트리 또는 CAD 패널에서 제공한다.

### 7.2 Raycaster 처리

현재 장면 선택 Raycaster를 확장하되, CAD 선이 기존 모델 선택을 방해하지 않도록 선택 대상을 분리한다.

- CAD 엔티티에는 전용 Three.js layer를 부여한다.
- CAD 선택 모드에서는 CAD layer를 우선 raycast한다.
- 일반 모델 선택 모드에서는 CAD 선택 layer를 제외할 수 있다.
- CAD 엔티티 선택이 활성화된 상태에서는 grid, axis, dimension overlay, sketch preview를 선택 대상에서 제외한다.
- `Raycaster.params.Line.threshold`는 현재 카메라 거리와 CAD 선의 화면상 목표 클릭 폭을 기준으로 동적으로 계산한다.
- threshold가 너무 크면 가까운 평행선이 잘못 선택되므로 화면 줌 단계별 상한·하한을 둔다.
- `Line`·`LineSegments`의 교차 결과는 entity group으로 역추적한다.
- 여러 교차가 있으면 카메라와의 거리, 화면 거리, 엔티티 우선순위를 순서대로 비교한다.

### 7.3 선택용 hit proxy

CAD 선의 실제 렌더링 두께와 클릭 편의성을 분리한다.

- 표시용 선은 원본 선 스타일을 유지한다.
- 선택용 proxy는 필요한 경우 투명한 `THREE.Line` 또는 얇은 평면 mesh로 만든다.
- proxy는 화면에 보이지 않으며 `depthWrite: false`를 사용한다.
- proxy의 `userData.cadEntityId`로 원본 엔티티를 찾는다.
- proxy가 너무 많아지는 대용량 모드에서는 개별 proxy 대신 공간 인덱스 기반의 2D 선분 거리 계산을 사용한다.
- 선택 결과가 proxy인지 원본인지에 관계없이 사용자에게는 항상 CAD entity 정보만 반환한다.

### 7.4 호버 상태

- 포인터가 CAD 엔티티에 가까워지면 해당 엔티티를 cyan 계열로 강조한다.
- 호버 엔티티의 layer가 숨김이면 선택하지 않는다.
- 호버 정보는 status bar와 CAD 패널에 표시한다.
- 포인터가 이동하지 않는 동안 중복 계산하지 않는다.
- 호버 상태는 workspace snapshot에 저장하지 않는다.
- 호버 overlay는 장면 선택 이벤트를 가로채지 않아야 한다.

### 7.5 클릭 상태

- 단일 클릭: 기존 선택을 해제하고 클릭한 엔티티 하나를 선택한다.
- `Shift + 클릭`: 기존 선택에 엔티티를 추가하거나 제거한다.
- `Ctrl + 클릭`: Windows 일반 선택 동작과 충돌하지 않는 범위에서 다중 선택 보조키로 지원한다.
- 빈 공간 클릭: CAD 선택을 해제한다.
- `Esc`: 활성 CAD 선택 모드 또는 선택 상태를 종료한다.
- 모델 트리에서 엔티티를 선택하면 화면에서 같은 엔티티를 강조한다.
- 다른 3D 모델을 클릭하면 CAD 엔티티 선택을 해제하고 기존 모델 선택 흐름으로 돌아간다.

### 7.6 선택 정보

`CAD Entity` 패널 또는 선택 정보 영역에 다음을 표시한다.

| 엔티티 | 표시 정보 |
| --- | --- |
| 공통 | 이름, 원본 type, handle, layer, block path, 색상, 선종류, 원본 파일명 |
| LINE | 시작점, 끝점, 길이, 각도 |
| POLYLINE | 정점 수, 닫힘 여부, 총 길이, bounding box |
| ARC | 중심, 반지름, 시작각, 끝각, 호 길이 |
| CIRCLE | 중심, 반지름, 지름, 둘레 |
| ELLIPSE | 중심, 장축, 단축, 회전각, 둘레 근사값 |
| SPLINE | control point 수, 차수, 닫힘 여부, 근사 길이 |
| INSERT | block name, insert point, scale, rotation, block path |

좌표는 CAD 로컬 좌표와 시뮬레이션 월드 좌표를 구분해 표시한다.

## 8. UI 설계

### 8.1 가져오기 대화상자

기존 3D 파일 가져오기 대화상자를 확장한다.

- 파일 input의 `accept`에 `.dwg,.dxf`를 추가한다.
- 파일 형식에 따라 `3D Model`과 `2D CAD`를 구분한다.
- 2D CAD 선택 시 Tool·암 로드·Grip Object 배치 옵션은 비활성화한다.
- 기본 배치는 `3D 모델링` 또는 `CAD 도면`으로 표시한다.
- 파일 분석 전에는 원본 파일명·크기·확장자를 표시한다.
- 단위가 unknown이면 단위 선택 영역을 표시한다.
- DWG인 경우 DWG 변환기 상태를 먼저 검사한다.
- 변환 중에는 진행률, 처리 엔티티 수, 경고 수를 표시한다.
- 취소 버튼은 Worker와 DWG 변환 요청을 모두 중단해야 한다.

권장 입력 항목:

- 파일 선택
- 파일 종류
- 원본 단위
- 대상 단위: `mm` 고정 또는 고급 설정
- 활성 공간: `Model Space` / 사용 가능한 layout
- 곡선 정밀도: `가벼움` / `표준` / `높음`
- TEXT/MTEXT 표시 여부
- DIMENSION 표시 여부
- INSERT 블록 전개 여부
- 도면을 원점으로 배치할지 중심으로 배치할지
- 가져오기
- 취소

### 8.2 CAD 문서 패널

새 패널 ID는 `cad-panel`로 한다.

#### 문서 영역

- 파일명
- 파일 형식
- CAD 버전
- 원본 단위와 적용 단위
- 변환기명·버전
- 엔티티 수
- 표시 엔티티 수
- 생략 엔티티 수
- 도면 크기
- 다시 분석 버튼
- 원본 파일 교체 버튼

#### 표시 영역

- 문서 표시/숨김
- 선 색상 모드: 원본 색상 / 단일 색상
- 기본 선 색상
- 선 투명도
- 선 표시 두께
- 선택용 클릭 폭
- 레이어 목록
- 레이어 검색
- 레이어 전체 표시/숨김
- 화면 맞춤
- 상부 보기
- 원점 중심 이동

#### 선택 영역

- 선택 모드 켜기/끄기
- 단일 선택/다중 선택
- 선택 엔티티 수
- 선택 해제
- 선택 엔티티 정보
- 선택 엔티티 좌표 복사
- 선택 엔티티를 CSV 또는 JSON으로 복사

#### 배치 영역

- X/Y/Z 위치
- A/B/C 회전
- X/Y/Z 배율
- Z plane offset
- 적용
- 초기화

### 8.3 모델 트리

```text
CAD 도면: layout.dwg
├─ Layer: 0 (123)
│  ├─ LINE · 10A
│  ├─ ARC · 10B
│  └─ LWPOLYLINE · 10C
├─ Layer: WALL (52)
└─ Layer: DIM (88)
```

대용량 도면에서는 모든 엔티티를 DOM에 한꺼번에 만들지 않는다.

- 문서와 레이어는 항상 표시한다.
- 레이어를 펼칠 때 처음 N개만 표시한다.
- 엔티티 검색 결과는 가상 목록으로 표시한다.
- handle, type, layer, bounding box 검색을 제공한다.
- 트리의 체크박스 변경은 실제 엔티티 visibility와 동기화한다.
- 트리에서 선택한 엔티티는 화면과 패널의 선택 상태를 함께 변경한다.

### 8.4 다국어

다국어 적용 대상:

- CAD 도면
- CAD 문서
- 파일 형식
- 가져오기·변환·분석·선택·레이어·화면 맞춤 문구
- 단위와 오류 메시지
- 접근성용 `aria-label`, `title`, `role="alert"` 문구

다음 CAD 원본 식별자는 영어 원문을 유지한다.

- `DWG`, `DXF`
- `LINE`, `ARC`, `CIRCLE`, `LWPOLYLINE`, `POLYLINE`, `ELLIPSE`, `SPLINE`, `INSERT`
- `Model Space`, `Paper Space`, `Layer`, `Handle`

원본 CAD entity type을 번역하면 사용자 CAD 파일의 의미와 디버깅 로그가 달라질 수 있으므로, UI 설명은 번역하되 원본 type 값은 그대로 표시한다.

## 9. 상태 모델 및 코드 구조

### 9.1 상태 추가

`state`에 다음 영역을 추가한다.

```js
cad2d: {
  documents: [],
  selectedEntityIds: new Set(),
  hoveredEntityId: null,
  activeDocumentId: null,
  importRequestId: null,
  converter: {
    status: 'unknown',
    version: '',
    error: ''
  },
  settings: {
    lineWidth: 1,
    pickWidth: 8,
    curveTolerance: 'standard',
    selectionMode: 'single'
  }
}
```

실제 구현에서는 snapshot 대상 값과 런타임 객체 참조를 분리한다.

- 저장 대상: documentId, assetId, transform, layer visibility, display settings
- 런타임 전용: THREE.Group, THREE.Line, Material, Worker, AbortController, hover object
- `Set`, `Map`, `File`, `Blob`은 직접 JSON에 저장하지 않는다.

### 9.2 추천 모듈 분리

| 파일 | 책임 |
| --- | --- |
| `2_3DSimulation/cad2d-core.mjs` | CAD2D IR schema, 단위, 엔티티 정규화, warning, ID 생성 |
| `2_3DSimulation/dxf-import-worker.js` | ASCII/Binary DXF 해석, 섹션·엔티티 추출, chunk 전송 |
| `2_3DSimulation/cad2d-geometry.mjs` | bulge·arc·ellipse·spline 샘플링, bounds, 길이 계산 |
| `2_3DSimulation/cad2d-renderer.mjs` | IR을 THREE.Group·Layer Group·Entity Group으로 변환 |
| `2_3DSimulation/cad2d-picker.mjs` | CAD 전용 raycast, threshold, hit proxy, selection 결과 |
| `2_3DSimulation/dwg-converter-adapter.mjs` | 로컬 브리지 health check·변환 요청·응답 검증 |
| `tools/cad-converter/` | 실제 DWG 변환 프로세스와 설치·버전 검사 |
| `2_3DSimulation/main.js` | 기존 UI·모델·복구·협업 흐름과 새 모듈 연결 |

`main.js`에 파서·곡선 수학·대량 렌더링 로직을 모두 넣지 않는다. 순수 계산 모듈은 Node 검증 스크립트에서 직접 호출할 수 있어야 한다.

### 9.3 CAD 모델 userData

CAD 루트에는 다음과 같은 메타데이터를 둔다.

```js
{
  uploaded: true,
  cad2d: true,
  cad2dSchemaVersion: 1,
  workspaceModelId: 'model-...',
  workspaceAssetId: 'asset-...',
  modelName: 'layout.dwg',
  sourceExtension: 'dwg',
  sourceUnit: 'millimeter',
  targetUnit: 'mm',
  unitScale: 1,
  cadDocumentId: 'cad2d-...',
  activeSpace: 'modelspace',
  entityCount: 100,
  renderedEntityCount: 98,
  skippedEntityCount: 2,
  cadPlaneOffset: 0,
  cadDisplaySettings: {
    colorMode: 'source',
    color: '#f8fafc',
    opacity: 1,
    lineWidth: 1,
    pickWidth: 8
  },
  cadLayerVisibility: {},
  placement: 'scene'
}
```

CAD 루트의 `placement`는 첫 릴리스에서 `scene`만 허용한다. Tool·arm-load·grip-object에 2D 도면을 부착하는 기능은 별도 요구사항으로 분리한다.

## 10. 작업 복구·Undo/Redo·협업

### 10.1 원본 asset 저장

기존 `persistImportedWorkspaceAsset()`를 재사용한다.

- DWG·DXF 원본 Blob을 IndexedDB에 저장한다.
- snapshot에는 `assetId`, file metadata, source hash를 저장한다.
- 변환 결과가 크면 normalized IR 전체를 snapshot에 넣지 않는다.
- 최근 변환 결과는 asset ID 또는 별도 cache key로 저장한다.
- 원본 파일이 존재하면 복구 시 같은 변환 pipeline을 사용한다.
- 원본 파일이 삭제되었지만 IR cache가 있으면 cache로 표시를 시도한다.
- 원본과 IR이 모두 없으면 모델 트리에는 복구 실패 항목과 복구 방법을 표시한다.

### 10.2 CAD 전용 snapshot

현재 workspace snapshot schema가 `1`이므로, CAD 추가 시 다음 중 하나를 선택한다.

- 전체 workspace schema를 `2`로 올리고 migration을 추가한다.
- 기존 `importedModels` 레코드에 `kind: "cad-2d"`를 추가하고, 기존 schema `1`에서도 unknown kind를 안전하게 무시하게 만든다.

권장 방식은 전체 workspace schema를 불필요하게 깨지 않도록 `kind: "cad-2d"`를 추가하고, CAD 문서 내부에 `cad2dSchemaVersion`을 별도로 두는 것이다.

예시:

```js
{
  kind: 'cad-2d',
  workspaceModelId: 'model-...',
  assetId: 'asset-...',
  name: 'layout.dwg',
  sourceExtension: 'dwg',
  sourceUnit: 'millimeter',
  targetUnit: 'mm',
  sourceHash: '...',
  cadDocumentId: 'cad2d-...',
  placement: 'scene',
  visible: true,
  transform: {
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1]
  },
  cadPlaneOffset: 0,
  layerVisibility: {
    'layer-0': true,
    'layer-wall': false
  },
  displaySettings: {
    colorMode: 'source',
    color: '#f8fafc',
    opacity: 1,
    lineWidth: 1,
    pickWidth: 8
  }
}
```

선택된 엔티티는 기본적으로 snapshot에 저장하지 않는다. 사용자가 작업 재개 시 마지막 선택도 복원해야 한다는 요구가 추가될 경우 `selectedEntityIds`만 저장하고, 해당 엔티티가 없으면 무시한다.

### 10.3 Undo/Redo

Undo/Redo에는 다음 변경을 포함한다.

- CAD 문서 추가
- CAD 문서 삭제
- CAD 문서 복사·붙여넣기
- CAD 문서 위치·회전·배율 변경
- 레이어 visibility 변경
- 색상·투명도·선 두께 변경
- 원점 이동 또는 단위 적용 변경

다음 런타임 상태는 history에 기록하지 않는다.

- 호버
- 현재 hover proxy
- 변환 진행률
- 변환기 연결 상태
- 일시적인 선택 강조 material 상태

### 10.4 협업

현재 협업 snapshot에는 용량 제한이 있으므로 CAD 원본 바이너리를 WebSocket으로 보내지 않는다.

1차 협업 정책:

- CAD 문서의 transform, visibility, layer visibility, display settings만 scene command로 동기화한다.
- 참여자에게 동일한 `sourceHash`의 CAD asset이 있으면 로컬 asset으로 복구한다.
- 참여자에게 asset이 없으면 문서 이름·hash·필요 파일을 안내한다.
- 작은 CAD2D IR은 snapshot 크기 제한 안에서 선택적으로 포함할 수 있다.
- 큰 IR은 snapshot에 포함하지 않고 `cad-asset-missing` 상태로 표시한다.
- 서로 다른 sourceHash를 같은 문서로 덮어쓰지 않는다.
- 협업 중 원본 파일 업로드/다운로드 기능은 별도 보안 검토 후 추가한다.

## 11. 성능 설계

### 11.1 메인 스레드 차단 방지

- DXF 파싱은 Web Worker에서 수행한다.
- DWG 변환은 브리지 프로세스에서 수행한다.
- 곡선 샘플링은 Worker 또는 변환기에서 수행한다.
- 메인 스레드는 chunk를 받아 장면 객체를 배치한다.
- 진행률은 파일 읽기, 파싱, 정규화, 렌더링 단계를 분리해 표시한다.
- 취소 요청은 Worker terminate와 브리지 request abort를 모두 수행한다.

### 11.2 엔티티 수별 렌더링 모드

| 상태 | 기준 예시 | 렌더링 전략 | 선택 전략 |
| --- | ---: | --- | --- |
| normal | 0~20,000 entities | 엔티티별 Group + Line | Three.js Raycaster |
| large | 20,001~100,000 entities | 레이어 단위 batch + 선택 index | batch segment index 또는 공간 인덱스 |
| extreme | 100,000 초과 | 저정밀 미리보기 후 상세 보기 선택 | 공간 인덱스 우선, 선택 시 상세 entity 생성 |

기준값은 샘플 측정 후 조정한다. 숫자를 고정된 성능 보장으로 문서화하지 않고, 실행 환경의 FPS·메모리·선택 지연을 기준으로 검증한다.

### 11.3 공간 인덱스

대용량 모드에서는 모든 엔티티를 매 클릭마다 Raycaster로 검사하지 않는다.

- CAD 로컬 XY bounds를 기준으로 2D uniform grid 또는 R-tree를 구성한다.
- 포인터를 CAD 평면에 투영한다.
- 포인터 주변 pick width에 해당하는 cell만 조회한다.
- 후보 선분과 포인터의 2D 거리를 계산한다.
- 가장 가까운 엔티티를 선택한다.
- 최종 선택 위치는 CAD local point와 world point를 모두 반환한다.

공간 인덱스는 CAD 원본 변경 시 재생성하고, 루트 transform만 변경될 때는 재사용한다.

### 11.4 곡선 샘플링

- 화면 크기와 카메라 거리를 기반으로 목표 pixel error를 정한다.
- 너무 작은 곡선은 최소 8개 점으로 표시한다.
- 큰 원과 긴 spline은 점 수 상한을 둔다.
- 원본 analytic 정보는 샘플 점과 별도로 보존한다.
- 화면 확대 시 고정된 원본 샘플을 계속 사용하는지, 필요 시 재샘플링할지 성능 측정으로 결정한다.
- 선택 정확도는 샘플 점 수가 아니라 analytic 또는 segment distance 계산 결과를 우선한다.

### 11.5 메모리 및 저장 용량

- 원본 파일과 IR을 중복 저장하지 않는다.
- IR cache가 원본 파일보다 지나치게 크면 cache를 저장하지 않고 재변환한다.
- IndexedDB quota 부족 시 도면 표시 자체는 유지하고, 복구 저장 실패만 별도 경고한다.
- 캐시 삭제 시 현재 장면 객체는 삭제하지 않는다.
- 사용자에게 현재 작업을 복구할 수 없는 상태인지 명확히 알린다.

## 12. 오류 처리 및 사용자 메시지

오류는 한 문장으로 뭉뚱그리지 않고 단계별 code를 사용한다.

| 코드 | 상황 | 사용자 메시지 방향 |
| --- | --- | --- |
| `CAD_UNSUPPORTED_EXTENSION` | DWG/DXF 이외의 파일 | 지원 형식 안내 |
| `CAD_FILE_TOO_LARGE` | 파일 크기 제한 초과 | 현재 제한과 파일 크기 안내 |
| `CAD_EMPTY_DRAWING` | 표시 가능한 엔티티 없음 | Model Space/layout 확인 안내 |
| `CAD_DXF_PARSE_FAILED` | DXF 구조 오류 | 파일 손상 또는 지원 버전 안내 |
| `CAD_DXF_BINARY_UNSUPPORTED` | Binary DXF 미지원 parser | parser 업데이트 또는 변환 안내 |
| `CAD_DWG_CONVERTER_UNAVAILABLE` | DWG 브리지 미실행 | 로컬 변환기 실행 안내 |
| `CAD_DWG_VERSION_UNSUPPORTED` | 지원하지 않는 DWG 버전 | 지원 버전 또는 DXF 저장 안내 |
| `CAD_CONVERTER_LICENSE` | 변환기 라이선스/설치 문제 | 관리자 또는 설치 안내 |
| `CAD_UNIT_UNKNOWN` | 단위 정보 없음 | 사용자 단위 선택 요청 |
| `CAD_ENTITY_SKIPPED` | 일부 엔티티 생략 | 생략 수와 원인 보기 |
| `CAD_WORKSPACE_ASSET_MISSING` | 복구 asset 없음 | 원본 파일 재선택 안내 |
| `CAD_COLLAB_ASSET_MISSING` | 협업 참여자의 asset 없음 | 동일 파일을 준비하라는 안내 |

오류 안내에는 내부 stack trace나 SDK 함수명을 표시하지 않는다. 개발자용 console에는 request ID와 원인을 기록한다.

## 13. 보안·개인정보·라이선스

### 13.1 파일 처리 보안

- 확장자만 믿지 않고 파일 signature와 parser 결과를 함께 확인한다.
- DWG/DXF를 외부 서버로 전송하는 경우 사용자에게 전송 사실을 명시한다.
- 기본 모드는 로컬 처리로 한다.
- 브리지 endpoint는 loopback 또는 허용된 사내 주소만 사용한다.
- 파일 경로를 브리지에 직접 전달하지 않고 Blob/stream으로 전달한다.
- 브리지에서 임시 파일을 만들 경우 작업별 고유 폴더와 정리 timeout을 사용한다.
- 변환 결과 JSON의 최대 크기와 entity 수를 제한한다.
- Text/MTEXT에 포함된 URL·스크립트·HTML을 실행하지 않고 일반 문자열로만 표시한다.
- XREF 경로를 자동으로 열거나 네트워크에서 다운로드하지 않는다.
- 파일 이름과 layer name을 HTML에 삽입할 때 textContent 또는 escaping을 사용한다.

### 13.2 SDK 라이선스

- DWG 엔진은 제품 배포 형태에 따라 라이선스 비용과 재배포 조건이 달라진다.
- SDK 원본과 라이선스 키를 저장소에 커밋하지 않는다.
- SDK 바이너리를 배포하려면 최종 계약서와 재배포 권한을 확인한다.
- 개발 환경과 배포 환경에서 변환기 버전을 표시한다.
- 변환기 교체가 가능하도록 `dwg-converter-adapter` 계약을 유지한다.
- DXF parser의 라이선스도 저장소의 third-party notice에 기록한다.

## 14. 구현 단계

### Phase 0. 입력 샘플 및 변환기 PoC

#### 작업

- 실제 사용 예정인 DWG 샘플을 버전별로 수집한다.
- 같은 도면의 DWG와 DXF 쌍을 수집한다.
- Model Space, Paper Space, layer, block, arc, circle, polyline, spline 샘플을 확보한다.
- 파일별 entity 수, bounds, units, 파일 크기를 측정한다.
- DWG 변환 SDK 후보의 라이선스·지원 버전·출력 가능 데이터를 확인한다.
- 변환 결과를 CAD2D IR 초안으로 저장해 비교한다.

#### 완료 조건

- 대표 DWG 최소 3개가 변환 가능한 후보를 확보한다.
- 대표 DXF ASCII와 Binary를 각각 읽을 수 있는 방식을 확정한다.
- DWG와 DXF의 bounds·단위·entity 수 비교 결과를 기록한다.
- DWG 변환기를 저장소에 포함할 수 있는지 여부를 결정한다.

#### 실패 시 경로

- DWG SDK가 필요한 속성을 반환하지 않으면 다른 후보로 교체한다.
- 라이선스가 제품 배포를 허용하지 않으면 브리지 계약만 유지하고 다른 SDK 또는 사내 변환 서비스로 전환한다.
- 브라우저 WASM이 메모리 한계를 넘으면 로컬 브리지로 고정한다.

### Phase 1. CAD2D IR 및 순수 계산 모듈

#### 작업

- `cad2d-core.mjs` 생성
- 단위 정규화, bounds, entity ID, warning schema 구현
- `cad2d-geometry.mjs` 생성
- line, arc, circle, bulge, ellipse, spline 샘플링 구현
- 길이·중심·bounds 계산 구현
- Node 기반 단위 테스트 작성

#### 완료 조건

- 동일 입력에 같은 IR을 생성한다.
- 단위 변환과 bounds 계산이 샘플 기대값과 일치한다.
- 곡선 샘플링이 NaN·무한대·불연속 점을 생성하지 않는다.
- 모든 entity record에 안정적인 ID가 있다.

### Phase 2. DXF Worker

#### 작업

- `dxf-import-worker.js` 생성
- ASCII/Binary DXF 식별
- SECTION·TABLES·BLOCKS·ENTITIES 해석
- P0/P1 엔티티 변환
- layer·color·linetype·handle 보존
- progress·warning·error 메시지 정의
- cancel 메시지 처리

#### 완료 조건

- ASCII DXF와 Binary DXF에서 동일 도면의 IR이 허용 오차 안에서 일치한다.
- 손상된 엔티티 일부가 전체 파일 실패로 이어지지 않는다.
- Worker 종료 후 pending request가 정리된다.

### Phase 3. DWG Converter Adapter

#### 작업

- `dwg-converter-adapter.mjs` 생성
- converter health check
- DWG 변환 request/response schema
- timeout·cancel·retry 정책
- converter version과 DWG version 검증
- 결과 CAD2D IR schema 검증
- 변환기 미설치·버전 불일치 오류 처리

#### 완료 조건

- 브리지 실행 여부에 따라 성공·미설치·지원하지 않는 버전이 구분된다.
- DWG 결과가 DXF 결과와 동일한 CAD2D IR 계약을 만족한다.
- 큰 변환 결과도 chunk 또는 stream으로 처리할 수 있다.

### Phase 4. Three.js CAD Scene Builder

#### 작업

- `cad2d-renderer.mjs` 생성
- document root/layer/entity group 생성
- line, arc, polyline, circle, ellipse, spline 렌더링
- layer visibility
- 색상·투명도·선 두께
- 화면 맞춤·상부 보기
- CAD root transform
- resource disposal

#### 완료 조건

- 모든 P0 entity가 표시된다.
- layer visibility와 문서 visibility가 렌더링과 동기화된다.
- CAD 문서 삭제 후 geometry·material·proxy가 해제된다.

### Phase 5. 선택·호버·속성 패널

#### 작업

- `cad2d-picker.mjs` 생성
- Raycaster layer
- line threshold
- hit proxy
- 대용량 spatial index
- 단일 선택·다중 선택·호버
- 선택 overlay
- entity property panel
- 모델 트리와 선택 상태 동기화

#### 완료 조건

- LINE 하나를 클릭해 원본 handle과 두 끝점을 확인할 수 있다.
- ARC·CIRCLE·POLYLINE도 원본 entity 단위로 선택된다.
- 가까운 두 선을 구분해 선택한다.
- 선택된 CAD 선이 기존 3D Mesh 선택을 방해하지 않는다.

### Phase 6. 기존 UI·복구·Undo/Redo·협업 연결

#### 작업

- 가져오기 대화상자와 accept 속성 확장
- CAD 패널 추가
- 모델 트리 분기
- workspace snapshot에 `cad-2d` 추가
- IndexedDB asset 저장·복구 연결
- history snapshot 연결
- collaboration asset hash와 transform command 연결
- 4개 언어 번역 추가

#### 완료 조건

- 새로 고침 후 CAD 도면이 복구된다.
- 저장 용량 부족 시 명확한 warning이 표시된다.
- 기존 3D 모델·STEP·STL·도형·스케치 작업이 영향받지 않는다.
- 협업 snapshot 크기 제한을 초과할 때 안전하게 거부된다.

### Phase 7. 성능·보안·배포 검증

#### 작업

- 파일 크기 및 엔티티 수별 성능 측정
- Worker 메모리 정리 확인
- 브리지 임시 파일 정리 확인
- converter version 표시
- 라이선스 고지와 third-party notice 추가
- 브라우저·화면 배율·다국어 UI 검증

#### 완료 조건

- 기준 샘플에서 UI가 장시간 멈추지 않는다.
- 취소 후 변환 프로세스가 남지 않는다.
- 손상·악성 문자열·매우 큰 좌표를 안전하게 처리한다.

## 15. 파일별 변경 계획

| 파일 | 변경 내용 |
| --- | --- |
| `2_3DSimulation/index.html` | 파일 input accept, CAD 패널, 변환 상태, 레이어·엔티티 정보 영역, 접근성 속성 추가 |
| `2_3DSimulation/style.css` | CAD 패널, 레이어 트리, entity property, 호버·선택 강조, 진행률, 모바일 레이아웃 추가 |
| `2_3DSimulation/main.js` | DWG/DXF import 분기, CAD state, scene 등록, 선택 통합, workspace·history·collaboration 연결 |
| `2_3DSimulation/cad2d-core.mjs` | CAD2D IR과 정규화 규칙 추가 |
| `2_3DSimulation/dxf-import-worker.js` | DXF Worker parser 추가 |
| `2_3DSimulation/cad2d-geometry.mjs` | bulge·arc·ellipse·spline 샘플링, bounds, 길이 계산 |
| `2_3DSimulation/cad2d-renderer.mjs` | CAD IR을 Three.js 장면으로 변환 |
| `2_3DSimulation/cad2d-picker.mjs` | CAD 엔티티 선택과 hit test 추가 |
| `2_3DSimulation/dwg-converter-adapter.mjs` | 로컬 변환 브리지와의 비동기 계약 추가 |
| `tools/cad-converter/` | DWG converter bridge, health check, 설치 확인, 임시 파일 정리 |
| `2_3DSimulation/workspace-recovery-core.mjs` | CAD asset metadata 및 cache 정책이 필요할 때 최소 확장 |
| `2_3DSimulation/collaboration-core.mjs` | CAD transform·asset manifest 명령 검증이 필요할 때 확장 |
| `tools/validate-2d-cad-import.mjs` | IR·unit·entity·DXF fixture·snapshot 계약 검증 |
| `test-fixtures/cad/` | ASCII DXF, Binary DXF, DWG 변환 결과 fixture, 손상 파일 fixture |
| `Language/ko/robot-3d-viewer.json` | 한국어 UI 문구 추가 |
| `Language/en/robot-3d-viewer.json` | 영어 UI 문구 추가 |
| `Language/zh-CN/robot-3d-viewer.json` | 중국어 UI 문구 추가 |
| `Language/vi/robot-3d-viewer.json` | 베트남어 UI 문구 추가 |
| `0_Home/version-history.json` | 최종 구현 완료 후 문제·결과 중심의 3D Simulation 버전 기록 추가 |

변경 파일명은 실제 구현 전에 현재 작업 트리 상태와 기존 파일 구조를 다시 확인하고 확정한다. 기존 미커밋 변경은 덮어쓰지 않는다.

## 16. 테스트 계획

### 16.1 순수 모듈 테스트

`tools/validate-2d-cad-import.mjs`에서 다음을 검사한다.

- CAD2D IR schema 필수 필드
- 엔티티 ID 안정성
- 단위 환산
- bounds 계산
- line 길이
- polyline 닫힘 여부
- bulge 원호 변환
- arc sweep
- circle 중심·반지름
- ellipse 회전
- spline 샘플 점 유효성
- 빈 도면 처리
- unknown unit 처리
- unsupported entity warning
- NaN·Infinity 좌표 거부
- 과도한 sample count 제한

### 16.2 DXF fixture 테스트

최소 fixture:

1. 단일 LINE
2. 교차 LINE 2개
3. 여러 LAYER
4. LWPOLYLINE 직선
5. LWPOLYLINE bulge 원호
6. 닫힌 POLYLINE
7. ARC·CIRCLE
8. ELLIPSE
9. SPLINE
10. BLOCK 정의와 INSERT
11. inch 단위 도면
12. unit unknown 도면
13. Paper Space와 Model Space가 같이 있는 도면
14. 알 수 없는 entity가 포함된 도면
15. 손상된 section과 잘못된 group code
16. Binary DXF

### 16.3 DWG 검증

DWG는 원본 파일을 테스트 fixture로 포함할지 라이선스와 배포 정책을 먼저 확인한다.

- 내부 샘플은 접근 권한이 있는 개발 환경에서만 사용한다.
- 저장소에 포함할 수 없는 파일은 해시·기대 결과 JSON·테스트 지침만 보관한다.
- DWG 변환 결과의 entity count, bounds, units, layer count를 기준값과 비교한다.
- DWG→CAD2D IR과 동일 파일의 DXF→CAD2D IR의 위치·길이·layer가 허용 오차 내에서 일치하는지 비교한다.
- 지원하지 않는 DWG 버전과 변환기 미설치 테스트를 별도로 수행한다.

### 16.4 Three.js 통합 테스트

- CAD root가 `state.models`에 한 번만 등록되는지 검사
- layer visibility가 실제 renderer visibility에 반영되는지 검사
- document transform 이후 선택 point의 world coordinate가 올바른지 검사
- LINE 선택 시 `selectedEntityId`가 맞는지 검사
- ARC/CIRCLE 선택 시 type과 analytic data가 맞는지 검사
- 빈 공간 클릭 시 selection이 해제되는지 검사
- 기존 Mesh 선택과 CAD Line 선택 우선순위 검사
- CAD overlay가 grid·axis·measurement overlay를 가리지 않는지 검사
- 삭제·복사·붙여넣기 후 resource가 정리되는지 검사

### 16.5 작업 복구 테스트

- 새 CAD 문서 추가 후 snapshot 생성
- IndexedDB asset 존재 상태에서 새로 고침 복구
- asset이 없는 상태에서 복구 warning
- source hash가 다른 asset을 잘못 연결하지 않는지 검사
- layer visibility와 transform 복구
- 저장 용량 부족 시 현재 장면 보존
- 기존 STEP, STL, primitive shape 복구 회귀

### 16.6 수동 브라우저 테스트

| 시나리오 | 기대 결과 |
| --- | --- |
| DWG 정상 파일 가져오기 | 변환 진행률 후 도면 표시 |
| DXF 정상 파일 가져오기 | Worker 진행률 후 도면 표시 |
| DWG 변환기 미실행 | 실행 방법이 포함된 오류 표시 |
| 레이어 숨김 | 해당 layer만 사라짐 |
| 선 호버 | 해당 엔티티만 강조 |
| 선 클릭 | entity 정보가 표시됨 |
| Shift 다중 선택 | 선택 엔티티 수가 증가·감소 |
| ARC 클릭 | 중심·반지름·각도 표시 |
| 도면 이동 후 선 클릭 | 같은 entity와 올바른 world point 표시 |
| 다른 로봇 모델 클릭 | CAD 선택 상태가 기존 모델 선택으로 전환 |
| 화면 맞춤 | 도면 전체가 화면 안에 표시 |
| 새로 고침 | CAD asset과 설정 복구 |
| 다국어 전환 | UI 문구는 번역되고 CAD 원본 type은 유지 |
| 모바일 또는 125~150% 배율 | 패널·선택 정보가 겹치지 않음 |

## 17. 성능 검증 기준

최종 숫자는 실제 개발 PC에서 조정하되, 다음 지표를 반드시 측정한다.

- 파일 읽기 시간
- DXF parse 시간
- DWG 변환 시간
- IR 생성 시간
- 첫 화면 표시 시간
- 화면 맞춤 시간
- 호버 반응 시간
- 클릭 선택 반응 시간
- 레이어 visibility 변경 시간
- peak JS heap
- Worker peak memory
- 변환 결과 JSON 크기
- 30초 이상 장면 표시 시 FPS 변화

초기 목표:

- 일반 샘플은 파일 선택 후 3초 이내에 첫 표시 상태를 제공한다.
- 긴 변환이 필요한 경우 1초 이상 UI가 멈춘 것처럼 보이지 않는다.
- 일반 모드에서 단일 선 선택 반응은 사용자 체감상 즉시 동작해야 한다.
- 대용량 모드에서도 클릭 후 300ms 안에 선택 결과 또는 진행 상태를 표시한다.
- 취소 후 2초 안에 UI가 다시 입력 가능한 상태가 된다.

위 수치는 하드웨어와 파일 복잡도에 따라 조정하며, 완료 판정 시 테스트 장비와 파일 크기를 함께 기록한다.

## 18. 위험 요소와 대응

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| DWG SDK 라이선스 문제 | 배포 불가 | 어댑터 분리, SDK 미커밋, 후보별 계약 확인 |
| DWG 버전 호환성 | 일부 파일 실패 | version check, 명확한 오류, DXF 변환 보조 안내 |
| Binary DXF parser 한계 | DXF 일부 실패 | ASCII/Binary 분기, parser 교체 가능한 Worker 계약 |
| 매우 큰 도면 | 브라우저 멈춤·메모리 부족 | Worker, chunk, batch, spatial index, entity 제한 |
| 큰 좌표값 | 정밀도 저하 | 원본 좌표 보존, 렌더 좌표 offset 분리, unit 검증 |
| 블록 중복 전개 | 엔티티 수 폭증 | block path 보존, 인스턴스 전개 상한, 지연 생성 |
| 곡선 샘플링 오차 | 선택 위치·길이 오류 | analytic data 보존, tolerance 테스트, 샘플 수 상한 |
| 가는 선 클릭 어려움 | 사용자 불편 | dynamic threshold, hit proxy, 2D spatial index |
| CAD 선이 기존 모델을 가림 | 잘못된 선택 | Raycaster layer, 선택 모드, overlay 제외 목록 |
| 복구 asset 삭제 | 작업 손실 | source hash, cache, 복구 경고, 원본 재선택 |
| 협업 snapshot 과대 | 방 생성 실패 | asset binary 미전송, IR 크기 제한, manifest fallback |
| 악성 MTEXT/레이어 문자열 | XSS·UI 오염 | textContent, escaping, HTML 실행 금지 |
| 외부 XREF | 개인정보·예상치 못한 파일 접근 | 자동 수집 금지, warning으로 표시 |

## 19. 최종 구현 전 결정 사항

다음 항목은 실제 코딩 전에 결정 기록을 남긴다.

1. DWG 변환 SDK 및 라이선스 형태
2. 로컬 브리지 설치 방식과 자동 실행 여부
3. 배포 환경에서 DWG 브리지에 접근할 수 있는지 여부
4. Binary DXF parser 구현 방식
5. 최초 릴리스의 최대 파일 크기와 entity 수
6. P1/P2 entity의 첫 릴리스 포함 범위
7. 대용량 선택용 spatial index 구현 시점
8. CAD 원본 asset의 IndexedDB 보존 기간과 삭제 정책
9. 협업 시 CAD asset 전달 정책
10. DWG 원본 fixture의 저장·접근 권한
11. line type과 원본 CAD 색상의 지원 범위
12. Text/MTEXT/DIMENSION의 첫 릴리스 표시 여부

이 중 1~3번은 DWG 지원 여부와 직접 연결되므로 Phase 0에서 결정한다. 결정되지 않은 상태에서 `main.js`에 특정 SDK API를 직접 넣지 않는다.

## 20. 버전 기록 계획

이 문서는 계획서이므로 구현 완료 전 버전 기록에는 기능을 추가하지 않는다. 실제 구현이 완료되면 `0_Home/version-history.json`에는 내부 코드 변경 과정이 아니라 최종 사용자에게 발생한 결과만 기록한다.

권장 기록 문구:

```text
2D CAD 도면을 3D 시뮬레이션에 표시하고, DWG·DXF의 선·호·폴리라인을 직접 선택해 레이어와 좌표 정보를 확인할 수 있도록 지원했습니다.
```

DWG 변환 프로그램 또는 별도 디버깅 도구의 버전이 업데이트되는 경우에는 해당 도구의 버전 기록에 프로그램명과 버전 변경만 기록한다. CAD 선택 기능의 세부 동작은 3D Simulation 버전 기록에 사용자 문제·결과 중심으로 기록한다.

## 21. 참고 자료

- Three.js `Raycaster` 공식 문서: https://threejs.org/docs/pages/Raycaster.html
- Three.js `Line` 공식 문서: https://threejs.org/docs/pages/Line.html
- Open Design Alliance Drawings SDK: https://www.opendesign.com/products/drawings
- Open Design Alliance DWG/DXF 지원 FAQ: https://www.opendesign.com/faq/question/do-oda-products-provide-ability-parse-dxf-and-dwg-files-support-modern-cad-features-eg
- ezdxf DXF entity 문서: https://ezdxf.readthedocs.io/en/stable/dxfentities/index.html

위 자료는 후보 기술과 일반적인 CAD entity 및 선 선택 가능성을 확인하기 위한 참고 자료다. 실제 배포용 DWG SDK 선택은 별도 라이선스 검토 결과를 기준으로 확정한다.
