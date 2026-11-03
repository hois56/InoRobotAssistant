import { test, expect } from '@playwright/test';

async function fillNumber(page, selector, value) {
    const input = page.locator(selector);
    await input.click(); await input.press('Control+a');
    await input.pressSequentially(String(value)); await input.press('Enter');
}

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);\s*$/m, 'window.__singleOriginReady = init();');
        await route.fulfill({response, body:source + '\nwindow.__singleOrigin = {state, THREE, equipmentApp, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, captureObjectClipboardSnapshot, pasteObjectClipboardSnapshot, consolidateWorkspaceSinglePartTransform};'});
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__singleOriginReady);
    await page.evaluate(() => window.__singleOriginReady);
    return errors;
}

test('이전 프로젝트의 단일 부품 복사본은 배치와 원위치를 보존하고 같은 Z 입력으로 높이를 맞춘다', async ({page}) => {
    const errors = await setup(page);
    await page.locator('#input-import-3d').setInputFiles('2_3DSimulation/test-assets/3D_model/Square_object_40x40x40.step');
    await page.locator('#import-placement').selectOption('scene');
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(() => window.__singleOrigin.state.models.length === 1);
    const expected = await page.evaluate(async () => {
        const a = window.__singleOrigin, model = a.state.models[0];
        if (model.userData.importedParts.length !== 1) throw new Error('단일 부품 가져오기 기준이 필요합니다.');
        const snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        const entry = snapshot.importedModels[0], baseline = entry.partState[0].matrix;
        const originalPart = new a.THREE.Matrix4().fromArray(baseline);
        model.updateWorldMatrix(true, true);
        const baselineWorld = new a.THREE.Box3().setFromObject(model).getCenter(new a.THREE.Vector3()).z;
        snapshot.importedModels = [[195, 2.19121366739273], [24, 171.69121366739273]].map(([z, extra], index) => {
            const copy = JSON.parse(JSON.stringify(entry));
            copy.workspaceModelId = `single-origin-${index}`;
            copy.transform.position = [300, index * 160, z];
            copy.transform.quaternion = new a.THREE.Quaternion().setFromAxisAngle(new a.THREE.Vector3(0,0,1), Math.PI / 2).toArray();
            copy.partState[0].matrix = originalPart.clone().premultiply(new a.THREE.Matrix4().makeTranslation(0,0,extra)).toArray();
            return copy;
        });
        snapshot.equipmentDefinitions = snapshot.importedModels.map((copy, index) => {
            const ref = `equipment-model:${copy.workspaceModelId}/-1`;
            return {id:`single-object-${index}`, type:'OBJECT', movingRef:ref,
                origins:{objectWorld:{[ref]:new a.THREE.Matrix4().compose(new a.THREE.Vector3(...copy.transform.position), new a.THREE.Quaternion(...copy.transform.quaternion), new a.THREE.Vector3(1,1,1)).toArray()}}};
        });
        snapshot.modelPartGroups = []; snapshot.modelGroups = []; snapshot.modelTreeInstances = [];
        snapshot.selection = {};
        const heights = [baselineWorld + 197.19121366739273, baselineWorld + 195.69121366739273];
        await a.restoreWorkspaceSnapshot(snapshot);
        return {heights, baseline};
    });
    const heights = () => page.evaluate(() => {
        const {state, THREE} = window.__singleOrigin;
        state.scene.updateMatrixWorld(true);
        return state.models.map(model => new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()).z);
    });
    (await heights()).forEach((z, index) => expect(z).toBeCloseTo(expected.heights[index], 6));
    for (const id of ['single-origin-0', 'single-origin-1']) {
        await page.locator('.model-tree-button').evaluateAll((buttons, id) => buttons.find(button => button.modelTreeSelection.entries[0][1].userData.workspaceModelId === id).click(), id);
        await fillNumber(page, '#model-position-z', 195);
    }
    const aligned = await heights();
    expect(aligned[0]).toBeCloseTo(aligned[1], 6);
    await page.locator('#btn-undo').click();
    expect((await heights())[1]).toBeCloseTo(expected.heights[1], 6);
    await page.locator('#btn-redo').click();
    (await heights()).forEach(z => expect(z).toBeCloseTo(aligned[0], 6));
    const copied = await page.evaluate(() => {
        const a = window.__singleOrigin, snapshot = a.captureObjectClipboardSnapshot(a.state.models[0]);
        a.pasteObjectClipboardSnapshot(snapshot, 1);
        return a.state.models.map(model => new a.THREE.Box3().setFromObject(model).getCenter(new a.THREE.Vector3()).z);
    });
    copied.forEach(z => expect(z).toBeCloseTo(aligned[0], 6));
    await page.evaluate(async () => {
        const a = window.__singleOrigin;
        await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
    });
    (await heights()).forEach(z => expect(z).toBeCloseTo(aligned[0], 6));
    await page.evaluate(() => window.__singleOrigin.equipmentApp.resetObjects('all'));
    (await heights()).slice(0, 2).forEach((z, index) => expect(z).toBeCloseTo(expected.heights[index], 6));
    expect(errors).toEqual([]);
});

