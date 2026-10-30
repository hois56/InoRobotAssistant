import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const step = readFileSync(new URL('../../2_3DSimulation/test-assets/Tool/Dual_VAC_Tool_lowered.step', import.meta.url));

for (const robotModel of ['IR-R10H-120', 'IR-S7-60Z20']) for (const placement of ['tcp', 'scene']) test(`${robotModel} STEP Tool은 수정한 TCP와 무관하게 플랜지 영점에 장착되고 부품 동작을 저장·복원한다 (${placement})`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__toolParts = { state, THREE, equipmentApp, getImportedModelParts, ensureWorkspaceModelId, installSceneModelAsTool, getRobotToolMountFrame, syncActiveTcpFrame, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__toolParts?.state.workspaceRecovery.ready);
    await page.locator('#model-select').selectOption(`robot:${robotModel}`);
    await page.waitForFunction(() => window.__toolParts?.state.models.some(model => model.userData.tcpFrame));
    await page.evaluate(() => {
        const a = window.__toolParts, robot = a.state.models.find(model => model.userData.tcpFrame);
        robot.userData.tcpProfiles[0].position.set(135, -75, 260);
        robot.userData.tcpProfiles[0].quaternion.setFromEuler(new a.THREE.Euler(0.3, -0.2, 0.4, 'ZYX'));
        a.syncActiveTcpFrame(robot);
    });
    await page.locator('#input-import-3d').setInputFiles({
        name: placement === 'tcp' ? 'CylinderTool.step' : 'CylinderTool.stp',
        mimeType: 'application/octet-stream', buffer: step
    });
    await page.locator('#import-placement').selectOption(placement);
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(() => window.__toolParts.state.models.some(model => model.userData.uploaded));
    if (placement === 'scene') {
        expect(await page.evaluate(() => {
            const a = window.__toolParts;
            return a.installSceneModelAsTool(a.state.models.find(model => model.userData.uploaded), null, a.state.models.find(model => model.userData.tcpFrame));
        })).toBe(true);
    }
    const mount = await page.evaluate(() => {
        const a = window.__toolParts, tool = a.state.models.find(model => model.userData.uploaded);
        const robot = tool.userData.attachmentHost, flange = a.getRobotToolMountFrame(robot);
        const before = tool.getWorldPosition(new a.THREE.Vector3());
        const tcpProfile = robot.userData.tcpProfiles[0].position.toArray();
        robot.userData.tcpProfiles[1].position.set(-200, 90, 400);
        robot.userData.tcpProfiles[1].quaternion.setFromEuler(new a.THREE.Euler(-0.4, 0.1, -0.5, 'ZYX'));
        robot.userData.activeTcpProfileIndex = 1;
        a.syncActiveTcpFrame(robot);
        const shiftAfterTcpChange = tool.getWorldPosition(new a.THREE.Vector3()).distanceTo(before);
        robot.userData.activeTcpProfileIndex = 0;
        a.syncActiveTcpFrame(robot);
        return { parentIsFlange: tool.parent === flange, position: tool.position.toArray(),
            rotation: tool.quaternion.angleTo(new a.THREE.Quaternion()), tcpProfile, shiftAfterTcpChange,
            distanceFromFlange: before.distanceTo(flange.getWorldPosition(new a.THREE.Vector3())) };
    });
    expect(mount.parentIsFlange).toBe(true);
    mount.position.forEach(value => expect(value).toBeCloseTo(0, 7));
    expect(mount.rotation).toBeLessThan(1e-7);
    expect(mount.distanceFromFlange).toBeLessThan(1e-7);
    expect(mount.tcpProfile).toEqual([135, -75, 260]);
    expect(mount.shiftAfterTcpChange).toBeLessThan(1e-7);
    const ids = await page.evaluate(() => {
        const a = window.__toolParts, model = a.state.models.find(model => model.userData.uploaded);
        return { model: model.userData.modelTreeId, robot: model.userData.attachmentHost.userData.modelTreeId,
            parts: a.getImportedModelParts(model).map(part => part.userData.modelPartId) };
    });
    expect(ids.parts).toHaveLength(23);
    for (const id of [ids.robot, ids.model]) {
        await expect(page.locator(`[data-model-tree-toggle="${id}"]`)).toHaveAttribute('aria-expanded', 'true');
    }
    const closedAssemblies = page.locator('#model-tree .model-tree-cad-assembly > details:not([open]) > summary > .model-tree-toggle:visible');
    while (await closedAssemblies.count()) await closedAssemblies.first().click();
    const rod = page.locator(`button[data-model-part-id="${ids.parts[10]}"]`);
    await expect(rod).toBeVisible();
    await rod.click({ button: 'right' });
    await page.locator('#model-motion-settings').click();
    await expect(page.locator('#equipment-dialog')).toBeVisible();
    const selectedRef = await page.evaluate(() => {
        const a = window.__toolParts, model = a.state.models.find(model => model.userData.uploaded);
        return `equipment-model:${a.ensureWorkspaceModelId(model)}/10`;
    });
    await expect(page.locator('[data-equipment-role="movingRef"] input:checked')).toHaveValue(selectedRef);
    await page.locator('#equipment-form button[type="submit"]').click();
    await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
    await page.screenshot({ path: test.info().outputPath('step-tool-parts-motion-settings.png') });
    const result = await page.evaluate(async () => {
        const a = window.__toolParts;
        const model = a.state.models.find(model => model.userData.uploaded);
        const parts = a.getImportedModelParts(model);
        const local = () => parts.map(part => part.position.toArray());
        const world = () => parts[10].getWorldPosition(new a.THREE.Vector3());
        const before = local(), worldBefore = world();
        const def = a.state.equipmentDefinitions.find(def => def.type === 'CYLINDER');
        def.runtime.position = 100; a.equipmentApp.runtime.apply(def, 0);
        const moved = local(), distance = world().distanceTo(worldBefore);
        const snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        await a.restoreWorkspaceSnapshot(snapshot);
        const restored = a.state.models.find(model => model.userData.uploaded);
        const restoredParts = a.getImportedModelParts(restored);
        const afterRestore = restoredParts.map(part => part.position.toArray());
        const restoredDef = a.state.equipmentDefinitions.find(def => def.type === 'CYLINDER');
        a.equipmentApp.runtime.reset([restoredDef]);
        return { before, moved, afterRestore, distance, reset: restoredParts.map(part => part.position.toArray()),
            rootPosition: restored.position.toArray(),
            attached: restored.parent === a.getRobotToolMountFrame(restored.userData.attachmentHost), ref: restoredDef.movingRef };
    });
    result.moved.forEach((position, index) => {
        if (index === 10) expect(position).not.toEqual(result.before[index]);
        else expect(position).toEqual(result.before[index]);
    });
    expect(result.distance).toBeCloseTo(100, 6);
    result.afterRestore.flat().forEach((value, index) => expect(value).toBeCloseTo(result.moved.flat()[index], 6));
    result.reset.flat().forEach((value, index) => expect(value).toBeCloseTo(result.before.flat()[index], 6));
    expect(result.attached).toBe(true);
    result.rootPosition.forEach(value => expect(value).toBeCloseTo(0, 7));
    expect(result.ref).toBe(selectedRef);
    expect(errors).toEqual([]);
});

