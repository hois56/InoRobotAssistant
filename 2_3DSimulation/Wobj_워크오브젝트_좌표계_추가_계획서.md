# Wobj 워크오브젝트 좌표계 추가 계획서

- 대상: InoRobot Assistant `2_3DSimulation`
- 작성일: 2026-09-15
- 목표: 시뮬레이션에 워크오브젝트 좌표계 15개를 등록·편집·표시하고, JOG와 OLP 이동에 반영

## 1. 권장 범위

`Wobj[0]`은 World 좌표계로 예약하고, 사용자가 편집할 수 있는 워크오브젝트는 `Wobj[1]`부터 `Wobj[15]`까지 15개로 구성한다. 따라서 UI에는 World를 포함해 총 16개 프레임이 표시된다.

워크오브젝트는 로봇별로 독립 저장한다. 현재 시뮬레이션은 여러 로봇과 로봇별 OLP 실행을 지원하므로, 전역 하나의 Wobj 목록을 사용하면 서로 다른 로봇의 좌표계가 섞일 수 있다.

권장 좌표 정책은 다음과 같다.

| 항목 | 정책 |
|---|---|
| `Wobj[0]` | 고정 World 프레임, 읽기 전용 |
| `Wobj[1]~[15]` | 사용자 편집 프레임 |
| 저장 기준 | 시뮬레이션 World 기준의 X/Y/Z(mm), Rx/Ry/Rz(deg) |
| 회전 순서 | 기존 시뮬레이션과 맞춘 Z-Y-X(Euler `ZYX`) |
| 미설정 Wobj | 기본값은 항등 변환으로 처리하여 기존 프로그램과 호환 |
| 좌표계 이름 | 기본 `Wobj 1` 등, 사용자가 변경 가능 |

실제 컨트롤러의 Wobj 원본 데이터가 Robot Base 기준으로 제공되는 경우에는 가져오기 단계에서 World 기준으로 변환하고, UI와 내부 모델은 한 가지 기준만 사용한다.

## 2. 현재 구조와 구현 공백

- `2_3DSimulation/main.js`의 `state`에는 World 그리드와 Base 축(`state.grid`, `state.baseAxes`)이 이미 있다.
- JOG 화면은 현재 `JOINT`와 `BASE` 모드만 제공한다.
- `2_3DSimulation/olp-runtime.mjs`는 `Wobj[n]`을 모션 옵션으로 파싱해 전달하지만, 해당 번호로 목표 포즈를 변환하지 않는다.
- 현재 OLP 목표는 `buildOlpCartesianTarget()`에서 바로 Robot Base 좌표로 만들어 IK에 전달된다.
- `SetWobj`, `SetFrame` 등의 설정 명령은 현재 지원되지 않는 명령으로 처리된다.
- 모션 프로젝트와 `.inosim` 작업공간은 스키마 버전과 정규화/복구 코드가 분리되어 있으므로, Wobj도 동일한 저장·복구 경로에 포함해야 한다.
- 프로젝트 생성기와 테스트 프로그램에는 이미 `Wobj[B_Wobj]` 또는 `Wobj[n]` 토큰이 사용되고 있지만, Wobj 포즈 데이터 자체를 시뮬레이션으로 읽는 구조는 확인되지 않는다.

## 3. 데이터 모델 설계

별도 순수 모듈 `2_3DSimulation/workobject-core.mjs`를 추가한다. 거대한 `main.js`에 수학과 정규화 로직을 모두 넣지 않고, 단위 테스트 가능한 좌표계 모듈로 분리한다.

권장 상수:

```js
WOBJ_WORLD_INDEX = 0
WOBJ_USER_COUNT = 15
WOBJ_FRAME_COUNT = 16
WOBJ_MAX_INDEX = 15
```

로봇별 상태 예시:

```js
robot.userData.workObjects = [
  {
    index: 0,
    name: 'World',
    defined: true,
    visible: true,
    editable: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0]
  },
  {
    index: 1,
    name: 'Wobj 1',
    defined: false,
    visible: false,
    editable: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0]
  }
  // Wobj 2 ~ Wobj 15
];
robot.userData.activeWorkObjectIndex = 0;
```

