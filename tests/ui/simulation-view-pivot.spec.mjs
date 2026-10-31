import { test, expect } from '@playwright/test';

async function setup(page, count = 10) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/^init\(\);/m, 'window.__simulationReady = init();');
    await route.fulfill({ response, body: `${source}\nwindow.__cellPivot = { state, THREE, createPrimitiveShapeRoot, updateUIStatus, selectSceneModel, selectSceneModelPart, openViewWindow, requestRender };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__cellPivot);
  await page.evaluate(() => window.__simulationReady);
  await page.evaluate(count => {
    const a = window.__cellPivot;
    const model = a.createPrimitiveShapeRoot('box', { x: 80, y: 80, z: 80 });
    const other = a.createPrimitiveShapeRoot('box', { x: 40, y: 40, z: 40 });
    model.add(other.children[0]);
    model.children[1].position.x = 200;
    model.userData.primitiveShape = false;
    model.userData.importedParts = [...model.children];
    model.position.set(500, 200, 100);
    a.state.scene.add(model); a.state.models.push(model);
    a.updateUIStatus(); a.selectSceneModel(model);
    for (let slot = 0; slot < count; slot++) a.openViewWindow(slot);
    a.requestRender();
  }, count);
  return errors;
}

const toggle = (surface, slot) => surface.locator(`.view-window-cell[data-slot="${slot}"] [data-view-selected-pivot]`);
const readViews = page => page.evaluate(() => {
  const { state } = window.__cellPivot;
  // Ignore sub-micron floating-point noise from OrbitControls.update().
  const pose = (camera, controls) => ({ position: camera.position.toArray().map(n => Number(n.toFixed(6))),
    target: controls.target.toArray().map(n => Number(n.toFixed(6))) });
  return { main: pose(state.camera, state.controls),
    cells: [...state.viewWindow.cells.values()].map(cell => pose(cell.camera, cell.controls)) };
});

test('10개 고정 뷰의 물체 중심 회전을 각각 켜고 끄며 다른 뷰와 메인에 영향을 주지 않는다', async ({ page }, testInfo) => {
  const errors = await setup(page);
  await expect(page.locator('[data-view-selected-pivot]')).toHaveCount(10);
  const before = await readViews(page);
  await toggle(page, 0).click();
  await expect(toggle(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle(page, 9)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#btn-selected-view-pivot')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => window.__cellPivot.state.viewWindow.cells.get(0).controls.target.x)).toBe(590);
  const focused = await readViews(page);
  expect(focused.main).toEqual(before.main);
  expect(focused.cells.slice(1)).toEqual(before.cells.slice(1));
  await page.evaluate(() => {
    const a = window.__cellPivot;
    a.selectSceneModelPart(a.state.models[0], a.state.models[0].children[1]);
    a.requestRender();
  });
  await expect.poll(() => page.evaluate(() => window.__cellPivot.state.viewWindow.cells.get(0).controls.target.x)).toBe(700);
  await toggle(page, 9).click();
  const beforeMove = await readViews(page);
  await page.evaluate(() => { const a = window.__cellPivot; a.state.models[0].position.x += 50; a.requestRender(); });
  await expect.poll(() => page.evaluate(() => window.__cellPivot.state.viewWindow.cells.get(9).controls.target.x)).toBe(750);
  const moved = await readViews(page);
  for (const slot of [0, 9]) {
    expect(moved.cells[slot].position[0] - beforeMove.cells[slot].position[0]).toBeCloseTo(50, 6);
    expect(moved.cells[slot].target[0]).toBe(750);
  }
  expect(moved.cells[1]).toEqual(beforeMove.cells[1]);
  await toggle(page, 0).click();
  expect((await readViews(page)).cells[0]).toEqual(moved.cells[0]);
  await page.locator('#btn-selected-view-pivot').click();
  await expect(toggle(page, 0)).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(page, 9)).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { const a = window.__cellPivot; a.state.models[0].position.x += 25; a.requestRender(); });
  await expect.poll(() => page.evaluate(() => window.__cellPivot.state.viewWindow.cells.get(9).controls.target.x)).toBe(775);
  expect((await readViews(page)).cells[0]).toEqual(moved.cells[0]);
  await page.locator('#view-window').screenshot({ path: testInfo.outputPath('independent-pivots.png') });
  expect(errors).toEqual([]);
});

test('고정 뷰의 실제 회전·팬과 새 창의 개별 토글이 독립적으로 동작한다', async ({ page }, testInfo) => {
  const errors = await setup(page, 2);
  await toggle(page, 0).click();
  const before = await readViews(page);
  const canvas = await page.locator('.view-window-cell[data-slot="0"] canvas').boundingBox();
  const start = { x: canvas.x + canvas.width * .5, y: canvas.y + canvas.height * .6 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 50, start.y + 25, { steps: 6 }); await page.mouse.up();
  const rotated = await readViews(page);
  expect(rotated.cells[0].target).toEqual(before.cells[0].target);
  expect(rotated.cells[0].position).not.toEqual(before.cells[0].position);
  expect(rotated.cells[1]).toEqual(before.cells[1]);
  expect(rotated.main).toEqual(before.main);
  await page.mouse.move(start.x, start.y); await page.mouse.down({ button: 'right' });
  await page.mouse.move(start.x + 40, start.y + 15, { steps: 6 }); await page.mouse.up({ button: 'right' });
  expect((await readViews(page)).cells[0].target).not.toEqual(rotated.cells[0].target);
  const popout = page.waitForEvent('popup');
  await page.locator('#view-window-popout').click();
  const popup = await popout;
  await expect(toggle(popup, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle(popup, 1)).toHaveAttribute('aria-pressed', 'false');
  await toggle(popup, 1).click(); await toggle(popup, 0).click();
  await expect(toggle(popup, 0)).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(popup, 1)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => {
    const { state, THREE } = window.__cellPivot;
    return [...state.viewWindow.cells.values()].every(({ controls }) => controls.mouseButtons.RIGHT === THREE.MOUSE.PAN
      && controls.screenSpacePanning && !controls.enableDamping && controls.rotateSpeed === 1
      && controls.panSpeed === 1 && controls.zoomSpeed === 1);
  })).toBe(true);
  await popup.screenshot({ path: testInfo.outputPath('detached-pivots.png') });
  await popup.close({ runBeforeUnload: true });
  await page.evaluate(() => window.__cellPivot.openViewWindow(0));
  await expect(toggle(page, 0)).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(page, 1)).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
