# InoRobot Assistant 업데이트 기록

메인 홈페이지에서 제공하는 각 카드의 기능 추가, 표시 변경, 자료 업데이트 및 오류 수정 내역입니다.

> 업데이트 기록은 사용자 화면과 다운로드 결과에서 확인할 수 있는 변경 사항을 기준으로 작성되었습니다.

## 목차

- [Robot Model Select](#robot-model-select)
- [Robot 3D Viewer](#robot-3d-viewer)
- [Robot Tool Selector](#robot-tool-selector)
- [Project Generator](#project-generator)
- [Software](#software)
- [Document](#document)
- [Debugging Tool](#debugging-tool)

---

## Robot Model Select

### Ver 26.06.19.01

- `[신규]` 비상정지 보호커버가 장착된 IR-TP200 티치펜던트를 추가했습니다.
- `[신규]` 보호커버형 펜던트 구매 코드를 추가했습니다: 5m `01640069`, 10m `01640072`, 15m `01640073`.
- `[변경]` 펜던트 선택 방식을 `미선택 / 보호커버 없음 / 보호커버 있음`으로 개편했습니다.
- `[변경]` 선택한 펜던트의 보호커버 유무·길이·구매 코드가 결과와 PDF에 표시됩니다.

### Ver 26.06.15.01

- `[추가]` IR-S7-60Z20S-INT 5m 케이블 구매 코드 `01741079*M00018`을 추가했습니다.

### Ver 26.06.02.01

- `[변경]` KCs 인증이 없는 SCARA 모델의 예상 납기를 10주로 표시하도록 변경했습니다.

### Ver 26.06.01.02

- `[변경]` 모델 코드를 `IR-R15H-145S-INT → IR-R15H-145S-K-INT`로 수정했습니다.
- `[변경]` 모델 코드를 `IR-R20H-120S-INT → IR-R20H-120S-K-INT`로 수정했습니다.
- `[추가]` IR-R15H IP67형 구매 코드 `01741446`을 추가했습니다.
- `[추가]` IR-R20H IP67형 구매 코드 `01741597`을 추가했습니다.
- `[추가]` IR-S25-100Z42S-INT 3m 케이블 구매 코드 `01741436*M00002`를 추가했습니다.
- `[추가]` IR-S60-120Z40S-INT 구매 코드를 추가했습니다: 5m `01741367*M00002`, 15m `01741367*M00003`.
- `[수정]` R15H·R20H 모델 코드 변경 후 기존 CAD 파일을 찾지 못하던 문제를 수정했습니다.

### Ver 26.06.01.01

- `[추가]` IR-R10-140S-INT 3m 케이블 구매 코드 `01741086*M00008`을 추가했습니다.

### Ver 26.05.29.01

- `[신규]` 6축 로봇에 표준형·클린형·IP67형 바디 옵션을 추가했습니다.
- `[변경]` R10-140·R16·R25는 고정 사양 `Body IP65 / Wrist IP67`만 표시하도록 변경했습니다.
- `[변경]` R15H·R20H 클린형은 `ISO Class 4`, 나머지 6축 클린형은 `ISO Class 3`으로 표시합니다.
- `[변경]` 바디 옵션 선택 시 모델명의 `S/C/P` 코드와 PDF 파일명이 함께 변경됩니다.
- `[수정]` R16·R25 등 `_CN` 또는 `_3D_CN` 파일명을 사용하는 모델의 CAD 다운로드 오류를 수정했습니다.
- `[수정]` 축 속도와 가동 범위에서 `°`, `°/s`, `mm`, `mm/s` 단위가 누락되던 문제를 수정했습니다.
- `[수정]` 상세 정보와 PDF에서 중량 `kg`, 반복정밀도 `mm` 단위가 누락되던 문제를 수정했습니다.
- `[수정]` IR-S35-80Z42S-INT에 잘못 표시되던 KC·KCs 인증을 제거했습니다.
- `[정리]` 미출시 IR-CS 모델을 필터와 검색 결과에서 제외했습니다.
- `[정리]` R10-140·R16·R25에서 사용할 수 없는 Handheld Motor Brake Release Box 옵션을 숨겼습니다.

### Ver 26.05.22.01

- `[변경]` IR-R4H·R7H-70·R7H-90·R10H·R15H·R20H의 Clean Type을 `Yes → No`로 수정했습니다.
- `[변경]` 해당 6축 모델의 클린 사양을 기본 사양이 아닌 선택 옵션으로 표시합니다.
- `[변경]` SCARA 클린형 모델의 예상 납기를 6개월로 변경했습니다.
- `[수정]` 모델 코드와 CAD 폴더명이 다른 R16·R25 모델에서 CAD 버튼이 비활성화되던 문제를 수정했습니다.
- `[변경]` CAD 버튼 문구를 `Checking / CAD Download / CAD Not Ready / Preparing`으로 통일했습니다.

### Ver 26.04.17.01

- `[수정]` IR-S25-120 표준형과 클린형 데이터가 서로 바뀌어 있던 문제를 수정했습니다.
- `[수정]` IR-S35-100·120 표준형과 클린형의 모델명·암 길이·Z축 길이·중량·사이클타임·인증 정보 연결 오류를 수정했습니다.
- `[추가]` IR-S25-120Z42S-INT와 IR-S35-120Z42S-INT의 2D DWG·3D STP·FBX 파일을 추가했습니다.
- `[수정]` R15H·R20H의 IP 등급이 PDF에서 잘못 표시되던 문제를 수정했습니다.

### Ver 26.04.12.01

- `[신규]` 모델 상세 정보에 권장 차단기 용량을 추가했습니다.
- `[변경]` R4·R7H 10A, R10·R11 15A, R10-140 20A, R16·R25 30A, S25 15A, S35·S60 20A로 표시합니다.

### Ver 26.03.31.02

- `[변경]` 펜던트·Arm I/O·Body I/O·통신 확장 옵션 구매 코드를 주황색 배지로 표시합니다.
- `[변경]` IR-TP200 연장 케이블 이름에 5m·15m·25m 길이를 직접 표시합니다.

---

## Robot 3D Viewer

### Ver 26.06.02.01

- `[변경]` 모델명을 `IR-R15H-145S-INT → IR-R15H-145S-K-INT`로 수정했습니다.
- `[변경]` 모델명을 `IR-R20H-120S-INT → IR-R20H-120S-K-INT`로 수정했습니다.
- `[수정]` `-S-K-INT` 모델 선택 시 기존 `-S-INT` CAD 파일을 찾지 못하던 문제를 수정했습니다.

### Ver 26.05.29.01

- `[수정]` R16·R25 등 `_CN` 또는 `_3D_CN` 형식으로 저장된 CAD 파일이 ZIP에 포함되지 않던 문제를 수정했습니다.
- `[수정]` `_2D.dwg` 파일이 없을 경우 `_3D_CN.dwg` 파일을 대신 다운로드하도록 변경했습니다.

### Ver 26.04.17.01

- `[신규]` IR-S25-120Z42S-INT와 IR-S35-120Z42S-INT 3D 모델을 추가했습니다.
- `[수정]` IR-S25-120과 IR-S35-120이 반대 방향으로 표시되던 문제를 수정했습니다.
- `[수정]` Robot Model Select에서 선택한 모델의 초기 회전값이 잘못 적용되던 문제를 수정했습니다.

### Ver 26.03.31.01

- `[신규]` Delete 또는 Backspace 키를 이용한 모델 개별 삭제 기능을 추가했습니다.
- `[신규]` 모델 이동·회전·크기 조절 핸들을 표시하거나 숨길 수 있는 기능을 추가했습니다.

---

## Robot Tool Selector

### Ver 26.04.26.01

- `[변경]` 무게·중심좌표·관성모멘트 입력값의 기본값을 모두 0으로 변경했습니다.
- `[수정]` 블록 계산 시 전체 CoG 기준으로 관성모멘트가 계산되도록 수정했습니다.
- `[수정]` Mode B에서 블록 자체 관성과 평행축 정리가 중복 적용되던 문제를 수정했습니다.
- `[수정]` 블록을 추가하거나 삭제하면 기존 입력값이 초기화되던 문제를 수정했습니다.
- `[수정]` 총중량이 0kg일 때 계산 결과가 NaN으로 표시되던 문제를 수정했습니다.
- `[변경]` CoM·COM 표기를 `CoG`로 통일했습니다.
- `[변경]` 관성모멘트 계산 결과를 소수점 셋째 자리까지 표시합니다.
- `[신규]` Tool Block CoG 입력 위치를 설명하는 참고 이미지를 추가했습니다.

---

## Project Generator

### Ver 26.06.19.01

- `[변경]` Teaching Offset X·Y·Z·A·B·C 항목에 데이터 형식 `2 Word /10000`을 표시합니다.

### Ver 26.06.15.01

- `[변경]` Teaching Mode·Wait Position·Process Busy 옵션을 기본 활성화 상태로 변경했습니다.
- `[신규]` Teaching Mode에 다음 위치 이동·이전 위치 이동·Offset 위치 이동·현재 위치 저장 기능을 추가했습니다.
- `[변경]` Wait Position과 Work Position의 시작·완료·Busy 상태를 각각 구분하도록 변경했습니다.
- `[수정]` Vision Offset과 Process Offset을 함께 사용할 때 적용 순서가 뒤바뀌던 문제를 수정했습니다.
- `[수정]` Vision Offset과 Process Offset이 중복 적용되던 문제를 수정했습니다.
- `[수정]` 다른 공정에서 Wait 또는 Work 위치로 복귀할 때 잘못된 경로로 이동하던 문제를 수정했습니다.
- `[수정]` SCARA 프로젝트에 존재하지 않는 J5·J6 토크 항목이 생성되던 문제를 수정했습니다.
- `[업데이트]` 프로젝트에 포함되는 IO Map을 `InoRobot_IO_Map_0614.xlsx`로 교체했습니다.
- `[업데이트]` Remote IO Mapping을 최신 Process Wait·Work·Busy·Teaching 구성으로 변경했습니다.
- `[수정]` Multi Recipe 설명에 잘못 표시된 Point File 전환 주소를 수정했습니다.
- `[변경]` 옵션 도움말과 타이밍 차트의 신호명을 실제 생성 결과와 동일하게 변경했습니다.

### Ver 26.05.20.01

- `[수정]` Teaching Mode를 선택하지 않았는데도 일부 Teaching 조건이 생성되던 문제를 수정했습니다.

### Ver 26.04.10.01

- `[수정]` 특정 옵션 조합에서 불필요한 조건이 생성되어 공정이 시작되지 않던 문제를 수정했습니다.

### Ver 26.04.07

- `[신규]` 프로젝트 옵션별 상세 설명 버튼과 툴팁을 추가했습니다.
- `[신규]` IO 타이밍 차트가 포함된 사용 가이드를 추가했습니다.
- `[수정]` Vision Offset 툴팁이 테이블 아래에 가려지던 문제를 수정했습니다.
- `[수정]` Teaching Mode 타이밍 차트의 신호와 파형 위치가 맞지 않던 문제를 수정했습니다.
- `[변경]` 타이밍 차트 헤더·라벨·파형 간격을 정렬하고 신호 변화 표현을 세로선으로 통일했습니다.

### Ver 26.04.02

- `[신규]` Labels·Remote IO·P.pts·User Warning 파일을 표 형식으로 미리보는 기능을 추가했습니다.
- `[신규]` Labels·User Warning·P.pts 데이터를 화면에서 직접 수정할 수 있습니다.
- `[변경]` Labels에서 수정한 이름이 모든 프로그램 미리보기에 반영됩니다.
- `[변경]` 파일 선택 목록을 Main·Static Task·Sub Program·Process·Data File 그룹으로 분류했습니다.

---

## Software

### Ver 26.06.19.01

- `[업데이트]` InoRobotLab을 `V4R24C4SPC18 → V4R24C4SPC21`로 업데이트했습니다.
- `[업데이트]` InoRobotTP를 `V4R24C4SPC18 → V4R24C4SPC21`로 업데이트했습니다.
- `[변경]` InoRobotLab 다운로드 용량을 설치형 470MB, 포터블 473MB로 갱신했습니다.

### Ver 26.06.06.01

- `[업데이트]` InoRobotLab을 `V4R24C4SPC17 → V4R24C4SPC18`로 업데이트했습니다.
- `[업데이트]` InoRobotTP를 `V4R24C4SPC17 → V4R24C4SPC18`로 업데이트했습니다.
- `[정리]` 기존 SPC15·SPC17 다운로드를 제거하고 SPC18 버전만 표시하도록 변경했습니다.

### Ver 26.05.14.01

- `[업데이트]` Display용 InoRobotLab·InoRobotTP를 `V4R24C4SPC0L18F121`로 교체했습니다.
- `[변경]` 제공되지 않는 Display용 InoRobotLab 설치형 버튼을 비활성 상태로 변경했습니다.
- `[추가]` Display용 InoRobotLab 포터블 454MB와 InoRobotTP 57MB 다운로드를 추가했습니다.

### Ver 26.04.17.01

- `[추가]` InoRobotLab 설치형·포터블 `V4R24C4SPC17` 다운로드를 추가했습니다.
- `[추가]` InoRobotTP `V4R24C4SPC17` 다운로드를 추가했습니다.

---

## Document

### Ver 26.06.23.01

- `[추가]` 하드웨어 매뉴얼에 `Safety Function` 탭을 추가했습니다.
- `[추가]` `Robot System Safety Function Guide.PDF`를 Safety Function 매뉴얼로 등록했습니다.

### Ver 26.06.19.01

- `[변경]` 메인 카드 이름을 `Manual → Document`로 변경했습니다.
- `[변경]` 카드 설명을 `로봇 매뉴얼·교육자료·인증서·통신 프로파일 다운로드 및 조회`로 변경했습니다.

### Ver 26.06.15.01

- `[신규]` EtherCAT `v1.0.1`, PROFINET `V2.35`, EtherNet/IP `V4.5` 통신 프로파일을 추가했습니다.
- `[신규]` CE 10개·Clean 4개·cSGSus 4개·FCC 2개·Functional Safety 2개·KCs 59개·MTBF 2개 등 총 83개의 인증서를 추가했습니다.
- `[신규]` 인증서 필터를 CE·Clean·cSGSus·FCC·Functional Safety·KCs·MTBF로 분류했습니다.
- `[변경]` 문서 검색 시 제목과 설명뿐만 아니라 실제 파일명과 경로까지 검색합니다.

### Ver 26.06.01.01

- `[업데이트]` 입문과정 `2. 로봇 기초` INT 및 Display 교육자료를 최신 PDF로 교체했습니다.

### Ver 26.05.14.01

- `[추가]` IR-S25&S35, IR-S60&GS60, IR-R15H&R20H 사용자 매뉴얼을 추가했습니다.
- `[추가]` Input IO·NPN Output IO·Encoder·Functional Safety·IR-LINK·PROFINET 확장카드 매뉴얼을 추가했습니다.
- `[신규]` 문서 필터에 `Expansion Card`와 `Selection Guide` 항목을 추가했습니다.

### Ver 26.04.26.01

- `[업데이트]` R25/R16 매뉴얼 파일명을 `IR-R25&R16 → IR-R25&16`으로 변경하고 최신 PDF로 교체했습니다.

### Ver 26.04.12.01

- `[업데이트]` 입문과정 `1. 로봇 소개` INT 및 Display 교육자료를 최신 PDF로 교체했습니다.

### Ver 26.04.10.01

- `[신규]` 교육자료에 `Application Level` 분류를 추가했습니다.
- `[추가]` API 교육자료 PDF와 실습용 API.zip을 추가했습니다.

### Ver 26.04.07.01

- `[추가]` InoRobotLab·변수·주요 명령어·주요 설정·Socket 통신·Fieldbus 통신 초급과정 자료를 추가했습니다.
- `[신규]` Display 교육자료 전용 `For Display` 필터를 추가했습니다.
- `[변경]` 문서 버튼을 `미리보기`와 `다운로드`로 분리했습니다.

---

## Debugging Tool

### Ver 26.06.19.01

- `[업데이트]` InoRobot Label Generator를 `V2.0 → V2.1`로 업데이트했습니다.

### Ver 26.06.15.01

- `[업데이트]` Communication Tester를 `V2.5 → V2.6`으로 업데이트했습니다.
- `[업데이트]` InoRobot Trace를 `V1.1 → V1.2`로 업데이트했습니다.

### Ver 26.06.10.01

- `[업데이트]` Communication Tester를 `V2.4 → V2.5`로 업데이트했습니다.
- `[정리]` 기존 Communication Tester V2.3 실행 파일과 ZIP 파일을 제거했습니다.

### Ver 26.05.18.01

- `[업데이트]` InoRobot Trace를 `V1.0 → V1.1`로 업데이트했습니다.

### Ver 26.04.26.01

- `[업데이트]` Communication Tester를 `V2.3 → V2.4`로 업데이트했습니다.
- `[신규]` InoRobot Trace V1.0 다운로드를 추가했습니다.
- `[신규]` InoRobot Label Generator V2.0 다운로드를 추가했습니다.
- `[업데이트]` Project Compare를 `V2.0 → V2.1`로 업데이트했습니다.

### Ver 26.04.13.01

- `[업데이트]` Communication Tester를 `V2.2 → V2.3`으로 업데이트했습니다.
- `[수정]` ZIP 파일 대신 Git LFS 정보 파일이 다운로드되던 문제를 수정했습니다.

### Ver 26.04.07.01

- `[추가]` Zero Calibration 웹 계산기에 오프라인 Excel 다운로드 버튼을 추가했습니다.

### Ver 26.04.02

- `[신규]` Communication Tester V2.2 다운로드를 추가했습니다.
- `[신규]` Project Compare V2.0 다운로드를 추가했습니다.