간섭영역도 Wobj 기준으로 설정할 수 있어야 하므로, 영역 데이터에는 좌표 기준을 함께 저장한다.

```js
zone.coordinateReference = {
  robotId: null, // Wobj[0]이면 null, Wobj[1]~[15]이면 소유 로봇 ID
  workObjectIndex: 0
};
```

- 간섭영역의 `P1`, `P2`, `Datum point`, `Offset`는 선택한 Wobj 로컬 좌표로 저장한다.
- `workObjectIndex = 0`이면 기존 World 기준과 동일하게 동작한다.
- `Wobj[1]~[15]`를 선택한 경우에는 `robotId + workObjectIndex`를 반드시 함께 저장한다. Wobj가 로봇별로 독립되기 때문에 번호만 저장하면 다른 로봇의 동일 번호 Wobj와 혼동될 수 있다.
- `targetRobotId`가 특정 로봇이면 기본 좌표 기준 로봇으로 해당 로봇을 제안한다. `전체 로봇`이면 사용자가 별도의 `좌표 기준 로봇`을 선택하도록 하여 기준을 모호하게 두지 않는다.
- 영역의 크기와 Safety distance는 기존처럼 mm 값이며, 회전·이동 변환의 영향을 받지 않는다.

모듈에서 제공할 기능:

- 기본 16개 프레임 생성
- 저장 데이터 정규화 및 잘못된 값 보정
- 깊은 복사
- 인덱스/범위/유한수 검증
- `[X,Y,Z,Rx,Ry,Rz]`와 변환 행렬 또는 포즈 간 변환
- Wobj 포즈와 Wobj 내부 TCP 포즈의 합성
- World 포즈를 특정 로봇 Base 포즈로 변환하기 위한 역변환
- 간섭영역 로컬 포인트를 World 포즈로 변환하거나, 검사 Probe를 Wobj 로컬로 역변환

## 4. 좌표 변환 규칙

내부적으로 모든 포즈는 변환 행렬 또는 `position + quaternion`으로 계산하고, UI와 파일에는 X/Y/Z와 Rx/Ry/Rz를 사용한다.

```text
T_world_tcp = T_world_wobj × T_wobj_tcp
T_base_tcp  = inverse(T_world_robotBase) × T_world_tcp
```

이후 `T_base_tcp`를 기존 `solveRobotIK()`에 전달한다. 역방향 표시와 JOG 값 계산은 다음과 같이 한다.

```text
T_wobj_tcp = inverse(T_world_wobj) × T_world_tcp
```

이 규칙을 사용하면 로봇 Base 위치가 이동하거나 외부축이 움직여도 Wobj가 World에 고정된 상태로 유지된다. `Wobj[0]`은 `T_world_wobj = Identity`로 처리한다.

반드시 별도 검증할 회전 케이스:

- Wobj 위치만 이동
- Wobj에 Rz 90도를 적용
- Wobj에 Rx/Ry를 적용한 6축 로봇
- SCARA에서 Wobj가 기울어져 TCP 자세가 도달 불가능해지는 경우
- 로봇 Base가 원점에서 이동한 경우

## 5. 3D 표시 구현

로봇 생성 시 Wobj 시각화 그룹을 생성하고, 각 프레임의 World 포즈를 갱신한다.

- `Wobj[0]`은 기존 World 축과 중복 표시되지 않도록 기존 `state.baseAxes`를 재사용하거나 별도 표시 여부를 하나로 묶는다.
- `Wobj[1]~[15]`은 `THREE.AxesHelper` 기반으로 표시한다.
- 축 색상은 기존 X=빨강, Y=초록, Z=파랑을 재사용한다.
- 선택된 프레임은 강조색과 라벨로 표시하고 나머지는 낮은 불투명도로 표시한다.
- 프레임별 표시/숨김을 지원한다.
- 카메라 거리와 무관하게 읽을 수 있도록 기존 TCP 축 표시에서 사용하는 카메라 스케일 방식을 재사용한다.
- Wobj 프레임은 로봇 Mesh나 충돌 Mesh로 취급하지 않는다.
- 간섭영역 형상은 선택 Wobj의 World 포즈를 따라 이동·회전한다. Wobj가 회전한 영역은 World에서 단순 AABB로 바꾸지 않고, Probe를 Wobj 로컬로 변환한 뒤 기존 직육면체 판정을 수행하여 OBB 동작을 보장한다.

