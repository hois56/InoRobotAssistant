import { test, expect } from '@playwright/test';

const stl = `solid view-fixture
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 40 0 0
vertex 0 30 0
endloop
endfacet
facet normal 0 -1 0
outer loop
vertex 0 0 0
vertex 0 0 20
vertex 40 0 0
endloop
endfacet
endsolid view-fixture`;

async function setup(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/\binit\(\);\s*$/, 'window.__importViewReady = init();\n');
    await route.fulfill({ response, body: `${source}\nwindow.__importView = { state };` });
  });
  await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__importViewReady && window.__importView?.state.renderer);
  await page.evaluate(() => window.__importViewReady);
  await page.evaluate(() => {
    const { camera, controls } = window.__importView.state;
    camera.position.set(1080, -730, 590);
    camera.up.set(0, 0, 1);
    camera.zoom = 1.4;
    camera.updateProjectionMatrix();
    controls.target.set(120, 75, 35);
    controls.update();
  });
  return { errors, before: await view(page) };
}

async function view(page) {
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { camera, controls } = window.__importView.state;
    return { position: camera.position.toArray(), rotation: camera.quaternion.toArray(),
      up: camera.up.toArray(), target: controls.target.toArray(), zoom: camera.zoom };
  });
}

function expectSameView(actual, expected) {
  for (const key of ['position', 'rotation', 'up', 'target']) {
    actual[key].forEach((value, i) => expect(value, `${key}[${i}]`).toBeCloseTo(expected[key][i], 8));
  }
  expect(actual.zoom).toBe(expected.zoom);
}

for (const selectedPivot of [false, true]) for (const count of [1, 2]) test(`${count === 1 ? '단일' : '여러'} 3D 파일을 가져와도 카메라 위치·방향·확대와 뷰 중심을 유지한다 (선택 중심=${selectedPivot})`, async ({ page }) => {
  test.setTimeout(90_000);
  const { errors, before } = await setup(page);
  if (selectedPivot) await page.locator('#btn-selected-view-pivot').click();
  const files = Array.from({ length: count }, (_, i) => ({
    name: `view-${i}.stl`, mimeType: 'application/octet-stream', buffer: Buffer.from(stl)
  }));
  await page.locator('#input-import-3d').setInputFiles(files);
  await page.locator('#import-placement').selectOption('scene');
  await page.locator('#btn-confirm-import').click();
  await page.waitForFunction(expected => {
    const state = window.__importView.state;
    return state.models.filter(model => model.userData.uploaded).length === expected && state.fileImportLoads.size === 0;
  }, count);
  await expect(page.locator('#loading-overlay')).toBeHidden();
  expectSameView(await view(page), before);
  await page.locator('#btn-reset-view').click();
  expect((await view(page)).position).not.toEqual(before.position);
  expect(errors).toEqual([]);
});

test('테스트 모델을 추가해도 현재 뷰를 유지한다', async ({ page }) => {
  test.setTimeout(90_000);
  const { errors, before } = await setup(page);
  await page.locator('#btn-test-model').click();
  await page.locator('[data-test-quantity="square-object"]').fill('1');
  await page.locator('#btn-confirm-test-model').click();
  await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 60_000 });
  expect(await page.evaluate(() => window.__importView.state.models.filter(model => model.userData.testModel).length)).toBe(1);
  expectSameView(await view(page), before);
  expect(errors).toEqual([]);
});
