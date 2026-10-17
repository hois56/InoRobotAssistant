import { test, expect } from '@playwright/test';

test('solid snaps require a selected face and circles expose quadrants', async ({ page }) => {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__faceSnaps = { state, THREE, buildSimulationSnapCandidates, selectSimulationSnapFace, findSimulationSnapAtPointer };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__faceSnaps?.state.renderer);
  const result = await page.evaluate(async () => {
    const { state, THREE, buildSimulationSnapCandidates } = window.__faceSnaps;
    state.measurement.active = true;
    state.measurement.points = [null, null];
    const meshes = [0, 200].map(x => {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(50, 32), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.position.x = x;
      mesh.userData.uploaded = true;
      state.scene.add(mesh);
      state.models.push(mesh);
      return mesh;
    });
    await buildSimulationSnapCandidates('measurement');
    const before = state.snapCandidates.filter(c => meshes.includes(c.mesh)).length;
    state.measurement.points[0] = { worldPoint: new THREE.Vector3() };
    await buildSimulationSnapCandidates('measurement');
    const afterP1 = state.snapCandidates.filter(c => meshes.includes(c.mesh)).length;
    const mesh = meshes[0];
    mesh.userData.largeModelMode = true;
    mesh.userData.largeModelChunk = true;
    state.snapFaceSelections = [{ key: 'circle-face', mesh, triangleIndex: 0, triangleRanges: [{ first: 0, last: 31 }] }];
    state.snapFaceSelection = state.snapFaceSelections[0];
    await buildSimulationSnapCandidates('measurement');
    state.camera.position.set(0, 0, 500);
    state.controls.target.set(0, 0, 0);
    state.controls.update();
    state.camera.updateMatrixWorld(true);
    state.measurement.snapType = 'quadrant';
    const point = new THREE.Vector3(50, 0, 0).project(state.camera);
    const canvas = state.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const hit = window.__faceSnaps.findSimulationSnapAtPointer({ target: canvas,
      clientX: rect.left + (point.x * 0.5 + 0.5) * rect.width,
      clientY: rect.top + (-point.y * 0.5 + 0.5) * rect.height });
    return { before, afterP1,
      pickedType: hit?.type,
      selected: state.snapCandidates.filter(c => c.mesh === mesh).map(c => c.type),
      unselected: state.snapCandidates.filter(c => c.mesh === meshes[1]).length };
  });
  expect(result.before).toBe(0);
  expect(result.afterP1).toBe(0);
  expect(result.unselected).toBe(0);
  expect(result.pickedType).toBe('quadrant');
  expect(result.selected).toContain('circle-center');
  expect(result.selected.filter(t => t === 'quadrant')).toHaveLength(4);
});

test('R20H is selectable in project generator', async ({ page }) => {
  await page.goto('/4_ProjectGenerator/index.html');
  await expect(page.locator('#cmbRobotModel option').filter({ hasText: 'R20H-120' })).toHaveCount(1);
  await page.locator('#cmbRobotModel').selectOption({ label: 'R20H-120' });
  await expect(page.locator('#cmbRobotModel')).toHaveValue('IR-R20H-120S5-INT');
});
