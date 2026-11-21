import { expect, test } from '@playwright/test';

const widths = [1920, 1440, 1366, 1351, 1280, 768, 390, 320];

test('상태 문구는 왼쪽 하단에 놓이고 도구 모음을 스크롤해도 움직이지 않는다', async ({ page }) => {
    await page.goto('/2_3DSimulation/', { waitUntil: 'domcontentloaded' });
    const status = page.locator('.stat-status-block .stat-item');
    const dock = page.locator('#panel-launcher');
    await expect(page.locator('#stat-status')).toBeVisible();
    await expect(page.locator('#stat-fps')).toHaveCount(0);
    await expect(dock.locator('[data-panel-toggle="workobject-panel"]')).toBeAttached();
    for (const width of widths) {
        await page.setViewportSize({ width, height: 800 });
        const [row, toolbar] = await Promise.all([status.boundingBox(), dock.boundingBox()]);
        expect(row.x).toBeGreaterThanOrEqual(0);
        expect(row.x).toBeLessThanOrEqual(20);
        expect(800 - row.y - row.height).toBeGreaterThanOrEqual(0);
        expect(800 - row.y - row.height).toBeLessThanOrEqual(20);
        if (width <= 1350) expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(row.y + 1);
        else expect(row.x + row.width).toBeLessThanOrEqual(toolbar.x);
        await dock.evaluate(node => { node.scrollLeft = node.scrollWidth; });
        expect((await status.boundingBox()).x).toBeCloseTo(row.x, 0);
    }
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.locator('#inorobot-language-select').selectOption('vi');
    const message = status.locator('#stat-status');
    await expect(message).toHaveText('Sẵn sàng');
    expect(await message.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});

test('하단 버튼이 한 줄에 배치되고 컨베이어 오른쪽 버튼은 안쪽 여백이 더 작다', async ({ page }) => {
    await page.goto('/2_3DSimulation/', { waitUntil: 'domcontentloaded' });
    const dock = page.locator('#panel-launcher');
    await expect(dock.locator('#btn-conveyor-tracking ~ #btn-undo')).toBeAttached();
    const conveyorIcon = dock.locator('#btn-conveyor-tracking svg');
    const workObject = dock.locator('[data-panel-toggle="workobject-panel"]');
    await expect(conveyorIcon.locator('path')).toHaveCount(1);
    await expect(workObject.locator('svg')).toBeVisible();
    await expect(workObject).toHaveAccessibleName(/작업물 좌표계/);
    for (const width of widths) {
        await page.setViewportSize({ width, height: 800 });
        await expect(conveyorIcon).toBeVisible();
        const iconWidth = (await conveyorIcon.boundingBox()).width;
        expect(iconWidth).toBeGreaterThanOrEqual(11);
        expect(iconWidth).toBeLessThanOrEqual(15);
        const buttons = dock.locator('button:visible');
        const layout = await buttons.evaluateAll((nodes, wide) => {
            const boxes = nodes.map(node => node.getBoundingClientRect());
            return {
                padded: nodes.every((node, index) => {
                    const style = getComputedStyle(node);
                    const compact = node.matches('#btn-conveyor-tracking ~ button');
                    const expected = compact ? (wide ? '2px' : '4px') : (wide ? '5.12px' : '7px');
                    return style.paddingInlineStart === expected && style.paddingInlineEnd === expected
                        && (!compact || boxes[index].width < 30);
                }),
                minimumGap: Math.min(...boxes.slice(1).map((box, i) => box.left - boxes[i].right)),
                singleRow: boxes.every(box => Math.abs(box.top + box.height / 2 - boxes[0].top - boxes[0].height / 2) < 1)
            };
        }, width > 768);
        expect(layout.padded, `버튼 좌우 패딩이 ${width}px 화면에서 적용된다`).toBe(true);
        expect(layout.minimumGap).toBeCloseTo(width > 768 ? 3 : 2, 1);
        expect(layout.singleRow).toBe(true);
        await dock.evaluate(node => { node.scrollLeft = node.scrollWidth; });
        await expect(buttons.last(), `마지막 버튼이 ${width}px 화면의 도구 모음 안에 들어온다`).toBeInViewport({ ratio: 1 });
    }
    const view = dock.locator('[data-panel-toggle="view-presets-panel"]');
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.mouse.move(10, 10);
        await expect(view).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        const originalWidth = (await view.boundingBox()).width;
        await view.click();
        await expect(page.locator('#view-presets-panel')).toBeVisible();
        await expect(view).toHaveClass(/active/);
        await expect(view).toHaveCSS('background-color', 'rgb(220, 239, 252)');
        expect((await view.boundingBox()).width).toBe(originalWidth);
        await view.click();
        await expect(page.locator('#view-presets-panel')).toBeHidden();
    }
});
