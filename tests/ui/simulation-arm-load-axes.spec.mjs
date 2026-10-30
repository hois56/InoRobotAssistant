import { test, expect } from '@playwright/test';

const tinyStl = `solid axes
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
endsolid axes`;

const models = [
  { name: '6축 R7H-90', folder: 'IR-R7H-90', allowed: [2, 3], defaultIndex: 3,
    angles: [20, -25, 45, 65, -30, 90] },
  { name: 'SCARA S7-60', folder: 'IR-S7-60Z20', allowed: [1], defaultIndex: 1,
    angles: [20, -30, 0, 55] }
];

async function setup(page, model) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/^init\(\);\s*$/m,
      'window.__armAxesReady = init();');
    await route.fulfill({ response, body: `${source}\nwindow.__armAxes = {
      state, THREE, handle3DImport, openImportDialog, closeImportDialog,
      openArmLoadPanelForModel, getRobotJointMountFrame, mountArmLoadModelAtJoint,
      setJointAngle, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot
    };` });
  });
  await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__armAxes?.state.renderer);
  await page.evaluate(() => window.__armAxesReady);
  await page.locator('#model-select').selectOption(`robot:${model.folder}`);
  await page.waitForFunction(folder => window.__armAxes.state.models.some(
    robot => robot.userData.motionModelFolder === folder), model.folder);
  return errors;
}

async function importLoad(page, model, index = model.defaultIndex) {
  return page.evaluate(async ({ source, folder, index }) => {
    const api = window.__armAxes;
    const robot = api.state.models.find(robot => robot.userData.motionModelFolder === folder);
    const load = await api.handle3DImport({
      file: new File([source], 'arm-axis-load.stl', { type: 'application/sla' }),
      placement: 'arm-load', attachmentRobot: robot, attachmentJointIndex: index
    });
    if (!load) throw new Error('Arm load import failed');
    return { id: load.userData.workspaceModelId, assetId: load.userData.workspaceAssetId,
      index: load.userData.attachmentJointIndex, axis: load.userData.attachmentAxis };
  }, { source: tinyStl, folder: model.folder, index });
}

async function visibleOptions(locator) {
  return locator.locator('option').evaluateAll(options => options.filter(option => !option.hidden)
    .map(option => ({ value: option.value, label: option.textContent.trim() })));
}

for (const model of models) {
  test(`${model.name} 가져오기와 암 로드 설정은 허용한 부착 축만 표시한다`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await setup(page, model);
    const expected = model.allowed.map(index => ({ value: String(index), label: `J${index + 1}` }));
    await page.evaluate(source => window.__armAxes.openImportDialog([
      new File([source], 'axis-options.stl', { type: 'application/sla' })
    ]), tinyStl);
    await expect(page.locator('#import-3d-dialog')).toBeVisible();
    await page.locator('#import-placement').selectOption('arm-load');
    await expect(page.locator('#import-arm-load-axis')).toBeVisible();
    expect(await visibleOptions(page.locator('#import-arm-load-axis'))).toEqual(expected);
    await expect(page.locator('#import-arm-load-axis')).toHaveValue(String(model.defaultIndex));
    await page.evaluate(() => window.__armAxes.closeImportDialog());

    const load = await importLoad(page, model);
    await page.evaluate(id => {
      const api = window.__armAxes;
      api.openArmLoadPanelForModel(api.state.models.find(load => load.userData.workspaceModelId === id));
    }, load.id);
    await expect(page.locator('#arm-load-axis')).toBeVisible();
    expect(await visibleOptions(page.locator('#arm-load-axis'))).toEqual(expected);
    await expect(page.locator('#arm-load-axis')).toHaveValue(String(model.defaultIndex));
    expect(errors).toEqual([]);
  });

  test(`${model.name} 지원하지 않는 축으로 새 암 로드를 요청해도 기본 허용 축에 부착한다`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await setup(page, model);
    const imported = await importLoad(page, model, 0);
    expect(imported.assetId).toBeTruthy();
    expect(imported.index).toBe(model.defaultIndex);
    expect(imported.axis).toBe(`J${model.defaultIndex + 1}`);
    const mounted = await page.evaluate(({ folder, defaultIndex, allowed }) => {
      const api = window.__armAxes;
      const robot = api.state.models.find(robot => robot.userData.motionModelFolder === folder);
      const load = new api.THREE.Group();
      const success = api.mountArmLoadModelAtJoint(robot, load, 0);
      const defaultFrame = api.getRobotJointMountFrame(robot, defaultIndex);
      return { success, index: load.userData.attachmentJointIndex, axis: load.userData.attachmentAxis,
        parentIsDefault: load.parent === defaultFrame,
        unsupportedFramesAreNull: robot.userData.joints.every((joint, index) =>
          allowed.includes(index) || api.getRobotJointMountFrame(robot, index) === null),
        missingIndexUsesDefault: api.getRobotJointMountFrame(robot) === defaultFrame,
        nullIndexUsesDefault: api.getRobotJointMountFrame(robot, null) === defaultFrame };
    }, model);
    expect(mounted).toEqual({ success: true, index: model.defaultIndex,
      axis: `J${model.defaultIndex + 1}`, parentIsDefault: true,
      unsupportedFramesAreNull: true, missingIndexUsesDefault: true, nullIndexUsesDefault: true });
    expect(errors).toEqual([]);
  });
}

