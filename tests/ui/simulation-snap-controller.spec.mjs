import { test, expect } from '@playwright/test';

test('1번 컨트롤러 연결 중 2번 스냅 이동과 면 정렬은 동작하고 1번은 보호된다', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__snapController = { state, THREE, loadModelFromServer, selectSceneModel, registerVirtualControllerSession, moveRobotTcpToSimulationSnap, applySnapFaceOrientation, getRobotControllerBaseFrame, getCurrentTcpPoseBase, updateSimulationSnapButton, updateMotionUiLock };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__snapController?.state.renderer);
  await page.locator('#model-select').selectOption('robot:IR-R10H-120');
  await page.waitForFunction(() => window.__snapController.state.activeArticulatedModel?.userData.tcpFrame);
  await page.evaluate(async () => {
    const a = window.__snapController, first = a.state.activeArticulatedModel;
    await a.loadModelFromServer(first.userData.motionModelDefinition, { append: true });
    const second = a.state.activeArticulatedModel;
    if (first === second) throw Error('Second robot not loaded');
    const controller = a.state.virtualController;
    a.registerVirtualControllerSession(controller);
    controller.targetRobotId = first.userData.motionInstanceId;
    controller.wanted = true;
    controller.status = 'streaming';
    a.selectSceneModel(second);
    a.updateMotionUiLock();
    window.__snapRobots = { first, second, firstAngles: first.userData.joints.map(joint => joint.angle) };
  });
  await expect(page.locator('#btn-snap-move')).toBeEnabled();
  await page.locator('#btn-snap-move').click();
  const moved = await page.evaluate(() => {
    const a = window.__snapController, { second } = window.__snapRobots;
    const base = a.getRobotControllerBaseFrame(second);
    second.updateMatrixWorld(true);
    const target = base.localToWorld(new a.THREE.Vector3(708, -350, 216));
    const result = a.moveRobotTcpToSimulationSnap({ worldPoint: target, type: 'center' });
    const mesh = new a.THREE.Mesh(new a.THREE.PlaneGeometry(100, 100), new a.THREE.MeshBasicMaterial());
    mesh.position.copy(target);
    mesh.userData.uploaded = true;
    a.state.scene.add(mesh);
    a.state.models.push(mesh);
    a.state.snapFaceSelections = [{ mesh, triangleIndex: 0, triangleRanges: [{ first: 0, last: 1 }] }];
    a.updateMotionUiLock();
    return { result, position: a.getCurrentTcpPoseBase(second).position.toArray() };
  });
  expect(moved.result).toBe(true);
  for (const [i, value] of [708, -350, 216].entries()) expect(moved.position[i]).toBeCloseTo(value, 2);
  for (const mode of ['vertical', 'horizontal']) {
    await expect(page.locator(`#btn-snap-face-${mode}`)).toBeEnabled();
    await page.locator(`#btn-snap-face-${mode}`).click();
    await expect(page.locator('#stat-status')).toContainText(mode === 'vertical' ? '수직' : '수평');
  }
  const protectedRobot = await page.evaluate(() => {
    const a = window.__snapController, { first, firstAngles } = window.__snapRobots;
    a.selectSceneModel(first);
    a.updateMotionUiLock();
    return { moved: a.moveRobotTcpToSimulationSnap({ worldPoint: new a.THREE.Vector3(708, -350, 216) }),
      aligned: a.applySnapFaceOrientation('vertical'),
      unchanged: first.userData.joints.every((joint, i) => joint.angle === firstAngles[i]) };
  });
  await expect(page.locator('#btn-snap-move')).toBeDisabled();
  expect(protectedRobot).toEqual({ moved: false, aligned: false, unchanged: true });
  expect(errors).toEqual([]);
});
