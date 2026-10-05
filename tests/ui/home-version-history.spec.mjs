import { test, expect } from '@playwright/test';
import fs from 'node:fs';

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
    await page.locator('#version-history-modal').screenshot({ path: test.info().outputPath('release-history.png') });
});
