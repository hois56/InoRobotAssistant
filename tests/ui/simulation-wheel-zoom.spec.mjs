import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__wheelTest = { state, THREE, setSelectedViewPivotEnabled, recreateMainOrbitControls };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__wheelTest?.state.controls);
}

for (const button of ['left', 'right']) {
  test(`${button} 드래그는 Shift 0.1배·Ctrl 2배로 같은 기능을 유지한다`, async ({ page }) => {
    await setup(page);
    const results = [];
    for (const keys of [[], ['Shift'], ['Control'], ['Shift', 'Control']]) {
      const before = await page.evaluate(() => {
        const { state } = window.__wheelTest;
        state.camera.position.set(0, -1000, 500); state.controls.target.set(0, 0, 0); state.controls.update();
        const rect = state.renderer.domElement.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, quaternion: state.camera.quaternion.toArray() };
      });
      for (const key of keys) await page.keyboard.down(key);
      await page.mouse.move(before.x, before.y); await page.mouse.down({ button });
      await page.mouse.move(before.x + 20, before.y, { steps: 4 }); await page.mouse.up({ button });
      for (const key of [...keys].reverse()) await page.keyboard.up(key);
      results.push(await page.evaluate(before => {
        const { state, THREE } = window.__wheelTest;
        return { angle: state.camera.quaternion.angleTo(new THREE.Quaternion().fromArray(before.quaternion)),
          distance: state.controls.target.length(), rotateSpeed: state.controls.rotateSpeed, panSpeed: state.controls.panSpeed,
          buttons: [state.controls.mouseButtons.LEFT, state.controls.mouseButtons.RIGHT] };
      }, before));
    }
    const metric = button === 'left' ? 'angle' : 'distance';
    const unchanged = button === 'left' ? 'distance' : 'angle';
    expect(results[0][metric]).toBeGreaterThan(0.001);
    for (const [i, scale] of [1, 0.1, 2, 0.1].entries()) {
      expect(results[i][metric] / results[0][metric]).toBeCloseTo(scale, 5);
      expect(results[i][unchanged]).toBeLessThan(1e-6);
      expect(results[i].rotateSpeed).toBe(1); expect(results[i].panSpeed).toBe(1);
      expect(results[i].buttons).toEqual(results[0].buttons);
    }
  });
}

test('드래그 중 보조키 변경과 취소 후에도 이동 감도를 복원한다', async ({ page }) => {
  await setup(page);
  const point = await page.evaluate(() => {
    const { state, recreateMainOrbitControls } = window.__wheelTest;
    state.camera.position.set(0, -1000, 500); state.controls.target.set(0, 0, 0);
    recreateMainOrbitControls(); state.controls.update();
    const rect = state.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const readTarget = () => page.evaluate(() => window.__wheelTest.state.controls.target.toArray());
  const targets = [await readTarget()];
  await page.mouse.move(point.x, point.y); await page.mouse.down({ button: 'right' });
  for (const [i, key] of [null, 'Shift', 'Control'].entries()) {
    if (key) await page.keyboard.down(key);
    await page.mouse.move(point.x + 20 * (i + 1), point.y, { steps: 3 });
    targets.push(await readTarget());
    if (key) await page.keyboard.up(key);
  }
  const distances = targets.slice(1).map((target, i) => Math.hypot(...target.map((v, j) => v - targets[i][j])));
  expect(distances[1] / distances[0]).toBeCloseTo(0.1, 6);
  expect(distances[2] / distances[0]).toBeCloseTo(2, 6);
  await page.evaluate(() => {
    const { state } = window.__wheelTest;
    state.renderer.domElement.dispatchEvent(new PointerEvent('pointercancel', {
      pointerId: [...state.orbitControlPointerIds][0], pointerType: 'mouse', bubbles: true
    }));
  });
  await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => {
    const { state, THREE, recreateMainOrbitControls } = window.__wheelTest;
    recreateMainOrbitControls();
    return state.controls.panSpeed === 1 && state.controls.rotateSpeed === 1
      && state.controls.mouseButtons.LEFT === THREE.MOUSE.ROTATE && state.controls.mouseButtons.RIGHT === THREE.MOUSE.PAN;
  })).toBe(true);
});

test('우클릭 팬은 확대 거리에 관계없이 같은 거리를 이동하고 감도를 복원한다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const { state, recreateMainOrbitControls } = window.__wheelTest;
    state.camera.position.set(0, -1000, 0); state.controls.target.set(0, 0, 0);
    recreateMainOrbitControls(); state.controls.update();
  });
  const moves = [];
  for (const distance of [1000, 10, 1000]) {
    const point = await page.evaluate(distance => {
      const { state } = window.__wheelTest;
      state.camera.position.set(0, -distance, 0); state.controls.target.set(0, 0, 0); state.controls.update();
      const rect = state.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, distance);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(point.x + 50, point.y + 20, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    moves.push(await page.evaluate(() => {
      const { state } = window.__wheelTest;
      return { target: state.controls.target.toArray(), speed: state.controls.panSpeed };
    }));
  }
  expect(Math.hypot(...moves[0].target)).toBeGreaterThan(1);
  for (const move of moves) {
    move.target.forEach((value, i) => expect(value).toBeCloseTo(moves[0].target[i], 6));
    expect(move.speed).toBe(1);
  }
});

test('Ctrl 휠은 기본의 2배이며 스케치·빈 공간에서도 감도를 복원한다', async ({ page }) => {
  await setup(page);
  const results = await page.evaluate(() => {
    const { state, THREE, setSelectedViewPivotEnabled, recreateMainOrbitControls } = window.__wheelTest;
    const results = [];
    for (const mode of ['main', 'surface', 'empty', 'sketch']) {
      if (mode === 'sketch') {
        state.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
        state.camera.up.set(1, 0, 0); state.sketch.active = true;
        recreateMainOrbitControls(null);
      }
      if (mode === 'surface') {
        const model = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), new THREE.MeshBasicMaterial());
        model.position.set(0, 140, 0); model.userData.uploaded = true; model.userData.placement = 'scene';
        state.scene.add(model); state.models.push(model); state.selectedModel = model;
      }
      if (mode === 'empty') state.models.forEach(model => { model.visible = false; });
      setSelectedViewPivotEnabled(mode !== 'main');
      const canvas = state.renderer.domElement, rect = canvas.getBoundingClientRect();
      for (const deltaY of [-100, 100]) {
        const measure = modifiers => {
          state.camera.position.set(0, -100, 0); state.camera.zoom = 1; state.camera.updateProjectionMatrix();
          state.controls.target.set(0, 0, 0); state.controls.update();
          canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, ...modifiers,
            clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
          if (mode === 'sketch') return Math.log(state.camera.zoom);
          if (mode === 'empty') return Math.log(state.controls.getDistance() / 100);
          return state.camera.position.y + 100;
        };
        const normal = measure({});
        results.push({ mode, ratio: measure({ ctrlKey: true }) / normal,
          fineRatio: measure({ ctrlKey: true, shiftKey: true }) / normal, speed: state.controls.zoomSpeed });
      }
    }
    return results;
  });
  for (const result of results) {
    expect(result.ratio, result.mode).toBeCloseTo(2, 6);
    expect(result.fineRatio, result.mode).toBeCloseTo(0.1, 6);
    expect(result.speed).toBe(1);
  }
});

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
