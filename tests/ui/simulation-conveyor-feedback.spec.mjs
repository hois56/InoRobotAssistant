import { test, expect } from '@playwright/test';

async function openSimulation(page, model) {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
window.__trackingFeedback = { state, ensureVirtualControllerCore, registerVirtualControllerSession,
    createPrimitiveShapeRoot, ensureWorkspaceModelId, equipmentApp, writeOlpSimulatorBit,
    conveyorTrackingApp, conveyorVisuals, conveyorDisplay, THREE, getRobotToolMountFrame, setJointAngle,
    handleVirtualControllerMessage, applyVirtualControllerFrameForController, disconnectVirtualController,
    updateConveyorSimulation, frame(time, render, paintTime = time) {
        const original = renderSimulationScene;
        renderSimulationScene = render;
        try { animate(time, paintTime); } finally { renderSimulationScene = original; }
    } };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__trackingFeedback?.state.workspaceRecovery.ready);
    await page.locator('#model-select').selectOption(model);
    await page.waitForFunction(() => window.__trackingFeedback.state.activeArticulatedModel?.userData.tcpFrame);
}

test('conveyor tracking paints between controller samples and restores the live pose', async ({ page }) => {
    await openSimulation(page, 'robot:IR-S10-80Z20');
    const result = await page.evaluate(async () => {
        const api = window.__trackingFeedback;
        const robot = api.state.activeArticulatedModel;
        const controller = api.state.virtualController;
        await api.ensureVirtualControllerCore(controller);
        api.registerVirtualControllerSession(controller);
        controller.targetRobotId = robot.userData.motionInstanceId;
        controller.source = 'bridge';
        controller.wanted = true;
        controller.status = 'streaming';
        api.state.renderFpsLimited = false;
        let tracking = true;
        Object.defineProperty(api.conveyorTrackingApp, 'active', { get: () => tracking });
        api.conveyorTrackingApp.isTrackingController = candidate => tracking && candidate === controller;
        const start = performance.now();
        const joint = robot.userData.joints[0];
        const angleOfMesh = () => Math.atan2(joint.group.matrixWorld.elements[1], joint.group.matrixWorld.elements[0]) * 180 / Math.PI;
        const initialAngle = angleOfMesh() - joint.angle;
        const send = (time, angle) => controller.samples.push({ kind: 'state', receivedAt: start + time,
            joints: [angle, 0, 0, 0], position: [angle, 0, 0], rotation: [0, 0, 0] });
        const frame = time => {
            let painted;
            api.frame(start + time, () => {
                robot.updateMatrixWorld(true);
                painted = angleOfMesh() - initialAngle;
            });
            return [painted, joint.angle, angleOfMesh() - initialAngle, robot.userData.controllerTcpPose.readout.position.x];
        };
        send(0, 0);
        frame(0);
        send(10, 10);
        send(20, 20);
        const first = frame(21);
        send(30, 30);
        const second = frame(32);
        const drained = frame(120);
        send(220, 80);
        const resumed = frame(220);
        tracking = false;
        send(240, 90);
        const unlinked = frame(244);
        return { first, second, drained, resumed, unlinked };
    });
    for (const [key, expected] of Object.entries({ first: [5, 20, 20, 20], second: [16, 30, 30, 30],
        drained: [30, 30, 30, 30], resumed: [80, 80, 80, 80], unlinked: [90, 90, 90, 90] })) {
        expected.forEach((value, index) => expect(result[key][index], `${key}[${index}]`).toBeCloseTo(value, 5));
    }
});

