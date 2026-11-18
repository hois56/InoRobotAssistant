import { expect, test } from '@playwright/test';

async function setup(page) {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({
            response,
            body: (await response.text()) + '\nwindow.__beltUi={state,createPrimitiveShapeRoot,updateUIStatus,equipmentApp,ensureWorkspaceModelId,getImportedModelParts,writeOlpAddress,conveyorTrackingApp};'
        });
    });
    await page.goto('/2_3DSimulation/');
    await page.waitForFunction(() => window.__beltUi?.state.workspaceRecovery.ready);
    await page.evaluate(() => {
        const { state, createPrimitiveShapeRoot, ensureWorkspaceModelId, equipmentApp, updateUIStatus } = window.__beltUi;
        for (const [name, dimensions, position] of [
            ['컨베이어', { x: 800, y: 160, z: 30 }, [0, 0, 0]],
            ['이송 물체', { x: 40, y: 40, z: 40 }, [-200, 0, 30]]
        ]) {
            const model = createPrimitiveShapeRoot('box', dimensions, { name });
            model.position.fromArray(position);
            state.scene.add(model);
            state.models.push(model);
        }
        equipmentApp.save({
            id: 'belt-object',
            type: 'OBJECT',
            movingRef: 'equipment-model:' + ensureWorkspaceModelId(state.models[1]) + '/-1'
        });
        updateUIStatus();
    });
    await page.locator('button[data-model-tree-id]').filter({ hasText: '컨베이어' }).click({ button: 'right' });
    await page.locator('#model-motion-settings').click();
}
test('모델 트리에서 이동 대상을 추가해 동작에 등록한다', async ({ page }) => {
    await setup(page);
    await page.locator('button[data-model-tree-id]').filter({ hasText: '이송 물체' }).click({ button: 'right' });
    await page.locator('#model-motion-add-part').click();
    await page.locator('#equipment-form button[type="submit"]').click();
    await expect(page.locator('#equipment-error')).toContainText('저장');
    const targets = await page.evaluate(() => {
        const { state, ensureWorkspaceModelId } = window.__beltUi;
        const motion = state.equipmentDefinitions.find(item => item.type === 'CYLINDER');
        return { refs: motion.movingRefs, expected: state.models.map(model => 'equipment-model:' + ensureWorkspaceModelId(model) + '/-1') };
    });
    expect(targets.refs).toEqual(targets.expected);
});

test('컨베이어 설정은 IO 없이 시험하고 IO 연결 후에도 운전하며 모델 트리에서 다시 편집한다', async ({ page }) => {
    await setup(page);
    const form = page.locator('#equipment-form');
    const type = form.locator('[name="type"]');
    const address = form.locator('[name="forwardAddress"]');
    const save = form.locator('button[type="submit"]');
    const status = page.locator('#equipment-error');
    const position = () => page.evaluate(() => window.__beltUi.state.models[1].position.x);
    await type.selectOption('CONVEYOR');
    await save.click();
    await expect(status).toContainText('저장');
    await page.locator('[data-conveyor-command="FORWARD"]').click();
    await expect.poll(position).toBeGreaterThan(-190);
    await page.locator('[data-conveyor-command="STOP"]').click();
    const stopped = await position();
    await page.waitForTimeout(120);
    expect(await position()).toBeCloseTo(stopped, 6);
    await address.fill('600');
    await save.click();
    await expect(status).toContainText('저장');
    await page.locator('#equipment-close').click();
    await page.evaluate(() => window.__beltUi.writeOlpAddress('Out[600]', 1));
    await expect.poll(position).toBeGreaterThan(stopped + 10);
    await page.locator('button[data-model-tree-id]').filter({ hasText: '컨베이어' }).click({ button: 'right' });
    await page.locator('#model-motion-edit-options button').click();
    await expect(type).toHaveValue('CONVEYOR');
    await expect(address).toHaveValue('600');
});

test('조립 모델에서 벨트 부품을 선택하면 가이드를 제외한 벨트 상면의 물체만 이송한다', async ({ page }) => {
    await setup(page);
    await page.locator('#equipment-close').click();
    await page.evaluate(() => {
        const { state, createPrimitiveShapeRoot, updateUIStatus } = window.__beltUi;
        const belt = state.models[0];
        const surface = belt.children.find(child => child.isMesh);
        surface.userData.modelPartName = '벨트 면';
        surface.userData.modelPartId = 'belt-face';
        const guide = createPrimitiveShapeRoot('box', { x: 800, y: 10, z: 100 }, { name: '가이드' });
        guide.position.set(0, 70, 30);
        belt.add(guide);
        guide.userData.modelPartName = '높은 가이드';
        guide.userData.modelPartId = 'belt-guide';
        belt.userData.importedParts = [surface, guide];
        delete belt.userData.primitiveShape;
        belt.userData.uploaded = true;
        updateUIStatus();
    });
    const beltFace = page.locator('button[data-model-part-id="belt-face"]');
    if (!await beltFace.isVisible()) await page.locator('[data-model-tree-toggle]').first().click();
    await beltFace.click({ button: 'right' });
    await page.locator('#model-motion-settings').click();
    await page.locator('#equipment-form [name="type"]').selectOption('CONVEYOR');
    await page.locator('#equipment-form button[type="submit"]').click();
    await expect(page.locator('#equipment-error')).toContainText('저장');
    const target = await page.evaluate(() => window.__beltUi.state.ioFunctionMappings.find(item => item.action === 'CONVEYOR').gripObjectRef);
    expect(target).toMatch(/\/0$/);
    await page.locator('[data-conveyor-command="FORWARD"]').click();
    await expect.poll(() => page.evaluate(() => window.__beltUi.state.models[1].position.x)).toBeGreaterThan(-190);
    expect(await page.evaluate(() => window.__beltUi.state.models[0].position.x)).toBe(0);
});

