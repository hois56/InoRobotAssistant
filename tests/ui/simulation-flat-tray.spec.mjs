import { test, expect } from '@playwright/test';

test('평면 트레이 위의 작업물을 자유롭게 이동·회전하고 비전 촬영 후 저장·복원한다', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);$/m, 'window.__flatTrayReady = init();');
        await route.fulfill({ response, body: `${source}\nwindow.__flatTray = { state, THREE, visionApp, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, fitCamera };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__flatTray);
    await page.evaluate(() => window.__flatTrayReady);
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__flatTray.state.models.some(model => model.userData.tcpFrame));
    await page.locator('#btn-test-model').click();
    const trayCard = page.locator('.test-model-card').filter({ has: page.locator('[data-test-quantity="flat-tray"]') });
    await expect(trayCard.locator('strong')).toHaveText('Flat Tray module 240 × 240');
    await page.waitForFunction(() => {
        const image = document.querySelector('[data-test-quantity="flat-tray"]').closest('.test-model-card').querySelector('img');
        return image.complete && image.naturalWidth > 0;
    });
    await page.locator('[data-test-quantity="flat-tray"]').fill('1');
    await page.locator('[data-test-quantity="square-object"]').fill('1');
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 90000 });
    const surface = await page.evaluate(() => {
        const a = window.__flatTray;
        const tray = a.state.models.find(model => model.userData.modelName === 'Flat_Tray_Module.step');
        const object = a.state.models.find(model => model.userData.modelName === 'Square_object_40x40x40.step');
        tray.position.set(350, 0, 0);
        object.position.set(350, 0, 176);
        a.state.scene.updateMatrixWorld(true);
        const heights = [];
        for (const x of [-110, -50, 0, 23, 86, 110]) for (const y of [-110, -64, 0, 45, 110]) {
            const ray = new a.THREE.Raycaster(new a.THREE.Vector3(350 + x, y, 500), new a.THREE.Vector3(0, 0, -1));
            heights.push(ray.intersectObject(tray, true)[0]?.point.z ?? null);
        }
        a.visionApp.config.detection.targetId = object.userData.workspaceModelId;
        a.fitCamera();
        return { heights, size: new a.THREE.Box3().setFromObject(tray).getSize(new a.THREE.Vector3()).toArray(),
            groups: tray.userData.modelPartGroups.map(group => group.name) };
    });
    expect(surface.size).toEqual([240, 240, 176]);
    expect(surface.groups).toEqual(['Base', 'Tray']);
    expect(surface.heights).toHaveLength(30);
    for (const height of surface.heights) expect(height).toBeCloseTo(176, 5);
    await page.screenshot({ path: test.info().outputPath('flat-tray-workpiece.png') });

    await page.locator('#btn-vision-panel').click();
    const panel = page.locator('#vision-panel');
    await panel.locator('[data-vision-action="enable"]').click();
    await page.evaluate(() => {
        const a = window.__flatTray, cfg = a.visionApp.config;
        const camera = a.state.models.find(model => model.userData.workspaceModelId === cfg.camera.mountId);
        camera.position.set(350, 0, 916);
        camera.rotation.set(0, 0, 0);
        camera.updateMatrixWorld(true);
        Object.assign(cfg.camera, { workPlaneZ: 216, noisePx: 0, processingMs: 0 });
        Object.assign(cfg.calibration, { centerX: 350, centerY: 0, z: 216, pitchX: 40, pitchY: 40 });
        a.visionApp.sceneChanged();
    });
    await panel.locator('[data-vision-tab="calibration"]').click();
    await panel.locator('[data-vision-action="cal-auto"]').click();
    await expect.poll(() => page.evaluate(() => ({
        calibrated: Boolean(window.__flatTray.visionApp.config.calibration.result),
        busy: window.__flatTray.visionApp.state.autoCalibrating,
        log: window.__flatTray.visionApp.state.log.slice(-2)
    })), { timeout: 20000 }).toMatchObject({ calibrated: true, busy: false });
    await panel.locator('[data-vision-tab="workpiece"]').click();
    await panel.locator('[data-vision-action="master"]').click();
    await page.waitForFunction(() => window.__flatTray.visionApp.config.detection.master);
    await page.evaluate(() => { window.__flatTray.visionApp.config.generator.seed = 7; });
    for (let index = 0; index < 3; index++) {
        await panel.locator('[data-vision-action="spawn"]').click();
        const moved = await page.evaluate(() => {
            const a = window.__flatTray;
            const object = a.state.models.find(model => model.userData.modelName === 'Square_object_40x40x40.step');
            const bounds = new a.THREE.Box3().setFromObject(object);
            return { position: object.position.toArray(), angle: object.rotation.z,
                bottom: bounds.min.z, withinSurface: bounds.min.x >= 230 && bounds.max.x <= 470 && bounds.min.y >= -120 && bounds.max.y <= 120 };
        });
        expect(moved.withinSurface).toBe(true);
        expect(moved.bottom).toBeCloseTo(176, 5);
        expect(Math.abs(moved.position[0] - 350)).toBeLessThanOrEqual(50);
        expect(Math.abs(moved.position[1])).toBeLessThanOrEqual(50);
        expect(Math.abs(moved.angle)).toBeGreaterThan(0.01);
    }
    await panel.locator('[data-vision-tab="camera"]').click();
    await panel.locator('[data-vision-action="capture"]').click();
    await page.waitForFunction(() => window.__flatTray.visionApp.state.lastResult?.counter >= 1);
    const measured = await page.evaluate(() => ({ result: window.__flatTray.visionApp.state.lastResult,
        master: window.__flatTray.visionApp.config.detection.master.truth }));
    expect(measured.result.ok).toBe(true);
    expect(measured.result.observation.heightDelta).toBeCloseTo(0, 2);
    expect(Math.abs(measured.result.dx - (measured.result.observation.truth.x - measured.master.x))).toBeLessThan(0.1);
    expect(Math.abs(measured.result.dy - (measured.result.observation.truth.y - measured.master.y))).toBeLessThan(0.1);
    await panel.screenshot({ path: test.info().outputPath('flat-tray-vision.png') });
    const restored = await page.evaluate(async () => {
        const a = window.__flatTray;
        const inspect = () => a.state.models.filter(model => model.userData.testModel).map(model => ({
            name: model.userData.modelName, position: model.position.toArray(), quaternion: model.quaternion.toArray(),
            groups: model.userData.modelPartGroups || []
        }));
        const before = inspect();
        await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
        return { before, after: inspect() };
    });
    expect(restored.after).toHaveLength(restored.before.length);
    for (const [index, before] of restored.before.entries()) {
        const after = restored.after[index];
        expect(after.name).toBe(before.name);
        expect(after.groups).toEqual(before.groups);
        before.position.forEach((value, axis) => expect(after.position[axis]).toBeCloseTo(value, 8));
        before.quaternion.forEach((value, axis) => expect(after.quaternion[axis]).toBeCloseTo(value, 10));
    }
    expect(errors).toEqual([]);
});