for (const mode of ['tracking', 'stationary linked', 'standalone']) {
test(`440 mm/s belt and workpiece follow the display clock with ${mode} robot`, async ({ page }) => {
    await openSimulation(page, 'robot:IR-R7H-90');
    const frames = await page.evaluate(async mode => {
        const api = window.__trackingFeedback;
        const { state } = api;
        const robot = state.activeArticulatedModel;
        const controller = state.virtualController;
        await api.ensureVirtualControllerCore(controller);
        api.registerVirtualControllerSession(controller);
        Object.assign(controller, { targetRobotId: robot.userData.motionInstanceId, ipAddress: '127.0.0.2',
            source: 'bridge', controllerKind: 'virtual', wanted: true, status: 'streaming',
            socket: { readyState: WebSocket.OPEN, bufferedAmount: 0, send() {} } });
        state.renderFpsLimited = false;
        // Use a linear axis so the displayed displacement can be compared in millimetres.
        const joint = robot.userData.joints[0];
        joint.definition = { ...joint.definition, type: 'prismatic', min: -1000, max: 1000 };
        joint.axis.set(1, 0, 0);
        joint.angle = NaN;
        const box = (name, dimensions, xyz) => {
            const model = api.createPrimitiveShapeRoot('box', dimensions, { name });
            model.position.fromArray(xyz);
            state.scene.add(model);
            state.models.push(model);
            return model;
        };
        const belt = box('Tracking belt', { x: 1000, y: 160, z: 30 }, [0, 1000, 0]);
        const surface = belt.getObjectByProperty('isMesh', true);
        surface.userData.cadPartName = 'Endless_belt_test';
        const product = box('Tracking product', { x: 40, y: 40, z: 40 }, [-250, 1000, 30]);
        state.selectedModel = product;
        state.selectedModelPart = null;
        state.selectedViewPivot.enabled = true;
        const beltRef = 'conveyor:' + api.ensureWorkspaceModelId(belt);
        api.equipmentApp.save({ id: 'tracking-product', type: 'OBJECT',
            movingRef: 'equipment-model:' + api.ensureWorkspaceModelId(product) + '/-1' });
        state.ioFunctionMappings = [{ id: 'tracking-belt', action: 'CONVEYOR', gripObjectRef: beltRef,
            conveyorAxis: 'X', conveyorSpeed: 440, direction: 'OUT', address: 512, triggerValue: 1, enabled: true }];
        if (mode !== 'standalone') {
            api.conveyorTrackingApp.open();
            document.querySelector('#conveyor-tracking-dialog [data-action="connect"]').click();
            if (!api.conveyorTrackingApp.isTrackingController(controller)) throw new Error('Tracking link did not open');
        }
        const start = performance.now();
        const send = time => controller.samples.push({ kind: 'state', receivedAt: start + time,
            sequence: time / 20 + 1, controllerTime: 1800000000000 + time,
            joints: [mode === 'tracking' ? .44 * time : 0, 0, 0, 0, 0, 0], position: [0, 0, 0], rotation: [0, 0, 0] });
        send(0);
        api.frame(start, () => {});
        api.writeOlpSimulatorBit('OUT', 512, 1);
        api.frame(start, () => {});
        const origin = product.position.x;
        const initialCamera = state.camera.position.x;
        const travel = api.conveyorVisuals.getBeltAnimation(surface.material).travel;
        const initialTravel = travel.value;
        let nextSample = 20;
        const frames = [];
        for (const time of [16, 32, 48, 64, 80, 96, 112, 128, 144, 176, 196, 216]) {
            while (nextSample <= Math.min(time, 140)) {
                send(nextSample);
                nextSample += 20;
            }
            let painted;
            const late = time % 3 * 4;
            api.frame(start + time + late, () => {
                painted = [joint.group.position.x - joint.basePosition.x, product.position.x - origin,
                    travel.value - initialTravel, state.camera.position.x - initialCamera];
            }, start + time);
            if (time >= 48) frames.push({ time, late, painted, live: product.position.x - origin, liveTravel: travel.value - initialTravel });
        }
        api.writeOlpSimulatorBit('OUT', 512, 0);
        for (const time of [232, 248, 264, 280]) {
            let painted;
            api.frame(start + time, () => {
                painted = [joint.group.position.x - joint.basePosition.x, product.position.x - origin,
                    travel.value - initialTravel, state.camera.position.x - initialCamera];
            });
            frames.push({ time, late: 0, painted, live: product.position.x - origin, liveTravel: travel.value - initialTravel });
        }
        return frames;
    }, mode);
    for (const { time, late, painted: [robot, product, belt, camera], live, liveTravel } of frames) {
        expect(live).toBeCloseTo(Math.min(time + late, 216) * .44, 5);
        expect(liveTravel).toBeCloseTo(live, 5);
        expect(product, `workpiece at ${time} ms`).toBeCloseTo(Math.min(time - 16, 216) * .44, 5);
        expect(belt, `belt surface at ${time} ms`).toBeCloseTo(product, 5);
        expect(camera, `camera following the workpiece at ${time} ms`).toBeCloseTo(belt, 5);
        expect(robot).toBeCloseTo(mode === 'tracking' ? Math.min(time - 16, 140) * .44 : 0, 5);
    }
});
}

