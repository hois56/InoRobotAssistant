import { expect, test } from '@playwright/test';

const supported = [
    ['ko', '/'], ['en', '/en/'], ['zh-CN', '/cn/'],
    ['vi', '/vn/'], ['tr', '/tr/'], ['ru', '/ru/']
];
const documents = '/6_Document/';
const catalog = '/1_RobotModelSelect/';
const modelId = 'IR-R7H-70S-INT';
const modelPath = catalog + 'models/' + modelId + '/';
const localeKey = 'inorobot.locale';

test('6개 언어 홈에서 복사한 공용 도구 링크는 새 브라우저에서도 언어가 유지된다', async ({ page, browser, baseURL }) => {
    for (const [locale, home] of supported) {
        await page.goto(locale === 'ko' ? '/kr/' : home);
        const link = page.locator('a[href^="/6_Document/"]').first();
        await expect(link).toHaveAttribute('href', documents + '?lang=' + locale);
        await link.click();
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        const shared = page.url();

        const recipient = await browser.newContext({ baseURL });
        try {
            const fresh = await recipient.newPage();
            await fresh.goto(shared);
            await expect(fresh.locator('html')).toHaveAttribute('lang', locale);
            await expect(fresh.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://inovancerobot.com' + documents);
            const preferred = locale === 'en' ? 'ko' : 'en';
            await fresh.evaluate(([key, value]) => localStorage.setItem(key, value), [localeKey, preferred]);
            await fresh.reload();
            await expect(fresh.locator('html')).toHaveAttribute('lang', locale);
            await fresh.evaluate(() => dispatchEvent(new Event('focus')));
            await expect(fresh.locator('html')).toHaveAttribute('lang', locale);
            expect(await fresh.evaluate(key => localStorage.getItem(key), localeKey)).toBe(preferred);
        } finally {
            await recipient.close();
        }
    }
});

test('모델 카드, 뒤로 가기와 직접 링크는 현재 언어를 잃지 않고 정규 주소는 바꾸지 않는다', async ({ page }) => {
    await page.goto(catalog + '?lang=ru&source=share#catalog');
    const card = page.locator('[data-product-id="' + modelId + '"]');
    await expect(card).toHaveAttribute('href', modelPath + '?lang=ru');
    await card.click();
    await expect(page.locator('#modal-model-name')).toHaveText(modelId);
    expect(new URL(page.url()).searchParams.get('lang')).toBe('ru');
    await page.goBack();
    await expect(page.locator('#options-modal')).toBeHidden();
    expect(new URL(page.url()).hash).toBe('#catalog');
    await page.goForward();
    await expect(page.locator('#modal-model-name')).toHaveText(modelId);

    await page.goto(modelPath + '?source=share&lang=ru#config');
    await expect(page.locator('#modal-model-name')).toHaveText(modelId);
    await page.locator('#inorobot-language-select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(new RegExp(modelId));
    const updated = new URL(page.url());
    expect(updated.searchParams.get('source')).toBe('share');
    expect(updated.searchParams.get('lang')).toBe('en');
    expect(updated.hash).toBe('#config');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://inovancerobot.com' + modelPath);
    await page.locator('#close-modal-btn').click();
    await expect(page.locator('#options-modal')).toBeHidden();
    const closed = new URL(page.url());
    expect(closed.pathname).toBe(catalog);
    expect(closed.searchParams.get('source')).toBe('share');
    expect(closed.searchParams.get('lang')).toBe('en');
    expect(closed.hash).toBe('#config');
});

test('언어가 고정된 주소에서 홈으로 갈 때 기존 기본 언어를 덮어쓰지 않는다', async ({ page }) => {
    await page.goto('/en/');
    await page.goto(documents + '?lang=ko');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await page.locator('a[data-i18n-home-link]').first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    expect(new URL(page.url()).pathname).toBe('/');
    expect(await page.evaluate(key => localStorage.getItem(key), localeKey)).toBe('en');
});

test('일반 주소는 브라우저의 언어 선택을 계속 따르고 가이드 임베드는 주소를 바꾸지 않는다', async ({ page, context }) => {
    await page.goto('/en/');
    const tool = await context.newPage();
    await tool.goto(documents);
    await expect(tool.locator('html')).toHaveAttribute('lang', 'en');
    expect(new URL(tool.url()).searchParams.get('lang')).toBe('en');
    await page.locator('#inorobot-language-select').selectOption('vi');
    await expect(tool.locator('html')).toHaveAttribute('lang', 'vi');
    expect(new URL(tool.url()).searchParams.get('lang')).toBe('vi');
    await page.locator('#robot-select-guide-trigger').click();
    const iframe = page.locator('#tool-guide-frame');
    await expect(iframe).toHaveAttribute('src', /embed=manual/);
    await expect(iframe.contentFrame().locator('html')).toHaveAttribute('lang', 'vi');
    const frame = page.frames().find(child => child !== page.mainFrame() && child.url().includes('embed=manual'));
    expect(new URL(frame.url()).searchParams.has('lang')).toBe(false);
});

test('러시아어 디버깅 도구의 Trace 이름은 신호 추적 의미로 표시한다', async ({ page }) => {
    await page.goto('/7_DebuggingTool/?lang=ru');
    const trace = page.getByRole('heading', { name: 'Трассировка сигналов', exact: true });
    await expect(trace).toBeVisible();
    await page.locator('#inorobot-language-select').selectOption('en');
    await expect(page.getByRole('heading', { name: 'Trace', exact: true })).toBeVisible();
});
