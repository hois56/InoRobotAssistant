# SPC25 펌웨어 대조 결과

범위는 웹 카탈로그의 31개 로봇 계열 전체다. 대응 INT 원본이 있는 29종과 R35/R50의 실제 펌웨어 변형 9종을 합쳐 URDF 38개를 생성했다. R35/R50에는 INT 기본 원본이 없으므로 실제 원본 모델명으로 내보내고, 웹 시뮬레이션에서 임의의 변형을 자동 선택하지 않는다.

원본 대응표는 기존 `rapid-model-data.mjs`의 명시적인 source path를 사용한다. 원본 JSON과 기존 Rapid Move용 동역학 레코드는 변경하지 않았다. 웹 시뮬레이션은 일반 MOVJ의 가감속 지시값·보간식과 원본 미지정 모델의 추정 경로를 수정했다.

## 출처와 재현

사용자가 제공한 `IMC100R-PLCV4R24C4SPC25_PR-1_0_3_236.zip`을 읽었다. 설치·업데이트 스크립트는 실행하지 않았다. 압축 안의 문서와 스크립트는 분석 자료로만 취급했다.

- ZIP SHA256: `a75412bd78294b0b3cfb1b3cbc41d4bc52f1bb33290afea6fc8933b5ac9233e3`
- 파라미터: ZIP 내부 `params_package.zip` → `params_package/Standard/Body/<정확한 모델명>/<정확한 모델명>.json`
- 설정 화면 메타데이터: 같은 폴더의 `MachineParamsUI.json`. 링크의 `inertia` 필드 표시명은 `重力模型`(중력 모델)이다. 표시명만으로 해당 수치의 물리적 타당성을 보장할 수는 없다.
- 라이브러리: `robotsys.img.ud`(bzip2 tar) → `robotsys/robotlib.tar.bz2` → `robotlib/MC_ArticulatedArm_A`, `robotlib/libDyncLib_Six.so`
- 원본 모델 레코드와 개별 SHA256은 `firmware-spc25.json`에 보존했다. 표준 라이브러리만 사용하는 `tools/extract-urdf-firmware.py`로 다시 추출할 수 있다.

`libDyncLib_Six.so`의 SHA256은 `f9fe5f2a9693b25b7898ec2ccae67ede716b00fb7d8249c4c2145c16768daea7`이다. 이는 저장소의 `tests/fixtures/robot-native-matrix-provenance.json`에 기록된 원본과 일치한다. 좌표계 검증에는 이 라이브러리에서 이미 변환되어 있는 `native-dynamics-kernel.mjs`의 질량 행렬과 중력 계산을 사용했다. ARM 바이너리를 직접 실행한 검증은 아니다.

## 원본 함수에서 확인한 사항

`MC_ArticulatedArm_A` SHA256: `bd0dcb35e7f33dfad6b69911549479edf0f3d10b92685c0e3faf17be2c27c145`

| 심볼 | 주소 / 길이 | 확인 사항 |
| --- | --- | --- |
| SetDyncLinkPrm | 0x59620 / 152 bytes | 19개의 double(0x98 bytes)을 그대로 복사한다. 관성 숫자 크기에 따른 단위 추정은 없다. |
| SetDyncArmLoad | 0x5a7e0 / 1168 bytes | 하중 합성 후 레코드 오프셋 0x38, 0x40, 0x48의 관성 교차 성분을 0으로 쓴다. 빈 arm load 초기화에도 적용된다. |
| AsmEndMass | 0x5a370 / 1136 bytes | 끝단 하중을 합성한다. 내보내는 URDF에는 공구·파지물의 추가 하중을 미리 합성하지 않는다. |
| SetDyncPlanRatedTq | 0x61550 / 304 bytes | ratedTrq(0x78) × ratio(0x68) × 별도 계획 배수를 계산한다. URDF에는 배수를 제외한 정격 출력 토크를 적용한다. |

함수 바이트 SHA256:

- SetDyncLinkPrm: `27c3acddeafae27d2a7274d403a8f42f0dfe97e2ce2bd32cd5929aa13115e11a`
- SetDyncArmLoad: `c47b3978d4cc72319a08ee3f2444ca17693ba99e9f4eb37ab14e8182676e5f10`
- AsmEndMass: `af21c32db6a6525f24494949472ec1de05a9f8e5d8ecaa2bc191b0ccc129f4be`
- SetDyncPlanRatedTq: `4ba336074b8f3a2f05de8fc7ed85e72e8a407d6431a227bf1ed87d1c28445d4c`

