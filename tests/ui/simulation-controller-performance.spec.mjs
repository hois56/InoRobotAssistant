import { test, expect } from '@playwright/test';

test('controller feedback batches pose side effects and leaves unchanged poses out of collision recalculation', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
const controllerPerfCounts = { collision: 0, origin: 0, home: 0 };
const originalPerfMark = markSceneCollisionDirty;
markSceneCollisionDirty = (...args) => { controllerPerfCounts.collision++; return originalPerfMark(...args); };
const originalPerfOrigin = syncWorkOriginOutputStates;
syncWorkOriginOutputStates = (...args) => { controllerPerfCounts.origin++; return originalPerfOrigin(...args); };
const originalPerfHome = syncOlpHomeStatus;
syncOlpHomeStatus = (...args) => { controllerPerfCounts.home++; return originalPerfHome(...args); };
window.__controllerPerf = { state, THREE, controllerPerfCounts, ensureVirtualControllerCore, registerVirtualControllerSession,
  applyVirtualControllerFrameForController, disconnectVirtualController, getCurrentTcpPoseBase, getJogReadoutPose };
` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__controllerPerf);
  await page.locator('#model-select').selectOption('robot:IR-R7H-90');
  await page.waitForFunction(() => window.__controllerPerf.state.activeArticulatedModel?.userData.tcpFrame);
  const result = await page.evaluate(async () => {
    const a = window.__controllerPerf, robot = a.state.activeArticulatedModel;
    const controller = a.state.virtualController;
    await a.ensureVirtualControllerCore(controller);
    a.registerVirtualControllerSession(controller);
    controller.targetRobotId = robot.userData.motionInstanceId;
    controller.source = 'bridge';
    controller.wanted = true;
    controller.status = 'streaming';
    controller.lastRateUpdateAt = performance.now();
    // A detailed attached Tool increases the cost of redundant world-matrix traversals.
    const attachment = new a.THREE.Group();
    for (let i = 0; i < 1000; i++) attachment.add(new a.THREE.Object3D());
    robot.userData.flangeFrame.add(attachment);
    let frame = 0;
    const send = (moving = false) => {
      const delta = moving ? ++frame * 0.01 : 0;
      controller.samples.push({ kind: 'state', receivedAt: performance.now(),
        joints: [20 + delta, -30 + delta, 40 + delta, -110 + delta, 60 + delta, 200 + delta],
        position: [708 + delta, -292, 215], rotation: [0, 0, 180] });
      a.applyVirtualControllerFrameForController(performance.now(), controller);
    };
    const reset = () => Object.keys(a.controllerPerfCounts).forEach(key => a.controllerPerfCounts[key] = 0);
    reset(); send(); const first = { ...a.controllerPerfCounts };
    reset(); for (let i = 0; i < 100; i++) send(); const stationary = { ...a.controllerPerfCounts };
    reset(); const durations = [];
    for (let i = 0; i < 200; i++) { const start = performance.now(); send(true); durations.push(performance.now() - start); }
    durations.sort((left, right) => left - right);
    const moving = { ...a.controllerPerfCounts };
    const pose = a.getJogReadoutPose(robot, a.getCurrentTcpPoseBase(robot));
    attachment.removeFromParent();
    a.disconnectVirtualController(controller);
    return { first, stationary, moving, medianMs: durations[100], p95Ms: durations[190],
      endpoint: pose.position.toArray(), joints: robot.userData.joints.map(joint => joint.angle) };
  });
  console.log('controller-pose-profile ' + JSON.stringify(result));
  expect(result.first).toEqual({ collision: 1, origin: 1, home: 1 });
  expect(result.stationary).toEqual({ collision: 0, origin: 0, home: 0 });
  expect(result.moving).toEqual({ collision: 200, origin: 200, home: 200 });
  expect(result.endpoint[0]).toBeCloseTo(710, 7);
  expect(result.endpoint[1]).toBeCloseTo(-292, 7);
  expect(result.endpoint[2]).toBeCloseTo(215, 7);
  expect(result.joints).toEqual([22, -28, 42, -108, 62, 202]);
});