Wobj를 수정할 때는 프레임 시각화만 바뀌며, 로봇 TCP 위치를 임의로 이동시키지 않는다. 이후 Wobj JOG 또는 OLP 명령이 해당 프레임을 사용해 TCP 목표를 계산한다.

## 6. Wobj 설정 UI

기존 패널 구조에 `Wobj 설정` 패널을 추가한다.

구성:

1. 대상 로봇 선택
2. `Wobj[0] World`와 `Wobj[1]~Wobj[15]` 목록
3. 활성 프레임 선택
4. 프레임 이름, 표시/숨김, 설정 여부
5. X/Y/Z(mm), Rx/Ry/Rz(deg) 입력
6. `현재 TCP를 Wobj 원점으로 등록`
7. `초기화`
8. 선택 프레임으로 카메라 이동
9. 3D 이동/회전 핸들

`Wobj[0]`은 이름과 좌표를 읽기 전용으로 표시한다. 15개 행을 한 화면에 무리하게 탭으로 배치하지 않고, 목록 행과 선택된 행의 상세 편집 영역으로 구성한다.

수치 입력과 3D 핸들 조작은 모두 하나의 Undo 기록으로 묶는다. 모션 실행 중에는 편집을 잠그고, 변경 후에는 현재 OLP/모션 프로그램에 적용되는 활성 Wobj를 다시 표시한다.

간섭영역 설정 화면에도 다음 항목을 추가한다.

- 좌표 기준 로봇
- 좌표 기준 Wobj 선택: `Wobj[0] World` 또는 `Wobj[1]~Wobj[15]`
- 형상 입력 라벨에 선택된 기준을 표시: 예를 들어 `P1 (Wobj[3] mm)`
- 기준을 변경할 때 기존 World 좌표를 새 Wobj 로컬 좌표로 변환할지, 숫자값을 유지할지 선택. 기본 동작은 형상이 World에서 이동하지 않도록 좌표를 변환하는 방식으로 한다.

현재 UI의 간섭영역 안내 문구인 `World 좌표계(Wobj[0] 대체)`는 선택한 Wobj 기준을 표시하도록 변경한다.

## 7. JOG 연동

현재 `JOINT / BASE` 선택 구조를 `JOINT / BASE / WOBJ`로 확장한다.

WOBJ 모드에서는 선택된 `activeWorkObjectIndex`를 기준으로 TCP 위치와 회전을 표시한다.

- 현재 TCP의 World 포즈를 Wobj 로컬 포즈로 변환해 입력란에 표시
- Wobj 축 기준의 +/− 이동 버튼 제공
- Wobj 축 기준의 Rx/Ry/Rz 회전 제공
- 3D JOG 핸들의 기준축을 선택된 Wobj 축으로 변경
- 입력값을 World 포즈로 되돌린 뒤 Robot Base 포즈로 변환하여 기존 IK 호출
- 도달 불가능하면 기존 TCP 위치를 복원하고 오류 상태 표시

기존 Base JOG의 `baseJogTarget`과 핸들 코드를 그대로 복사하지 않고, `getJogReferenceFrame()` 같은 공통 계층으로 Base/Wobj 기준을 분리한다. 이를 통해 Base 기능의 회귀를 줄인다.

## 8. OLP 런타임 연동

### 8.1 모션 명령

`olp-runtime.mjs`에서 이미 파싱된 `options.wobj`를 `runOlpMove()`와 `runOlpJump()`가 사용하도록 연결한다.

- `Wobj[n]`이 없으면 `Wobj[0]`을 사용
- `Wobj[B_Wobj]`는 기존 변수 평가 결과를 인덱스로 사용
- `Wobj[0]~Wobj[15]` 외 값은 명확한 런타임 오류로 표시
- 미설정 `Wobj[1]~[15]`는 항등 변환으로 처리해 기존 프로젝트를 깨지 않음
- `MovC`의 중간점과 끝점 모두 동일 Wobj로 변환
- `Jump/Jumpl`의 상승·이동·하강 중간 포즈는 중복 변환하지 않도록 World/Base 포즈 여부를 명확히 구분

