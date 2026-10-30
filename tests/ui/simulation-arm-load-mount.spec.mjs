import { test, expect } from '@playwright/test';

const tinyStl = `solid mount
facet normal 0 0 -1
outer loop
vertex 0 0 0
vertex 0 12 0
vertex 12 0 0
endloop
endfacet
facet normal 0 -1 0
outer loop
vertex 0 0 0
vertex 12 0 0
vertex 0 0 12
endloop
endfacet
facet normal -1 0 0
outer loop
vertex 0 0 0
vertex 0 0 12
vertex 0 12 0
endloop
endfacet
facet normal 1 1 1
outer loop
vertex 12 0 0
vertex 0 12 0
vertex 0 0 12
endloop
endfacet
endsolid mount`;

const models = [
  { name: 'R4-56', folder: 'IR-R4-56', centers: [[31.49983253, 0, 656.68655502], [274.999832, -1, 650.05397691]],
    offsets: [[31.49983253, 0, 66.68655502], [274.999832, -1, 40.05397691]] },
  { name: 'R4H-54', folder: 'IR-R4H-54', centers: [[31.49983253, 0, 656.68655502], [283.999832, 0, 654.86201514]],
    offsets: [[31.49983253, 0, 66.68655502], [283.999832, 0, 44.86201514]] },
  { name: 'R7H-70', folder: 'IR-R7H-70', centers: [[86, -0.00419855, 779.5], [267, -0.00419855, 769.5]],
    offsets: [[36, -0.00419855, 99.5], [217, -0.00419855, 49.5]] },
  { name: 'R7H-90', folder: 'IR-R7H-90', centers: [[86, 0, 889.5], [347, 0, 879.5]],
    offsets: [[36, 0, 99.5], [297, 0, 49.5]] },
  { name: 'R10H-120', folder: 'IR-R10H-120', centers: [[82.5, 0, 1054], [517, 0, 1049.5]],
    offsets: [[57.5, 0, 94], [492, 0, 49.5]] }
];

async function setup(page, folder) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace('init();\n', 'window.__armMountReady = init();\n');
    await route.fulfill({ response, body: `${source}\nwindow.__armMount = { state, THREE, handle3DImport, openArmLoadPanelForModel, getRobotJointMountFrame, setJointAngle, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot };` });
  });
  await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__armMount?.state.renderer);
  await page.evaluate(() => window.__armMountReady);
  await page.locator('#model-select').selectOption(`robot:${folder}`);
  await page.waitForFunction(folder => window.__armMount.state.models.some(model => model.userData.motionModelFolder === folder), folder);
}

async function importLoad(page, index, folder) {
  return page.evaluate(async ({ source, index, folder }) => {
    const api = window.__armMount;
    const robot = api.state.models.find(model => model.userData.motionModelFolder === folder);
    const load = await api.handle3DImport({
      file: new File([source], `J${index + 1}-arm-load.stl`, { type: 'application/sla' }),
      placement: 'arm-load', attachmentRobot: robot, attachmentJointIndex: index
    });
    if (!load) throw new Error('Arm load import failed');
    robot.updateMatrixWorld(true);
    return { id: load.userData.workspaceModelId, assetId: load.userData.workspaceAssetId,
      local: load.position.toArray(), world: load.getWorldPosition(new api.THREE.Vector3()).toArray() };
  }, { source: tinyStl, index, folder });
}

for (const model of models) {
test(`${model.name} 암 로드 가져오기와 Link 선택은 확인한 장착 기준을 영점으로 사용한다`, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page, model.folder);
  const elbow = await importLoad(page, 2, model.folder);
  const forearm = await importLoad(page, 3, model.folder);
  expect(elbow.local).toEqual([0, 0, 0]);
  expect(elbow.world).toEqual(model.centers[0]);
  expect(forearm.local).toEqual([0, 0, 0]);
  expect(forearm.world).toEqual(model.centers[1]);
  expect(elbow.assetId).toBeTruthy();
  expect(forearm.assetId).toBeTruthy();

  await page.evaluate(id => {
    const api = window.__armMount;
    const model = api.state.models.find(model => model.userData.workspaceModelId === id);
    api.openArmLoadPanelForModel(model);
  }, forearm.id);
  await expect(page.locator('#arm-load-axis')).toBeVisible();
  await page.locator('#arm-load-axis').selectOption('2');
  const switched = await page.evaluate(id => {
    const api = window.__armMount;
    const model = api.state.models.find(model => model.userData.workspaceModelId === id);
    model.updateWorldMatrix(true, false);
    return { local: model.position.toArray(), world: model.getWorldPosition(new api.THREE.Vector3()).toArray(),
      index: model.userData.attachmentJointIndex };
  }, forearm.id);
  expect(switched).toEqual({ local: [0, 0, 0], world: model.centers[0], index: 2 });
  for (const axis of ['x', 'y', 'z']) {
    await expect(page.locator(`[data-arm-load-field="${axis}"]`)).toHaveValue('0');
  }
  await page.locator('#arm-load-axis').selectOption('3');
  const reset = await page.evaluate(id => {
    const api = window.__armMount;
    const model = api.state.models.find(model => model.userData.workspaceModelId === id);
    model.updateWorldMatrix(true, false);
    return model.getWorldPosition(new api.THREE.Vector3()).toArray();
  }, forearm.id);
  expect(reset).toEqual(model.centers[1]);
  expect(errors).toEqual([]);
});

