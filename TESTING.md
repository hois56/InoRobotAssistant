# 자동 검사 사용법

## 수정하면서 검사하기

저장한 코드나 데이터가 바뀔 때 빠른 회귀 검사를 자동으로 다시 실행하려면 저장소 루트에서 다음 명령을 켜 둡니다.

```powershell
npm run test:watch
```

Codex 작업은 `AGENTS.md` 지침에 따라 의미 있는 수정 단위마다 `npm run test:fast`를 실행합니다. 저장 감시기는 빠른 검사를 자동 실행하고, 주요 화면·언어 공통 코드를 바꾸면 브라우저 검사를, C# 코드를 바꾸면 빌드를 추가 실행합니다. 빠른 검사는 현재 모델별 케이블 구매 코드, 소프트웨어 다운로드 연결, CAD 매니페스트 파일 존재 여부, 주요 화면의 로컬 스크립트·스타일 연결, 대표 프로젝트 생성 결과를 확인합니다.

브라우저 흐름만 확인할 때는 다음 명령을 사용합니다.

```powershell
npm run test:ui
```

## 작업 완료 검사

```powershell
npm run verify:full
```

이 명령은 빠른 회귀 검사, 저장소 JavaScript 구문 검사, 가상 컨트롤러 브리지 빌드, 외부 C# 생성기의 대표 출력 비교, 브라우저 회귀 검사를 실행합니다. GitHub Actions는 외부 C# 생성기 소스가 저장소에 포함되지 않아 `npm run verify:ci`를 실행합니다.

## 기준 결과 갱신

구매 코드, 다운로드 대상 또는 생성 프로그램 결과를 의도적으로 바꾼 경우에는 테스트가 보여 주는 차이를 먼저 확인합니다. 값이 승인된 원본과 일치할 때만 기준 파일을 함께 변경합니다.

생성기 기준 결과는 다음 명령으로 다시 기록할 수 있습니다. 변경 내용을 검토하기 전에 실행하지 마세요.

```powershell
npm run test:dotnet-generator:update-baseline
```

웹 프로젝트 생성기의 예상 결과는 `tests/fixtures/project-generator/`에 텍스트로 보관합니다. 변경 후 테스트가 실패하면 생성 결과 차이를 검토한 다음, 의도된 경우에만 `npm run test:project-generator:update-baseline`으로 갱신합니다.

추가로 실행되는 C# 생성기 하네스는 현재 저장소 바깥의 `InoRobot_Proejct_Gen_for_SDC` 소스와 템플릿을 사용합니다. 기준 결과를 갱신하려면 `npm run test:dotnet-generator:update-baseline`을 사용합니다. 해당 폴더가 없는 환경에서는 검사를 통과 처리하지 않습니다. 저장소만 사용하는 CI에서는 이 외부 생성기 검사를 실행할 수 없습니다.