### 8.2 런타임 상태

현재 OLP 런타임의 모션 스냅샷에 활성 Wobj 번호를 추가한다. OLP 상태 패널에는 마지막 실행 모션의 `Tool`과 함께 `Wobj[n]`을 표시한다.

### 8.3 간섭영역 검사

간섭영역 검사는 저장 좌표와 판정 좌표를 분리한다.

1. 간섭영역의 P1/P2 또는 Datum/Offset는 선택 Wobj 로컬 좌표로 저장한다.
2. 렌더링 시 `T_world_wobj`를 적용하여 World에서 영역 형상을 표시한다.
3. 검사 시 현재 TCP·MTCP·Sphere·Cuboid Probe의 World 위치/자세에 `inverse(T_world_wobj)`를 적용한다.
4. 변환된 Wobj 로컬 Probe를 `interference-zone-core.mjs`의 bounds 판정에 전달한다.
5. Wobj가 변경되면 영역 시각화, 현재 간섭 상태, OUT/알람 상태를 즉시 다시 계산한다.

```text
probe_wobj = inverse(T_world_wobj) × probe_world
interference = test(probe_wobj, zone.geometry)
```

이 구조는 Wobj 회전이 있는 경우에도 영역을 회전된 직육면체로 판정할 수 있고, World 좌표로 숫자를 미리 변환해 저장하는 방식에서 발생하는 기준 불일치를 막는다. `targetRobotId = all`인 영역은 저장된 `coordinateReference.robotId`의 Wobj를 기준으로 모든 대상 로봇 Probe를 검사한다.

간섭영역의 `Get current point`와 3D 스냅도 동일한 규칙을 적용한다.

```text
현재 TCP/스냅 World 위치
  → inverse(T_world_wobj) 적용
  → 간섭영역 geometry에 Wobj 로컬 X/Y/Z로 저장
```

따라서 사용자가 Wobj를 이동하거나 회전해도 간섭영역의 위치가 작업물 기준으로 함께 이동한다. 반대로 `TCP 감지 범위`의 구·박스·MTCP 오프셋은 Tool에 부착된 형상이므로 기존 Tool/TCP 로컬 기준을 유지하고, Wobj 변환을 중복 적용하지 않는다.

### 8.4 설정 명령

`SetWobj` 또는 `SetFrame`을 지원할지는 실제 컨트롤러의 정확한 명령 문법을 먼저 확인한다. 문법이 확정되기 전에는 임의의 구문을 구현하지 않고, 1차 범위는 모션 명령의 `Wobj[...]` 인자로 제한한다.

## 9. 모션 프로그램 및 저장/복구

다음 경로에 Wobj 데이터와 활성 인덱스를 포함한다.

- Undo/Redo용 `captureSceneSnapshot()` / 복원 / 동등성 비교
- 로봇별 모션 프로젝트
- `.inosim` 작업공간 저장 및 복구
- 모션 프로그램 파일 내보내기/가져오기
- 협업 방 생성 시 전달하는 workspace snapshot

기존 스키마를 그대로 덮어쓰지 않고 스키마 버전을 올린 뒤, 이전 버전 데이터는 다음 기본값으로 마이그레이션한다.

- Wobj 16개 생성
- `Wobj[0]`은 World
- `Wobj[1]~[15]`은 미설정 항등 프레임
- 활성 Wobj는 0

저장 파일에는 런타임 Three.js 객체를 넣지 않고 순수 JSON 배열만 저장한다.

협업 중에는 최초 workspace snapshot에 Wobj를 포함하고, 방 생성 후 변경도 반영하려면 기존 `sceneCommand` 경로에 Wobj 변경 명령을 추가한다. 동기화하지 않을 경우 UI에서 협업 중 Wobj 편집을 잠그는 정책을 명시해야 한다.

## 10. 프로젝트 파일 가져오기 연계

