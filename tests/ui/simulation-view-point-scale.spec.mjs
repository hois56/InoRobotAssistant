import { test, expect } from '@playwright/test';

for (const detached of [false, true]) test(`${detached ? '분리 창' : '페이지'}의 고정 뷰 포인트 크기와 라벨 가시성은 각 카메라를 따른다`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/^init\(\);/m, 'window.__simulationReady = init();');
    await route.fulfill({ response, body: `${source}\nwindow.__pointViews = { state, THREE, ensureMotionProgram, captureRobotMotionStep, updateTeachingPointDisplay, openViewWindow, requestRender };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__pointViews);
  await page.evaluate(() => window.__simulationReady);
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.waitForFunction(() => window.__pointViews.state.activeProgramRobot?.userData.tcpFrame);
  await page.evaluate(() => {
    const a = window.__pointViews, { state, THREE } = a;
    const robot = state.activeProgramRobot, program = a.ensureMotionProgram(robot);
    const step = a.captureRobotMotionStep(robot);
    step.label = 'View independent point';
    program.steps = [step]; program.selectedStepId = step.id;
    Object.assign(state.teachingPoints, { enabled: true, labels: true, xray: true, labelMode: 'both' });
    a.updateTeachingPointDisplay();
    const center = state.teachingPoints.scene.points[0].position;
    state.camera.position.copy(center).add(new THREE.Vector3(0, -900, 0));
    state.controls.target.copy(center); state.controls.update();
    a.openViewWindow(0); a.openViewWindow(1);
    for (const [slot, distance] of [[0, 500], [1, 1600]]) {
      const cell = state.viewWindow.cells.get(slot);
      cell.camera.position.copy(center).add(new THREE.Vector3(0, -distance, 0));
      cell.controls.target.copy(center); cell.controls.update();
    }
    window.__pointDraws = {};
    function observe(renderer, camera, key) {
      const original = renderer.render;
      renderer.render = function(scene, renderCamera) {
        const result = original.call(this, scene, renderCamera);
        if (scene === state.scene && renderCamera === camera) {
          const overlay = state.teachingPoints.scene;
          const position = overlay.points[0].position;
          const height = renderer.domElement.clientHeight;
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
          const pixels = worldSize => {
            const top = position.clone().addScaledVector(up, worldSize / 2).project(camera);
            const bottom = position.clone().addScaledVector(up, -worldSize / 2).project(camera);
            return Math.abs(top.y - bottom.y) * height / 2;
          };
          window.__pointDraws[key] = { frame: (window.__pointDraws[key]?.frame || 0) + 1,
            marker: pixels(overlay.selection.scale.y), label: pixels(overlay.detailLabel.scale.y),
            axes: pixels(overlay.axes.scale.y), visible: overlay.detailLabel.visible,
            markerWorld: overlay.selection.scale.y, camera: camera.position.toArray() };
        }
        return result;
      };
    }
    observe(state.renderer, state.camera, 'main');
    for (const cell of state.viewWindow.cells.values()) observe(cell.renderer, cell.camera, String(cell.slot));
    a.requestRender();
  });
  let popup = null;
  if (detached) {
    const opened = page.waitForEvent('popup');
    await page.locator('#view-window-popout').click();
    popup = await opened;
    popup.on('pageerror', error => errors.push(error.message));
  }
  await expect.poll(() => page.evaluate(() => Boolean(window.__pointDraws['1']))).toBe(true);
  const before = await page.evaluate(() => structuredClone(window.__pointDraws));
  await page.evaluate(() => {
    const a = window.__pointViews;
    a.state.camera.position.sub(a.state.controls.target).multiplyScalar(2).add(a.state.controls.target);
    a.state.controls.update(); a.requestRender();
  });
  await expect.poll(() => page.evaluate(() => window.__pointDraws['1'].frame)).toBeGreaterThan(before['1'].frame);
  const afterMainZoom = await page.evaluate(() => structuredClone(window.__pointDraws));
  expect(afterMainZoom.main.camera).not.toEqual(before.main.camera);
  for (const slot of ['0', '1']) {
    expect(afterMainZoom[slot].camera).toEqual(before[slot].camera);
    for (const field of ['marker', 'label', 'axes']) expect(afterMainZoom[slot][field]).toBeCloseTo(before[slot][field], 5);
    expect(afterMainZoom[slot].marker).toBeCloseTo(17, 5);
    expect(afterMainZoom[slot].label).toBeCloseTo(22, 5);
    expect(afterMainZoom[slot].axes).toBeCloseTo(42, 5);
  }
  await page.evaluate(() => {
    const a = window.__pointViews, cell = a.state.viewWindow.cells.get(0);
    cell.camera.position.sub(cell.controls.target).multiplyScalar(3).add(cell.controls.target);
    cell.controls.update(); a.requestRender();
  });
  await expect.poll(() => page.evaluate(() => window.__pointDraws['0'].frame)).toBeGreaterThan(afterMainZoom['0'].frame);
  const afterCellZoom = await page.evaluate(() => structuredClone(window.__pointDraws));
  for (const key of ['main', '0', '1']) {
    expect(afterCellZoom[key].marker).toBeCloseTo(17, 5);
    expect(afterCellZoom[key].label).toBeCloseTo(22, 5);
  }
  // A point outside the main camera still needs a label in a fixed view that sees it.
  await page.evaluate(() => {
    const a = window.__pointViews;
    a.state.controls.target.x += 100_000; a.state.controls.update(); a.requestRender();
  });
  await expect.poll(() => page.evaluate(() => window.__pointDraws.main.visible)).toBe(false);
  const final = await page.evaluate(() => ({ samples: window.__pointDraws,
    restored: window.__pointViews.state.teachingPoints.scene.selection.scale.y }));
  expect(final.samples['0'].visible && final.samples['1'].visible).toBe(true);
  expect(final.restored).toBeCloseTo(final.samples.main.markerWorld, 5);
  await (popup || page).locator('#view-window').screenshot({ path: testInfo.outputPath('independent-point-sizes.png') });
  expect(errors).toEqual([]);
});