## 변환 기준

질량은 kg, 무게중심은 m, 유효 대각 관성은 kg·m²로 취급한다. STL 좌표만 mm에서 m로 변환한다. 기존 생성기의 “절댓값이 10보다 크면 해당 성분을 환산”하는 처리는 제거했다.

네이티브 무게중심 벡터에서 CAD/URDF 링크 좌표로의 대응은 다음과 같다. `w`는 J5→J6 길이(m)다. 관성도 같은 축 대응으로 변환한다.

| 링크 | URDF 무게중심 (x, y, z) |
| --- | --- |
| link_1 | (x, y, z) |
| link_2 | (x, -z, y) |
| link_3 | (-y, -z, x) |
| link_4 | (z, -y, x) |
| link_5 | (-y, -z, x) |
| link_6 | (z-w, -y, x) |

`tool0`는 CAD의 J6 프레임에 대해 RPY=(π, -π/2, 0)로 설정하여 제어기의 플랜지 Z축과 맞춘다.

## 복구할 수 없는 강체 관성의 처리

양의 대각 성분과 주관성의 삼각 부등식을 모두 검사한다. 전체 38개 원본의 194개 이동 링크 중 69개는 펌웨어의 유효 3D 물성을 사용하고, 125개는 원본 질량을 유지한 STL 외곽 상자의 균일 밀도 근사다. SCARA 17종의 68개 링크는 원본 관성이 평면 운동용이라 완전한 3D 관성으로 사용할 수 없어 모두 근사에 포함된다. P3 메시가 없는 모델의 J3는 P4 형상을 명시적인 carriage proxy로 사용한다. 정밀 CAD 물성을 복구한 결과가 아니다.

최초에 대조했던 네 모델의 근사 링크는 다음과 같다. 전체 모델별 목록은 README.md와 physics-audit.json에 기록했다.

| 모델 | 형상 근사 링크 |
| --- | --- |
| IR-R4H-54 | link_1, link_2, link_5, link_6 |
| IR-R7H-70 | link_1 |
| IR-R7H-90 | link_1 |
| IR-R10H-120 | link_1, link_4 |

최초 네 모델의 나머지 16개 링크는 펌웨어 초기화 후의 유효 대각 관성과 원본 무게중심을 사용하고 좌표계를 변환했다. 근사 방법, 사유, 사용한 메시, 질량, 출력 토크·직선축 힘, 속도는 `physics-audit.json`의 링크별 기록과 각 URDF 주석에서 확인할 수 있다.

URDF의 effort는 감속기 효율을 1로 둔 정격 출력 토크다. 실제 효율·피크 토크·드라이브 전류 보호 한계·연속 열 한계·축간 커플링·마찰·회전자 관성을 모두 재현하는 값은 아니다. 펌웨어의 별도 서보 토크 제한 레코드도 출처 JSON에 남겼지만 이를 임의로 피크 출력 토크로 해석하지 않았다.

SCARA J3는 `2π × 정격 모터 토크 × 감속비 / 리드(m)`의 이상적인 나사 구동력(N)을 적용했다. J3 속도는 원본 playback의 deg/s를 리드로 한 번만 환산해 m/s로 쓴다. 웹 카탈로그의 J3 속도는 이미 mm/s여서 여기에 리드를 다시 곱하던 이전 URDF 오류를 제거했다. 표준 SCARA의 tool0 방향은 identity, 천장형 TS의 영점 방향은 Z축 180도다.

## 웹 시뮬레이션 속도·가감속

`simulation-motion-audit.json`은 31개 계열의 실제 카탈로그 값과 펌웨어를 구분해 대조한 결과다.