const legacyCases = [
  { model: models[0], name: '6축 구형 J1 암 로드', sourceIndex: 0, sourceOffset: [0, 0, 0], numericOffset: false },
  { model: models[1], name: 'SCARA 구형 J4 암 로드와 숫자 35mm 기준', sourceIndex: 3, sourceOffset: [0, 0, 35], numericOffset: true },
  { model: models[1], name: 'SCARA 구형 J4 암 로드와 표식만 있는 35mm 기준', sourceIndex: 3, sourceOffset: [0, 0, 35], numericOffset: false }
];

for (const legacy of legacyCases) {
  test(`${legacy.name}를 허용 축으로 옮겨 복원해도 실제 배치를 보존한다`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await setup(page, legacy.model);
    const imported = await importLoad(page, legacy.model);
    expect(imported.assetId).toBeTruthy();
    const result = await page.evaluate(async ({ folder, angles, defaultIndex, id,
      sourceIndex, sourceOffset, numericOffset }) => {
      const api = window.__armAxes;
      const robot = api.state.models.find(robot => robot.userData.motionModelFolder === folder);
      const load = api.state.models.find(load => load.userData.workspaceModelId === id);
      robot.position.set(300, -150, 75);
      robot.rotation.set(0.1, -0.2, 0.4);
      angles.forEach((angle, index) => api.setJointAngle(robot.userData.joints[index], angle, false, true));

      const legacyFrame = new api.THREE.Group();
      legacyFrame.position.fromArray(sourceOffset);
      robot.userData.joints[sourceIndex].group.add(legacyFrame);
      legacyFrame.add(load);
      load.position.set(11, -7, 19.5);
      load.quaternion.setFromEuler(new api.THREE.Euler(0.2, -0.3, 0.45));
      load.scale.set(1.2, 0.8, 1.4);
      load.userData.attachmentJointIndex = sourceIndex;
      load.userData.attachmentAxis = `J${sourceIndex + 1}`;
      load.updateWorldMatrix(true, false);
      const beforeMatrix = load.matrixWorld.toArray();
      const snapshot = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
      const entry = snapshot.importedModels.find(entry => entry.workspaceModelId === id);
      entry.attachmentJointIndex = sourceIndex;
      entry.attachmentAxis = `J${sourceIndex + 1}`;
      entry.armLoadMountReference = 'mount-frame';
      entry.transform = { position: load.position.toArray(), quaternion: load.quaternion.toArray(),
        scale: load.scale.toArray() };
      if (numericOffset) entry.armLoadMountOffset = sourceOffset;
      else delete entry.armLoadMountOffset;

      const inspect = () => {
        const restored = api.state.models.find(load => load.userData.workspaceModelId === id);
        if (!restored) throw new Error('The legacy arm load was not restored');
        restored.updateWorldMatrix(true, false);
        return { matrix: restored.matrixWorld.toArray(), index: restored.userData.attachmentJointIndex,
          axis: restored.userData.attachmentAxis, parentIsDefault: restored.parent ===
            api.getRobotJointMountFrame(restored.userData.attachmentHost, defaultIndex) };
      };
      const warnings = await api.restoreWorkspaceSnapshot(snapshot);
      const restored = inspect();
      const saved = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
      const savedEntry = saved.importedModels.find(entry => entry.workspaceModelId === id);
      const resaveWarnings = await api.restoreWorkspaceSnapshot(saved);
      return { beforeMatrix, warnings, restored, savedIndex: savedEntry.attachmentJointIndex,
        savedOffset: savedEntry.armLoadMountOffset, resaveWarnings, afterResave: inspect() };
    }, { ...legacy.model, id: imported.id, sourceIndex: legacy.sourceIndex,
      sourceOffset: legacy.sourceOffset, numericOffset: legacy.numericOffset });
    expect(result.warnings).toEqual([]);
    expect(result.resaveWarnings).toEqual([]);
    expect(result.savedIndex).toBe(legacy.model.defaultIndex);
    expect(result.savedOffset).toHaveLength(3);
    for (const actual of [result.restored, result.afterResave]) {
      expect(actual.index).toBe(legacy.model.defaultIndex);
      expect(actual.axis).toBe(`J${legacy.model.defaultIndex + 1}`);
      expect(actual.parentIsDefault).toBe(true);
      actual.matrix.forEach((value, index) => expect(value).toBeCloseTo(result.beforeMatrix[index], 6));
    }
    expect(errors).toEqual([]);
  });
}
