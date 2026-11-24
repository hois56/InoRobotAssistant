import { expect, test } from '@playwright/test';

test('상하단 버튼·로봇 모델 선택·상태 문구는 선택 언어의 화면 글꼴을 따른다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/2_3DSimulation/');
    await page.waitForFunction(() => window.InoRobotI18n);

    const fullscreen = page.locator('#btn-fullscreen-mode span');
    const program = page.locator('[data-panel-toggle="program-panel"]');
    await expect(fullscreen).toHaveText('전체 화면');
    await expect(program).toHaveText('프로그램');

    const model = page.locator('#model-select');
    await expect(model.locator('option:checked')).toContainText('로봇 모델을 선택하세요');
    const status = page.locator('#stat-status');
    await expect(status).toHaveText(/.+/);

    const textElements = [
        '#btn-fullscreen-mode span', '[data-panel-toggle="program-panel"]',
        '#model-select', '#model-select option:checked', '#model-select optgroup',
        '#stats-bar .stat-item label', '#stat-status'
    ];
    for (const locale of ['ko', 'en', 'zh-CN', 'vi', 'tr', 'ru']) {
        await page.evaluate(value => window.InoRobotI18n.setLocale(value, { persist: false }), locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        const styles = await page.evaluate(selectors => ({
            pageFont: getComputedStyle(document.body).fontFamily,
            fonts: selectors.map(selector => getComputedStyle(document.querySelector(selector)).fontFamily),
            statusSpacing: getComputedStyle(document.getElementById('stat-status')).letterSpacing,
            labelSpacing: getComputedStyle(document.querySelector('#stats-bar .stat-item label')).letterSpacing
        }), textElements);
        for (const [index, selector] of textElements.entries()) {
            expect.soft(styles.fonts[index], locale + ' ' + selector).toBe(styles.pageFont);
        }
        expect.soft(styles.statusSpacing, locale + ' status spacing').toBe(styles.labelSpacing);
    }
});

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