test('한 좌표 노드로 묶인 STEP Tool의 세부 부품과 기존 프로젝트 위치·색상·참조를 복원한다', async ({ page }) => {
    const makeMesh = (name, x, color) => ({ name, color,
        attributes: { position: { array: [x, 0, 0, x + 10, 0, 0, x, 10, 10] } },
        index: { array: [0, 1, 2] }, brep_faces: [{ first: 0, last: 0 }] });
    const fixture = { success: true,
        root: { children: [{ name: 'Coordinate frame', meshes: [0, 1] }] },
        meshes: [makeMesh('Cylinder body', 0, [1, 0, 0]), makeMesh('Cylinder rod', 60, [0, 0, 1])] };
    await page.route('**/2_3DSimulation/step-import-worker.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nocctPromise = Promise.resolve({ ReadStepFile: () => (${JSON.stringify(fixture)}) });` });
    });
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__compoundTool = { state, THREE, equipmentApp, getImportedModelParts, ensureWorkspaceModelId, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, getWorkspaceMaterialColor, renderModelTree };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__compoundTool?.state.models.some(model => model.userData.tcpFrame));
    await page.locator('#input-import-3d').setInputFiles({ name: 'CompoundTool.step', mimeType: 'application/octet-stream', buffer: Buffer.from('mock STEP assembly') });
    await page.locator('#import-placement').selectOption('tcp');
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(() => window.__compoundTool.state.models.some(model => model.userData.uploaded));
    const result = await page.evaluate(async () => {
        const a = window.__compoundTool, tool = a.state.models.find(model => model.userData.uploaded);
        const id = a.ensureWorkspaceModelId(tool), parts = a.getImportedModelParts(tool);
        const world = model => a.getImportedModelParts(model).slice(1).map(part => part.getWorldPosition(new a.THREE.Vector3()).toArray());
        const before = world(tool), originalAggregate = parts[0].position.toArray();
        a.equipmentApp.save({ id: 'legacy-whole-tool', type: 'CYLINDER', movingRef: `equipment-model:${id}/0`, travel: 100, axis: 'X' });
        const snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        const entry = snapshot.importedModels.find(entry => entry.workspaceModelId === id);
        entry.partState = entry.partState.slice(0, 1);
        entry.materialColors = [{ path: [0, 0, 0], colors: ['123456'] }, { path: [0, 0, 1], colors: ['abcdef'] }];
        await a.restoreWorkspaceSnapshot(snapshot);
        const restored = a.state.models.find(model => a.ensureWorkspaceModelId(model) === id);
        const restoredParts = a.getImportedModelParts(restored);
        const colors = () => restoredParts.slice(1).map(part => {
            let color; part.traverse(mesh => { if (mesh.isMesh && !mesh.userData.outlineSource) color = a.getWorkspaceMaterialColor(mesh.material, mesh); }); return color;
        });
        const restoredColors = colors(), after = world(restored);
        const def = a.state.equipmentDefinitions.find(def => def.id === 'legacy-whole-tool');
        def.runtime.position = 100; a.equipmentApp.runtime.apply(def, 0);
        const moved = world(restored);
        a.equipmentApp.runtime.reset([def]);
        const secondSnapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        await a.restoreWorkspaceSnapshot(secondSnapshot);
        const savedAgain = a.state.models.find(model => a.ensureWorkspaceModelId(model) === id);
        savedAgain.userData.modelPartGroups = [{ name: 'Cylinder', parts: [0, 1], collapsed: false }];
        a.renderModelTree();
        return { before, after, moved, ref: def.movingRef, restoredRef: a.state.equipmentDefinitions.find(candidate => candidate.id === 'legacy-whole-tool').movingRef,
            names: a.getImportedModelParts(savedAgain).slice(1).map(part => part.userData.modelPartName), originalAggregate, aggregate: a.getImportedModelParts(savedAgain)[0].position.toArray(),
            restoredColors, savedColors: a.serializeWorkspaceSnapshot().importedModels.find(entry => entry.workspaceModelId === id).materialColors.map(record => record.colors[0]) };
    });
    expect(result.names).toEqual(['Cylinder body', 'Cylinder rod']);
    expect(result.aggregate).toEqual(result.originalAggregate);
    result.after.flat().forEach((value, index) => expect(value).toBeCloseTo(result.before.flat()[index], 6));
    result.moved.forEach((position, index) => expect(Math.hypot(...position.map((value, axis) => value - result.before[index][axis]))).toBeCloseTo(100, 6));
    expect(result.ref).toBe(result.restoredRef);
    expect(result.restoredColors).toEqual(['123456', 'abcdef']);
    expect(result.savedColors).toEqual(['123456', 'abcdef']);
    expect(await page.locator('.model-tree-part-button').count()).toBe(2);
});
