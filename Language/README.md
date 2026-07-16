# InoRobot Assistant 번역 파일 안내

번역가는 `Language` 폴더에서 수정할 언어 폴더를 연 뒤, 해당 사이트 이름의 JSON 파일만 수정하면 됩니다.

| 언어 | 폴더 |
| --- | --- |
| 한국어 | `Language/ko` |
| 영어 | `Language/en` |
| 중국어 간체 | `Language/zh-CN` |
| 베트남어 | `Language/vi` |

## 사이트별 번역 파일

| 사이트 | 수정할 파일 | 포함 내용 |
| --- | --- | --- |
| Home (메인 사이트) | `home.json` | 메인 화면, 공통 언어 UI, 모든 사이트의 버전 기록, Debugging Tool 상세 버전 기록 |
| Robot Model Select | `robot-model-select.json` | 필터, 상세 사양, 옵션, 툴팁, PDF 문구 |
| Robot 3D Viewer | `robot-3d-viewer.json` | 뷰어 UI, 모델 추가 모드, 툴팁 |
| Tool Selector | `tool-selector.json` | 입력 항목, 계산 결과, 툴팁 |
| Project Generator | `project-generator.json` | 옵션 창, 가이드, 차트, 미리보기 UI |
| Software | `software.json` | 설명, 툴팁, 다운로드 및 오류 문구 |
| Document | `document.json` | 탭, 문서 설명, 검색 및 오류 문구 |
| Debugging Tool | `debugging-tool.json` | Debugging Tool과 Zero Calibration UI |

각 언어 폴더에는 위의 JSON 파일 8개만 번역 원본으로 둡니다. `index.html`은 빌드할 때 자동 생성되므로 직접 수정하지 않습니다.

## 수정 방법

1. 원하는 언어 폴더에서 수정할 사이트의 JSON 파일을 엽니다.
2. JSON의 오른쪽 값만 번역합니다. 왼쪽 키는 바꾸지 않습니다.
3. `{count}`, `{model}`, `{version}` 같은 변수는 번역문에도 그대로 유지합니다.
4. 모델명, 주문 코드, 프로토콜명, 파일명, 확장자와 로봇 코드는 번역하지 않습니다.
5. 버전 기록은 해당 언어의 `home.json` 아래 `versionHistory`와 `debugVersionHistory`에서 수정합니다.
6. 모든 JSON 파일은 UTF-8과 올바른 JSON 형식을 유지합니다.

## 생성 및 검사

번역을 수정한 뒤 프로젝트 루트에서 다음 명령을 실행합니다.

```powershell
node tools\build-localized-site.cjs
node tools\validate-localized-site.cjs
```

첫 번째 명령은 브라우저용 번역 데이터, 언어별 메인 페이지와 사이트맵을 다시 만듭니다. 두 번째 명령은 네 언어의 파일 구조, 키, 변수, 페이지별 번역 범위와 버전 기록을 검사합니다.

다음 파일은 자동 생성되므로 직접 수정하지 않습니다.

- `Language/runtime/locales-data.js`
- `0_Home/ko/index.html`
- `0_Home/kr/index.html`
- `0_Home/en/index.html`
- `0_Home/zh-CN/index.html`
- `0_Home/vi/index.html`
- `sitemap.xml`
