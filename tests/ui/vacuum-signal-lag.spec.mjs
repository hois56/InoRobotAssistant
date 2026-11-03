import { test, expect } from '@playwright/test';

test('렌더 프레임 사이의 진공 펄스는 같은 컨트롤러 위치에서 흡착하고 파기 위치에서 떨어진다', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + '\nwindow.__vacuumLag={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,getArticulatedRobots,getRobotToolMountFrame,ensureVirtualControllerCore,registerVirtualControllerSession,handleVirtualControllerMessage,applyVirtualControllerFrameForController,disconnectVirtualController};' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__vacuumLag?.state.workspaceRecovery.ready);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__vacuumLag.getArticulatedRobots().length === 1);
    const result = await page.evaluate(async () => {
        const a = window.__vacuumLag, app = a.equipmentApp, T = a.THREE, robot = a.getArticulatedRobots()[0];
        const ref = model => 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
        const tool = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '펄스 흡착 Tool' });
        a.getRobotToolMountFrame(robot).add(tool); tool.position.z = 100;
        tool.userData.placement = 'tcp'; tool.userData.attachmentHost = robot; a.state.models.push(tool);
        const product = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '펄스 대상' });
        product.position.copy(tool.localToWorld(new T.Vector3(0, 0, 21.5)));
        product.quaternion.copy(tool.getWorldQuaternion(new T.Quaternion()));
        a.state.scene.add(product); a.state.models.push(product);
        app.save({ id: 'lag-object', type: 'OBJECT', movingRef: ref(product) });
        const def = app.save({ id: 'lag-vacuum', type: 'VACUUM', movingRef: ref(tool), vacuumMode: 'WHOLE' }, { forward: 512, reverse: 513 });
        let searches = 0; const find = app.runtime.contact.find.bind(app.runtime.contact);
        app.runtime.contact.find = (...args) => { searches++; return find(...args); };
        const controller = a.state.virtualController;
        await a.ensureVirtualControllerCore(controller); a.registerVirtualControllerSession(controller);
        controller.targetRobotId = robot.userData.motionInstanceId; controller.source = 'bridge'; controller.wanted = true;
        controller.status = 'streaming'; controller.lastRateUpdateAt = performance.now();
        const joints = robot.userData.joints.map(joint => joint.angle);
        const send = (angle, forward = 0, reverse = 0) => {
            const pose = [...joints]; pose[0] += angle;
            a.handleVirtualControllerMessage({ type: 'robotState', data: { joints: pose, outputs: { 512: forward, 513: reverse } } }, controller);
        };
        const position = () => product.getWorldPosition(new T.Vector3());
        const start = position();
        send(30); a.applyVirtualControllerFrameForController(performance.now(), controller);
        // These packets are handled without yielding to requestAnimationFrame.
        send(0, 1); send(30, 0);
        a.applyVirtualControllerFrameForController(performance.now(), controller);
        app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, performance.now());
        const held = product.userData.equipmentOwner === def.id, moved = position().distanceTo(start);
        const mesh = tool.children[0], local = def.runtime.heldObjects?.[0]?.local;
        send(60, 0, 1);
        const release = position();
        const expectedRelease = local && new T.Vector3().setFromMatrixPosition(mesh.matrixWorld.clone().multiply(new T.Matrix4().fromArray(local)));
        send(90, 0, 0); a.applyVirtualControllerFrameForController(performance.now(), controller);
        app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, performance.now() + 500);
        const output = { held, moved, searches, released: !product.userData.equipmentOwner,
            releaseError: expectedRelease ? release.distanceTo(expectedRelease) : 1e9, stayed: position().distanceTo(release), active: def.runtime.vacuumActive };
        a.disconnectVirtualController(controller);
        return output;
    });
    expect(result.held).toBe(true); expect(result.moved).toBeGreaterThan(10); expect(result.searches).toBe(1);
    expect(result.released).toBe(true); expect(result.releaseError).toBeLessThan(1e-6); expect(result.stayed).toBeLessThan(1e-6); expect(result.active).toBe(false);
    expect(errors).toEqual([]);
});
