import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);$/m, 'window.__clipboardReady = init();');
        await route.fulfill({ response, body: source + '\nwindow.__modelClipboard = { state, THREE, createPrimitiveShapeRoot, updateUIStatus, selectSceneModel, syncModelOutlines, setCollisionMaterialHighlight, installSceneModelAsTool, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__modelClipboard);
    await page.evaluate(() => window.__clipboardReady);
    return errors;
}

async function addModel(page, imported = false) {
    await page.evaluate(imported => {
        const a = window.__modelClipboard;
        const model = a.createPrimitiveShapeRoot('box', { x: 40, y: 40, z: 40 });
        if (imported) {
            model.userData.primitiveShape = false;
            model.userData.uploaded = true;
            model.name = model.userData.modelName = 'Fixture.step';
            const part = model.children[0];
            part.userData.modelPartName = 'Original part';
            part.userData.modelTreeName = '부품 이름';
            model.userData.importedParts = [part];
        }
        a.state.scene.add(model);
        a.state.models.push(model);
        a.updateUIStatus();
    }, imported);
}

const modelButtons = page => page.locator('#model-tree .model-tree-button');
const modelNames = page => modelButtons(page).locator(':scope > .model-tree-name');

async function rename(page, button, name) {
    await button.click({ button: 'right' });
    page.once('dialog', dialog => dialog.accept(name));
    await page.locator('#model-rename').click();
}

async function copy(page, button) {
    await button.click({ button: 'right' });
    await page.locator('#model-copy').click();
}

async function paste(page, added = 1) {
    const count = await modelButtons(page).count();
    await modelButtons(page).first().click({ button: 'right' });
    await page.locator('#model-paste').click();
    await expect(modelButtons(page)).toHaveCount(count + added);
    await page.waitForFunction(() => !window.__modelClipboard.state.modelClipboardPastePending);
}

for (const imported of [false, true]) {
    test(`이름을 바꾼 ${imported ? '가져온 모델' : '기본 도형'}을 반복 복사해도 이름에 순번을 붙이고 실행 취소로 복원한다`, async ({ page }) => {
        const errors = await setup(page);
        await addModel(page, imported);
        await rename(page, modelButtons(page).first(), '흡착 모델');
        await copy(page, modelButtons(page).first());
        await paste(page);
        await expect(modelNames(page)).toHaveText(['흡착 모델', '흡착 모델 #2']);
        await paste(page);
        await expect(modelNames(page)).toHaveText(['흡착 모델', '흡착 모델 #2', '흡착 모델 #3']);
        await copy(page, modelButtons(page).nth(1));
        await paste(page);
        await expect(modelNames(page)).toHaveText(['흡착 모델', '흡착 모델 #2', '흡착 모델 #3', '흡착 모델 #4']);
        await page.locator('#btn-undo').click();
        await expect(modelNames(page)).toHaveText(['흡착 모델', '흡착 모델 #2', '흡착 모델 #3']);
        await page.locator('#btn-redo').click();
        await expect(modelNames(page)).toHaveText(['흡착 모델', '흡착 모델 #2', '흡착 모델 #3', '흡착 모델 #4']);
        if (imported) {
            expect(await page.evaluate(() => window.__modelClipboard.state.models.map(model => ({
                name: model.userData.modelName, part: model.userData.importedParts[0].userData.modelTreeName
            })))).toEqual(Array(4).fill({ name: 'Fixture.step', part: '부품 이름' }));
        } else {
            await page.evaluate(async () => {
                const a = window.__modelClipboard;
                await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
            });
            await expect(modelNames(page)).toHaveText(['흡착 모델', '흡착 모델 #2', '흡착 모델 #3', '흡착 모델 #4']);
        }
        expect(errors).toEqual([]);
    });
}

test('복사본 이름은 다른 모델에 이미 사용한 순번을 건너뛴다', async ({ page }) => {
    const errors = await setup(page);
    await addModel(page);
    await addModel(page);
    await rename(page, modelButtons(page).first(), '작업대');
    await rename(page, modelButtons(page).nth(1), '작업대 #2');
    await copy(page, modelButtons(page).first());
    await paste(page);
    await expect(modelNames(page)).toHaveText(['작업대', '작업대 #2', '작업대 #3']);
    expect(errors).toEqual([]);
});

test('이름을 바꾸지 않은 모델은 기존 도형 이름과 가져온 모델의 복사 순번을 유지한다', async ({ page }) => {
    const errors = await setup(page);
    await addModel(page);
    await copy(page, modelButtons(page).first());
    await paste(page);
    await expect(modelNames(page)).toHaveText(['사각형 1', '사각형 2']);
    await addModel(page, true);
    await copy(page, modelButtons(page).last());
    await paste(page);
    await expect(modelNames(page)).toHaveText(['사각형 1', '사각형 2', 'Fixture #1', 'Fixture #2']);
    expect(errors).toEqual([]);
});

test('이름을 바꾼 로봇과 장착 Tool을 함께 복사하면 각각 이름 순번을 붙인다', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await setup(page);
    await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');
    await page.waitForFunction(() => window.__modelClipboard.state.models.some(model => model.userData.tcpFrame));
    await rename(page, modelButtons(page).first(), '이송 로봇');
    await addModel(page, true);
    await rename(page, modelButtons(page).last(), '흡착 Tool');
    await page.evaluate(() => {
        const a = window.__modelClipboard;
        a.installSceneModelAsTool(a.state.models[1], null, a.state.models[0]);
    });
    await copy(page, modelButtons(page).first());
    await paste(page, 2);
    expect(await page.evaluate(() => window.__modelClipboard.state.models.map(model => model.userData.modelTreeName)))
        .toEqual(['이송 로봇', '흡착 Tool', '이송 로봇 #2', '흡착 Tool #2']);
    expect(await page.evaluate(() => {
        const models = window.__modelClipboard.state.models;
        return models[3].userData.attachmentHost === models[2];
    })).toBe(true);
    expect(errors).toEqual([]);
});

