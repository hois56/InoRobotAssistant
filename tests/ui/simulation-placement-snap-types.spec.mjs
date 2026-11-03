import { test, expect } from '@playwright/test';

async function setup(page, { robot = false } = {}) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/^init\(\);\s*$/m, 'window.__placementSnapReady = init();');
    await route.fulfill({ response, body: source + '\nwindow.__placementSnaps = { state, THREE, renderModelTree, syncEmptyStateVisibility, requestRender };' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__placementSnapReady && window.__placementSnaps);
  await page.evaluate(() => window.__placementSnapReady);
  if (robot) {
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__placementSnaps.state.activeArticulatedModel?.userData.tcpFrame);
  }
  await page.evaluate(robot => {
    const { state, THREE, renderModelTree, syncEmptyStateVisibility, requestRender } = window.__placementSnaps;
    const model = new THREE.Group();
    model.name = '스냅 이동 모델';
    model.userData = { uploaded: true, placement: 'scene', modelName: model.name };
    model.position.set(...(robot ? [-700, -400, 250] : [-180, 0, 80]));
    const part = new THREE.Mesh(new THREE.BoxGeometry(140, 120, 100), new THREE.MeshStandardMaterial());
    part.scale.setScalar(robot ? 3 : 1);
    model.add(part);
    state.scene.add(model);
    state.models.push(model);
    window.__placementSnaps.model = model;
    state.camera.position.set(...(robot ? [1200, -3200, 2200] : [350, -900, 650]));
    state.controls.target.set(0, 0, 0);
    state.controls.update();
    renderModelTree();
    syncEmptyStateVisibility();
    requestRender();
  }, robot);
  await page.locator('#model-tree .model-tree-button').filter({ hasText: '스냅 이동 모델' }).click();
  await page.locator('[data-transform-mode="translate"]').click();
  await expect.poll(() => page.evaluate(() => window.__placementSnaps.state.placement.active)).toBe(true);
  return errors;
}

async function selectFace(page) {
  const point = await page.evaluate(() => {
    const { state, THREE, model } = window.__placementSnaps;
    model.updateWorldMatrix(true, true);
    const point = model.children[0].localToWorld(new THREE.Vector3(35, -60, 25)).project(state.camera);
    const rect = state.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-point.y * 0.5 + 0.5) * rect.height };
  });
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => {
    const { state } = window.__placementSnaps;
    return state.snapCandidatesReady && state.snapFaceSelections.length === 1;
  })).toBe(true);
}

const markers = page => page.locator('.simulation-snap-candidate-marker:visible');
const visibleTypes = page => markers(page).evaluateAll(elements => [...new Set(elements.map(element => element.dataset.snapType))]);

test('모델 트리 이동은 선택한 유형의 스냅만 표시하고 클릭할 수 있다', async ({ page }) => {
  const errors = await setup(page);
  await selectFace(page);
  await page.locator('#model-placement-snap-type').selectOption('edge-midpoint');
  await expect.poll(() => visibleTypes(page)).toEqual(['edge-midpoint']);
  const marker = markers(page).first();
  const box = await marker.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#model-placement-hover-readout')).toContainText('에지 중심점');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => window.__placementSnaps.state.placement.sourcePoint?.snapType)).toBe('edge-midpoint');
  expect(errors).toEqual([]);
});

test('면을 선택한 뒤 현재 TCP를 선택해 모델을 배치할 수 있다', async ({ page }) => {
  const errors = await setup(page, { robot: true });
  await page.locator('#model-placement-snap-type').selectOption('robot-tcp');
  await expect.poll(() => visibleTypes(page)).toEqual(['robot-tcp']);
  await page.locator('#model-placement-snap-type').selectOption('auto');
  await selectFace(page);
  await page.locator('#model-placement-snap-type').selectOption('robot-tcp');
  await expect.poll(() => visibleTypes(page)).toEqual(['robot-tcp']);
  await expect.poll(() => page.evaluate(() => window.__placementSnaps.state.snapFaceSelections.length)).toBe(1);
  await page.locator('#model-placement-snap-type').selectOption('auto');
  const origin = page.locator('.simulation-snap-candidate-marker[data-snap-type="model-origin"]:visible');
  await expect(origin).toHaveCount(1);
  const originBox = await origin.boundingBox();
  await page.mouse.click(originBox.x + originBox.width / 2, originBox.y + originBox.height / 2);
  await expect.poll(() => page.evaluate(() => window.__placementSnaps.state.placement.sourceWorldPoint?.toArray())).toEqual([-700, -400, 250]);
  await page.locator('#model-placement-snap-type').selectOption('robot-tcp');
  await expect.poll(() => visibleTypes(page)).toEqual(['robot-tcp']);
  const tcp = await page.evaluate(() => {
    const { state, THREE } = window.__placementSnaps;
    return state.activeArticulatedModel.userData.tcpFrame.getWorldPosition(new THREE.Vector3()).toArray();
  });
  const tcpBox = await markers(page).first().boundingBox();
  await page.mouse.move(tcpBox.x + tcpBox.width / 2, tcpBox.y + tcpBox.height / 2);
  await expect(page.locator('#model-placement-hover-readout')).toContainText('현재 TCP');
  await page.mouse.click(tcpBox.x + tcpBox.width / 2, tcpBox.y + tcpBox.height / 2);
  await expect.poll(() => page.evaluate(() => window.__placementSnaps.state.placement.directionPoint?.snapType)).toBe('robot-tcp');
  await page.locator('#btn-measurement-apply-placement').click();
  const position = await page.evaluate(() => window.__placementSnaps.model.position.toArray());
  position.forEach((value, axis) => expect(value).toBeCloseTo(tcp[axis], 5));
  expect(errors).toEqual([]);
});
