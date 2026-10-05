import { test, expect } from '@playwright/test';

test('고정 뷰와 팝업에서 스냅 측정하고 메인 뷰로 복귀한다', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__viewSnapTest = { state, THREE, openViewWindow, popOutViewWindow, hideViewWindow, buildSimulationSnapCandidates, requestRender };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__viewSnapTest?.state.renderer);
  await page.evaluate(async () => {
    const { state, THREE, openViewWindow, buildSimulationSnapCandidates } = window.__viewSnapTest;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial());
    mesh.userData.uploaded = true;
    mesh.name = 'view-snap-regression';
    state.scene.add(mesh);
    state.models.push(mesh);
    state.camera.position.set(0, -500, 0);
    state.controls.target.set(0, 0, 0);
    state.controls.update();
    openViewWindow(0);
    const cell = state.viewWindow.cells.get(0);
    cell.camera.position.set(500, 0, 0);
    cell.controls.target.set(0, 0, 0);
    cell.controls.update();
    // Different camera directions make a main-camera pick visibly incorrect.
    state.measurement.active = true;
    state.measurement.snapType = 'endpoint';
    state.measurement.points = [null, null];
    await buildSimulationSnapCandidates('measurement');
  });
  async function coordinate(slot, main = false) {
    return page.evaluate(({ slot, main }) => {
      const { state, THREE } = window.__viewSnapTest;
      const cell = main ? { camera: state.camera, canvas: state.renderer.domElement } : state.viewWindow.cells.get(slot);
      const point = new THREE.Vector3(50, -50, 50).project(cell.camera);
      const rect = cell.canvas.getBoundingClientRect();
      return { x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-point.y * 0.5 + 0.5) * rect.height };
    }, { slot, main });
  }
  const canvas = page.locator('.view-window-canvas');
  await canvas.click({ position: { x: (await canvas.boundingBox()).width / 2, y: (await canvas.boundingBox()).height / 2 } });
  await expect.poll(() => page.evaluate(() => window.__viewSnapTest.state.snapCandidatesReady)).toBe(true);
  const point = await coordinate(0);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('.view-window-cell #simulation-snap-marker')).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => window.__viewSnapTest.state.measurement.points[0]?.worldPoint.toArray())).toEqual([50, -50, 50]);
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#view-window-popout').click();
  const popup = await popupPromise;
  popup.on('pageerror', error => errors.push(error.message));
  await expect.poll(() => popup.locator('.view-window-cell').evaluate(element => getComputedStyle(element).position)).toBe('relative');
  await expect.poll(() => page.evaluate(() => { const cell = window.__viewSnapTest.state.viewWindow.cells.get(0); const rect = cell.canvas.getBoundingClientRect(); return Math.abs(cell.camera.aspect - rect.width / rect.height); })).toBeLessThan(0.01);
  await page.evaluate(() => { window.__viewSnapTest.state.measurement.points = [null, null]; });
  const popPoint = await coordinate(0);
  await popup.mouse.move(popPoint.x, popPoint.y);
  await popup.mouse.click(popPoint.x, popPoint.y);
  await expect.poll(() => page.evaluate(() => window.__viewSnapTest.state.measurement.points[0]?.worldPoint.toArray())).toEqual([50, -50, 50]);
  await expect(popup.locator('.view-window-cell #simulation-snap-marker')).toBeVisible();
  await page.evaluate(() => {
    window.__viewSnapTest.hideViewWindow();
    window.__viewSnapTest.state.measurement.points = [null, null];
  });
  const mainPoint = await coordinate(0, true);
  await page.mouse.click(mainPoint.x, mainPoint.y);
  await expect.poll(() => page.evaluate(() => window.__viewSnapTest.state.measurement.points[0]?.worldPoint.toArray())).toEqual([50, -50, 50]);
  expect(errors).toEqual([]);
});
