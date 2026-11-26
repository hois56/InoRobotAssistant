import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('calibration exports one K12 coordinate and raw captures retain fractional pixels', async ({ page }) => {
    const errors = await openSimulation(page);
    const panel = await prepareVision(page);
    const coordinate = panel.locator('[data-vision-field="calibration.controllerCoordinate"]');
    await coordinate.selectOption('5');
    const downloadReady = page.waitForEvent('download');
    await panel.locator('[data-vision-action="cal-export-lab"]').click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toBe('AssistantVisionCalibration.json');
    const data = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(data.Format).toBe('InoRobotAssistant.VisionCalibration.v1');
    expect(data.CoorCfgList).toHaveLength(1);
    expect(data.CoorCfgList[0].CoorId).toBe(5);
    expect(data.CoorCfgList[0].CaliMatrix.every(Number.isFinite)).toBe(true);
    const raw = await page.evaluate(async () => window.__vision.visionApp.controller.handleText('CALRAW'));
    expect(raw.trim()).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
    await panel.locator('[data-vision-tab="link"]').click();
    await panel.locator('details > summary').filter({ hasText: '문자열 형식' }).click();
    await panel.locator('[data-vision-field="output.terminator"]').selectOption('lab');
    const framed = await page.evaluate(async () => ({
        terminator: window.__vision.visionApp.config.output.terminator,
        reply: await window.__vision.visionApp.controller.handleText('CALRAW')
    }));
    expect(framed.terminator).toBe('lab');
    expect(framed.reply).toMatch(/^-?\d+\.\d+,-?\d+\.\d+V$/);
    expect(errors).toEqual([]);
});

