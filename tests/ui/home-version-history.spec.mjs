import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const tagOrder = ['추가', '신규', '지원', '개선', '변경', '개편', '수정', '업데이트', '삭제', '정리', '배포'];

async function expectGroupedHistory(body) {
    const blocks = body.locator('.history-version-block');
    expect(await blocks.count()).toBeGreaterThan(0);
    for (const block of await blocks.all()) {
        const tags = await block.locator('.history-tag').allTextContents();
        const ranks = tags.map(tag => tagOrder.indexOf(tag));
        expect(ranks, await block.locator('h3').textContent()).toEqual([...ranks].sort((a, b) => a - b));
    }
}

for (const [name, route, trigger] of [
    ['home', '/0_Home/en/', '[data-history-card="robot3dViewer"]'],
    ['debugging', '/7_DebuggingTool/', '[data-debug-history="communicationTester"]']
]) {
    test(`${name} 버전 기록의 한글 제목과 본문은 화면 글꼴을 따른다`, async ({ page }) => {
        await page.goto(route);
        await page.evaluate(() => window.InoRobotI18n.setLocale('ko', { persist: false }));
        await page.locator(trigger).click();

        const dialog = page.getByRole('dialog');
        const family = await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily);
        await expect(dialog.locator('.history-title')).toHaveCSS('font-family', family);
        await expect(dialog.locator('.history-entry').first()).toHaveCSS('font-family', family);
        await expect(dialog.locator('.history-tag').first()).toHaveCSS('font-family', family);
    });

    test(`${name} 버전 기록은 밝은 창에서 스크롤하고 좁은 화면에서도 닫을 수 있다`, async ({ page }) => {
        await page.goto(route);
        if (name === 'home') await page.evaluate(() => window.InoRobotI18n.setLocale('en', { persist: false }));
        const button = page.locator(trigger);
        const dialog = page.getByRole('dialog');
        const body = dialog.locator('.history-dialog-body');
        for (const width of [1280, 360]) {
            await page.setViewportSize({ width, height: 720 });
            await button.click();
            await expect(body.locator('.history-entry').first()).toBeInViewport();
            await expect(dialog).toHaveCSS('color-scheme', 'light');
            const close = dialog.locator('.history-close-button');
            await expect(close).toBeInViewport();
            expect(await body.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
            await dialog.screenshot({ path: test.info().outputPath(`${name}-history-${width}.png`) });
            await body.focus();
            await page.keyboard.press('End');
            await expect.poll(() => body.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
            await expect(close).toBeInViewport();
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
            await expect(button).toBeFocused();
        }
    });
}

test('홈페이지 카드와 버전 기록 창은 최신 배포 기록을 표시한다', async ({ page }) => {
    const source = JSON.parse(fs.readFileSync(new URL('../../0_Home/version-history.json', import.meta.url), 'utf8'));
    const section = source.locales.ko.versionHistory.sections.find(value => value.title === '3D Simulation');
    const latest = section.versions[0];
    await page.goto('/0_Home/ko/index.html');
    await expect(page.locator('[data-site-card-version="robot3dViewer"]')).toHaveText(latest.title);
    await page.locator('[data-history-card="robot3dViewer"]').click();
    const body = page.locator('#history-dialog-body');
    await expect(body).toBeVisible();
    await expect(body).toContainText(latest.title);
    await expect(body).toContainText(latest.items[0].replace(/^`\[[^\]]+\]`\s*/, ''));
    await expect(body).not.toContainText('Ver 26.10.04');
    await expectGroupedHistory(body);
    // The sticky site header must not be drawn over the history dialog.
    const layers = await page.evaluate(() => [
        Number(getComputedStyle(document.getElementById('version-history-modal')).zIndex),
        Number(getComputedStyle(document.querySelector('body > header.site-header')).zIndex)
    ]);
    expect(layers[0]).toBeGreaterThan(layers[1]);
    await page.locator('#version-history-modal').screenshot({ path: test.info().outputPath('release-history.png') });
});

for (const fallback of [false, true]) {
    test(`디버깅 도구의 ${fallback ? '오프라인용' : '다국어'} 기록도 버전별로 구분을 모아 표시한다`, async ({ page }) => {
        if (fallback) await page.route('**/Language/runtime/locales-data.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
        await page.goto('/7_DebuggingTool/index.html');
        await page.locator('[data-debug-history="communicationTester"]').click();
        const body = page.locator('#debug-history-body');
        await expect(body).toBeVisible();
        await expect(body).toContainText('Ver 3.1');
        await expect(body).toContainText('Ver 4.0 (2026.11.04)');
        await expect(body).toContainText('Ver 5.0 (2026.11.21)');
        await expect(page.locator('[data-debug-history="communicationTester"]')).toHaveAttribute('data-current-version', 'V5.0');
        await expect(page.locator('a[href="CommunicationTester/InoRobot_Comm_Test_V5.0.zip"]')).toHaveCount(1);
        await expectGroupedHistory(body);
    });
}
