# InoRobot — Isaac Sim용 USD 4종

## 파일

- `IR-R4H-54.usd`
- `IR-R7H-70.usd`
- `IR-R7H-90.usd`
- `IR-R10H-120.usd`
- `demo_all.usd`: 위 네 파일을 상대 경로로 참조하는 전체 배치 장면

각 로봇 USD에는 메시·재질·관절·물리 설정이 들어 있습니다. 원본 STL이나 URDF를 옆에 두지 않아도 됩니다. 개별 파일을 열면 조명·바닥·PhysicsScene도 함께 열립니다. 다른 Stage에 reference로 추가할 때는 기본 prim인 `/Robot`만 추가되므로 환경이 중복되지 않습니다. `demo_all.usd`는 같은 폴더의 로봇 파일 네 개를 모두 유지해야 합니다.

## Isaac Sim에서 열기

1. ZIP을 풀고 Isaac Sim의 **File > Open**으로 원하는 로봇 `.usd` 또는 `demo_all.usd`를 엽니다.
2. 개별 파일에서 `/Robot`을 선택한 후 **F**로 화면에 맞춥니다. 배치 장면에서는 `/World` 아래의 로봇을 선택합니다. `/Environment/Camera`도 포함되어 있습니다.
3. **Play**를 누르면 베이스가 고정된 위치 제어 로봇으로 시작합니다. `/Robot/Joints/J1`~`J6`의 angular drive 목표를 변경해 움직일 수 있습니다.

URDF Importer로 다시 가져올 필요는 없습니다. 다른 Stage에서는 로봇 USD를 reference로 추가하고 그 Stage의 PhysicsScene을 사용하면 됩니다.

## 제어 경로와 단위

- 기본 prim / articulation root: `/Robot`
- 베이스: `/Robot/base_link`
- 관절: `/Robot/Joints/J1`~`J6`
- 툴 프레임: `/Robot/link_6/tool0`
- 거리 m, 질량 kg, 중력 9.81 m/s², Z-up
- USD 관절 제한·drive targetPosition·maxJointVelocity는 **도·도/초**입니다.
- Isaac Sim의 ArticulationAction에 전달하는 회전 관절 위치·속도는 **라디안·라디안/초**입니다.

## 포함한 물리 설정

- 6개 회전 관절과 world-to-base fixed joint
- 수정된 URDF의 질량·무게중심·관성을 그대로 변환
- 펌웨어 모터 관성 × 감속비²의 reflected armature
- 관절별 정격 출력 토크와 속도 제한
- force 방식의 위치 드라이브, 10 Hz·임계 감쇠를 기준으로 계산한 초기 gain
- 링크별 convex-hull 충돌 형상, 2 mm contact offset, self collision OFF
- 120 Hz PhysicsScene, articulation solver position 32 / velocity 8

드라이브 gain은 실행 가능한 초기 설정이며 실기 서보의 식별·튜닝 값은 아닙니다. 정격 토크는 감속기 효율을 1로 가정한 값으로 피크 토크를 뜻하지 않습니다. Rapid Move 알고리즘과 이동 명령 프로그램은 USD에 포함하지 않았습니다.

## 관성 근사

| 모델 | 근사 관성 링크 |
| --- | --- |
| R4H-54 | link_1, link_2, link_5, link_6 |
| R7H-70 | link_1 |
| R7H-90 | link_1 |
| R10H-120 | link_1, link_4 |

이 8개 링크는 펌웨어의 원본 질량을 유지한 외곽 상자 근사입니다. 나머지 16개는 펌웨어 유효 관성입니다. 고정된 base_link의 질량은 물리 엔진이 충돌 형상에서 추정하게 두었으며, 이동 링크의 질량으로 임의의 값을 추가하지 않았습니다.

## 검증 범위

`validation.json`은 OpenUSD에서 파일 재열기·의존성·schema compliance·물성·관절 프레임·3개 자세의 운동학·속도 및 토크 설정을 검사한 결과입니다. **제작 PC에 Isaac Sim이 없어 Isaac Sim/PhysX의 실제 재생 검증은 수행하지 못했습니다.** 호환성을 위해 OpenUSD 24.11로 crate 0.8.0을 사용했습니다.

Isaac Sim 5.x Python 환경에서는 다음 보조 스크립트로 실제 물리 점검을 실행할 수 있습니다. 다른 버전에서 API가 변경된 경우 해당 버전의 Articulation API에 맞게 조정해야 합니다.

```powershell
# Isaac Sim 설치 폴더에서 실행. 아래 경로는 압축을 푼 실제 폴더로 변경합니다.
.\python.bat "D:\robot_usd\isaac_smoke_test.py" --asset "D:\robot_usd\IR-R7H-90.usd" --headless
```

스크립트는 시뮬레이션 안에서 작은 관절 목표를 주고 6 DOF, 유한한 상태, 관절 범위와 움직임을 확인합니다. 실제 로봇에는 연결하지 않습니다.

설정 근거: [OpenUSD articulation root](https://openusd.org/release/api/class_usd_physics_articulation_root_a_p_i.html), [각도 드라이브의 단위](https://openusd.org/24.05/api/class_usd_physics_drive_a_p_i.html), [NVIDIA PhysX schema](https://docs.omniverse.nvidia.com/kit/docs/omni_physics/107.2/dev_guide/schemas/physxschema.html).