async function openSimulation(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__vision={state,visionApp,THREE,getImportedModelParts,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,getRobotOlpSocketService,readOlpAddress,writeOlpAddress};` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__vision);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__vision.state.models.some(model => model.userData.tcpFrame));
    return errors;
}

async function prepareVision(page) {
    await page.locator('#btn-vision-panel').click();
    const panel = page.locator('#vision-panel');
    await expect(panel).toBeVisible();
    await panel.locator('[data-vision-action="enable"]').click();
    await expect(panel.locator('[data-vision-canvas]')).toBeVisible();
    await expect(panel.locator('[data-vision-out="fov"]')).toContainText('mm/px');
    await page.evaluate(() => { window.__vision.visionApp.config.camera.noisePx = 0; window.__vision.visionApp.config.camera.processingMs = 0; });
    await panel.locator('[data-vision-tab="calibration"]').click();
    await panel.locator('[data-vision-action="cal-auto"]').click();
    await page.waitForFunction(() => window.__vision.visionApp.config.calibration.result && !window.__vision.visionApp.state.autoCalibrating, null, { timeout: 20000 });
    return panel;
}

test('vision images exclude robot coordinate handles and preserve their main-view visibility', async ({ page }) => {
    const errors = await openSimulation(page);
    await page.locator('#btn-vision-panel').click();
    await page.locator('#vision-panel [data-vision-action="enable"]').click();
    const result = await page.evaluate(() => {
        const { state, visionApp } = window.__vision;
        const robot = state.models.find(model => model.userData.tcpFrame);
        const axes = robot.userData.toolAxesAtTcp;
        const jog = state.baseJogTransformControls;
        const hiddenAxes = state.zeroPointEdit.axes;
        axes.visible = true;
        jog.attach(robot.userData.tcpFrame);
        jog.visible = true;
        hiddenAxes.visible = false;
        const originalRender = state.renderer.render;
        const readState = () => ({ tcp: axes.visible, jog: jog.visible, hiddenAxes: hiddenAxes.visible, robot: robot.visible, frame: robot.userData.tcpFrame.visible, tcpSetting: state.tcpAxesVisible });
        let during;
        try {
            state.renderer.render = function (...args) {
                if (this.getRenderTarget()) during = readState();
                return originalRender.apply(this, args);
            };
            visionApp.drawImage();
            const duringFirst = during;
            const after = readState();
            const canvas = document.querySelector('[data-vision-canvas]');
            const pixels = () => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            const withHandles = pixels();
            axes.visible = false; jog.visible = false;
            visionApp.drawImage();
            const withoutHandles = pixels();
            const sameImage = withHandles.every((value, index) => value === withoutHandles[index]);
            axes.visible = true; jog.visible = true;
            state.renderer.render = () => { throw new Error('capture failure for visibility regression'); };
            visionApp.drawImage();
            return { during: duringFirst, after, afterFailure: readState(), sameImage };
        } finally {
            state.renderer.render = originalRender;
            jog.detach();
        }
    });
    expect(result.during).toMatchObject({ tcp: false, jog: false, hiddenAxes: false, robot: true, frame: true });
    expect(result.after).toMatchObject({ tcp: true, jog: true, hiddenAxes: false, robot: true, frame: true, tcpSetting: true });
    expect(result.afterFailure).toEqual(result.after);
    expect(result.sameImage).toBe(true);
    expect(errors).toEqual([]);
});

test('virtual vision calibrates, registers the master and measures a random work object', async ({ page }, testInfo) => {
    const errors = await openSimulation(page);
    const panel = await prepareVision(page);
    const calibration = await page.evaluate(() => window.__vision.visionApp.config.calibration.result);
    expect(calibration.translationCount).toBe(9);
    expect(calibration.rms).toBeLessThan(0.01);
    expect(calibration.rotation.count).toBe(3);
    expect(Math.abs(calibration.rotation.radius - Math.hypot(25, 15))).toBeLessThan(0.05);
    await expect(panel.locator('[data-vision-out="calibration"]')).toContainText('RMS');

    await panel.locator('[data-vision-tab="workpiece"]').click();
    await panel.locator('[data-vision-action="spawn-nominal"]').click();
    await panel.locator('[data-vision-action="master"]').click();
    await page.waitForFunction(() => window.__vision.visionApp.config.detection.master);
    await panel.locator('[data-vision-tab="workpiece"]').click();
    await page.evaluate(() => Object.assign(window.__vision.visionApp.config.generator, { seed: 7, rangeX: 12, rangeY: 8, rangeRz: 20 }));
    await panel.locator('[data-vision-action="spawn"]').click();
    await panel.locator('[data-vision-tab="camera"]').click();
    await panel.locator('[data-vision-action="capture"]').click();
    await page.waitForFunction(() => window.__vision.visionApp.state.lastResult?.counter >= 1);
    const result = await page.evaluate(() => {
        const { visionApp, state } = window.__vision;
        const last = visionApp.state.lastResult;
        const generated = state.models.filter(model => model.userData.visionWork);
        return {
            ok: last.ok, dx: last.dx, dy: last.dy, dtheta: last.dtheta, truth: last.observation.truth, master: visionApp.config.detection.master.truth,
            generated: generated.length,
            registered: generated.every(model => state.equipmentDefinitions.some(def => def.type === 'OBJECT' && def.movingRefs.some(ref => ref.includes(model.userData.workspaceModelId))))
        };
    });
    expect(result.ok).toBe(true);
    expect(result.generated).toBe(1);
    expect(result.registered).toBe(true);
    // The master uses the object center as rotation center, so the offset is
    // the true center displacement in robot coordinates.
    expect(Math.abs(result.dx - (result.truth.x - result.master.x))).toBeLessThan(0.1);
    expect(Math.abs(result.dy - (result.truth.y - result.master.y))).toBeLessThan(0.1);
    expect(Math.abs(result.dtheta - (result.truth.theta - result.master.theta))).toBeLessThan(0.1);
    await expect(panel.locator('[data-vision-out="result"]')).toContainText('OK');
    await expect(panel.locator('[data-vision-out="result"]')).not.toContainText('정답 대비 오차');
    const counter = await page.evaluate(() => window.__vision.visionApp.state.lastResult.counter);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__vision.visionApp.state.lastResult.counter)).toBe(counter);
    const coloredPixels = await page.evaluate(() => {
        const canvas = document.querySelector('[data-vision-canvas]');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let orange = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > pixels[i + 1] + 20 && pixels[i + 1] > pixels[i + 2] + 20) orange++;
        return orange;
    });
    expect(coloredPixels).toBeGreaterThan(100);
    await panel.screenshot({ path: testInfo.outputPath('vision-color-capture.png') });
    expect(errors).toEqual([]);
});

test('an imported work object is moved in place and a single capture measures its correction', async ({ page }, testInfo) => {
    const errors = await openSimulation(page);
    const panel = await prepareVision(page);
    await panel.locator('[data-vision-tab="workpiece"]').click();
    await panel.locator('[data-vision-action="spawn-nominal"]').click();
    const vertices = [[10, -15, 0], [70, -15, 0], [70, 15, 0], [10, 15, 0], [10, -15, 20], [70, -15, 20], [70, 15, 20], [10, 15, 20]];
    const triangles = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    const geometry = Buffer.from(new Float32Array(triangles.flatMap(index => vertices[index])).buffer);
    const gltf = {
        asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        buffers: [{ byteLength: geometry.length, uri: 'data:application/octet-stream;base64,' + geometry.toString('base64') }],
        bufferViews: [{ buffer: 0, byteLength: geometry.length }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 36, type: 'VEC3', min: [10, -15, 0], max: [70, 15, 20] }],
        materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.1, 0.8, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.7 } }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }]
    };
    await page.locator('#input-import-3d').setInputFiles({ name: 'VisionWork.gltf', mimeType: 'model/gltf+json', buffer: Buffer.from(JSON.stringify(gltf)) });
    await page.locator('#import-placement').selectOption('scene');
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(() => window.__vision.state.models.some(model => model.userData.uploaded) && !window.__vision.state.fileImportLoads.size);
    const original = await page.evaluate(async () => {
        const { state, visionApp, THREE } = window.__vision;
        const { objectFeaturePoints } = await import('/2_3DSimulation/vision-scene.mjs');
        const model = state.models.find(model => model.userData.uploaded);
        model.scale.set(1.2, 0.7, 1.1);
        model.rotation.set(0.05, -0.08, 0.3, 'ZYX');
        model.position.set(visionApp.config.generator.nominalX, visionApp.config.generator.nominalY, 0);
        model.updateMatrixWorld(true);
        const width = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x;
        model.scale.multiplyScalar(60 / width);
        model.updateMatrixWorld(true);
        model.position.z += visionApp.config.camera.workPlaneZ - objectFeaturePoints(model).center[2];
        model.updateMatrixWorld(true);
        const materials = [];
        model.traverse(child => { if (child.isMesh) for (const material of [child.material].flat()) materials.push(material.color.getHexString()); });
        return { id: model.userData.workspaceModelId, uuid: model.uuid, position: model.position.toArray(), scale: model.scale.toArray(), materials, count: state.models.length };
    });
    await panel.locator('[data-vision-tab="workpiece"]').click();
    await expect(panel.locator('[data-vision-field="generator.rangeX"]')).toHaveValue('50');
    await expect(panel.locator('[data-vision-field="generator.rangeY"]')).toHaveValue('50');
    await expect(panel.locator('[data-vision-field="generator.rangeRz"]')).toHaveValue('180');
    await panel.locator('[data-vision-field="detection.targetId"]').selectOption(original.id);
    await expect(panel.locator('[data-vision-field="generator.shape"]')).toBeHidden();
    await expect(panel.locator('[data-vision-action="spawn-clear"]')).toBeHidden();
    await panel.locator('[data-vision-action="master"]').click();
    await page.waitForFunction(() => window.__vision.visionApp.config.detection.master);
    await page.evaluate(() => { window.__vision.visionApp.config.generator.seed = 7; });
    for (let i = 0; i < 3; i++) {
        await panel.locator('[data-vision-action="spawn"]').click();
        const moved = await page.evaluate(id => {
            const { state, visionApp } = window.__vision;
            const model = state.models.find(model => model.userData.workspaceModelId === id);
            const materials = [];
            model.traverse(child => { if (child.isMesh) for (const material of [child.material].flat()) materials.push(material.color.getHexString()); });
            return { uuid: model.uuid, position: model.position.toArray(), scale: model.scale.toArray(), materials, count: state.models.length,
                tilt: [model.matrixWorld.elements[2], model.matrixWorld.elements[6], model.matrixWorld.elements[10]],
                referenceTilt: [visionApp.config.generator.referenceMatrix[2], visionApp.config.generator.referenceMatrix[6], visionApp.config.generator.referenceMatrix[10]] };
        }, original.id);
        expect(moved.uuid).toBe(original.uuid);
        expect(moved.count).toBe(original.count);
        expect(moved.materials).toEqual(original.materials);
        expect(moved.scale).toEqual(original.scale);
        expect(Math.abs(moved.position[0] - original.position[0])).toBeLessThanOrEqual(50);
        expect(Math.abs(moved.position[1] - original.position[1])).toBeLessThanOrEqual(50);
        expect(moved.position[2]).toBeCloseTo(original.position[2], 6);
        moved.tilt.forEach((value, index) => expect(value).toBeCloseTo(moved.referenceTilt[index], 6));
    }
    await panel.locator('[data-vision-tab="camera"]').click();
    await panel.locator('[data-vision-action="capture"]').click();
    await page.waitForFunction(() => window.__vision.visionApp.state.lastResult?.counter >= 1);
    const measured = await page.evaluate(() => {
        const app = window.__vision.visionApp;
        return { result: app.state.lastResult, master: app.config.detection.master.truth };
    });
    expect(measured.result.ok).toBe(true);
    expect(Math.abs(measured.result.dx - (measured.result.observation.truth.x - measured.master.x))).toBeLessThan(0.1);
    expect(Math.abs(measured.result.dy - (measured.result.observation.truth.y - measured.master.y))).toBeLessThan(0.1);
    const savedReference = await page.evaluate(() => {
        const app = window.__vision.visionApp, saved = app.serialize();
        app.restore(saved);
        return { before: saved.generator.referenceMatrix, after: app.config.generator.referenceMatrix };
    });
    expect(savedReference.after).toEqual(savedReference.before);
    await panel.locator('[data-vision-tab="workpiece"]').click();
    await panel.locator('[data-vision-action="spawn-nominal"]').click();
    const restored = await page.evaluate(id => window.__vision.state.models.find(model => model.userData.workspaceModelId === id).position.toArray(), original.id);
    restored.forEach((value, index) => expect(value).toBeCloseTo(original.position[index], 6));
    await panel.locator('[data-vision-field="detection.targetId"]').scrollIntoViewIfNeeded();
    await panel.screenshot({ path: testInfo.outputPath('vision-selected-work-object.png') });
    expect(errors).toEqual([]);
});

test('upward capture sees the bottom of the workpiece and measures its offset', async ({ page }) => {
    const errors = await openSimulation(page);
    const panel = await prepareVision(page);
    await panel.locator('[data-vision-tab="camera"]').click();
    await panel.locator('[data-vision-field="camera.direction"]').selectOption('up');
    expect(await page.evaluate(() => window.__vision.visionApp.config.calibration.result)).toBe(null);
    await panel.locator('[data-vision-action="place"]').click();
    const pose = await page.evaluate(() => {
        const cfg = window.__vision.visionApp.config;
        return { lens: cfg.camera.z, plane: cfg.camera.workPlaneZ, bottom: cfg.generator.nominalZ };
    });
    expect(pose.lens).toBeLessThan(pose.plane);
    expect(pose.bottom).toBe(pose.plane);
    await expect(panel.locator('[data-vision-out="fov"]')).toContainText('mm/px');
    await panel.locator('[data-vision-tab="calibration"]').click();
    await panel.locator('[data-vision-action="cal-auto"]').click();
    await page.waitForFunction(() => window.__vision.visionApp.config.calibration.result && !window.__vision.visionApp.state.autoCalibrating);
    await panel.locator('[data-vision-tab="workpiece"]').click();
    await panel.locator('[data-vision-action="spawn-nominal"]').click();
    await panel.locator('[data-vision-action="master"]').click();
    await page.waitForFunction(() => window.__vision.visionApp.config.detection.master);
    await page.evaluate(() => {
        const { state } = window.__vision;
        const object = state.models.find(model => model.userData.visionWork);
        object.position.x += 6; object.position.y -= 4; object.updateMatrixWorld(true);
    });
    await panel.locator('[data-vision-tab="camera"]').click();
    await panel.locator('[data-vision-action="capture"]').click();
    await page.waitForFunction(() => window.__vision.visionApp.state.lastResult);
    const result = await page.evaluate(() => window.__vision.visionApp.state.lastResult);
    expect(result.ok).toBe(true);
    expect(Math.abs(result.observation.heightDelta)).toBeLessThan(0.01);
    expect(Math.abs(result.dx - 6)).toBeLessThan(0.1);
    expect(Math.abs(result.dy + 4)).toBeLessThan(0.1);
    expect(errors).toEqual([]);
});

test('the test Vision module activates its own upward Camera and keeps its part mounting after restore', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const errors = await openSimulation(page);
    await page.locator('#btn-test-model').click();
    await page.locator('[data-test-quantity="vision"]').fill('1');
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 60000 });
    const imported = await page.evaluate(() => {
        const { state, visionApp, THREE, getImportedModelParts } = window.__vision;
        const model = state.models.find(model => model.userData.modelName === 'Vision_module.step');
        const group = model.userData.modelPartGroups.find(group => group.name === 'Camera');
        const parts = getImportedModelParts(model);
        const box = group.parts.reduce((box, index) => box.union(new THREE.Box3().setFromObject(parts[index])), new THREE.Box3());
        return { enabled: visionApp.config.enabled, camera: visionApp.config.camera, modelId: model.userData.workspaceModelId,
            firstPart: group.parts[0], origin: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z],
            rootPosition: model.position.toArray(), count: state.models.length, link: visionApp.state.link.state };
    });
    await testInfo.attach('module-camera-bounds', { body: JSON.stringify(imported, null, 2), contentType: 'application/json' });
    expect(imported.enabled).toBe(true);
    expect(imported.count).toBe(2);
    expect(imported.camera.mountId).toBe(imported.modelId);
    expect(imported.camera.mountPartIndex).toBe(imported.firstPart);
    expect(imported.camera.direction).toBe('up');
    expect(imported.link).toBe('stopped');
    ['x', 'y', 'z'].forEach((key, index) => expect(imported.camera[key]).toBeCloseTo(imported.origin[index], 2));
    expect(imported.camera.workPlaneZ).toBeGreaterThan(imported.camera.z);
    await page.locator('#btn-vision-panel').click();
    const panel = page.locator('#vision-panel');
    await expect(panel.locator('[data-vision-field="camera.direction"]')).toHaveValue('up');
    await expect(panel.locator('[data-vision-canvas]')).toBeVisible();
    await expect(panel.locator('[data-vision-out="fov"]')).toContainText('mm/px');
    await page.evaluate(() => {
        const { state, getImportedModelParts } = window.__vision;
        const model = state.models.find(model => model.userData.modelName === 'Vision_module.step');
        const parts = getImportedModelParts(model);
        for (const index of model.userData.modelPartGroups.find(group => group.name === 'Camera').parts) parts[index].position.z += 40;
        model.position.x += 120; model.updateMatrixWorld(true);
    });
    await expect.poll(() => page.evaluate(() => window.__vision.visionApp.config.camera.z)).toBeCloseTo(imported.camera.z + 40, 2);
    await expect.poll(() => page.evaluate(() => window.__vision.visionApp.config.camera.x)).toBeCloseTo(imported.camera.x + 120, 2);
    const restored = await page.evaluate(async () => {
        const api = window.__vision;
        const before = api.visionApp.serialize();
        await api.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot())));
        await new Promise(resolve => setTimeout(resolve, 300));
        return { before: before.camera, after: api.visionApp.config.camera };
    });
    expect(restored.after.direction).toBe('up');
    expect(restored.after.mountPartIndex).toBe(restored.before.mountPartIndex);
    ['x', 'y', 'z'].forEach(key => expect(restored.after[key]).toBeCloseTo(restored.before[key], 2));
    await panel.locator('[data-vision-field="camera.direction"]').selectOption('down');
    await expect(panel.locator('[data-vision-out="fov"]')).toContainText('mm/px');
    await panel.locator('[data-vision-field="camera.direction"]').scrollIntoViewIfNeeded();
    await panel.screenshot({ path: testInfo.outputPath('vision-direction-camera.png') });
    expect(errors).toEqual([]);
});

test('vision communication uses controllers and preserves both roles for Socket and Ethernet/IP', async ({ page }, testInfo) => {
    const configured = [];
    let tokenRequests = 0;
    await page.route('**/api/virtualbus-token', route => route.fulfill({ status: 404, body: '' }));
    const pairingToken = 'vision-bridge-test-token';
    await page.route('http://127.0.0.1:5055/api/health', route => route.fulfill({
        json: { service: 'InoRobotVirtualControllerBridge', virtualVisionVersion: 1, pairingToken }
    }));
    await page.routeWebSocket('ws://127.0.0.1:5055/virtualvision/', socket => {
        socket.onMessage(raw => {
            const message = JSON.parse(raw);
            if (message.type === 'hello') {
                expect(message.token).toBe(pairingToken);
                tokenRequests++;
                socket.send(JSON.stringify({ type: 'ready' }));
            }
            if (message.type === 'configure') {
                configured.push(message.config);
                socket.send(JSON.stringify({ type: 'status', status: { state: message.config.role === 'server' ? 'listening' : 'connected' } }));
            }
        });
    });
    const errors = await openSimulation(page);
    await page.locator('#btn-vision-panel').click();
    const panel = page.locator('#vision-panel');
    await panel.locator('[data-vision-action="enable"]').click();
    await panel.locator('[data-vision-tab="link"]').click();
    const target = panel.locator('[data-vision-field="link.target"]');
    const protocol = panel.locator('[data-vision-field="link.protocol"]');
    const role = panel.locator('[data-vision-field="link.role"]');
    await expect(target).toBeDisabled();
    await expect(target).toHaveValue('external');
    await expect(target.locator('option')).toHaveCount(1);
    await expect(protocol.locator('option')).toHaveText(['Socket', 'Ethernet/IP']);
    await expect(panel.locator('[data-vision-field="link.active"], [data-vision-preset], [data-vision-field="link.olpMode"]')).toHaveCount(0);
    await expect(panel.locator('[data-vision-out="link"]')).toContainText('정지');
    expect(tokenRequests).toBe(0);

    for (const name of ['socket', 'eip']) {
        await protocol.selectOption(name);
        for (const visionRole of ['client', 'server']) {
            const before = configured.length;
            await role.selectOption(visionRole);
            await expect(role).toBeVisible();
            await expect(role).toHaveValue(visionRole);
            await expect(panel.locator('[data-vision-out="link"]')).toContainText('정지');
            expect(configured).toHaveLength(before);
            await panel.locator('[data-vision-action="connect"]').click();
            await expect.poll(() => configured.length).toBe(before + 1);
            await expect.poll(() => configured.at(-1)).toMatchObject({ protocol: name, role: visionRole });
            await expect(panel.locator('[data-vision-action="connect"]')).toHaveText('연결 해제');
            const serverPort = panel.locator('[data-vision-field="link.port"]');
            const targetIp = panel.locator('[data-vision-field="link.targetIp"]');
            const targetPort = panel.locator('[data-vision-field="link.targetPort"]');
            await expect(visionRole === 'server' ? serverPort : targetIp).toBeVisible();
            await expect(visionRole === 'server' ? targetIp : serverPort).toBeHidden();
            await expect(visionRole === 'server' ? serverPort : targetPort).toHaveValue(name === 'socket' ? '5000' : '44818');
            if (visionRole === 'client') await expect(targetPort).toBeVisible();
            if (name === 'eip') await expect(panel.locator('[data-vision-out="map"]')).toContainText('O→T');
        }
    }

    // Imported settings must not re-enable the removed OLP/Modbus options or
    // silently leave communication disabled behind the removed checkbox.
    await page.evaluate(() => {
        const app = window.__vision.visionApp;
        const saved = app.serialize();
        app.restore({ ...saved, link: { ...saved.link, active: false, target: 'olp', protocol: 'modbus', role: 'client' } });
    });
    await expect(protocol).toHaveValue('socket');
    await expect(target).toHaveValue('external');
    await expect(role).toHaveValue('client');
    await expect(panel.locator('[data-vision-out="link"]')).toContainText('정지');
    expect(configured).toHaveLength(4);
    await panel.locator('[data-vision-action="connect"]').click();
    await expect.poll(() => configured.at(-1)).toMatchObject({ protocol: 'socket', role: 'client' });
    expect(tokenRequests).toBe(5);
    expect(await page.evaluate(() => window.__vision.visionApp.serialize().link.active)).toBe(true);
    await protocol.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: testInfo.outputPath('vision-communication.png') });
    expect(errors).toEqual([]);
});

test('vision communication waits for a click and never retries failed or dropped sessions', async ({ page }) => {
    let tokenRequests = 0, failToken = true;
    const sessions = [];
    await page.route('http://127.0.0.1:5055/api/health', route => route.fulfill({
        json: { service: 'InoRobotVirtualControllerBridge', pairingToken: 'old-bridge-token' }
    }));
    await page.route('**/api/virtualbus-token', route => {
        tokenRequests++;
        return route.fulfill(failToken ? { status: 503, json: {} } : { json: { token: 'vision-test-token-'.repeat(3) } });
    });
    await page.routeWebSocket('**/virtualvision/', socket => {
        sessions.push(socket);
        socket.onMessage(raw => {
            const message = JSON.parse(raw);
            if (message.type === 'hello') socket.send(JSON.stringify({ type: 'ready' }));
            if (message.type === 'configure') socket.send(JSON.stringify({ type: 'status', status: { state: 'connected' } }));
        });
    });
    const errors = await openSimulation(page);
    await page.locator('#btn-vision-panel').click();
    const panel = page.locator('#vision-panel');
    await panel.locator('[data-vision-action="enable"]').click();
    await panel.locator('[data-vision-tab="link"]').click();
    await expect(panel.locator('[data-vision-out="link"]')).toContainText('정지');
    expect(tokenRequests).toBe(0);
    const connect = panel.locator('[data-vision-action="connect"]');
    await connect.click();
    await expect(panel.locator('[data-vision-out="link"]')).toContainText('최신 브리지를 다운로드');
    await expect(connect).toHaveText('연결');
    await page.waitForTimeout(5500);
    expect(tokenRequests).toBe(1);
    expect(sessions).toHaveLength(0);

    failToken = false;
    await connect.click();
    await expect(panel.locator('[data-vision-out="link"]')).toContainText('연결됨');
    await expect(connect).toHaveText('연결 해제');
    sessions[0].close();
    await expect(panel.locator('[data-vision-out="link"]')).toContainText('정지');
    await expect(connect).toHaveText('연결');
    await page.waitForTimeout(2200);
    expect(tokenRequests).toBe(2);
    expect(sessions).toHaveLength(1);
    await connect.click();
    await expect(panel.locator('[data-vision-out="link"]')).toContainText('연결됨');
    expect(sessions).toHaveLength(2);
    await connect.click();
    await expect(panel.locator('[data-vision-out="link"]')).toContainText('정지');
    expect(errors).toEqual([]);
});

test('enabling the vision without a robot still creates the camera model', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__vision={state,visionApp};` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__vision);
    await page.locator('#btn-vision-panel').click();
    await page.locator('#vision-panel [data-vision-action="enable"]').click();
    await expect(page.locator('#model-tree [data-model-tree-id]').filter({ hasText: '비전 카메라' }).first()).toContainText('VISION 1');
    expect(await page.evaluate(() => window.__vision.state.models.filter(model => window.__vision.visionApp.isCameraModel(model)).length)).toBe(1);
    expect(errors).toEqual([]);
});

