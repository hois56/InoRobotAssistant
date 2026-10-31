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
        await expectGroupedHistory(body);
    });
}
