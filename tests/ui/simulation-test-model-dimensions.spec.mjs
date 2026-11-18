import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__modelSizes = { state, THREE, getImportedModelParts, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, equipmentApp, equipmentObjectRef, ensureWorkspaceModelId, saveConveyorMotion, runConveyorCommand, createPrimitiveShapeRoot };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__modelSizes);
    return errors;
}

test('3D 모델은 현재 치수를 기본으로 표시하고 지정한 치수로 생성·저장·복원한다', async ({ page }) => {
    test.setTimeout(300000);
    const errors = await setup(page);
    await page.locator('#btn-test-model').click();
    const defaults = { base: [1000,1000,500], conveyor: [500,200,200], 'square-object': [40,40,40],
        'square-tray': [200,200,200], 'stage-vac': [200,200,200], 'teaching-kit': [500,500,200],
        vision: [200,200,200], equipment: [1800,1400,430], 'scara-height-base': [207,170,200], 'flat-tray': [240,240,176] };
    const keys = ['length', 'width', 'height'];
    const field = (id, key) => page.locator(`[data-test-model-dimensions="${id}"] [data-test-model-dimension="${key}"]`);
    for (const [id, sizes] of Object.entries(defaults)) {
        for (const [axis, key] of keys.entries()) await expect(field(id, key)).toHaveValue(String(sizes[axis]));
    }
    await expect(page.locator('[data-test-category="tool"] [data-test-model-dimension]')).toHaveCount(0);
    const selected = { base: [1200,800,650], 'square-object': [80,60,30], 'square-tray': [260,240,180],
        'stage-vac': [300,250,150], 'teaching-kit': [600,450,250], 'scara-height-base': [240,200,300], 'flat-tray': [360,280,220] };
    for (const [id, sizes] of Object.entries(selected)) {
        await page.locator(`[data-test-quantity="${id}"]`).fill(id === 'square-object' ? '2' : '1');
        for (const [axis, key] of keys.entries()) await field(id, key).fill(String(sizes[axis]));
    }
    await expect(page.locator('#test-model-total')).toContainText('8');
    await field('square-object', 'width').fill('0');
    await expect(page.locator('#btn-confirm-test-model')).toBeDisabled();
    await field('square-object', 'width').fill('60');
    await expect(page.locator('#btn-confirm-test-model')).toBeEnabled();
    for (const width of [390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const id of Object.keys(defaults)) {
            const card = page.locator('.test-model-card').filter({ has: page.locator(`[data-test-quantity="${id}"]`) });
            const bounds = await card.boundingBox();
            for (const key of keys) {
                const input = await field(id, key).boundingBox();
                expect(input.x + input.width).toBeLessThanOrEqual(bounds.x + bounds.width);
                expect(input.width).toBeGreaterThan(30);
            }
        }
    }
    await page.locator('#test-model-dialog').screenshot({ path: test.info().outputPath('custom-model-dimensions.png') });
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 150000 });
    const inspect = () => page.evaluate(() => {
        const a = window.__modelSizes;
        return a.state.models.filter(m => m.userData.testModel).map(model => {
            const box = new a.THREE.Box3().setFromObject(model);
            return { id: model.userData.testModelAssetId, dimensions: model.userData.testModelDimensions,
                size: box.getSize(new a.THREE.Vector3()).toArray(), maxZ: box.max.z, scale: model.scale.toArray(),
                parts: a.getImportedModelParts(model).length };
        });
    });
    const before = await inspect();
    expect(before).toHaveLength(8);
    for (const model of before) {
        expect(model.id in selected).toBe(true);
        expect(model.dimensions).toEqual(Object.fromEntries(keys.map((key, i) => [key, selected[model.id][i]])));
        model.size.forEach((value, axis) => expect(value).toBeCloseTo(selected[model.id][axis], 3));
        expect(model.scale).toEqual([1,1,1]);
        expect(model.parts).toBeGreaterThan(0);
        if (model.id === 'base') expect(model.maxZ).toBe(0);
    }
    await page.evaluate(async () => { const a = window.__modelSizes; await a.restoreWorkspaceSnapshot(a.serializeWorkspaceSnapshot()); });
    expect(await inspect()).toEqual(before);
    expect(errors).toEqual([]);
});

test('일반 컨베이어는 트래킹 모델과 같은 띠를 표시하고 운전·정지 및 복원 후 유지한다', async ({ page }) => {
    test.setTimeout(120000);
    const errors = await setup(page);
    await page.locator('#btn-test-model').click();
    await page.locator('[data-test-quantity="conveyor"]').fill('1');
    await page.locator('[data-test-conveyor-dimension="length"]').fill('800');
    await page.locator('[data-test-conveyor-dimension="width"]').fill('300');
    await page.locator('[data-test-conveyor-dimension="height"]').fill('400');
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 60000 });
    const marked = () => page.evaluate(() => {
        let key = '';
        const model = window.__modelSizes.state.models.find(m => m.userData.testModelAssetId === 'conveyor');
        model?.traverse(mesh => { if (mesh.isMesh && /^Endless_belt_/.test(mesh.userData.cadPartName || mesh.name)) key = mesh.material.customProgramCacheKey(); });
        return key;
    });
    await expect.poll(marked).toContain('conveyor-capsule-v1');
    await page.evaluate(() => {
        const a = window.__modelSizes, model = a.state.models[0];
        const partIndex = a.getImportedModelParts(model).findIndex(p => p.name.startsWith('Endless_belt_'));
        const ref = a.equipmentObjectRef(a.ensureWorkspaceModelId(model), partIndex);
        a.saveConveyorMotion({ type:'CONVEYOR', movingRef:ref, movingRefs:[ref], axis:'X', speed:100, name:'Conveyor' },
            { direction:'OUT', forward:null, reverse:null, triggerValue:1 });
        const object = a.createPrimitiveShapeRoot('box', { x:40, y:40, z:40 });
        object.position.set(-250,0,390); a.state.scene.add(object); a.state.models.push(object);
        a.equipmentApp.save({ id:'size-belt-object', type:'OBJECT', movingRef:a.equipmentObjectRef(a.ensureWorkspaceModelId(object)) });
        window.__sizeBeltRef = ref; a.runConveyorCommand(ref, 'FORWARD');
    });
    await expect.poll(() => page.evaluate(() => window.__modelSizes.state.models[1].position.x)).toBeGreaterThan(-240);
    await page.evaluate(() => window.__modelSizes.runConveyorCommand(window.__sizeBeltRef, 'STOP'));
    const stopped = await page.evaluate(() => window.__modelSizes.state.models[1].position.x);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__modelSizes.state.models[1].position.x)).toBeCloseTo(stopped, 5);
    await page.evaluate(async () => { const a = window.__modelSizes; await a.restoreWorkspaceSnapshot(a.serializeWorkspaceSnapshot()); });
    await expect.poll(marked).toContain('conveyor-capsule-v1');
    expect(errors).toEqual([]);
});
