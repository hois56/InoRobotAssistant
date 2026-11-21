# 디버깅 도구 배포 후보 만들기

새 버전 작업과 프로그램 테스트를 끝낸 다음에만 실행한다. 빌드(`Build-RustPrograms.ps1`)는 그대로고, 이 단계는 빌드하거나 최신 파일을 자동으로 선택하지 않는다. 테스트한 **정확한 ZIP과 SHA-256**을 결과 기록에 함께 남긴다. 이 스크립트가 확인하는 것은 ZIP과 검사 기록의 파일 일치이며, 프로그램 테스트를 대신하지 않는다.

아래는 입력 예시다. 실제 테스트 기록의 버전, 해시, 경로, 날짜, 사용자에게 보이는 변경 사항으로 바꿔 실행한다.

```powershell
& .\tools\Stage-DebugRelease.ps1 -Tool communicationTester -CurrentVersion 4.0 -Version 5.0 `
  -Zip 'D:\release-input\InoRobot_Rust_Comm5.0.zip' -Sha256 '<검증 기록의 SHA-256>' `
  -Tag 'communication-tester-v5.0' -Date '2026-11-21' -Note '<사용자에게 보이는 변경 한 줄>' `
  -Out 'D:\release-staging\comm-5.0' -PythonPath 'D:\work\KOR_version\.venv\Scripts\python.exe'
```

Python 3.10 이상이 필요하다. 사용 가능한 `py` 또는 Python이 PATH에 있으면 `-PythonPath`는 생략한다. 출력은 웹사이트 폴더 **밖**의 아직 없는 경로여야 한다. ZIP 안에는 예와 같이 `InoRobot_Comm_Test_V5.0.exe` 형태의 버전이 맞는 실행 파일이 하나 있어야 한다. 실행 파일과 필요한 DLL·라이선스를 테스트 때 사용한 묶음 그대로 넣는다. Trace는 `IMC100API.dll`가 필요하다. 빌더가 `Major.Minor`까지만 파일명에 쓰므로, 패치 버전의 ZIP은 전체 버전을 표시하는 정확한 파일명으로 준비·검증한다.

| 도구 ID | 기존 공개 방식 |
| --- | --- |
| `communicationTester`, `logAnalyzer`, `cadLightweight` | GitHub Release, 새 버전 태그 필수 |
| `labelGenerator`, `trace`, `projectCompare` | 사이트 상대경로, 태그 사용 안 함 |

결과에는 `review.diff`, `release-plan.json`, `site-candidate` 및 동일 해시의 ZIP이 들어 있다. GitHub용 ZIP은 `release-asset`에, 상대경로 ZIP은 `site-candidate`의 정확한 다운로드 경로 아래에 만들어진다. 원본 사이트·기존 ZIP·Git 설정은 수정하지 않으며 자동 업로드·푸시·공개도 없다.

실제 공개가 승인되면 원본 파일 해시와 diff를 다시 대조하고, Release 도구는 `downloads/README.md`의 draft 업로드·원격 크기/해시 확인 절차를 따른다. 상대경로 도구의 새 ZIP은 Git에서 기본 무시되므로 현재 배포 방식으로 실제 제공되는지 먼저 확인한다. **공개 전에 링크 대상으로 ZIP이 확인되지 않으면 카드 링크를 바꾸지 않는다.** Git LFS를 다시 켜거나 배포 경로를 임의로 변경하지 않는다. 적용·생성·검사 순서는 `release-plan.json`을 따른다.

격리된 가짜 ZIP만 사용한 점검:

```powershell
& 'D:\work\KOR_version\.venv\Scripts\python.exe' -B .\tools\test-prepare-debug-release.py
```
