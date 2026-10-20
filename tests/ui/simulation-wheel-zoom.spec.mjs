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

test('Shift 휠은 빈 공간과 스케치에서도 세밀하게 동작하고 감도를 복원한다', async ({ page }) => {
  await setup(page);
  const results = await page.evaluate(async () => {
    const { state, THREE, setSelectedViewPivotEnabled, recreateMainOrbitControls } = window.__wheelTest;
    setSelectedViewPivotEnabled(true);
    const canvas = state.renderer.domElement;
    const results = [];
    for (const sketch of [false, true]) {
      if (sketch) {
        state.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
        state.camera.up.set(1, 0, 0);
        state.sketch.active = true;
        recreateMainOrbitControls(null);
      }
      state.camera.position.set(0, -100, 0); state.controls.target.set(0, 0, 0); state.controls.update();
      const value = () => sketch ? state.camera.zoom : state.controls.getDistance();
      const wheel = shiftKey => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, shiftKey, bubbles: true, cancelable: true }));
      const before = value();
      wheel(false);
      const normal = value();
      wheel(true); wheel(true);
      await Promise.resolve();
      results.push({ ratio: Math.log(value() / normal) / Math.log(normal / before), speed: state.controls.zoomSpeed });
    }
    return results;
  });
  for (const result of results) {
    expect(result.ratio).toBeCloseTo(0.2, 6);
    expect(result.speed).toBe(1);
  }
  // Real wheel events also restore the speed before the next input event.
  const point = await page.evaluate(() => {
    const { state } = window.__wheelTest;
    const rect = state.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, zoom: state.camera.zoom };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => page.evaluate(() => window.__wheelTest.state.camera.zoom)).toBeGreaterThan(point.zoom);
  const normal = await page.evaluate(() => window.__wheelTest.state.camera.zoom);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -100);
  await expect.poll(() => page.evaluate(() => window.__wheelTest.state.camera.zoom)).toBeGreaterThan(normal);
  await page.keyboard.up('Shift');
  const fine = await page.evaluate(() => ({ zoom: window.__wheelTest.state.camera.zoom, speed: window.__wheelTest.state.controls.zoomSpeed }));
  expect(Math.log(fine.zoom / normal) / Math.log(normal / point.zoom)).toBeCloseTo(0.1, 6);
  expect(fine.speed).toBe(1);
});

test('휠 확대가 원점을 통과해도 시선이 뒤집히지 않고 축소로 돌아온다', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const { state, THREE, setSelectedViewPivotEnabled } = window.__wheelTest;
    setSelectedViewPivotEnabled(false);
    state.camera.position.set(6, -8, 4);
    state.controls.target.set(0, 0, 0); state.controls.update();
    const initial = state.camera.position.clone();
    const direction = state.camera.getWorldDirection(new THREE.Vector3());
    const quaternion = state.camera.quaternion.clone();
    const canvas = state.renderer.domElement;
    const wheel = deltaY => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
    let maxAngle = 0;
    for (let i = 0; i < 80; i++) {
      wheel(-100);
      maxAngle = Math.max(maxAngle, quaternion.angleTo(state.camera.quaternion));
    }
    const travel = state.camera.position.clone().sub(initial).dot(direction);
    const targetAhead = state.controls.target.clone().sub(state.camera.position).dot(direction);
    for (let i = 0; i < 80; i++) wheel(100);
    return { maxAngle, travel, targetAhead, returnError: state.camera.position.distanceTo(initial) };
  });
  expect(result.travel).toBeGreaterThan(20);
  expect(result.maxAngle).toBeLessThan(1e-6);
  expect(result.targetAhead).toBeGreaterThan(0);
  expect(result.returnError).toBeLessThan(1e-6);
});

for (const selectedPivot of [false, true]) {
  test(`Shift 휠은 기본 이동량의 10분의 1로 확대·축소한다 (${selectedPivot})`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(selectedPivot => {
      const { state, THREE, setSelectedViewPivotEnabled } = window.__wheelTest;
      const model = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), new THREE.MeshBasicMaterial());
      model.position.set(0, 140, 0); model.userData.uploaded = true; model.userData.placement = 'scene';
      state.scene.add(model); state.models.push(model); state.selectedModel = model;
      setSelectedViewPivotEnabled(selectedPivot);
      state.camera.position.set(0, -10, 0); state.controls.target.set(0, 0, 0); state.controls.update();
      const canvas = state.renderer.domElement, rect = canvas.getBoundingClientRect();
      const wheel = (deltaY, shiftKey) => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, shiftKey,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
      wheel(-100, false);
      const initial = state.camera.position.clone();
      wheel(-100, true);
      const fineStep = state.camera.position.distanceTo(initial);
      wheel(100, true);
      const returnError = state.camera.position.distanceTo(initial);
      wheel(-100, false);
      return { fineStep, returnError, normalStep: state.camera.position.distanceTo(initial), speed: state.controls.zoomSpeed };
    }, selectedPivot);
    expect(result.fineStep).toBeCloseTo(0.04, 6);
    expect(result.normalStep).toBeCloseTo(0.4, 6);
    expect(result.returnError).toBeLessThan(1e-6);
    expect(result.speed).toBe(1);
  });
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