test('컨베이어 센서 IN0을 적용하고 저장·복원하며 감지한다', async ({ page }) => {
    await setup(page);
    await page.locator('#equipment-form [name="type"]').selectOption('CONVEYOR');
    await page.locator('#equipment-form button[type="submit"]').click();
    await page.locator('#equipment-close').click();
    await page.locator('#btn-conveyor-tracking').click();
    const panel = page.locator('#conveyor-tracking-dialog');
    await panel.locator('[name="address"]').fill('');
    await panel.locator('[name="address"]').fill('0');
    await expect(panel.locator('[name="address"]')).toHaveValue('0');
    await panel.locator('[data-action="apply-sensor"]').click();
    await expect(panel.locator('[data-status]')).toContainText('센서 설정을 적용했습니다');
    expect(await page.evaluate(() => window.__beltUi.conveyorTrackingApp.serialize()[0].address)).toBe(0);
    await page.evaluate(() => {
        const app = window.__beltUi.conveyorTrackingApp;
        app.restore(app.serialize().map(settings => ({ ...settings, capture: true })));
        app.open();
    });
    await expect(panel.locator('[name="capture"]')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: '현재 화면 촬영' })).toBeVisible();
    expect(await page.evaluate(() => Object.hasOwn(window.__beltUi.conveyorTrackingApp.serialize()[0], 'capture'))).toBe(false);
    await expect(panel.locator('[name="address"]')).toHaveValue('0');
    await panel.locator('[data-action="run"]').click();
    await expect(panel.locator('[data-sensor-preview]')).toContainText('IN0');
    await panel.locator('[data-action="stop"]').click();
});


test('운전 중 언어를 바꿔도 속도를 유지하고 공급·센서 상태를 번역한다', async ({ page }) => {
    await setup(page);
    const form = page.locator('#equipment-form');
    await form.locator('[name="type"]').selectOption('CONVEYOR');
    await form.locator('[type="submit"]').click();
    await page.locator('#equipment-close').click();
    await page.locator('#btn-conveyor-tracking').click();
    const panel = page.locator('#conveyor-tracking-dialog');
    await panel.locator('[data-action="apply-sensor"]').click();
    await panel.locator('[data-action="apply-feed"]').click();
    await panel.locator('[name="testSpeed"]').fill('');
    await panel.locator('[name="testSpeed"]').fill('75');
    await expect(panel.locator('[name="testSpeed"]')).toHaveValue('75');
    await panel.locator('[data-action="run"]').click();
    await page.locator('.inorobot-language-select').selectOption('en');
    await expect(panel.locator('[data-test-status]')).toHaveText('Running · Forward · 75 mm/s');
    await expect(panel.locator('[data-feed-status]')).toContainText('Automatic feed: Enabled');
    await expect(panel.locator('[data-sensor-preview]')).toContainText('Scene sensor IN');
    await page.locator('.inorobot-language-select').selectOption('ru');
    await expect(panel.locator('[data-test-status]')).toHaveText('В работе · Вперёд · 75 mm/s');
    await expect(panel.locator('[data-feed-status]')).toContainText('Автоподача: Включена');
    await expect(panel.locator('[data-sensor-preview]')).toContainText('Датчик сцены IN');
    await expect(panel.locator('[name="testSpeed"]')).toHaveValue('75');
    await panel.locator('[data-action="stop"]').click();
});

test('컨베이어는 그리기 프레임이 없을 때도 실제 물체 위치를 갱신하고 정지한다', async ({ page }) => {
    await setup(page);
    await page.locator('#equipment-form [name="type"]').selectOption('CONVEYOR');
    await page.locator('#equipment-form button[type="submit"]').click();
    await page.locator('#equipment-close').click();
    await page.locator('#btn-conveyor-tracking').click();
    const panel = page.locator('#conveyor-tracking-dialog');
    await panel.locator('[name="testSpeed"]').fill('');
    await panel.locator('[name="testSpeed"]').fill('100');
    // Slow/software rendering can delay RAF without blocking browser timers.
    // Suppress painting, then exercise the actual simulation and UI buttons.
    const before = await page.evaluate(() => {
        const api = window.__beltUi;
        window.requestAnimationFrame = () => 0;
        api.state.renderFramePending = false;
        return api.state.models[1].position.x;
    });
    await panel.locator('[data-action="run"]').click();
    await expect.poll(() => page.evaluate(() => window.__beltUi.state.models[1].position.x), { timeout: 1800 }).toBeGreaterThan(before + 20);
    await panel.locator('[data-action="stop"]').click();
    const stopped = await page.evaluate(() => window.__beltUi.state.models[1].position.x);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__beltUi.state.models[1].position.x)).toBeCloseTo(stopped, 6);
});
