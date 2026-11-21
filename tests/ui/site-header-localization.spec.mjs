import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const locales = ['ko', 'en', 'zh-CN', 'vi', 'tr', 'ru'];
const homeNames = ['이노밴스 로봇 어시스턴트', 'Inovance Robot Assistant', '汇川机器人助手', 'Trợ lý robot Inovance', 'Inovance Robot Asistanı', 'Помощник по роботам Inovance'];
const siteNames = ['이노로봇 어시스턴트', 'InoRobot Assistant', 'InoRobot 助手', 'Trợ lý InoRobot', 'InoRobot Asistanı', 'Помощник InoRobot'];
const headerTitle = 'body > header :is(h1, .site-heading, .app-title)';

function labels(file, key) {
    return locales.map(locale => {
        const url = new URL(`../../Language/${locale}/${file}.json`, import.meta.url);
        const data = JSON.parse(readFileSync(url, 'utf8'));
        return key.split('.').reduce((value, part) => value[part], data);
    });
}

const screens = [
    ['/1_RobotModelSelect/', labels('home', 'legacy.Robot Model Select')],
    ['/2_3DSimulation/', labels('home', 'legacy.3D Simulation')],
    ['/3_ToolSelector/', labels('home', 'legacy.Robot Tool Selector')],
    ['/4_ProjectGenerator/', labels('home', 'legacy.Project Generator')],
    ['/5_Software/', labels('software', 'legacy.Software Download Center')],
    ['/6_Document/', labels('document', 'legacy.Technical Manual Center')],
    ['/7_DebuggingTool/', labels('home', 'legacy.Debugging Tool')],
    ['/7_DebuggingTool/ZeroCalibration/', labels('debugging-tool', 'legacy.Zero Calibration Tool')],
    ['/Servo/', labels('servo', 'pages.servo.heading')],
    ['/privacy/', siteNames]
];

async function expectTitleStyle(title) {
    const pageFont = await title.page().locator('body').evaluate(body => getComputedStyle(body).fontFamily);
    await expect(title).toHaveCSS('font-family', pageFont);
    await expect(title).toHaveCSS('font-size', '16px');
    await expect(title).toHaveCSS('font-weight', '600');
    await expect(title).toHaveCSS('line-height', '22.4px');
    await expect(title).toHaveCSS('letter-spacing', 'normal');
    await expect(title).toHaveCSS('text-transform', 'none');
}

for (const [route, titles] of screens) {
    test(`로고 옆 제목이 선택한 언어와 공통 글꼴을 따른다 ${route}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        const title = page.locator(headerTitle);
        const picker = page.getByRole('combobox', { name: 'Language', exact: true });
        await expect(title).toBeVisible();
        for (const [index, locale] of locales.entries()) {
            await picker.selectOption(locale);
            await expect(title).toHaveText(titles[index]);
            await expectTitleStyle(title);
            if (route === '/4_ProjectGenerator/') {
                const version = page.locator('header .header-divider p');
                const titleFont = await title.evaluate(element => getComputedStyle(element).fontFamily);
                await expect(version).toHaveCSS('font-family', titleFont);
            }
        }
        for (const width of [1024, 768, 721]) {
            await page.setViewportSize({ width, height: 768 });
            await expect(title).toBeInViewport({ ratio: 1 });
            await expectTitleStyle(title);
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(title).toHaveText(titles.at(-1));
    });
}

test.describe('언어별 홈의 첫 화면', () => {
    test.use({ javaScriptEnabled: false });

    test('스크립트 실행 전에도 로고 옆에 해당 언어의 사이트 이름을 표시한다', async ({ page }) => {
        for (const [index, locale] of locales.entries()) {
            await page.goto(`/0_Home/${locale}/`, { waitUntil: 'domcontentloaded' });
            const title = page.locator(headerTitle);
            await expect(title).toHaveText(homeNames[index]);
            await expectTitleStyle(title);
        }
    });
});

test('모델 상세 페이지도 같은 제목을 쓰고 모델명을 주 제목으로 제공한다', async ({ request }) => {
    const response = await request.get('/1_RobotModelSelect/models/IR-R4H-54S-INT/');
    const html = await response.text();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<span class="app-title"[^>]*data-i18n="[^"]+"[^>]*>로봇 모델 선택<\/span>/);
});
