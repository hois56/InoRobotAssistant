import { expect, test } from '@playwright/test';

const panels = [
    'model-browser-panel', 'shape-panel', 'measurement-panel', 'view-presets-panel',
    'collaboration-panel', 'interference-zone-panel', 'io-simulator-panel',
    'vision-panel', 'conveyor-tracking-dialog', 'jog-panel', 'position-points-panel',
    'tcp-profile-panel', 'workobject-panel', 'program-panel', 'virtual-controller-panel'
];

async function expectCompactHeader(header, font = 'Noto Sans KR') {
    const title = header.getByRole('heading', { level: 2 });
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS('font-family', new RegExp(`^"${font}",`));
    await expect(title).toHaveCSS('font-size', '16px');
    await expect(title).toHaveCSS('font-weight', '700');
    await expect(title).toHaveCSS('color', 'rgb(7, 94, 148)');
    await expect(header).toHaveCSS('padding-block-start', '2px');
    await expect(header).toHaveCSS('padding-block-end', '2px');
    await expect.poll(async () => (await header.boundingBox())?.height).toBe(40);
}

test('시뮬레이션 주요 패널은 제목 줄 높이와 글꼴, 색상을 통일한다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/2_3DSimulation/', { waitUntil: 'domcontentloaded' });
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    const dock = page.locator('#panel-launcher');
    await expect(dock.locator('[data-panel-toggle="jog-panel"]')).toBeEnabled();
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const id of panels) {
            await test.step(`${width}px - ${id}`, async () => {
                const panel = page.locator(`#${id}`);
                const button = dock.locator(`[data-panel-toggle="${id}"]`);
                if (!(await panel.isVisible())) await button.click();
                const header = panel.locator(':scope > div:first-child');
                await expectCompactHeader(header);
                if (id === 'conveyor-tracking-dialog') {
                    const icon = header.getByRole('heading').locator('svg');
                    await expect(icon).toBeVisible();
                    expect(await icon.innerHTML()).toBe(await button.locator('svg').innerHTML());
                }
                if (id === 'shape-panel' || id === 'measurement-panel') {
                    await expect(header.locator(':scope > div:first-child > span')).toHaveCount(0);
                }
                await button.click();
                await expect(panel).toBeHidden();
            });
        }
    }
});

test('별도 창으로 분리한 도형 패널도 같은 높이로 제목만 표시한다', async ({ page }) => {
    await page.goto('/2_3DSimulation/', { waitUntil: 'domcontentloaded' });
    await page.locator('#panel-launcher [data-panel-toggle="shape-panel"]').click();
    const popupReady = page.waitForEvent('popup');
    await page.locator('#shape-panel [data-panel-action="popout"]').click();
    const popup = await popupReady;
    const header = popup.locator('.shape-panel-header');
    await expectCompactHeader(header);
    await expect(header.locator(':scope > div:first-child > span')).toHaveCount(0);
    await page.evaluate(() => window.InoRobotI18n.setLocale('zh-CN'));
    await expectCompactHeader(header, 'Noto Sans SC');
    await page.evaluate(() => window.InoRobotI18n.setLocale('en'));
    await expectCompactHeader(header, 'Noto Sans');
    await header.locator('[data-panel-action="hide"]').click();
    await expect.poll(() => popup.isClosed()).toBe(true);
    await page.locator('#panel-launcher [data-panel-toggle="shape-panel"]').click();
    await expectCompactHeader(page.locator('#shape-panel .shape-panel-header'), 'Noto Sans');
});

test('별도 패널의 빈 곳을 잡아 끌면 창이 이동하고 입력 칸은 편집할 수 있다', async ({ page }) => {
    await page.goto('/2_3DSimulation/', { waitUntil: 'domcontentloaded' });
    await page.locator('#panel-launcher [data-panel-toggle="shape-panel"]').click();
    const popupReady = page.waitForEvent('popup');
    await page.locator('#shape-panel [data-panel-action="popout"]').click();
    const popup = await popupReady;
    const header = popup.locator('.shape-panel-header');
    await expectCompactHeader(header);

    const position = () => popup.evaluate(() => [window.screenX, window.screenY]);
    await popup.evaluate(() => window.moveTo(100, window.screenY));
    await expect.poll(async () => (await position())[0]).toBe(100);
    const start = await position();
    const input = popup.locator('[data-shape-create-dimension="x"]');
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially('150');
    await expect(input).toHaveValue('150');
    expect(await position()).toEqual(start);

    const size = () => popup.evaluate(() => [window.outerWidth, window.outerHeight]);
    const originalSize = await size();
    const dragHeader = async (dx) => {
        const box = await header.boundingBox();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await popup.mouse.move(x, y);
        await popup.mouse.down();
        await popup.mouse.move(x + dx, y);
        await popup.mouse.up();
    };

    for (const [dx, x] of [[36, 136], [-18, 118]]) {
        await dragHeader(dx);
        await expect.poll(position).toEqual([x, start[1]]);
        expect(await size()).toEqual(originalSize);
    }

    // Emulate a delayed browser bounds update that expands the popup after moveTo.
    await popup.evaluate(() => {
        const moveTo = window.moveTo.bind(window);
        let width = window.outerWidth;
        let height = window.outerHeight;
        Object.defineProperties(window, {
            outerWidth: { get: () => width },
            outerHeight: { get: () => height }
        });
        window.resizeTo = (w, h) => {
            width = w;
            height = h;
        };
        window.__sizeAfterMove = new Promise(resolve => {
            window.moveTo = (x, y) => {
                moveTo(x, y);
                window.setTimeout(() => {
                    width += 12;
                    height += 8;
                    window.dispatchEvent(new Event('resize'));
                    resolve([width, height]);
                }, 20);
            };
        });
    });
    await dragHeader(20);
    await expect.poll(position).toEqual([138, start[1]]);
    expect(await popup.evaluate(() => window.__sizeAfterMove)).toEqual(originalSize);
});
