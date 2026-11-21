# 변경 범위에 맞는 검사

작은 변경은 관련 검사를 한 번 실행합니다. 전체 브라우저 검사와 C# 빌드를 저장할 때마다 반복하지 않습니다.

| 상황 | 명령 |
| --- | --- |
| 작업 중 빠른 확인 | `npm run test:changed -- <수정한 원본 파일...>` |
| 기능·화면 수정 완료 | `npm run verify:changed -- <수정한 원본 파일...>` |
| 실행 대상만 미리 보기 | 위 명령에 `--list` 추가 |
| 저장 시 가벼운 자동 검사 | `npm run test:watch` |
| 저장 시 관련 UI·C# 검사도 실행 | `npm run test:watch -- --ui` |
| 전체 JavaScript 회귀 검사 | `npm run test:fast` |
| 컨트롤러 브리지 동작 검사 | `npm run test:bridge` |
| 외부 C# 생성기 수정 후 검사 | `npm run test:dotnet-generator` |
| 배포 준비·명시적인 전체 검증 | `npm run verify:full` |

`npm run verify:changed -- 4_ProjectGenerator/generator.js`는 생성 결과 비교와 생성기 화면 검사를 실행합니다.

경로를 생략하면 Git의 미커밋 변경과 새 파일을 모읍니다. 다른 작업의 변경이 남아 있다면 이번 작업의 원본 경로를 명시하세요. 버전 기록 생성물과 캐시 주소만 함께 바뀌었다면 `0_Home/version-history.json`을 포함해 기록 일관성을 확인하면 됩니다.

구매 코드·다운로드 연결·로봇 프로그램 출력 비교는 관련 영역 검사에 계속 포함됩니다. 공통 언어 런타임이나 분류할 수 없는 앱 변경은 보수적으로 검사 범위를 넓힙니다. 화면별 JSON 번역은 해당 화면 범위를 사용합니다. 전용 테스트가 없는 화면은 직접 확인하고, 자동 선택이 관련 동작을 충분히 다루지 못하면 필요한 테스트를 명시해서 실행하세요.

`verify:changed`는 컨트롤러 브리지가 바뀌면 Rust 동작 검사와 빌드를 추가합니다. 저장소 밖의 C# 생성기 소스·템플릿을 수정하면 `test:dotnet-generator` 또는 `verify:changed -- --generator`를 직접 실행합니다. 검사에는 외부 생성기 소스가 필요합니다.

전체 검사(`verify:full`, CI)는 JavaScript·브라우저 검사와 Rust 브리지 동작 검사를 실행합니다. 커밋 hook은 스테이징된 경로의 빠른 검사를 실행합니다.
