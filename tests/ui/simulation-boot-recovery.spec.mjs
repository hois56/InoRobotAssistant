import { expect, test } from '@playwright/test';

const simulation = '/2_3DSimulation/index.html';
const languages = [
    ['ko', /불러오지 못했습니다/, '다시 시도'],
    ['en', /Could not load/, 'Try again'],
    ['zh-CN', /无法加载/, '重试'],
    ['vi', /Không thể tải/, 'Thử lại'],
    ['tr', /yüklenemedi/, 'Tekrar dene'],
    ['ru', /Не удалось загрузить/, 'Повторить']
];
const unavailable = route => route.fulfill({
    status: 429,
    headers: { 'Cache-Control': 'no-store' },
    body: 'Temporary failure'
});

// These external styles, helpers and analytics are not needed to boot the test
// simulator; their connection timing must not affect startup fault assertions.
test.beforeEach(async ({ page }) => {
    await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|static\.cloudflareinsights\.com|inorobot-visitor-counter\.hois56\.workers\.dev|unpkg\.com|cdnjs\.cloudflare\.com)\//, route => route.abort());
});

test('simulation startup script failure gives a localized retry without the failing URL', async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => localStorage.setItem('inorobot.locale', 'ko'));
    await page.route(/\/2_3DSimulation\/rust-ui\.mjs(?:\?|$)/, unavailable);
    for (const [locale, message, retryLabel] of languages) {
        await page.goto(`${simulation}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
        const failure = page.locator('#simulation-boot-failure');
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(failure.getByRole('alert')).toHaveText(message);
        await expect(failure).not.toContainText(/https?:\/\/|\.m?js\?/);
        await expect(failure.getByRole('button', { name: retryLabel, exact: true })).toBeFocused();
    }
});

test('an early manual embed failure uses its same-origin guide language before the saved preference', async ({ page }) => {
    await page.route('**/simulation-guide-fixture', route => route.fulfill({
        contentType: 'text/html',
        body: `<script>
            localStorage.setItem('inorobot.locale', 'ko');
            window.InoRobotI18n = { locale: 'vi' };
        </script>
        <iframe id="guide" src="${simulation}?embed=manual"></iframe>
        <iframe id="explicit-guide" src="${simulation}?embed=manual&amp;lang=ru"></iframe>
        <iframe id="sandbox-guide" sandbox="allow-scripts" src="${simulation}?embed=manual"></iframe>`
    }));
    await page.route(/\/2_3DSimulation\/rust-ui\.mjs(?:\?|$)/, unavailable);
    await page.goto('/simulation-guide-fixture', { waitUntil: 'domcontentloaded' });
    for (const [id, locale, retry] of [['guide', 'vi', 'Thử lại'], ['explicit-guide', 'ru', 'Повторить'], ['sandbox-guide', 'ko', '다시 시도']]) {
        const frame = page.frameLocator('#' + id);
        await expect(frame.locator('html')).toHaveAttribute('lang', locale);
        await expect(frame.getByRole('button', { name: retry, exact: true })).toBeVisible();
    }
});

test('simulation retries a failed module request and keeps the language, embed flag and fragment', async ({ page }) => {
    test.setTimeout(120_000);
    const moduleRequest = /\/2_3DSimulation\/conveyor-tracking-core\.mjs(?:\?|$)/;
    await page.route(moduleRequest, unavailable);
    await page.goto(`${simulation}?lang=vi&embed=manual#check`, { waitUntil: 'domcontentloaded' });
    const failure = page.locator('#simulation-boot-failure');
    await expect(failure.getByRole('alert')).toHaveText(/Không thể tải/, { timeout: 30_000 });
    await expect(failure).not.toContainText(/https?:\/\/|\.m?js\?/);
    await expect(page.locator('#btn-conveyor-tracking')).toBeHidden();
    await expect(page.locator('body')).not.toHaveAttribute('inert', '');
    const requestedUrl = page.url();

    await page.unroute(moduleRequest, unavailable);
    await failure.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.locator('#btn-conveyor-tracking')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('body')).not.toHaveAttribute('inert', '');
    await expect(failure).toBeHidden();
    await expect(page).toHaveURL(requestedUrl);
});
