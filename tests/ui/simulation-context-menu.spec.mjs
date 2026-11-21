import { test, expect } from '@playwright/test';

async function setup(page) {
    await page.addInitScript(() => {
        window.__simulationContextEvents = [];
        // Read after dispatch finishes: a capture-listener microtask can run
        // before the application's later listeners cancel the default action.
        window.addEventListener('contextmenu', event => {
            setTimeout(() => window.__simulationContextEvents.push({ prevented: event.defaultPrevented }), 0);
        }, { capture: true });
    });
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);\s*$/m, 'window.__contextReady = init();');
        await route.fulfill({ response, body: source + '\nwindow.__contextCheck = { state, addCurrentMotionStep, saveMotionProjectNow, THREE };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__contextReady && window.__contextCheck);
    await page.evaluate(() => window.__contextReady);
}

async function panCamera(page) {
    const start = await page.evaluate(() => {
        const { state } = window.__contextCheck, canvas = state.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        for (const yRatio of [0.25, 0.5, 0.7]) {
            for (const xRatio of [0.5, 0.65, 0.4]) {
                const x = rect.left + rect.width * xRatio, y = rect.top + rect.height * yRatio;
                if ([document.elementFromPoint(x, y), document.elementFromPoint(x + 24, y + 16)].every(target => target === canvas)) {
                    return { x, y, position: state.camera.position.toArray(), target: state.controls.target.toArray() };
                }
            }
        }
        throw new Error('카메라 이동을 확인할 3D 화면 영역이 없습니다.');
    });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(start.x + 24, start.y + 16, { steps: 4 });
    await page.mouse.up({ button: 'right' });
    const after = await page.evaluate(() => ({
        position: window.__contextCheck.state.camera.position.toArray(),
        target: window.__contextCheck.state.controls.target.toArray()
    }));
    expect(after).not.toEqual({ position: start.position, target: start.target });
}

async function expectNativeMenusBlocked(page) {
    await expect.poll(() => page.evaluate(() => window.__simulationContextEvents.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__simulationContextEvents.every(event => event.prevented))).toBe(true);
}

test('카메라 우클릭 이동 후 3D 화면·오버레이·패널 공백에서 브라우저 기본 메뉴를 차단한다', async ({ page }) => {
    await setup(page);
    await panCamera(page);
    await expectNativeMenusBlocked(page);
    await expect(page.locator('#model-context-menu')).toBeHidden();

    // Cover release targets that do not pass through the renderer canvas,
    // including panel whitespace where no application menu item is targeted.
    for (const selector of ['#canvas-container', '#simulation-snap-marker', '#primitive-dimension-overlay', '#model-tree', '#program-panel']) {
        const prevented = await page.locator(selector).evaluate(node => {
            window.__contextCheck.state.suppressNextSceneContextMenu = true;
            const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
            node.dispatchEvent(event);
            return event.defaultPrevented;
        });
        expect(prevented, selector).toBe(true);
    }
});

test('카메라 이동 후 모델 트리와 프로그램 패널의 앱 우클릭 메뉴와 명령이 유지된다', async ({ page }) => {
    await setup(page);
    await panCamera(page);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__contextCheck.state.activeProgramRobot);
    await page.locator('#model-tree .model-tree-button').first().click({ button: 'right' });
    await expect(page.locator('#model-context-menu')).toBeVisible();
    await expect(page.locator('#model-hide')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.evaluate(() => window.__contextCheck.addCurrentMotionStep());
    await page.locator('[data-panel-toggle="program-panel"]').click();
    const row = page.locator('#program-step-list [data-program-step-id]').first();
    await row.click({ button: 'right' });
    await expect(page.locator('#program-step-context-menu')).toBeVisible();
    await page.locator('#program-show-position-value').click();
    await expect(page.locator('#position-value-dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    // A stale camera-drag flag must not swallow the panels' own handlers.
    for (const [target, menu] of [
        [page.locator('#model-tree .model-tree-button').first(), '#model-context-menu'],
        [row, '#program-step-context-menu']
    ]) {
        const prevented = await target.evaluate(node => {
            window.__contextCheck.state.suppressNextSceneContextMenu = true;
            const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
            node.dispatchEvent(event);
            return event.defaultPrevented;
        });
        expect(prevented).toBe(true);
        await expect(page.locator(menu)).toBeVisible();
        await page.keyboard.press('Escape');
    }
    await expectNativeMenusBlocked(page);
});

test('겹친 면 보정은 선택한 모델에 적용하고 되돌리기와 작업 복원을 지원한다', async ({ page }) => {
    test.setTimeout(60_000);
    await setup(page);
    await page.waitForFunction(() => window.__contextCheck.state.workspaceRecovery.ready);
    const plane = [
        'solid plate', 'facet normal 0 0 1', 'outer loop', 'vertex 0 0 0',
        'vertex 100 0 0', 'vertex 0 100 0', 'endloop', 'endfacet', 'endsolid plate'
    ].join('\n');
    const fileInput = page.locator('#input-import-3d');
    const names = ['Case.stl', 'Label.stl'];
    await fileInput.setInputFiles(names.map(name => ({
        name, mimeType: 'application/octet-stream', buffer: Buffer.from(plane)
    })));
    await page.locator('#btn-confirm-import').click();
    const readParts = () => page.evaluate(files => {
        const { state } = window.__contextCheck;
        return files.map(name => {
            const model = state.models.find(candidate => candidate.userData.modelName === name);
            const part = model?.userData.importedParts[0];
            if (!part) return null;
            const mesh = part.children.find(child => child.isMesh);
            return {
                enabled: mesh.material.polygonOffset,
                test: mesh.material.depthTest,
                vertices: Array.from(mesh.geometry.attributes.position.array),
                position: part.position.toArray()
            };
        });
    }, names);
    await expect.poll(async () => (await readParts()).filter(Boolean).length).toBe(2);
    const before = await readParts();
    expect(before.map(part => part.enabled)).toEqual([false, false]);

    const row = page.locator('#model-tree .model-tree-button').filter({ hasText: 'Label' });
    const offset = page.locator('#model-surface-depth-offset');
    await row.click({ button: 'right' });
    await expect(offset).toHaveAttribute('aria-checked', 'false');
    await offset.click();
    const enabled = [before[0], { ...before[1], enabled: true }];
    expect(await readParts()).toEqual(enabled);

    await row.click({ button: 'right' });
    await expect(offset).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await page.locator('#btn-undo').click();
    expect(await readParts()).toEqual(before);
    await page.locator('#btn-redo').click();
    expect(await readParts()).toEqual(enabled);

    await page.evaluate(() => window.__contextCheck.saveMotionProjectNow());
    await page.reload();
    await page.locator('#btn-workspace-restore').click();
    await expect.poll(readParts).toEqual(enabled);
});
