import { test, expect } from '@playwright/test';

test('홈의 각 도구는 카드 한 곳에서 열고 헤더에는 원본 로고를 표시한다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/0_Home/ko/');

    const cards = page.locator('.tool-grid a.tool-link');
    await expect(cards).toHaveCount(8);
    const toolPaths = await cards.evaluateAll(links => links.map(link => link.pathname));
    const visiblePaths = await page.locator('a:visible').evaluateAll(links => links.map(link => link.pathname));
    for (const path of toolPaths) {
        expect.soft(visiblePaths.filter(candidate => candidate === path), path).toHaveLength(1);
    }

    const logo = page.getByRole('img', { name: 'INOVANCE', exact: true });
    await expect(logo).toHaveAttribute('src', '/1_RobotModelSelect/INOVANCE_Logo.png');
    expect(await logo.evaluate(image => getComputedStyle(image).filter)).toBe('none');
});