- 원본이 대응되는 29종의 일반 관절 속도·가속도·정지 감속도와 직교 이동 설정은 `stMotion.stPlayback`과 일치한다. SCARA J3만 deg/s 및 deg/s²에서 mm/s 및 mm/s²로 환산한다.
- Rapid Move 29종의 기준 속도·가속도는 원본의 `stRobotBody.stBest.defaultJointVel/defaultJointAcc`와 일치한다. UI 설정 허용 범위인 `stJointLimit.dMaxAccHigh`를 실제 Rapid Move 가속도로 잘못 해석하면 안 된다.
- Rapid Move의 하중·자세·토크 제한과 명령의 Acc/Dec 비율은 기존 동역학 계산을 통해 적용된다. 이는 전체 제어기 펌웨어와 동등한 구현이나 실기 사이클타임의 보증은 아니다.
- 원본 미지정 R35/R50과 사용자 모델의 추정 경로는 카탈로그 값 기준이다. 기존 10% 가감속 가산을 제거하고 Acc/Dec 비율을 각각 반영한다.
- Rapid Move OFF의 일반 MOVJ는 각 축의 속도·가속도·감속도와 Acc/Dec 지시값으로 시간을 계산하고, 같은 5차 S자 보간식을 OLP와 티칭 재생에 사용한다. OLP만 3차 보간식을 쓰던 불일치를 제거했다.
- 양수인 1% 미만의 소수 Acc/Dec도 임의로 1%로 올리지 않고 반영하며, 0은 기존처럼 기본값을 사용한다.
- 대칭 Cartesian 프로파일은 Acc/Dec의 작은 값을 기준으로 보수적으로 처리한다. 두 값을 평균내어 낮은 제한을 넘을 수 있던 동작을 수정했다. 서로 다른 가속·감속 시간을 최적으로 만드는 비대칭 Cartesian 플래너는 이번 구현 범위에 없다.
- URDF의 속도 제한과 웹 플래너는 서로 다른 소비 경로다. URDF 자체에는 웹 Rapid Move 코드나 가감속 플래너를 내장하지 않는다.

## 검증과 남은 범위

- 선택한 네 모델의 XML, 6축 연결, 질량·관성 물리 조건, 메시 상대 경로, 정격 토크와 모델 선택을 검사한다.
- 펌웨어 값으로 생성한 16개 링크는 세 자세에서 독립적인 직교 좌표 Jacobian으로 계산한 질량 행렬·중력 토크를 원본 라이브러리에서 변환한 계산부와 비교한다.
- 도구의 플랜지 영점 방향과 잘못된 입력·누락 자료의 실패 동작을 검사한다.
- 전체 변환의 기본 결과는 URDF다. 이후 R4H-54, R7H-70, R7H-90, R10H-120은 `../usd/`에 고정 베이스·충돌·위치 드라이브를 포함한 USD로 추가 생성했고 OpenUSD 구조·물성·운동학 검증을 통과했다. 대상 Isaac Sim에서 실제 재생·중력 유지·궤적 추종을 실행한 검증은 아직 수행하지 않았다. 자세한 범위는 해당 폴더의 README_KO.md와 validation.json을 따른다.

2026-11-14 전체 확장 후 실행 결과:

- 새 이동 제한 검사 4개와 URDF 검사 9개가 통과했다. 초기 네 모델의 16개 링크 × 3자세 질량 행렬·중력 비교도 포함한다.
- 기존 Rapid Move·OLP·일시정지·언어별 버전 기록 회귀 검사 148개가 통과했다.
- `verify:changed`로 실제 브라우저 검사 7개가 통과했다. 전체 31개 manifest의 설정 전달, Rapid ON/OFF의 실제 OLP 재생, 15개 우선 모델의 동역학 선택, TS4/TS5 좌표계, S7 Tool 하중, 일시정지와 작은 이동을 포함한다.
- 수정한 실행 코드 5개와 검사 코드 7개의 구문 검사가 통과했다.
- 표준 XML 파서로 URDF 38개의 연결 트리와 이동 링크 194개를 확인했고, 메시 참조 470개가 모두 존재했다.
- 펌웨어 ZIP을 다시 읽어 추출한 전체 자료가 저장된 `firmware-spc25.json`과 일치했다.
- 초기 네 모델 작업에서 발견한 별도 공통 검사 실패는 남아 있다. `tests/tooling/test-selection.test.mjs:64`가 버전 기록의 UI 검사 목록에 새 `document-guide.spec.mjs`가 포함되는 것을 기대하지 않는 문제이며, 이번에 수정하지 않았다. 이동 관련 완료 검사는 통과했다.
