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
        product.position.copy(tool.localToWorld(new T.Vector3(0, 0, 20.25)));
        product.quaternion.copy(tool.getWorldQuaternion(new T.Quaternion()));
        a.state.scene.add(product); a.state.models.push(product);
        app.save({ id: 'lag-object', type: 'OBJECT', movingRef: ref(product) });
        const def = app.save({ id: 'lag-vacuum', type: 'VACUUM', movingRef: ref(tool), vacuumMode: 'WHOLE' }, { forward: 10, reverse: 11 });
        const controller = a.state.virtualController;
        await a.ensureVirtualControllerCore(controller); a.registerVirtualControllerSession(controller);
        controller.targetRobotId = robot.userData.motionInstanceId; controller.source = 'bridge'; controller.wanted = true;
        controller.status = 'streaming'; controller.lastRateUpdateAt = performance.now();
        const joints = robot.userData.joints.map(joint => joint.angle);
        let sequence = 0;
        const send = (angle, forward = 0, reverse = 0, timestamp = sequence * 4, type = 'robotState') => {
            const pose = [...joints]; pose[0] += angle;
            a.handleVirtualControllerMessage({ type, data: { sequence: ++sequence, timestamp, joints: pose, outputs: { 10: forward, 11: reverse } } }, controller);
        };
        const position = () => product.getWorldPosition(new T.Vector3());
        const start = position();
        send(30); a.applyVirtualControllerFrameForController(performance.now(), controller);
        // These packets are handled without yielding to requestAnimationFrame.
        send(0, 1);
        const heldAtSignal = product.userData.equipmentOwner === def.id;
        send(30, 0);
        a.applyVirtualControllerFrameForController(performance.now(), controller);
        app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, performance.now());
        const held = product.userData.equipmentOwner === def.id, moved = position().distanceTo(start);
        const mesh = tool.children[0], local = def.runtime.heldObjects?.[0]?.local;
        send(60, 0, 1);
        const release = position();
        const expectedRelease = local && new T.Vector3().setFromMatrixPosition(mesh.matrixWorld.clone().multiply(new T.Matrix4().fromArray(local)));
        send(90, 0, 0); a.applyVirtualControllerFrameForController(performance.now(), controller);
        app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, performance.now() + 500);
        const output = { heldAtSignal, held, moved, released: !product.userData.equipmentOwner,
            releaseError: expectedRelease ? release.distanceTo(expectedRelease) : 1e9, stayed: position().distanceTo(release), active: def.runtime.vacuumActive };
        app.resetObjects(ref(product));
        // Replay a 200 ms pulse. Only the middle position packet reaches the workpiece.
        send(30, 1, 0, 1000, 'robotOutputEdge');
        output.waitingAtPulseStart = def.runtime.vacuumActive && !def.runtime.heldRef;
        send(0, 1, 0, 1100);
        output.heldAtContactSample = product.userData.equipmentOwner === def.id;
        send(30, 1, 0, 1180);
        send(30, 0, 0, 1200, 'robotOutputEdge');
        output.heldAfterPulse = product.userData.equipmentOwner === def.id;
        send(30, 0, 1, 1204, 'robotOutputEdge');
        output.releasedAfterPulse = !product.userData.equipmentOwner && !def.runtime.vacuumActive;
        a.disconnectVirtualController(controller);
        return output;
    });
    expect(result.heldAtSignal).toBe(true); expect(result.held).toBe(true); expect(result.moved).toBeGreaterThan(10);
    expect(result.released).toBe(true); expect(result.releaseError).toBeLessThan(1e-6); expect(result.stayed).toBeLessThan(1e-6); expect(result.active).toBe(false);
    expect(result.waitingAtPulseStart).toBe(true); expect(result.heldAtContactSample).toBe(true);
    expect(result.heldAfterPulse).toBe(true); expect(result.releasedAfterPulse).toBe(true);
    expect(errors).toEqual([]);
});