test(`${model.name} 암 로드는 링크 회전을 따라가고 작업 저장·복원 후에도 위치와 영점을 유지한다`, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page, model.folder);
  const elbow = await importLoad(page, 2, model.folder);
  const forearm = await importLoad(page, 3, model.folder);
  const result = await page.evaluate(async ({ ids, folder, centers }) => {
    const api = window.__armMount;
    const robot = api.state.models.find(model => model.userData.motionModelFolder === folder);
    robot.position.set(120, -80, 30);
    robot.rotation.z = 0.35;
    [20, -25, 45, 65, -30, 90].forEach((angle, index) => api.setJointAngle(robot.userData.joints[index], angle, false, true));
    robot.updateMatrixWorld(true);
    const inspect = () => ids.map((id, index) => {
      const load = api.state.models.find(model => model.userData.workspaceModelId === id);
      const host = load.userData.attachmentHost;
      const joint = host.userData.joints[index + 2];
      host.updateMatrixWorld(true);
      const link = joint.group.children.find(child => child.isMesh);
      const world = load.getWorldPosition(new api.THREE.Vector3());
      const expected = link.localToWorld(new api.THREE.Vector3(...centers[index]));
      return { id, local: load.position.toArray(), world: world.toArray(), error: world.distanceTo(expected),
        joint: load.userData.attachmentJointIndex, parentIsMount: load.parent === api.getRobotJointMountFrame(host, index + 2) };
    });
    const before = inspect();
    const snapshot = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
    const saved = snapshot.importedModels.map(model => ({ id: model.workspaceModelId, assetId: model.assetId,
      joint: model.attachmentJointIndex, reference: model.armLoadMountReference, offset: model.armLoadMountOffset }));
    const warnings = await api.restoreWorkspaceSnapshot(snapshot);
    return { before, after: inspect(), saved, warnings };
  }, { ids: [elbow.id, forearm.id], folder: model.folder, centers: model.centers });
  expect(result.warnings).toEqual([]);
  expect(result.saved).toHaveLength(2);
  result.saved.forEach((saved, index) => {
    expect(saved.assetId).toBeTruthy();
    expect(saved.reference).toBe('mount-frame');
    expect(saved.offset).toEqual(model.offsets[index]);
  });
  result.before.forEach((before, index) => {
    const after = result.after[index];
    expect(before.error).toBeLessThan(1e-6);
    expect(after.error).toBeLessThan(1e-6);
    expect(after.local).toEqual([0, 0, 0]);
    expect(after.joint).toBe(index + 2);
    expect(after.parentIsMount).toBe(true);
    after.world.forEach((value, axis) => expect(value).toBeCloseTo(before.world[axis], 6));
  });
  expect(errors).toEqual([]);
});
}

for (const model of models.filter(model => ['IR-R4-56', 'IR-R4H-54', 'IR-R10H-120'].includes(model.folder))) {
test(`구형 ${model.name} 작업은 장착 기준 표식 유무와 관계없이 실제 암 로드 배치를 보존한다`, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page, model.folder);
  const elbow = await importLoad(page, 2, model.folder);
  const forearm = await importLoad(page, 3, model.folder);
  const result = await page.evaluate(async ({ ids, offsets, folder }) => {
    const api = window.__armMount;
    const robot = api.state.models.find(model => model.userData.motionModelFolder === folder);
    ids.forEach((id, index) => {
      const load = api.state.models.find(model => model.userData.workspaceModelId === id);
      load.position.set(15 + 8 * index, -12 + index, 24.5);
      load.quaternion.setFromEuler(new api.THREE.Euler(0.2 + index * 0.1, -0.3, 0.45));
      load.scale.set(1.2, 0.8, 1.4);
    });
    robot.position.set(300, -150, 75);
    robot.rotation.set(0.1, -0.2, 0.4);
    [30, -40, 55, 75, -25, 100].forEach((angle, index) => api.setJointAngle(robot.userData.joints[index], angle, false, true));
    const inspect = () => ids.map(id => {
      const load = api.state.models.find(model => model.userData.workspaceModelId === id);
      if (!load) throw new Error(`Missing restored arm load: ${id}`);
      load.updateWorldMatrix(true, false);
      return { matrix: load.matrixWorld.toArray(), local: load.position.toArray(),
        quaternion: load.quaternion.toArray(), scale: load.scale.toArray() };
    });
    const before = inspect();
    const original = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
    const cases = [];
    for (const reference of [undefined, 'mount-frame']) {
      const legacy = JSON.parse(JSON.stringify(original));
      legacy.importedModels.forEach(entry => {
        const offset = offsets[entry.attachmentJointIndex - 2];
        entry.transform.position = entry.transform.position.map((value, index) => value + offset[index]);
        delete entry.armLoadMountOffset;
        if (reference) entry.armLoadMountReference = reference;
        else delete entry.armLoadMountReference;
      });
      const warnings = await api.restoreWorkspaceSnapshot(legacy);
      const afterLegacy = inspect();
      const saved = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
      const references = saved.importedModels.map(entry => entry.armLoadMountReference);
      const savedOffsets = saved.importedModels.map(entry => entry.armLoadMountOffset);
      const resaveWarnings = await api.restoreWorkspaceSnapshot(saved);
      cases.push({ warnings, resaveWarnings, afterLegacy, afterResave: inspect(), references, savedOffsets });
    }
    return { before, cases };
  }, { ids: [elbow.id, forearm.id], offsets: model.offsets, folder: model.folder });
  for (const item of result.cases) {
    expect(item.warnings).toEqual([]);
    expect(item.resaveWarnings).toEqual([]);
    expect(item.references).toEqual(['mount-frame', 'mount-frame']);
    expect(item.savedOffsets).toEqual(model.offsets);
    result.before.forEach((before, index) => {
      for (const after of [item.afterLegacy[index], item.afterResave[index]]) {
        for (const field of ['matrix', 'local', 'quaternion', 'scale']) {
          after[field].forEach((value, element) => expect(value).toBeCloseTo(before[field][element], 6));
        }
      }
    });
  }
  expect(errors).toEqual([]);
});
}
