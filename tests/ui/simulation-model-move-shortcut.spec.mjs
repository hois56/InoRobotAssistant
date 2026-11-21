import { test, expect } from '@playwright/test';

test('Space shows a temporary move handle for a selected non-robot model', async ({ page }) => {
    test.setTimeout(60_000);
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);$/m, 'window.simulationReady = init();');
        await route.fulfill({ response, body: source + '\nwindow.modelMove = { state, THREE, createPrimitiveShapeRoot, updateUIStatus };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.simulationReady);
    await page.evaluate(() => {
        const { state, createPrimitiveShapeRoot, updateUIStatus } = window.modelMove;
        const model = createPrimitiveShapeRoot('box', { x: 40, y: 40, z: 40 });
        state.scene.add(model);
        state.models.push(model);
        updateUIStatus();
    });

    const controls = () => page.evaluate(() => {
        const { selectedModel, transformControls, placement } = window.modelMove.state;
        return {
            shown: transformControls.visible && transformControls.enabled,
            attached: Boolean(selectedModel && transformControls.object === selectedModel),
            mode: transformControls.mode,
            placement: placement.active
        };
    });
    await page.keyboard.press('Space');
    expect(await controls()).toMatchObject({ shown: false });

    await page.locator('#model-tree .model-tree-button').first().click();
    expect(await controls()).toMatchObject({ shown: false });
    await page.keyboard.down('Space');
    expect(await controls()).toEqual({ shown: true, attached: true, mode: 'translate', placement: false });
    await page.keyboard.up('Space');
    expect(await controls()).toMatchObject({ shown: false, attached: false });

    await page.locator('#model-position-x').focus();
    await page.keyboard.down('Space');
    expect(await controls()).toMatchObject({ shown: false });
    await page.keyboard.up('Space');
    await page.locator('#model-tree .model-tree-button').first().click();

    await page.keyboard.down('Space');
    const handle = await page.evaluate(() => {
        const { state, THREE } = window.modelMove;
        const center = state.selectedModel.getWorldPosition(new THREE.Vector3());
        state.controls.target.copy(center);
        state.camera.position.copy(center).add(new THREE.Vector3(1200, -1200, 1000));
        state.controls.update();
        state.transformControls.updateMatrixWorld(true);
        const gizmo = state.transformControls.children.find(child => child.isTransformControlsGizmo);
        const axis = gizmo.gizmo.translate.getObjectByName('X');
        const point = axis.localToWorld(new THREE.Vector3(0.44, 0, 0)).project(state.camera);
        const canvas = state.renderer.domElement.getBoundingClientRect();
        return { x: canvas.x + (point.x + 1) * canvas.width / 2, y: canvas.y + (1 - point.y) * canvas.height / 2 };
    });
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    expect(await page.evaluate(() => window.modelMove.state.transformControls.dragging)).toBe(true);
    await page.mouse.move(handle.x + 20, handle.y);
    expect(await page.evaluate(() => window.modelMove.state.selectedModel.position.x)).not.toBe(0);
    await page.keyboard.up('Space');
    expect(await controls()).toMatchObject({ shown: false, attached: true });
    await page.mouse.up();
    expect(await controls()).toMatchObject({ shown: false, attached: false });

    await page.keyboard.down('Space');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await controls()).toMatchObject({ shown: false, attached: false });
    await page.keyboard.up('Space');

    await page.locator('[data-transform-mode="translate"]').click();
    await page.keyboard.down('Space');
    expect(await controls()).toMatchObject({ shown: true, mode: 'rotate', placement: true });
    await page.keyboard.up('Space');
    expect(await controls()).toMatchObject({ shown: true, mode: 'translate', placement: true });
    await page.locator('[data-transform-mode="translate"]').click();

    await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');
    await page.waitForFunction(() => window.modelMove.state.models.some(model => model.userData.tcpFrame));
    await page.locator('#model-tree .model-tree-button').filter({ hasText: 'IR-S10-80Z20' }).click();
    await page.keyboard.down('Space');
    expect(await controls()).toMatchObject({ shown: false, attached: false });
    await page.keyboard.up('Space');
});