현재 확인된 프로젝트 파일 파서는 `.pro`, `.pts`, `.jsn`, `.dat`와 Label 정보를 중심으로 동작하며, Wobj 포즈 데이터의 원본 파일 형식은 확인되지 않았다.

따라서 1차 구현은 시뮬레이션 UI에서 Wobj를 설정하고 작업공간에 저장하는 방식으로 진행한다. 실제 컨트롤러 프로젝트에서 Wobj 포즈를 자동으로 읽어야 한다면, 다음 정보를 확보한 후 `olp-project-core.mjs`에 전용 파서를 추가한다.

- Wobj 포즈가 저장된 파일명과 확장자
- 포즈의 기준이 World인지 Robot Base인지
- 회전값 순서와 단위
- 0번 프레임이 실제로 World인지 여부
- 15개 번호 범위가 `[1]~[15]`인지 `[0]~[14]`인지

## 11. 구현 단계

### 단계 1 — 좌표계 핵심 모듈

- `workobject-core.mjs` 생성
- 상수, 기본 데이터, 정규화, 복사, 검증 구현
- 포즈 합성/역변환 구현
- 순수 단위 테스트 작성

### 단계 2 — 로봇 상태와 3D 프레임

- 로봇 생성/복원 시 Wobj 16개 초기화
- 프레임 그룹 및 라벨 생성
- World 포즈와 표시 상태 동기화
- Base 이동, 외부축 이동, 로봇 교체 시 프레임 재계산

### 단계 3 — Wobj 설정 패널

- `index.html`에 패널 구조 추가
- `style.css`에 15개 목록과 상세 입력 레이아웃 추가
- `main.js`에 선택/편집/초기화/현재 TCP 등록 이벤트 추가
- Wobj 편집 Undo/Redo와 자동 저장 연결
- Wobj 변경 시 간섭영역 시각화와 간섭 상태 재계산

### 단계 3-1 — 간섭영역 좌표 기준 연동

- 간섭영역 편집 UI에 좌표 기준 로봇/Wobj 선택 추가
- 기존 간섭영역 P1/P2/Datum/Offset를 World 기준으로 간주하여 Wobj[0] 데이터로 마이그레이션
- `Get current point`, `Get snap point`의 World→Wobj 로컬 변환
- Wobj 로컬 좌표 기반의 형상 표시와 검사 판정
- Wobj 회전 시 OBB/로컬 bounds 검증

### 단계 4 — JOG WOBJ 모드

- JOG 모드 탭 확장
- Wobj 로컬 TCP 표시 및 입력
- Wobj 기준 이동/회전 계산
- Wobj 기준 3D 핸들 연결

### 단계 5 — OLP 이동 변환

- `Wobj[n]` 옵션을 실제 포즈 변환에 연결
- MovJ, MovL, MovC, Jump, Jumpl 검증
- 동적 인덱스 `B_Wobj` 처리
- 활성 Wobj/오류 표시 추가

### 단계 6 — 파일, 협업, 다국어

- 모션 프로젝트 및 `.inosim` 스키마 마이그레이션
- 협업 snapshot/변경 동기화
- 한국어·영어·중국어·베트남어 문구 추가
- `Wobj`, `World`, `Rx/Ry/Rz` 같은 기술 토큰은 원문 유지

### 단계 7 — 회귀 검증 및 버전 기록

- 단위/통합/UI 검증 수행
- 기존 OLP 샘플 회귀 테스트
- 최종 변경사항만 3D Simulation 버전 기록에 추가
- 버전 기록에는 사용자 관점의 결과와 해결된 문제를 작성하고 내부 시행착오는 기록하지 않음

## 12. 검증 계획

### 핵심 좌표 검증

