import { test, expect } from '@playwright/test';

test('기본값이 아닌 저장된 Tool TCP도 스냅으로 표시하고 선택한다', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__savedTcpSnaps = { state, THREE, syncActiveTcpFrame, getSimulationSnapRobotTcpCandidates, getSketchExternalSnapCandidates, getSimulationSnapRobotSpecialCandidateSignature, renderModelTree, syncEmptyStateVisibility, requestRender };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__savedTcpSnaps?.state.workspaceRecovery.ready);
  await page.locator('#model-select').selectOption('robot:IR-R10H-120');
  await page.waitForFunction(() => window.__savedTcpSnaps.state.activeArticulatedModel?.userData.tcpFrame);
  const configured = await page.evaluate(() => {
    const a = window.__savedTcpSnaps, { state, THREE } = a, robot = state.activeArticulatedModel;
    robot.userData.activeTcpProfileIndex = 1;
    robot.userData.tcpProfiles[1].position.set(30, 50, 100);
    robot.userData.tcpProfiles[3].position.set(260, -150, 380);
    a.syncActiveTcpFrame(robot);
    const model = new THREE.Group();
    model.name = 'TCP 스냅 이동 모델';
    model.userData = { uploaded: true, placement: 'scene', modelName: model.name };
    model.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshStandardMaterial()));
    state.scene.add(model); state.models.push(model); a.model = model;
    model.position.set(-700, -400, 250);
    state.camera.position.set(1200, -3200, 2200); state.controls.target.set(0, 0, 0); state.controls.update();
    a.renderModelTree(); a.syncEmptyStateVisibility(); a.requestRender();
    return { indices: a.getSimulationSnapRobotTcpCandidates().map(candidate => candidate.tcpProfileIndex),
      target: robot.userData.flangeFrame.localToWorld(robot.userData.tcpProfiles[3].position.clone()).toArray() };
  });
  expect(configured.indices).toEqual([1, 3]);
  await page.locator('#model-tree .model-tree-button').filter({ hasText: 'TCP 스냅 이동 모델' }).click();
  await page.locator('[data-transform-mode="translate"]').click();
  await page.locator('#model-placement-snap-type').selectOption('robot-tcp');
  await expect(page.locator('.simulation-snap-candidate-marker[data-snap-type="robot-tcp"]:visible')).toHaveCount(2);
  const point = await page.evaluate(() => {
    const { state, THREE } = window.__savedTcpSnaps;
    const candidate = state.snapCandidates.find(candidate => candidate.tcpProfileIndex === 3);
    const projected = candidate.localPoint.clone().applyMatrix4(candidate.mesh.matrixWorld).project(state.camera);
    const rect = state.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('#model-placement-hover-readout')).toContainText('Tool 3 TCP');
  await expect(page.locator('#simulation-snap-label')).toContainText('Tool 3 TCP');
  await page.mouse.click(point.x, point.y);
  const chosen = await page.evaluate(() => window.__savedTcpSnaps.state.placement.sourceWorldPoint?.toArray());
  configured.target.forEach((value, axis) => expect(chosen[axis]).toBeCloseTo(value, 5));
  const checks = await page.evaluate(() => {
    const a = window.__savedTcpSnaps, robot = a.state.activeArticulatedModel;
    const sketch = a.getSketchExternalSnapCandidates().find(candidate => candidate.label === 'Tool 3 TCP');
    const before = a.getSimulationSnapRobotSpecialCandidateSignature(a.getSimulationSnapRobotTcpCandidates());
    robot.userData.tcpProfiles[3].position.x += 10;
    const after = a.getSimulationSnapRobotSpecialCandidateSignature(a.getSimulationSnapRobotTcpCandidates());
    robot.userData.activeTcpProfileIndex = 0; a.syncActiveTcpFrame(robot);
    const zero = a.getSimulationSnapRobotTcpCandidates().map(candidate => candidate.tcpProfileIndex);
    robot.userData.modelTreeHidden = true;
    return { sketch: sketch.point.toArray(), changed: before !== after, zero,
      hidden: a.getSimulationSnapRobotTcpCandidates().length };
  });
  configured.target.slice(0, 2).forEach((value, axis) => expect(checks.sketch[axis]).toBeCloseTo(value, 5));
  expect(checks.sketch[2]).toBe(0);
  expect(checks.changed).toBe(true);
  expect(checks.zero).toEqual([0, 1, 3]);
  expect(checks.hidden).toBe(0);
  expect(errors).toEqual([]);
});