test('vision stays live and camera coordinates are edited in the model tree', async ({ page, context }, testInfo) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await openSimulation(page);
    await page.locator('#btn-vision-panel').click();
    const panel = page.locator('#vision-panel');
    await panel.locator('[data-vision-action="enable"]').click();
    const cameraItem = page.locator('#model-tree [data-model-tree-id]').filter({ hasText: '비전 카메라' }).first();
    await expect(cameraItem).toContainText('VISION 1');
    await expect(panel.locator('[data-vision-field="__live"], [data-vision-action="trigger"], [data-vision-action="disable"], [data-vision-field="camera.monochrome"], [data-vision-field="camera.moveModel"]')).toHaveCount(0);
    expect(await panel.locator('[data-vision-field]').evaluateAll(fields => fields.filter(field => /^camera\.(x|y|z|rx|ry|rz)$/.test(field.dataset.visionField)).length)).toBe(0);
    const frustum = panel.locator('.vision-view-bar [data-vision-field="camera.showFrustum"]');
    await expect(frustum).toBeVisible();
    await frustum.uncheck();
    expect(await page.evaluate(() => window.__vision.visionApp.config.camera.showFrustum)).toBe(false);
    await frustum.check();
    await page.evaluate(() => {
        window.__visionFrameCount = 0;
        const context = document.querySelector('[data-vision-canvas]').getContext('2d');
        const original = context.putImageData.bind(context);
        context.putImageData = (...args) => { window.__visionFrameCount++; return original(...args); };
    });
    await expect.poll(() => page.evaluate(() => window.__visionFrameCount)).toBeGreaterThan(2);

    // Moving the camera model moves the vision viewpoint.
    const moved = await page.evaluate(async () => {
        const { visionApp, state } = window.__vision;
        const camera = state.models.find(model => visionApp.isCameraModel(model));
        camera.position.x += 37;
        camera.updateMatrixWorld(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        return { visionX: visionApp.config.camera.x, modelX: camera.position.x };
    });
    expect(Math.abs(moved.visionX - moved.modelX)).toBeLessThan(1e-3);

    // Editing the model-tree pose moves the camera and its viewpoint.
    // Numeric inputs keep the caret at the start on the first click.
    await cameraItem.click();
    const z = page.locator('#model-position-z');
    await z.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('850');
    await z.press('Tab');
    await expect.poll(() => page.evaluate(() => {
        const { visionApp, state } = window.__vision;
        const camera = state.models.find(model => visionApp.isCameraModel(model));
        return camera?.position.z === visionApp.config.camera.z ? visionApp.config.camera.z : null;
    })).toBeCloseTo(850, 3);
    await panel.screenshot({ path: testInfo.outputPath('vision-live-camera.png') });

    // Register an existing model through the model tree context menu.
    await page.locator('[data-panel-toggle="shape-panel"]').click();
    await page.locator('#shape-create').click();
    const box = page.locator('#model-tree [data-model-tree-id]').filter({ hasText: '사각형' }).last();
    await box.click({ button: 'right' });
    await page.locator('#model-vision-camera').click();
    await expect(page.locator('#model-tree [data-model-tree-id]').filter({ hasText: '비전 카메라' }).first()).toContainText('사각형');
    const registered = await page.evaluate(() => {
        const { visionApp, state } = window.__vision;
        return { cameras: state.models.filter(model => visionApp.isCameraModel(model)).length, builtIn: state.models.some(model => model.userData.modelName === 'VISION 1') };
    });
    expect(registered).toEqual({ cameras: 1, builtIn: false });

    // Example programs copy with Windows line endings.
    await panel.locator('[data-vision-tab="link"]').click();
    await panel.locator('[data-vision-guide] > summary').click();
    const copy = panel.locator('[data-vision-copy]').first();
    await copy.click();
    await expect(copy).toContainText('복사됨');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('Start;');
    expect(clipboard).toContain('\r\n');
    expect(errors).toEqual([]);
});
