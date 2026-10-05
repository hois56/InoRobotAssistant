import { expect, test } from '@playwright/test';

test('실제 SCARA 모델의 설치면 원점, TCP Z, JOG 핸들과 프로젝트 저장 좌표를 분리한다', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Inspect the running module without adding a production debug API.
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n
      window.__scaraOriginTest = { state, THREE, getCurrentTcpPoseBase,
        getRobotControllerBaseFrame, serializeMotionProject, setJogMode,
        solveScaraIK, loadArticulatedRobot, restoreRobotControllerBaseTransform };` });
  });
  await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#model-select option[value="robot:IR-S10-80Z20"]')).toHaveCount(1, { timeout: 30_000 });
  await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');
  await page.waitForFunction(() => window.__scaraOriginTest?.state.models.some(model => model.userData.tcpFrame), { timeout: 60_000 });
  const result = await page.evaluate(async () => {
    const api = window.__scaraOriginTest;
    const { THREE, state } = api;
    const robot = state.models.find(model => model.userData.tcpFrame);
    robot.updateMatrixWorld(true);
    const frame = api.getRobotControllerBaseFrame(robot);
    const baseMesh = frame.children.find(child => child.userData.collisionRole === 'robot-mounted-base');
    const pose = api.getCurrentTcpPoseBase(robot);
    api.setJogMode('base');
    const gizmo = state.baseJogGizmoTarget;
    const gizmoError = gizmo.getWorldPosition(new THREE.Vector3())
      .distanceTo(robot.userData.tcpFrame.getWorldPosition(new THREE.Vector3()));
    const tubeParentCorrect = robot.userData.scaraTube.parent === frame;
    const baseZ = new THREE.Box3().setFromObject(baseMesh).min.z;
    const positions = baseMesh.geometry.getAttribute('position');
    const bounds = baseMesh.geometry.boundingBox;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let index = 0; index < positions.count; index++) {
      if (positions.getZ(index) > bounds.min.z + 0.01) continue;
      minX = Math.min(minX, positions.getX(index));
      maxX = Math.max(maxX, positions.getX(index));
    }
    const mountingCenterX = baseMesh.localToWorld(new THREE.Vector3((minX + maxX) / 2, 0, bounds.min.z)).x;
    const initial = { rootX: robot.position.x, rootZ: robot.position.z, mountingCenterX,
      datumX: frame.position.x, tcpX: pose.position.x, baseZ, tcpZ: pose.position.z,
      worldTcpZ: robot.userData.tcpFrame.getWorldPosition(new THREE.Vector3()).z,
      datumZ: frame.position.z, gizmoError, tubeParentCorrect };
    const target = { position: pose.position.clone().add(new THREE.Vector3(-20, 20, -25)),
      quaternion: pose.quaternion.clone() };
    const solved = api.solveScaraIK(robot, target);
    const saved = api.serializeMotionProject().robots[0];
    const restored = await api.loadArticulatedRobot(state.catalog.get('robot:IR-S10-80Z20'));
    api.restoreRobotControllerBaseTransform(restored, saved.baseTransform);
    const savePositionError = api.getRobotControllerBaseFrame(restored).getWorldPosition(new THREE.Vector3())
      .distanceTo(frame.getWorldPosition(new THREE.Vector3()));
    return { initial, solved: solved.success, positionError: solved.positionError, savePositionError };
  });
  expect(result.initial.rootZ).toBe(0);
  expect(result.initial.rootX).toBe(0);
  expect(Math.abs(result.initial.mountingCenterX)).toBeLessThan(0.01);
  expect(result.initial.datumX).toBeCloseTo(36.5, 3);
  expect(result.initial.tcpX).toBeCloseTo(800, 3);
  expect(Math.abs(result.initial.baseZ)).toBeLessThan(0.01);
  expect(Math.abs(result.initial.tcpZ)).toBeLessThan(0.01);
  expect(result.initial.datumZ).toBeGreaterThan(100);
  expect(result.initial.worldTcpZ).toBeCloseTo(result.initial.datumZ, 3);
  expect(result.initial.gizmoError).toBeLessThan(0.01);
  expect(result.initial.tubeParentCorrect).toBe(true);
  expect(result.solved).toBe(true);
  expect(result.positionError).toBeLessThan(0.01);
  expect(result.savePositionError).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});