for (const collision of [false, true]) {
    test(`선택 강조${collision ? '와 충돌 강조' : ''} 중 복사해도 여러 재질의 원래 색과 발광을 유지한다`, async ({ page }) => {
        const errors = await setup(page);
        await addModel(page, true);
        const original = await page.evaluate(() => {
            const a = window.__modelClipboard, mesh = a.state.models[0].children[0];
            mesh.material = [
                new a.THREE.MeshStandardMaterial({ color: '#2674ac', emissive: '#123456', emissiveIntensity: 0.17, roughness: 0.32, metalness: 0.21 }),
                new a.THREE.MeshStandardMaterial({ color: '#000000', emissive: '#654321', emissiveIntensity: 0.23, roughness: 0.63, metalness: 0.04 })
            ];
            mesh.geometry.clearGroups();
            mesh.geometry.addGroup(0, 18, 0);
            mesh.geometry.addGroup(18, 18, 1);
            delete mesh.userData.modelPartMaterials;
            a.state.outlineMode = false;
            a.syncModelOutlines();
            return mesh.material.map(material => ({ color: material.color.getHexString(), emissive: material.emissive.getHexString(),
                intensity: material.emissiveIntensity, roughness: material.roughness, metalness: material.metalness }));
        });
        await modelButtons(page).first().click();
        expect(await page.evaluate(() => window.__modelClipboard.state.models[0].children[0].material.map(material => material.emissive.getHexString())))
            .toEqual(['facc15', 'facc15']);
        if (collision) await page.evaluate(() => {
            const a = window.__modelClipboard;
            a.state.models[0].children[0].material.forEach(material => a.setCollisionMaterialHighlight(material, true));
        });
        await copy(page, modelButtons(page).first());
        await paste(page);
        await paste(page);
        await page.evaluate(() => window.__modelClipboard.selectSceneModel(null));
        const pasted = await page.evaluate(() => {
            const a = window.__modelClipboard;
            return a.state.models.slice(1).map(model => model.children.find(child => child.isMesh).material.map(material => ({
                color: material.color.getHexString(), emissive: material.emissive.getHexString(), intensity: material.emissiveIntensity,
                roughness: material.roughness, metalness: material.metalness
            })));
        });
        expect(pasted).toEqual([original, original]);
        expect(await page.evaluate(() => {
            const a = window.__modelClipboard, materials = a.state.models.map(model => model.children.find(child => child.isMesh).material);
            return materials[0][0] !== materials[1][0] && materials[1][0] !== materials[2][0];
        })).toBe(true);
        expect(errors).toEqual([]);
    });
}
