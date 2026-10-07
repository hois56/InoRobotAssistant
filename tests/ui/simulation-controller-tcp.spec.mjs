import { test, expect } from '@playwright/test';

test('R7H-90 controller TCP controls JOG, endpoint and MTCP with Tool/Wobj while keeping the received arm configuration', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__controllerTcp = {state,THREE,ensureVirtualControllerCore,registerVirtualControllerSession,handleVirtualControllerMessage,applyVirtualControllerFrameForController,getCurrentTcpPoseBase,getRobotWorldTcpPoint,getRobotToolWorldTransform,getMtcpProfileWorldPoint,syncActiveTcpFrame,getJogReadoutPose,calculatePointArmParameters,disconnectVirtualController};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__controllerTcp);
  await page.locator('#model-select').selectOption('robot:IR-R7H-90');
  await page.waitForFunction(() => window.__controllerTcp.state.models.some(model => model.userData.tcpFrame));
  const result = await page.evaluate(async () => {
    const a = window.__controllerTcp;
    const robot = a.state.activeArticulatedModel;
    robot.userData.tcpProfiles[0].position.set(30, -20, 150);
    robot.userData.tcpProfiles[0].quaternion.setFromEuler(new a.THREE.Euler(0.2, -0.1, 0.3, 'ZYX'));
    a.syncActiveTcpFrame(robot);
    robot.userData.workObjects[1] = { index: 1, defined: true, position: [130, -70, 40], rotation: [10, -20, 30] };
    robot.userData.activeWorkObjectIndex = 1;
    const flange = robot.userData.flangeFrame;
    window.__originalMount = { position: flange.position.toArray(), quaternion: flange.quaternion.toArray() };
    const controller = a.state.virtualController;
    await a.ensureVirtualControllerCore(controller);
    a.registerVirtualControllerSession(controller);
    controller.targetRobotId = robot.userData.motionInstanceId;
    controller.source = 'bridge';
    controller.wanted = true;
    controller.status = 'streaming';
    controller.streamWatchdogTimer = 1;
    const joints = [20, -30, 40, -110, 60, 200];
    a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: { joints, tcp: [708, -292, 215, 0, 0, 180] } }), controller);
    a.applyVirtualControllerFrameForController(performance.now(), controller);
    const tcpWorld = a.getRobotWorldTcpPoint(robot);
    const mtcp = a.getMtcpProfileWorldPoint(robot, a.getRobotToolWorldTransform(robot), 0).toArray();
    return { joints: robot.userData.joints.map(joint => joint.angle), arm: a.calculatePointArmParameters(robot),
      distance: new a.THREE.Vector3().fromArray(tcpWorld).distanceTo(new a.THREE.Vector3().fromArray(mtcp)) };
  });
  expect(result.joints).toEqual([20, -30, 40, -110, 60, 200]);
  expect(result.arm).toEqual([0, -2, 2, 1]);
  expect(result.distance).toBeLessThan(1e-7);
  for (const [key, value] of Object.entries({ x: '708.00', y: '-292.00', z: '215.00' })) {
    await expect(page.locator('#tcp-' + key)).toHaveValue(value);
  }
  expect(Math.abs(Number(await page.locator('#tcp-rx').inputValue()))).toBeCloseTo(180, 2);
  expect(Number(await page.locator('#tcp-ry').inputValue())).toBeCloseTo(0, 2);
  expect(Number(await page.locator('#tcp-rz').inputValue())).toBeCloseTo(0, 2);
  const restored = await page.evaluate(() => {
    const a = window.__controllerTcp, robot = a.state.activeArticulatedModel;
    a.disconnectVirtualController(a.state.virtualController);
    const original = window.__originalMount;
    return { positionError: robot.userData.flangeFrame.position.distanceTo(new a.THREE.Vector3().fromArray(original.position)),
      rotationError: robot.userData.flangeFrame.quaternion.angleTo(new a.THREE.Quaternion().fromArray(original.quaternion)),
      profile: robot.userData.tcpProfiles[0].position.toArray(), corrected: Boolean(robot.userData.controllerTcpPose) };
  });
  expect(restored.positionError).toBeLessThan(1e-8);
  expect(restored.rotationError).toBeLessThan(1e-7);
  expect(restored.profile).toEqual([30, -20, 150]);
  expect(restored.corrected).toBe(false);
  expect(errors).toEqual([]);
});
