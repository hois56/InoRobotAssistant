import { test, expect } from '@playwright/test';

async function openSimulation(page, model) {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
window.__trackingFeedback = { state, ensureVirtualControllerCore, registerVirtualControllerSession,
    createPrimitiveShapeRoot, ensureWorkspaceModelId, equipmentApp, writeOlpSimulatorBit,
    conveyorTrackingApp, conveyorVisuals, frame(time, render, paintTime = time) {
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
        send(20, 10);
        send(40, 20);
        const first = frame(58);
        send(60, 30);
        const second = frame(72);
        const drained = frame(120);
        send(220, 80);
        const resumed = frame(220);
        tracking = false;
        send(240, 90);
        const unlinked = frame(244);
        return { first, second, drained, resumed, unlinked };
    });
    for (const [key, expected] of Object.entries({ first: [5, 20, 20, 20], second: [12, 30, 30, 30],
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
        expect(product, `workpiece at ${time} ms`).toBeCloseTo(Math.min(time - 48, 216) * .44, 5);
        expect(belt, `belt surface at ${time} ms`).toBeCloseTo(product, 5);
        expect(camera, `camera following the workpiece at ${time} ms`).toBeCloseTo(belt, 5);
        expect(robot).toBeCloseTo(mode === 'tracking' ? Math.min(time - 48, 140) * .44 : 0, 5);
    }
});
}
