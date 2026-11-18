import { expect, test } from '@playwright/test';

test('Shows the rendered FPS below status while drawing and returns to zero when idle', async ({ page }) => {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()) +
            '\nwindow.__fpsDisplay = { state, requestRender };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__fpsDisplay?.state.workspaceRecovery.ready);

    const display = page.locator('#stat-fps');
    await expect(display).toBeVisible();
    const status = await page.locator('#stat-status').boundingBox();
    const fps = await display.boundingBox();
    expect(fps.y).toBeGreaterThanOrEqual(status.y + status.height);
    expect(fps.x).toBeLessThanOrEqual(status.x);

    const limit = page.getByRole('checkbox', { name: 'Limit rendering to 60 FPS' });
    await limit.check();
    await page.evaluate(() => {
        window.__fpsDisplay.timer = setInterval(window.__fpsDisplay.requestRender, 8);
    });
    try {
        await expect(display).toHaveText(/^[1-9]\d* FPS$/);
        expect(parseInt(await display.textContent(), 10)).toBeLessThanOrEqual(65);
    } finally {
        await page.evaluate(() => clearInterval(window.__fpsDisplay.timer));
    }
    await expect(display).toHaveText('0 FPS');
});
