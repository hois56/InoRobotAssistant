import { test, expect } from '@playwright/test';

test('모델 트리 이동에서 선택한 면의 모델 영점을 표시하고 P1·P2로 이동한다', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/^init\(\);\s*$/m, 'window.__originReady = init();');
    await route.fulfill({ response, body: source + '\nwindow.__originSnaps = { state, THREE, renderModelTree, syncEmptyStateVisibility, requestRender, pickSimulationSnapFaceAtPointer };' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__originReady && window.__originSnaps);
  await page.evaluate(() => window.__originReady);
  await page.evaluate(() => {
    const { state, THREE, renderModelTree, syncEmptyStateVisibility, requestRender } = window.__originSnaps;
    for (const [index, position] of [[0, [-180, 0, 80]], [1, [200, 0, 110]]]) {
      const model = new THREE.Group();
      model.name = `모델링${index + 1}`;
      model.userData = { uploaded: true, placement: 'scene', modelName: model.name };
      model.position.fromArray(position);
      model.rotation.z = 0.3;
      const part = new THREE.Mesh(new THREE.BoxGeometry(140, 120, 100), new THREE.MeshStandardMaterial());
      model.add(part);
      state.scene.add(model);
      state.models.push(model);
    }
    state.camera.position.set(350, -900, 650);
    state.controls.target.set(0, 0, 0);
    state.controls.update();
    renderModelTree();
    syncEmptyStateVisibility();
    requestRender();
  });
  await page.locator('#model-tree .model-tree-button').filter({ hasText: '모델링1' }).click();
  await page.locator('[data-transform-mode="translate"]').click();
  await expect.poll(() => page.evaluate(() => window.__originSnaps.state.placement.active)).toBe(true);
  await expect(page.locator('.simulation-snap-candidate-marker[data-snap-type="model-origin"]:visible')).toHaveCount(0);

  async function clickFace(index) {
    const point = await page.evaluate(index => {
      const { state, THREE } = window.__originSnaps;
      const model = state.models[index];
      model.updateWorldMatrix(true, true);
      const point = model.children[0].localToWorld(new THREE.Vector3(35, -60, 25)).project(state.camera);
      const rect = state.renderer.domElement.getBoundingClientRect();
      const x = rect.left + (point.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-point.y * 0.5 + 0.5) * rect.height;
      return { x, y, target: document.elementFromPoint(x, y)?.tagName,
        picked: window.__originSnaps.pickSimulationSnapFaceAtPointer({ target: state.renderer.domElement, clientX: x, clientY: y })?.mesh.uuid,
        expected: model.children[0].uuid };
    }, index);
    expect(point.target).toBe('CANVAS');
    expect(point.picked).toBe(point.expected);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.evaluate(() => {
      const { state } = window.__originSnaps;
      return { ready: state.snapCandidatesReady, faces: state.snapFaceSelections.length,
        navigation: state.viewNavigationActive, dragging: state.transformControls.dragging };
    })).toEqual({ ready: true, faces: 1, navigation: false, dragging: false });
    const marker = page.locator('.simulation-snap-candidate-marker[data-snap-type="model-origin"]:visible');
    await expect(marker).toHaveCount(1);
    const candidates = await page.evaluate(() => {
      const { state } = window.__originSnaps;
      return state.snapCandidates.filter(candidate => candidate.type === 'model-origin')
        .map(candidate => ({ model: state.models.indexOf(candidate.mesh), point: candidate.snapWorldPoint.toArray() }));
    });
    expect(candidates).toEqual([{ model: index, point: index === 0 ? [-180, 0, 80] : [200, 0, 110] }]);
    return marker;
  }

  const firstOrigin = await clickFace(0);
  const firstBox = await firstOrigin.boundingBox();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await expect(page.locator('#simulation-snap-marker')).toContainText('모델 영점');
  await page.mouse.click(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await expect.poll(() => page.evaluate(() => window.__originSnaps.state.placement.sourceWorldPoint?.toArray())).toEqual([-180, 0, 80]);

  const secondOrigin = await clickFace(1);
  const secondBox = await secondOrigin.boundingBox();
  await page.mouse.click(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
  await expect.poll(() => page.evaluate(() => window.__originSnaps.state.placement.directionWorldPoint?.toArray())).toEqual([200, 0, 110]);
  await page.locator('#btn-measurement-apply-placement').click();
  const position = await page.evaluate(() => window.__originSnaps.state.models[0].position.toArray());
  position.forEach((value, axis) => expect(value).toBeCloseTo([200, 0, 110][axis], 5));
  expect(errors).toEqual([]);
});
