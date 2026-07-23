# 방문자 분석 설정

사이트는 Cloudflare Web Analytics를 사용하도록 모든 HTML 진입 페이지에 공통 로더를 추가해 두었습니다.
현재 토큰이 비어 있으므로 토큰을 입력하기 전에는 분석 요청이 전송되지 않습니다.

## Cloudflare 토큰 입력

1. Cloudflare Dashboard에서 **Web Analytics**를 엽니다.
2. `Add a site`에서 `inovancerobot.com`을 등록합니다.
3. `Manage site`의 beacon token을 복사합니다.
4. [`analytics-config.js`](analytics-config.js)의 `token` 값에 붙여 넣습니다.
5. 변경사항을 GitHub Pages에 배포합니다.

토큰은 브라우저에 전달되는 공개 식별자이므로 소스에 포함되어도 정상입니다. API 키나 비밀번호를 입력하면 안 됩니다.

## 확인 방법

배포 후 다음 페이지를 차례로 열고 Cloudflare Web Analytics에서 Path 기준으로 확인합니다.

- `/`
- `/2_3DSimulation/`
- `/3_ToolSelector/`
- `/6_Document/`
- `/privacy/`

시뮬레이션 페이지에 진입하면 `/2_3DSimulation/`의 페이지뷰가 증가합니다. 데이터가 대시보드에 나타나기까지 몇 분이 걸릴 수 있습니다.

## Microsoft 제출용 공개 URL

개인정보처리방침 URL은 다음과 같습니다.

`https://inovancerobot.com/privacy/`

Microsoft Advertising 또는 Bing Webmaster Tools에서 도메인을 등록할 때는 `https://inovancerobot.com/`을 사이트 URL로 사용하고, 위 개인정보처리방침 링크가 홈페이지 하단에 표시되는지 확인합니다. 도메인 소유권 확인 자체는 Microsoft 계정에서 meta 태그, XML 파일 또는 DNS 방식으로 별도 진행해야 합니다.
