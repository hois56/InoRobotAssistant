import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${(await response.text()).replace('init();\n', 'window.__simulationReady = init();\n')}\nwindow.__pivotTest = { state, THREE, createPrimitiveShapeRoot, updateUIStatus, selectSceneModel, selectSceneModelPart, updateSelectedViewPivot, requestRender };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__pivotTest);
    await page.evaluate(() => window.__simulationReady);
    await page.evaluate(() => {
        const a = window.__pivotTest;
        const model = a.createPrimitiveShapeRoot('box', { x: 80, y: 80, z: 80 });
        const other = a.createPrimitiveShapeRoot('box', { x: 40, y: 40, z: 40 });
        model.add(other.children[0]);
        model.children[1].position.x = 200;
        model.userData.primitiveShape = false;
        model.userData.importedParts = [...model.children];
        model.userData.importedParts.forEach((part, index) => {
            part.userData.modelPartId = `pivot-part-${index}`;
            part.userData.modelPartName = `부품 ${index + 1}`;
        });
        model.position.set(500, 200, 100);
        a.state.scene.add(model); a.state.models.push(model); a.updateUIStatus();
        a.state.camera.position.set(0, -800, 450);
        a.state.controls.target.set(0, 0, 0); a.state.controls.update();
        a.requestRender();
    });
    return errors;
}

test('선택 중심 토글은 초기화 오른쪽에 있고 모델·부품·이동을 따르며 OFF는 현재 뷰를 유지한다', async ({ page }) => {
    const errors = await setup(page);
    const toggle = page.locator('#btn-selected-view-pivot');
    await expect(page.locator('#btn-reset-view + #btn-selected-view-pivot')).toHaveCount(1);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveText('');
    await expect(toggle.locator('i')).toHaveClass(/fa-crosshairs/);
    const initial = await page.evaluate(() => {
        const a = window.__pivotTest;
        const offset = a.state.camera.position.clone().sub(a.state.controls.target).toArray();
        a.selectSceneModel(a.state.models[0]); a.updateSelectedViewPivot();
        return { offset, target: a.state.controls.target.toArray() };
    });
    expect(initial.target).toEqual([0, 0, 0]);
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveClass(/active/); await expect(toggle).toHaveText('');
    const focused = await page.evaluate(() => {
        const a = window.__pivotTest; a.updateSelectedViewPivot();
        const center = new a.THREE.Box3().setFromObject(a.state.models[0]).getCenter(new a.THREE.Vector3());
        return { error: a.state.controls.target.distanceTo(center), offset: a.state.camera.position.clone().sub(center).toArray() };
    });
    expect(focused.error).toBeLessThan(1e-6);
    focused.offset.forEach((value, index) => expect(value).toBeCloseTo(initial.offset[index], 5));
    await page.locator('button[data-model-part-id="pivot-part-1"]').click();
    await page.waitForFunction(() => Math.abs(window.__pivotTest.state.controls.target.x - 700) < 1e-6);
    const moved = await page.evaluate(() => {
        const a = window.__pivotTest, before = a.state.camera.position.clone();
        a.state.models[0].position.x += 50; a.updateSelectedViewPivot();
        return { target: a.state.controls.target.toArray(), delta: a.state.camera.position.clone().sub(before).toArray() };
    });
    expect(moved.target).toEqual([750, 200, 120]); expect(moved.delta).toEqual([50, 0, 0]);
    const beforeOff = await page.evaluate(() => ({ camera: window.__pivotTest.state.camera.position.toArray(), target: window.__pivotTest.state.controls.target.toArray() }));
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).not.toHaveClass(/active/); await expect(toggle).toHaveText('');
    const afterOff = await page.evaluate(() => {
        const a = window.__pivotTest;
        a.selectSceneModel(a.state.models[0]); a.state.models[0].position.x += 100; a.updateSelectedViewPivot();
        return { camera: a.state.camera.position.toArray(), target: a.state.controls.target.toArray() };
    });
    expect(afterOff).toEqual(beforeOff);
    // No selection and sketch mode must not move either camera or pivot.
    await page.evaluate(() => window.__pivotTest.selectSceneModel(null)); await toggle.click();
    expect(await page.evaluate(() => {
        const a = window.__pivotTest, before = a.state.camera.position.clone();
        a.state.sketch.active = true; a.selectSceneModel(a.state.models[0]); a.updateSelectedViewPivot(true);
        const delta = a.state.camera.position.distanceTo(before); a.state.sketch.active = false;
        return delta;
    })).toBe(0);
    expect(errors).toEqual([]);
});

test('ON의 실제 회전은 선택 중심을 사용하고 우클릭 팬과 기존 마우스 설정을 유지한다', async ({ page }) => {
    const errors = await setup(page);
    await page.evaluate(() => window.__pivotTest.selectSceneModel(window.__pivotTest.state.models[0]));
    await page.locator('#btn-selected-view-pivot').click();
    const before = await page.evaluate(() => {
        const { state } = window.__pivotTest;
        return { camera: state.camera.position.toArray(), target: state.controls.target.toArray(), distance: state.camera.position.distanceTo(state.controls.target) };
    });
    const canvas = await page.evaluate(() => {
        const rect = window.__pivotTest.state.renderer.domElement.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const start = { x: canvas.x + canvas.width * .52, y: canvas.y + canvas.height * .74 };
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + 70, start.y + 30, { steps: 8 }); await page.mouse.up();
    const rotated = await page.evaluate(() => {
        const { state } = window.__pivotTest;
        return { camera: state.camera.position.toArray(), target: state.controls.target.toArray(), distance: state.camera.position.distanceTo(state.controls.target) };
    });
    expect(rotated.target).toEqual(before.target); expect(rotated.camera).not.toEqual(before.camera);
    expect(rotated.distance).toBeCloseTo(before.distance, 5);
    await page.mouse.move(start.x, start.y); await page.mouse.down({ button: 'right' });
    await page.mouse.move(start.x + 60, start.y + 25, { steps: 8 }); await page.mouse.up({ button: 'right' });
    const panned = await page.evaluate(() => {
        const { state, THREE } = window.__pivotTest;
        return { target: state.controls.target.toArray(), distance: state.camera.position.distanceTo(state.controls.target),
            contract: state.controls.mouseButtons.RIGHT === THREE.MOUSE.PAN && state.controls.screenSpacePanning && !state.controls.enableDamping && state.controls.rotateSpeed === 1 && state.controls.panSpeed === 1 && state.controls.zoomSpeed === 1 };
    });
    expect(panned.target).not.toEqual(rotated.target); expect(panned.distance).toBeCloseTo(before.distance, 5);
    expect(panned.contract).toBe(true);
    await page.locator('#btn-reset-view').click();
    expect(await page.evaluate(() => {
        const a = window.__pivotTest, center = new a.THREE.Box3().setFromObject(a.state.selectedModel).getCenter(new a.THREE.Vector3());
        return a.state.controls.target.distanceTo(center);
    })).toBeLessThan(1e-6);
    expect(errors).toEqual([]);
});