test('단일 부품 좌표 정리는 수동 영점과 고정 행렬을 보존하고 독립 부품 동작과 부착 모델을 유지한다', async ({page}) => {
    const errors = await setup(page);
    const results = await page.evaluate(() => {
        const {state, THREE, consolidateWorkspaceSinglePartTransform} = window.__singleOrigin;
        return ['custom-origin', 'tcp', 'part-motion', 'object-part', 'multi-part', 'shear'].map(kind => {
            const model = new THREE.Group(), content = new THREE.Group();
            model.position.set(10, 20, 30); model.rotation.set(0.1, 0.2, 0.3);
            model.userData = {uploaded:true, placement:kind === 'tcp' ? 'tcp' : 'scene', workspaceModelId:`origin-${kind}`};
            content.position.set(-40, 0, 3); content.rotation.z = Math.PI / 4;
            if (kind === 'shear') content.scale.set(2, 1, 1);
            content.updateMatrix(); content.matrixAutoUpdate = false;
            const part = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30), new THREE.MeshBasicMaterial());
            part.position.set(3, 4, 5); part.updateMatrix();
            const baseline = part.matrix.clone();
            part.position.z += 100;
            if (kind === 'shear') part.rotation.z = Math.PI / 3;
            part.updateMatrix(); part.matrixAutoUpdate = false;
            content.add(part); model.add(content); model.userData.importedParts = [part];
            if (kind === 'multi-part') {
                const other = part.clone(); content.add(other); model.userData.importedParts.push(other);
            }
            state.scene.add(model); state.models.push(model);
            const ref = `equipment-model:origin-${kind}/0`;
            state.equipmentDefinitions = kind === 'part-motion' || kind === 'object-part'
                ? [{type:kind === 'part-motion' ? 'CYLINDER' : 'OBJECT', movingRef:ref}]
                : [];
            model.updateWorldMatrix(true, true);
            const before = {root:model.matrix.toArray(), part:part.matrix.toArray(), world:part.matrixWorld.toArray(), content:content.matrix.toArray()};
            consolidateWorkspaceSinglePartTransform(model, baseline);
            return {kind, before, after:{root:model.matrix.toArray(), part:part.matrix.toArray(), world:part.matrixWorld.toArray(), content:content.matrix.toArray()}, baseline:baseline.toArray(), fixed:part.matrixAutoUpdate === false};
        });
    });
    for (const result of results) {
        result.after.world.forEach((v, index) => expect(v).toBeCloseTo(result.before.world[index], 6));
        expect(result.after.content).toEqual(result.before.content);
        expect(result.fixed).toBe(true);
        if (result.kind === 'custom-origin') expect(result.after.part).toEqual(result.baseline);
        else {
            expect(result.after.root).toEqual(result.before.root);
            expect(result.after.part).toEqual(result.before.part);
        }
    }
    expect(errors).toEqual([]);
});