1. `Wobj[1] = (100, 0, 0, 0, 0, 0)`에서 로컬 TCP `(0,0,0)`이 World `(100,0,0)`에 도달하는지 확인
2. `Wobj[1]`에 Rz 90도를 적용하고 로컬 `(100,0,0)`이 World `(100,100,0)` 방향으로 변환되는지 확인
3. Wobj를 수정한 뒤 기존 로봇 TCP가 즉시 이동하지 않는지 확인
4. Wobj JOG에서 +X 이동이 World X가 아닌 선택 Wobj의 X축 방향으로 움직이는지 확인
5. 로봇 Base와 외부축을 이동해도 World에 고정된 Wobj가 유지되는지 확인
6. Wobj[1] 기준으로 저장한 간섭영역이 Wobj 이동·회전에 따라 작업물과 함께 이동하는지 확인
7. Wobj[1]에 Rz 90도를 적용한 간섭영역이 World에서 회전된 직육면체로 판정되는지 확인
8. `Get current point`와 `Get snap point`가 World 위치가 아닌 선택 Wobj 로컬 값으로 저장되는지 확인

### 기능 검증

- 편집 가능한 Wobj가 정확히 15개인지 확인
- `Wobj[0]`이 읽기 전용인지 확인
- 모든 프레임 표시/숨김 및 선택 강조 확인
- 6축과 SCARA에서 도달 가능/불가능 포즈 처리 확인
- `Wobj[n]`, `Wobj[B_Wobj]`, Wobj 미지정 모션 확인
- MovJ/MovL/MovC/Jump/Jumpl 각각 확인
- Undo/Redo, 새로고침 자동 복구, `.inosim` 저장/불러오기 확인
- 로봇 2대의 Wobj 설정이 서로 섞이지 않는지 확인
- 간섭영역의 기준 로봇/Wobj가 저장·복구 후 유지되는지 확인
- `targetRobotId = all`에서도 명시된 좌표 기준 Wobj로 모든 Probe를 일관되게 검사하는지 확인
- 기존 간섭영역 데이터가 Wobj[0] World 기준으로 마이그레이션되어 위치가 변하지 않는지 확인
- TCP 감지 범위의 Tool/TCP 로컬 오프셋에 Wobj가 중복 적용되지 않는지 확인
- 기존 `Wobj[1]~[11]` 샘플이 기본 항등 프레임에서 기존과 동일하게 실행되는지 확인
- 협업 snapshot과 변경 동기화 확인
- 4개 언어에서 패널 문구 누락/영문 노출 오류 확인

## 13. 완료 기준

- 15개 사용자 Wobj를 생성·편집·삭제가 아닌 초기화·표시/숨김·선택할 수 있다.
- 선택 Wobj 기준 TCP 좌표를 JOG에서 편집할 수 있다.
- OLP의 `Wobj[n]`이 실제 목표 포즈에 반영된다.
- 기존 Wobj 미설정 프로그램은 항등 변환으로 기존 동작을 유지한다.
- 간섭영역 P1/P2/Datum/Offset가 선택 Wobj 로컬 좌표로 저장되고, Wobj 이동·회전이 시각화와 충돌 판정에 반영된다.
- 기존 간섭영역 데이터는 World 기준으로 자동 호환된다.
- 작업공간과 모션 파일 저장 후 다시 불러와도 Wobj 위치·회전·이름·표시 상태·활성 번호가 유지된다.
- 6축/SCARA 및 다중 로봇에서 잘못된 포즈를 조용히 실행하지 않고 오류 또는 도달 불가 상태를 표시한다.
- 자동 검증 스크립트와 브라우저 수동 검증을 모두 통과한다.

## 14. 착수 전 확정이 필요한 항목

1. 15개를 `Wobj[1]~Wobj[15]`로 할지, `Wobj[0]~Wobj[14]`로 할지
2. Wobj 포즈 원본을 자동 import할지, 우선 UI 입력만 지원할지
3. 실제 컨트롤러의 Wobj 포즈 기준이 World인지 Robot Base인지
4. `SetWobj`/`SetFrame` 명령을 1차 범위에 포함할지
5. 협업 중 Wobj 편집을 실시간 동기화할지, 호스트 전용으로 제한할지

권장 착수안은 `Wobj[0]=World + Wobj[1]~[15] 사용자 프레임`, UI 직접 설정, 모션 명령의 `Wobj[...]` 적용, 기본 항등값 호환성까지를 1차 릴리스로 구현한 뒤 실제 컨트롤러 Wobj 파일 import와 `SetWobj`는 별도 단계로 추가하는 것이다.
