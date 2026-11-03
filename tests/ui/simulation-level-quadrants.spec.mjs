import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('컨트롤러 TCP 좌표계가 달라도 STEP Tool과 사분점은 관절 기준 장착 위치를 유지한다', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__levelQuadrants = { state, THREE, setJointAngle, syncActiveTcpFrame, getTcpRotationDegrees, getCurrentTcpPoseBase, getRobotControllerBaseFrame, ensureVirtualControllerCore, registerVirtualControllerSession, handleVirtualControllerMessage, applyVirtualControllerFrameForController, disconnectVirtualController, buildSimulationSnapResultForMesh };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__levelQuadrants);
  await page.locator('#model-select').selectOption('robot:IR-R7H-90');
  await page.waitForFunction(() => window.__levelQuadrants.state.activeArticulatedModel?.userData.tcpFrame);
  await page.locator('#input-import-3d').setInputFiles({ name: 'Dual_VAC_Tool.step', mimeType: 'application/octet-stream',
    buffer: readFileSync(new URL('../../2_3DSimulation/test-assets/Tool/Dual_VAC_Tool_lowered.step', import.meta.url)) });
  await page.locator('#import-placement').selectOption('tcp');
  await page.locator('#btn-confirm-import').click();
  await page.waitForFunction(() => window.__levelQuadrants.state.models.some(model => model.userData.uploaded));
  const result = await page.evaluate(async () => {
    const a = window.__levelQuadrants, T = a.THREE;
    const robot = a.state.models.find(model => model.userData.tcpFrame);
    robot.userData.activeTcpProfileIndex = 2;
    robot.userData.tcpProfiles[2].position.set(48.5, 77.5, 149.2);
    a.syncActiveTcpFrame(robot);
    const joints = [20, -40.1, 100, 0.138, 30, 0];
    joints.forEach((angle, index) => a.setJointAngle(robot.userData.joints[index], angle, false));
    const pose = a.getCurrentTcpPoseBase(robot), rotation = a.getTcpRotationDegrees(robot, pose);
    const tool = a.state.models.find(model => model.userData.uploaded), flange = robot.userData.flangeFrame;
    const original = { position: flange.position.clone(), quaternion: flange.quaternion.clone(),
      parent: flange.parent, toolPosition: tool.position.clone(), toolQuaternion: tool.quaternion.clone() };
    let circle;
    tool.traverse(mesh => {
      if (!mesh.isMesh || circle) return;
      const candidates = a.buildSimulationSnapResultForMesh(mesh, false)?.candidates || [];
      const center = candidates.find(candidate => candidate.type === 'circle-center' && Math.abs(candidate.source.radiusMm - 24.525) < 0.001);
      if (center) circle = { mesh, points: candidates.filter(candidate => candidate.type === 'quadrant' && candidate.source.chainIndex === center.source.chainIndex) };
    });
    const heights = () => circle.points.map(point => {
      circle.mesh.updateWorldMatrix(true, false);
      return a.getRobotControllerBaseFrame(robot).worldToLocal(circle.mesh.localToWorld(new T.Vector3().fromArray(point.point))).z;
    });
    const before = heights(), controller = a.state.virtualController;
    await a.ensureVirtualControllerCore(controller);
    a.registerVirtualControllerSession(controller);
    controller.targetRobotId = robot.userData.motionInstanceId;
    controller.source = 'bridge'; controller.wanted = true; controller.status = 'streaming'; controller.streamWatchdogTimer = 1;
    const send = () => {
      a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: {
        joints, tcp: [...pose.position.toArray(), rotation.rz, 0, 0]
      } }), controller);
      a.applyVirtualControllerFrameForController(performance.now(), controller);
    };
    send();
    const after = heights(); send(); const repeated = heights();
    const mountError = Math.max(flange.position.distanceTo(original.position), flange.quaternion.angleTo(original.quaternion),
      tool.position.distanceTo(original.toolPosition), tool.quaternion.angleTo(original.toolQuaternion));
    const correctedJoints = robot.userData.joints.map(joint => joint.angle);
    a.disconnectVirtualController(controller);
    return { before, after, repeated, mountError, correctedJoints, joints,
      restored: heights(), parentRestored: flange.parent === original.parent };
  });
  expect(Math.max(...result.before) - Math.min(...result.before)).toBeGreaterThan(0.05);
  expect(result.after).toHaveLength(4);
  result.after.forEach((z, i) => expect(z).toBeCloseTo(result.before[i], 7));
  expect(result.repeated).toEqual(result.after);
  expect(result.mountError).toBeLessThan(1e-7);
  expect(result.correctedJoints).toEqual(result.joints);
  expect(result.parentRestored).toBe(true);
  result.restored.forEach((z, i) => expect(z).toBeCloseTo(result.before[i], 7));
  expect(errors).toEqual([]);
});
