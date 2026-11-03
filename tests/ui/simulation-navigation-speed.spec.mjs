import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/^init\(\);/m, 'window.__navigationReady = init();');
    await route.fulfill({ response, body: `${source}\nwindow.__navigationSpeed = { state, THREE, createPrimitiveShapeRoot, selectSceneModel, updateUIStatus, recreateMainOrbitControls, setSelectedViewPivotEnabled };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__navigationSpeed);
  await page.evaluate(() => window.__navigationReady);
}

test('선택 중심 회전 중 빈 공간에서도 휠 이동량이 줄지 않는다', async ({ page }) => {
  await setup(page);
  const distances = await page.evaluate(() => {
    const a = window.__navigationSpeed, { state } = a;
    a.setSelectedViewPivotEnabled(true);
    state.camera.position.set(0, -1000, 0); state.controls.target.set(0, 0, 0);
    a.recreateMainOrbitControls(); state.controls.update();
    const canvas = state.renderer.domElement, rect = canvas.getBoundingClientRect();
    const measure = distance => {
      state.camera.position.set(0, -distance, 0); state.controls.target.set(0, 0, 0); state.controls.update();
      const before = state.camera.position.clone();
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        bubbles: true, cancelable: true }));
      return state.camera.position.distanceTo(before);
    };
    return [measure(1000), measure(10), measure(1000)];
  });
  distances.forEach(distance => expect(distance).toBeCloseTo(40, 6));
});

test('뷰 초기화는 가까운 거리에서 남은 휠·팬 속도 기준도 갱신한다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const a = window.__navigationSpeed, { state } = a;
    const model = a.createPrimitiveShapeRoot('box', { x: 400, y: 300, z: 200 });
    state.scene.add(model); state.models.push(model); a.updateUIStatus(); a.selectSceneModel(model);
    a.setSelectedViewPivotEnabled(true);
    state.camera.position.set(0, -10, 0); state.controls.target.set(0, 0, 0);
    a.recreateMainOrbitControls(); state.controls.update();
    const canvas = state.renderer.domElement, rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100,
      clientX: rect.left + rect.width * .98, clientY: rect.top + rect.height * .98,
      bubbles: true, cancelable: true }));
  });
  await page.locator('#btn-reset-view').click();
  const zoom = await page.evaluate(() => {
    const { state } = window.__navigationSpeed;
    const canvas = state.renderer.domElement, rect = canvas.getBoundingClientRect();
    const before = state.camera.position.clone(), distance = state.controls.getDistance();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100,
      clientX: rect.left + rect.width * .98, clientY: rect.top + rect.height * .98,
      bubbles: true, cancelable: true }));
    return { distance, moved: state.camera.position.distanceTo(before) };
  });
  expect(zoom.moved).toBeCloseTo(zoom.distance * .04, 5);
  const moves = [];
  for (const recreate of [false, true]) {
    await page.locator('#btn-reset-view').click();
    const start = await page.evaluate(recreate => {
      const a = window.__navigationSpeed, { state } = a;
      if (recreate) a.recreateMainOrbitControls();
      const rect = state.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + rect.width * .75, y: rect.top + rect.height * .75, target: state.controls.target.toArray() };
    }, recreate);
    await page.mouse.move(start.x, start.y); await page.mouse.down({ button: 'right' });
    await page.mouse.move(start.x + 35, start.y + 12, { steps: 4 }); await page.mouse.up({ button: 'right' });
    moves.push(await page.evaluate(target => window.__navigationSpeed.state.controls.target.distanceTo(
      new window.__navigationSpeed.THREE.Vector3().fromArray(target)), start.target));
  }
  expect(moves[0]).toBeGreaterThan(1);
  expect(moves[0]).toBeCloseTo(moves[1], 5);
});
