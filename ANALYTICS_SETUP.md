# 방문자 분석 설정

사이트는 Cloudflare Web Analytics를 사용하도록 모든 HTML 진입 페이지에 공통 로더를 추가해 두었습니다.
Beacon token은 `analytics-config.js`에 입력되어 있으며, 배포 후 페이지별 분석이 시작됩니다.

## Cloudflare 토큰 입력

1. Cloudflare Dashboard에서 **Web Analytics**를 엽니다.
2. `Add a site`에서 `inovancerobot.com`을 등록합니다.
3. `Manage site`의 beacon token을 복사합니다.
4. [`analytics-config.js`](analytics-config.js)의 `token` 값에 붙여 넣습니다.
5. 변경사항을 GitHub Pages에 배포합니다.

토큰은 브라우저에 전달되는 공개 식별자이므로 소스에 포함되어도 정상입니다. API 키나 비밀번호를 입력하면 안 됩니다.

## 방문자 분석

사이트에는 목적이 다른 두 지표가 있습니다.

- 페이지별 방문·유입·기기 통계는 Cloudflare Web Analytics에서 확인합니다.
- 홈 하단의 누적 방문자 수는 전용 Cloudflare Worker와 SQLite 기반 Durable Object에서 집계합니다.

누적 카운터는 확인된 운영값 `2,031`을 승계 하한으로 사용하고, 같은 방문자 조합은 5분 동안 한 번만
반영합니다. 총계 증가와 중복 확인을 하나의 원자 트랜잭션으로 처리하므로 동시 방문으로 증가분이
유실되지 않습니다. 이전 Workers KV는 배포 전후의 증가분을 무손실로 승계하는 전환 용도로만 남겨 둡니다.
배포와 승계 확인 절차는 [`5_Software/visitor-counter-worker/README.md`](5_Software/visitor-counter-worker/README.md)를
따릅니다.

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
