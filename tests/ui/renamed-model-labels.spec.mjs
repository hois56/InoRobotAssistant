import { test, expect } from '@playwright/test';

test('모델 트리에서 바꾼 모델·부품 이름은 동작과 Tool·물체·컨베이어·부하 목록 및 복원에 반영된다', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + '\nwindow.__labels={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,getImportedModelParts,getArticulatedRobots,getGripObjectReferences,getIoFunctionMappingTargetReferences,getToolLoadPartSettings,installSceneModelAsTool,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot};' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__labels?.state.workspaceRecovery.ready);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__labels.getArticulatedRobots().length === 1);
    await page.locator('#input-import-3d').setInputFiles('2_3DSimulation/test-assets/Test_Equipment_CAD.step');
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(() => window.__labels.state.models.some(model => model.userData.importedParts?.length > 1));
    const refs = await page.evaluate(() => {
        const a = window.__labels, model = a.state.models.find(m => m.userData.uploaded), part = a.getImportedModelParts(model)[0];
        a.equipmentApp.save({ id: 'renamed-cylinder', type: 'CYLINDER', movingRef: 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/0' });
        return { id: model.userData.modelTreeId, part: part.userData.modelPartId, original: part.userData.modelPartName,
            rootRef: 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1', partRef: 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/0' };
    });
    // Use the actual rename menu, preserving the stable model/part IDs.
    await page.locator('#model-tree .model-tree-button').filter({ hasText: 'Test_Equipment_CAD' }).click({ button: 'right' });
    page.once('dialog', dialog => dialog.accept('새 Tool 이름')); await page.locator('#model-rename').click();
    const toggle = page.locator('[data-model-tree-toggle]').last();
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    const path = await page.evaluate(refs => window.__labels.equipmentApp.resolve(refs.partRef).object.userData.cadAssemblyPath || [], refs);
    for (const entry of path) {
        const toggle = page.locator(`[data-cad-assembly-id="${entry.id}"] > details > summary > .model-tree-toggle`).first();
        if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    }
    await page.locator('.model-tree-part-button').first().click({ button: 'right' });
    page.once('dialog', dialog => dialog.accept('상하 흡착판')); await page.locator('#model-rename').click();
    const labels = () => page.evaluate(refs => {
        const a = window.__labels, model = a.equipmentApp.resolve(refs.rootRef).model;
        return { equipment: a.equipmentApp.references().find(ref => ref.value === refs.partRef).label,
            action: a.equipmentApp.targets('CYLINDER')[0].label,
            grip: a.getGripObjectReferences().find(ref => ref.part === a.getImportedModelParts(model)[0]).label,
            conveyor: a.getIoFunctionMappingTargetReferences('CONVEYOR').find(ref => ref.value.endsWith('/0')).label,
            load: a.getToolLoadPartSettings(model)[0].name, original: a.getImportedModelParts(model)[0].userData.modelPartName };
    }, refs);
    const current = await labels();
    for (const key of ['equipment', 'action', 'grip', 'conveyor']) expect(current[key]).toContain('새 Tool 이름 / 상하 흡착판');
    expect(current.load).toBe('상하 흡착판'); expect(current.original).toBe(refs.original);
    await page.keyboard.press('Control+z'); expect((await labels()).equipment).not.toContain('상하 흡착판');
    await page.keyboard.press('Control+y'); expect((await labels()).equipment).toContain('상하 흡착판');
    await page.evaluate(async () => { const a = window.__labels; await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()))); });
    expect(await labels()).toEqual(current);
    await page.evaluate(refs => {
        const a = window.__labels, model = a.equipmentApp.resolve(refs.rootRef).model;
        a.installSceneModelAsTool(model, null, a.getArticulatedRobots()[0]);
        const object = a.createPrimitiveShapeRoot('box', { x: 10, y: 10, z: 10 }); a.state.scene.add(object); a.state.models.push(object);
        a.equipmentApp.ui.open(refs.partRef);
    }, refs);
    await page.locator('#equipment-form [name="type"]').selectOption('VACUUM');
    await expect(page.locator('#equipment-form [name="name"]')).toHaveValue(/새 Tool 이름 \/ 상하 흡착판/);
    expect(errors).toEqual([]);
});