test('a delayed K14 pose acquires and releases at the workpiece position of that same sample', async ({ page }) => {
    await openSimulation(page, 'robot:IR-S7-50Z20');
    const results = await page.evaluate(exerciseConveyorGrip);
    expect(results).toHaveLength(21);
    for (const row of results) {
        expect(row.gripError, JSON.stringify(row)).toBeCloseTo(0, 5);
        expect(row.trayError, JSON.stringify(row)).toBeCloseTo(0, 5);
    }
});

async function exerciseConveyorGrip() {
    const a = window.__trackingFeedback;
    const { THREE, state, equipmentApp, conveyorTrackingApp, conveyorDisplay } = a;
    const robot = state.activeArticulatedModel;
    const controller = state.virtualController;
    await a.ensureVirtualControllerCore(controller);
    a.registerVirtualControllerSession(controller);
    Object.assign(controller, { targetRobotId: robot.userData.motionInstanceId, ipAddress: '127.0.0.2',
        source: 'bridge', controllerKind: 'virtual', wanted: true, status: 'streaming',
        socket: { readyState: WebSocket.OPEN, bufferedAmount: 0, send() {}, close() {} } });

    // A linear test axis isolates pickup timing from inverse kinematics.
    const joint = robot.userData.joints[0];
    joint.definition = { ...joint.definition, type: 'prismatic', min: -1000, max: 1000 };
    robot.updateMatrixWorld(true);
    joint.axis.set(1, 0, 0).transformDirection(joint.group.parent.matrixWorld.clone().invert());
    a.setJointAngle(joint, 0, false, true);
    const joints = robot.userData.joints.map(axis => axis.angle);
    const box = (name, dimensions) => a.createPrimitiveShapeRoot('box', dimensions, { name });
    const ref = model => 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
    const position = model => model.getWorldPosition(new THREE.Vector3());
    const tool = box('Vacuum pad', { x: 20, y: 20, z: 20 });
    a.getRobotToolMountFrame(robot).add(tool);
    tool.position.z = 100;
    tool.userData.placement = 'tcp';
    tool.userData.attachmentHost = robot;
    state.models.push(tool);
    const product = box('Workpiece', { x: 20, y: 20, z: 20 });
    const origin = tool.localToWorld(new THREE.Vector3(0, 0, 20.25));
    const orientation = tool.getWorldQuaternion(new THREE.Quaternion());
    product.position.copy(origin);
    product.quaternion.copy(orientation);
    state.scene.add(product);
    state.models.push(product);
    const belt = box('Fixture belt', { x: 1000, y: 160, z: 30 });
    const bottom = new THREE.Box3().setFromObject(product).min.z;
    belt.position.set(origin.x, origin.y, bottom + 0.1 - new THREE.Box3().setFromObject(belt).max.z);
    state.scene.add(belt);
    state.models.push(belt);
    equipmentApp.save({ id: 'sync-part', type: 'OBJECT', movingRef: ref(product) });
    const vacuum = equipmentApp.save({ id: 'sync-vacuum', type: 'VACUUM', movingRef: ref(tool),
        vacuumMode: 'WHOLE' }, { forward: 10, reverse: 11 });
    const mapping = { id: 'sync-belt', action: 'CONVEYOR', gripObjectRef: 'conveyor:' + a.ensureWorkspaceModelId(belt),
        conveyorAxis: 'X', conveyorSpeed: 100, direction: 'OUT', address: 512, triggerValue: 1, enabled: true };
    state.ioFunctionMappings.push(mapping);
    conveyorTrackingApp.open();
    document.querySelector('#conveyor-tracking-dialog [data-action="connect"]').click();
    if (!conveyorTrackingApp.isTrackingController(controller)) throw new Error('Tracking link did not open');

    const initialGap = origin.clone().sub(position(tool));
    let now = Math.ceil(performance.now()), sequence = 0;
    const step = time => { now = time; a.updateConveyorSimulation(time); };
    const send = (travel, time, forward = 0, reverse = 0, type = 'robotState') => {
        const pose = [...joints];
        pose[0] = travel;
        a.handleVirtualControllerMessage({ type, data: { sequence: ++sequence,
            timestamp: performance.timeOrigin + time, joints: pose, outputs: { 10: forward, 11: reverse } } }, controller);
        a.applyVirtualControllerFrameForController(now, controller);
    };
    const results = [];
    const trials = [100, 440].flatMap(speed => Array.from({ length: 9 }, (_, index) => ({ speed, delay: index * 3 })));
    trials.push({ speed: 440, delay: 80, stop: true }, { speed: 440, delay: 20, waiting: true },
        { speed: 440, delay: 5, catchUp: true });
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
    try {
        for (const trial of trials) {
            const { speed, delay, stop, waiting, catchUp } = trial;
            const start = now + 20;
            a.writeOlpSimulatorBit('OUT', 512, 0);
            step(start);
            send(0, start);
            product.position.copy(origin);
            product.quaternion.copy(orientation);
            product.updateWorldMatrix(true, true);
            mapping.conveyorSpeed = speed;
            a.writeOlpSimulatorBit('OUT', 512, 1);
            const sampleTime = start + 40;
            const arrival = sampleTime + delay;
            const travel = speed * .04;
            step(start + 20);
            if (waiting) {
                send(-100, now - 2, 1, 0, 'robotOutputEdge');
                if (!vacuum.runtime.vacuumActive || vacuum.runtime.heldRef) throw new Error('Expected vacuum to wait for contact');
                if (Math.abs(position(product).x - origin.x - speed * .02) > 1e-6) throw new Error('Unpicked workpiece did not stay at its live position');
            }
            if (catchUp) step(sampleTime - 6);
            else {
                step(sampleTime + (stop ? 8 : 0));
                if (stop) a.writeOlpSimulatorBit('OUT', 512, 0);
                step(arrival);
            }
            if (stop) conveyorDisplay.paint(arrival - 16, () => {});
            now = arrival;
            const liveTravel = position(product).x - origin.x;
            send(travel, sampleTime, 1, 0, waiting ? 'robotState' : 'robotOutputEdge');
            if (product.userData.equipmentOwner !== vacuum.id) throw new Error(`Workpiece was not acquired: ${JSON.stringify(trial)}`);
            const gripError = position(product).sub(position(tool)).sub(initialGap).x;
            now += 20;
            send(150, now, 0, 1, 'robotOutputEdge');
            if (product.userData.equipmentOwner || vacuum.runtime.heldRef) throw new Error('Workpiece was not released');
            const trayError = position(product).x - origin.x - 150;
            results.push({ ...trial, liveTravel, gripError, trayError });
        }
        return results;
    } finally {
        a.disconnectVirtualController(controller);
        delete performance.now;
    }
}
