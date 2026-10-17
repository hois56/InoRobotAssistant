import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__wheelTest = { state, THREE, setSelectedViewPivotEnabled, recreateMainOrbitControls };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__wheelTest?.state.controls);
}

test('빈 공간·숨긴 모델·스케치의 휠 동작을 유지하고 표면 앞에서 멈춘다', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const { state, THREE, recreateMainOrbitControls, setSelectedViewPivotEnabled } = window.__wheelTest;
    const canvas = state.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const wheel = deltaY => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
    state.camera.position.set(0, -10, 0); state.controls.target.set(0, 0, 0); state.controls.update();
    wheel(-100);
    const emptyDistance = state.controls.getDistance();
    const model = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), new THREE.MeshBasicMaterial());
    model.position.set(0, 140, 0); model.userData.uploaded = true; model.userData.placement = 'scene';
    state.scene.add(model); state.models.push(model); model.visible = false;
    wheel(-100);
    const hiddenDistance = state.controls.getDistance();
    model.visible = true;
    state.selectedModel = model;
    setSelectedViewPivotEnabled(true);
    state.camera.position.set(0, -hiddenDistance, 0);
    state.controls.target.set(0, 0, 0); state.controls.update();
    // The canvas handler must keep using the current controls after recreation.
    recreateMainOrbitControls();
    for (let i = 0; i < 400; i++) wheel(-100);
    const surfaceCameraY = state.camera.position.y;
    state.controls.enabled = false;
    wheel(-100);
    const disabledCameraY = state.camera.position.y;
    state.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    state.camera.up.set(1, 0, 0); state.camera.position.set(0, 0, 500);
    state.sketch.active = true;
    recreateMainOrbitControls(null);
    state.controls.update();
    const sketchTarget = state.controls.target.clone();
    wheel(-100);
    return { emptyDistance, hiddenDistance, surfaceCameraY, disabledCameraY,
      sketchZoom: state.camera.zoom, sketchTargetShift: state.controls.target.distanceTo(sketchTarget) };
  });
  expect(result.emptyDistance).toBeCloseTo(9.6, 6);
  expect(result.hiddenDistance).toBeCloseTo(result.emptyDistance - 0.4, 6);
  expect(result.surfaceCameraY).toBeCloseTo(99.8, 5);
  expect(result.disabledCameraY).toBe(result.surfaceCameraY);
  expect(result.sketchZoom).toBeCloseTo(1 / 0.95, 6);
  expect(result.sketchTargetShift).toBe(0);
});

for (const selectedPivot of [false, true]) {
  test(`반복 확대의 이동량은 줄지 않고 축소로 복귀한다 (${selectedPivot})`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(selectedPivot => {
      const { state, THREE, setSelectedViewPivotEnabled } = window.__wheelTest;
      const model = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), new THREE.MeshBasicMaterial());
      model.position.set(0, 140, 0); model.userData.uploaded = true; model.userData.placement = 'scene';
      state.scene.add(model); state.models.push(model); state.selectedModel = model;
      setSelectedViewPivotEnabled(selectedPivot);
      state.camera.position.set(0, -10, 0); state.controls.target.set(0, 0, 0); state.controls.update();
      const canvas = state.renderer.domElement, rect = canvas.getBoundingClientRect();
      const wheel = deltaY => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
      const steps = [];
      for (let i = 0; i < 20; i++) {
        const before = state.camera.position.clone(); wheel(-100);
        steps.push(state.camera.position.distanceTo(before));
      }
      for (let i = 0; i < 20; i++) wheel(100);
      return { steps, position: state.camera.position.toArray() };
    }, selectedPivot);
    result.steps.forEach(step => expect(step).toBeCloseTo(0.4, 6));
    expect(result.position[1]).toBeCloseTo(-10, 6);
  });
  test(`선택 중심 OFF는 기존 중심, ON은 커서 표면 기준으로 확대한다 (${selectedPivot})`, async ({ page }) => {
    await setup(page);
    const point = await page.evaluate(selectedPivot => {
      const { state, THREE, setSelectedViewPivotEnabled } = window.__wheelTest;
      const model = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), new THREE.MeshBasicMaterial());
      model.position.set(25, 140, 0);
      model.userData.uploaded = true; model.userData.placement = 'scene';
      state.scene.add(model); state.models.push(model); state.selectedModel = model;
      setSelectedViewPivotEnabled(selectedPivot);
      state.camera.position.set(0, -10, 0);
      state.controls.target.set(0, 0, 0); state.controls.update();
      state.scene.updateMatrixWorld(true); state.camera.updateMatrixWorld(true);
      const surface = new THREE.Vector3(25, 100, 0).project(state.camera);
      const rect = state.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (surface.x + 1) * rect.width / 2, y: rect.top + (1 - surface.y) * rect.height / 2,
        projected: surface.toArray(), quaternion: state.camera.quaternion.toArray(), width: rect.width, height: rect.height };
    }, selectedPivot);
    await page.mouse.move(point.x, point.y);
    for (let step = 0; step < 8; step++) {
      const before = await page.evaluate(() => window.__wheelTest.state.camera.position.y);
      await page.mouse.wheel(0, -100);
      await expect.poll(() => page.evaluate(() => window.__wheelTest.state.camera.position.y)).toBeGreaterThan(before);
    }
    const result = await page.evaluate(() => {
      const { state, THREE } = window.__wheelTest;
      state.camera.updateMatrixWorld(true);
      return { cameraY: state.camera.position.y, quaternion: state.camera.quaternion.toArray(),
        projected: new THREE.Vector3(25, 100, 0).project(state.camera).toArray(),
        contract: !state.controls.zoomToCursor && state.controls.zoomSpeed === 1 && state.controls.mouseButtons.RIGHT === THREE.MOUSE.PAN };
    });
    expect(result.cameraY).toBeCloseTo(-6.8, 5);
    // Native mouse coordinates are rounded to pixels by Chromium.
    if (selectedPivot) expect(Math.abs(result.projected[0] - point.projected[0]) * point.width / 2).toBeLessThan(1);
    expect(Math.abs(result.projected[1] - point.projected[1]) * point.height / 2).toBeLessThan(1);
    result.quaternion.forEach((value, i) => expect(value).toBeCloseTo(point.quaternion[i], 6));
    expect(result.contract).toBe(true);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(() => window.__wheelTest.state.camera.position.y)).toBeLessThan(result.cameraY);
  });
}
