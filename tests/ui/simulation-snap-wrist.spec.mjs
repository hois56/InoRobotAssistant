import { test, expect } from '@playwright/test';

for (const model of ['IR-R10H-120', 'IR-R20H-120']) test(`영점에서 스냅 이동 후 바닥 수직 정렬은 J4 영점을 우선한다 (${model})`, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__snapWrist = { state, THREE, moveRobotTcpToSimulationSnap, applySnapFaceOrientation, getCurrentTcpPoseBase, getTcpRotationDegrees, updateSnapFaceOrientationUi };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__snapWrist?.state.renderer);
  await page.locator('#model-select').selectOption(`robot:${model}`);
  await page.waitForFunction(() => window.__snapWrist.state.models.some(m => m.userData.tcpFrame));
  const before = await page.evaluate(() => {
    const a = window.__snapWrist;
    const robot = a.state.models.find(m => m.userData.tcpFrame);
    const zero = robot.userData.joints.map(j => j.angle);
    a.state.snapMoveMode = true;
    const mesh = new a.THREE.Mesh(new a.THREE.PlaneGeometry(100, 100), new a.THREE.MeshBasicMaterial());
    mesh.position.set(708, -350, 216);
    mesh.userData.uploaded = true;
    a.state.scene.add(mesh);
    a.state.models.push(mesh);
    const moved = a.moveRobotTcpToSimulationSnap({ worldPoint: mesh.position.clone(), type: 'center' });
    a.state.snapFaceSelections = [{ mesh, triangleIndex: 0, triangleRanges: [{ first: 0, last: 1 }] }];
    a.updateSnapFaceOrientationUi();
    return { zero, moved, position: a.getCurrentTcpPoseBase(robot).position.toArray() };
  });
  expect(before.zero.every(angle => angle === 0)).toBe(true);
  expect(before.moved).toBe(true);
  await page.locator('#btn-snap-face-vertical').click();
  const after = await page.evaluate(() => {
    const a = window.__snapWrist, robot = a.state.models.find(m => m.userData.tcpFrame);
    const pose = a.getCurrentTcpPoseBase(robot);
    return { angles: robot.userData.joints.map(j => ({ angle: j.angle, min: j.definition.min, max: j.definition.max })),
      position: pose.position.toArray(), rotation: a.getTcpRotationDegrees(robot, pose) };
  });
  expect(Math.abs(after.angles[3].angle)).toBeLessThan(1);
  expect(Math.abs(after.rotation.ry)).toBeLessThan(0.01);
  for (let i = 0; i < 3; i++) expect(Math.abs(after.position[i] - before.position[i])).toBeLessThan(0.002);
  for (const j of after.angles) { expect(j.angle).toBeGreaterThanOrEqual(j.min); expect(j.angle).toBeLessThanOrEqual(j.max); }
  expect(errors).toEqual([]);
});
