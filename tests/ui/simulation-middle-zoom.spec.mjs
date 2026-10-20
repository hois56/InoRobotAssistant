import { test, expect } from '@playwright/test';

test('가운데 버튼 드래그는 5분의 1 감도로 확대하고 놓으면 기존 감도를 복원한다', async ({ page }) => {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__middleZoom = { state };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__middleZoom?.state.controls);
  const before = await page.evaluate(() => {
    const { state } = window.__middleZoom;
    state.camera.position.set(0, -1000, 0); state.controls.target.set(0, 0, 0); state.controls.update();
    const r = state.renderer.domElement.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, distance: state.controls.getDistance() };
  });
  await page.mouse.move(before.x, before.y);
  await page.mouse.down({ button: 'middle' });
  expect(await page.evaluate(() => window.__middleZoom.state.controls.zoomSpeed)).toBeCloseTo(0.2);
  await page.mouse.move(before.x, before.y + 100, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  const after = await page.evaluate(() => ({ distance: window.__middleZoom.state.controls.getDistance(), speed: window.__middleZoom.state.controls.zoomSpeed }));
  expect(after.speed).toBe(1);
  expect(Math.abs(Math.log(after.distance / before.distance))).toBeGreaterThan(0.09);
  expect(Math.abs(Math.log(after.distance / before.distance))).toBeLessThan(0.11);
});
