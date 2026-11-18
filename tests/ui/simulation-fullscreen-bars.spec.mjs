import { expect, test } from '@playwright/test';

test('fullscreen top bar waits 500 ms and the bottom bar opens immediately at the edge', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/2_3DSimulation/');
    const body = page.locator('body');
    await page.locator('#btn-fullscreen-mode').click();
    await expect(body).toHaveClass(/fullscreen-ui-mode/);
    await expect(body).not.toHaveClass(/fullscreen-(?:topbar|statsbar)-revealed/);
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));

    const bars = await page.evaluate(() => [
        { name: 'topbar', edge: 0, direction: 1, height: document.querySelector('#topbar').offsetHeight },
        { name: 'statsbar', edge: innerHeight - 1, direction: -1, height: document.querySelector('#stats-bar').offsetHeight }
    ]);
    for (const { name, edge, direction, height } of bars) {
        const revealed = new RegExp(`fullscreen-${name}-revealed`);
        const nearEdge = edge + direction * Math.floor((height + 16) / 2 - 2);
        const overBar = edge + direction * (height - 4);

        await page.mouse.move(640, overBar);
        await page.clock.fastForward(500);
        await expect(body).not.toHaveClass(revealed);

        if (name === 'topbar') {
            await page.mouse.move(640, nearEdge);
            await page.clock.fastForward(300);
            await page.mouse.move(640, 450);
            await page.clock.fastForward(500);
            await expect(body).not.toHaveClass(revealed);

            await page.mouse.move(640, nearEdge);
            await page.clock.fastForward(300);
            await page.mouse.move(650, nearEdge);
            await page.clock.fastForward(199);
            await expect(body).not.toHaveClass(revealed);
            await page.clock.fastForward(1);
        } else {
            await page.mouse.move(640, nearEdge);
        }
        expect(await body.getAttribute('class')).toMatch(revealed);

        await page.mouse.move(640, overBar);
        await page.clock.fastForward(500);
        await expect(body).toHaveClass(revealed);
        await page.mouse.move(640, 450);
        await page.clock.fastForward(250);
        await expect(body).not.toHaveClass(revealed);
    }

    await page.mouse.move(640, 1);
    await page.clock.fastForward(300);
    await page.mouse.move(640, -1);
    await page.clock.fastForward(500);
    await expect(body).not.toHaveClass(/fullscreen-topbar-revealed/);

    await page.mouse.move(640, 1);
    await page.keyboard.press('Escape');
    await page.clock.fastForward(500);
    await expect(body).not.toHaveClass(/fullscreen-(?:ui-mode|topbar-revealed|statsbar-revealed)/);
});

test.describe('touch input', () => {
    test.use({ hasTouch: true });

    test('the fullscreen button stays available when entering without a mouse', async ({ page }) => {
        await page.goto('/2_3DSimulation/');
        const button = page.locator('#btn-fullscreen-mode');
        await button.tap();
        await expect(page.locator('body')).toHaveClass(/fullscreen-topbar-revealed/);
        await button.tap();
        await expect(button).toHaveAttribute('aria-pressed', 'false');
    });
});
