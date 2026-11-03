import { test, expect } from '@playwright/test';

async function fillNumber(page, selector, value) {
  const input = page.locator(selector);
  await input.focus();
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

async function setup(page, model = 'IR-S7-60Z20') {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
window.__toolWobj = { state, THREE, selectTcpProfile, applyTcpSnapPoint, serializeWorkspaceSnapshot, getRobotToolMountFrame,
  restoreWorkspaceSnapshot, undoLastAction, redoLastAction, restoreRobotTcpProfiles, applyOlpTcpProfile,
  renderWorkObjectPanel, getRobotControllerBaseFrame };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__toolWobj?.state.renderer);
  await page.locator('#model-select').selectOption(`robot:${model}`);
  await expect(page.locator('[data-panel-toggle="tcp-profile-panel"]')).toBeEnabled();
}

async function exportParameters(page, kind) {
  const pending = page.waitForEvent('download');
  await page.locator(kind === 'Tool' ? '#btn-export-tool-data' : '#btn-export-workobject-data').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(`${kind === 'Tool' ? 'Tool' : 'Wobj'}Param.dat`);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text).toMatch(/^FileInfo\r\n/);
  expect(text).toMatch(/    CheckCode="[0-9A-F]{8}"\r\nEndFileInfo\r\n/);
  const records = JSON.parse(text.split('EndFileInfo\r\n')[1]);
  expect(records).toHaveLength(16);
  return records;
}

test('Tool 0~15와 부하 정보는 저장·복원·실행 취소 및 dat 내보내기에서 유지된다', async ({ page }) => {
  test.setTimeout(90000);
  await setup(page);
  await page.locator('[data-panel-toggle="tcp-profile-panel"]').click();
  await expect(page.locator('[data-tcp-profile]')).toHaveCount(16, { timeout: 3000 });
  await expect(page.locator('[data-tcp-offset="x"]')).toBeDisabled();
  await page.locator('[data-tcp-profile="15"]').click();
  await fillNumber(page, '[data-tcp-offset="x"]', '123.5');
  await fillNumber(page, '[data-tcp-offset="rx"]', '30');
  await fillNumber(page, '[data-tool-load="mass"]', '7');
  await fillNumber(page, '[data-tool-load="cogX"]', '10.125');
  await fillNumber(page, '[data-tool-load="ix"]', '0.000012345');
  await page.locator('#btn-apply-tcp-profile').click();
  await page.evaluate(() => window.__toolWobj.undoLastAction());
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('0');
  await page.evaluate(() => window.__toolWobj.redoLastAction());
  const records = await exportParameters(page, 'Tool');
  expect(records[15].TFrame.Data).toEqual([123.5, 0, 0, 0, 0, 30]);
  expect(records[15].TLoad.mass).toBe(7);
  expect(records[15].TLoad.cog[0]).toBe(10.125);
  expect(records[15].TLoad.inertia[0]).toBe(0.000012345);
  expect(records[0].TFrame.Data).toEqual([0, 0, 0, 0, 0, 0]);
  expect(records[0].TLoad.mass).toBe(0);
  await page.evaluate(async () => {
    const a = window.__toolWobj;
    await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
    a.applyOlpTcpProfile(a.state.activeArticulatedModel, { tool: 15 });
  });
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('7');
  await page.locator('[data-tcp-profile="0"]').click();
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('0');
  await expect(page.locator('#btn-apply-tcp-profile')).toBeDisabled();
  await expect(page.locator('#btn-tcp-snap')).toBeDisabled();
  await expect(page.locator('[data-tcp-offset="x"]')).toHaveValue('0');
});

test('Wobj 0 표시와 장면 스냅은 좌표를 보존하고 UFrame을 로봇 베이스 기준으로 내보낸다', async ({ page }) => {
  test.setTimeout(90000);
  await setup(page);
  await page.locator('[data-panel-toggle="workobject-panel"]').click();
  await expect(page.locator('[data-work-object-index="0"]')).toHaveText('Wobj 0');
  await expect(page.locator('#btn-register-workobject')).toHaveCount(0);
  await page.locator('[data-work-object-index="1"]').click();
  await fillNumber(page, '[data-workobject-pose="rz"]', '90');
  await page.locator('#btn-workobject-snap').click();
  expect(await page.evaluate(() => {
    const a = window.__toolWobj;
    return a.applyTcpSnapPoint(new a.THREE.Vector3(100, 200, 300));
  })).toBe(true);
  await expect(page.locator('[data-workobject-pose="x"]')).toHaveValue('63.5');
  await expect(page.locator('[data-workobject-pose="y"]')).toHaveValue('200');
  await expect(page.locator('[data-workobject-pose="z"]')).toHaveValue('145');
  await expect(page.locator('[data-workobject-pose="rz"]')).toHaveValue('90');
  await page.locator('#btn-apply-workobject').click();
  const records = await exportParameters(page, 'Wobj');
  // This SCARA controller base is offset by X=36.5, Z=155 in the scene.
  expect(records[1].UFrame.Data).toEqual([63.5, 200, 145, 90, 0, 0]);
  expect(records[0].UFrame.Data).toEqual([0, 0, 0, 0, 0, 0]);
  expect(records[2].UFrame.Data).toEqual([0, 0, 0, 0, 0, 0]);
  expect(await page.evaluate(() => window.__toolWobj.state.activeArticulatedModel.userData.workObjects[1].position)).toEqual([100, 200, 300]);
});

test('모델 부하 가져오기는 장착 위치와 회전 및 관성 축을 반영한다', async ({ page }) => {
  test.setTimeout(90000);
  await setup(page);
  await page.locator('[data-panel-toggle="tcp-profile-panel"]').click();
  await page.locator('[data-tcp-profile="1"]').click();
  await page.evaluate(() => {
    const a = window.__toolWobj, robot = a.state.activeArticulatedModel;
    const model = new a.THREE.Mesh(new a.THREE.BoxGeometry(10, 20, 30), new a.THREE.MeshBasicMaterial());
    model.userData = { uploaded: true, placement: 'tcp', attachmentHost: robot, toolLoadProperties: { mode: 'mass', massKg: 7 } };
    model.position.set(10, 20, 30); model.rotation.z = Math.PI / 2;
    a.getRobotToolMountFrame(robot).add(model); a.state.models.push(model);
  });
  await page.locator('#btn-tool-load-from-models').click();
  await expect(page.locator('#tool-load-model-dialog')).toHaveCount(0);
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('7');
  await expect(page.locator('[data-tool-load="cogX"]')).toHaveValue('10');
  await expect(page.locator('[data-tool-load="cogY"]')).toHaveValue('20');
  await expect(page.locator('[data-tool-load="cogZ"]')).toHaveValue('30');
  expect(Number(await page.locator('[data-tool-load="ix"]').inputValue())).toBeCloseTo(7 * (10 ** 2 + 30 ** 2) / 12e6, 8);
  expect(Number(await page.locator('[data-tool-load="iy"]').inputValue())).toBeCloseTo(7 * (20 ** 2 + 30 ** 2) / 12e6, 8);
  const widths = await page.locator('[data-tool-load]').evaluateAll(inputs => inputs.map(input => input.getBoundingClientRect().width));
  expect(Math.min(...widths)).toBeGreaterThan(65);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.locator('#tcp-profile-panel').screenshot({ path: 'tmp/tool-panel-preview.png' });
  await page.locator('#inorobot-language-select').selectOption('en');
  await expect(page.locator('#btn-export-tool-data')).toContainText('Export file');
});

async function addToolLoadChoices(page) {
  await setup(page);
  await page.locator('[data-panel-toggle="tcp-profile-panel"]').click();
  await page.locator('[data-tcp-profile="1"]').click();
  await page.evaluate(() => {
    const a = window.__toolWobj, robot = a.state.activeArticulatedModel;
    for (const [index, mass] of [3, 7, 100].entries()) {
      const model = new a.THREE.Mesh(new a.THREE.BoxGeometry(10, 20, 30), new a.THREE.MeshBasicMaterial());
      model.name = ['Clamp <A>', 'Gripper B', 'Scene object'][index];
      model.userData = { uploaded: true, placement: index === 2 ? 'scene' : 'tcp', attachmentHost: robot,
        toolLoadProperties: { mode: 'mass', massKg: mass } };
      model.position.set(index * 10, index * 20, index * 30);
      (index === 2 ? a.state.scene : a.getRobotToolMountFrame(robot)).add(model);
      a.state.models.push(model);
    }
  });
  await fillNumber(page, '[data-tool-load="mass"]', '9');
}

test('Tool 부하 정보 버튼은 가져오기 왼쪽에 있고 Tool 0에서도 단일 모델 정보를 바로 연다', async ({ page }) => {
  test.setTimeout(90000);
  await addToolLoadChoices(page);
  await page.evaluate(() => {
    const a = window.__toolWobj;
    a.state.models = a.state.models.filter(model => model.name !== 'Gripper B');
    a.selectTcpProfile(0);
  });
  const info = page.locator('#btn-tool-load-info');
  await expect(info).toBeEnabled();
  await info.scrollIntoViewIfNeeded();
  const boxes = await Promise.all([info.boundingBox(), page.locator('#btn-tool-load-from-models').boundingBox()]);
  expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x);
  await info.click();
  await expect(page.locator('#tool-load-model-dialog')).toHaveCount(0);
  await expect(page.locator('#tool-load-info-panel')).toBeVisible();
  await expect(page.locator('#tool-load-selected-name')).toContainText('Clamp <A>');
  await expect(page.locator('#tool-load-result-mass')).toHaveText('3.0000 kg');
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('0');
});

test('Tool 부하 정보는 여러 모델 중 선택한 모델을 열고 가져오기 값은 유지한다', async ({ page }) => {
  test.setTimeout(90000);
  await addToolLoadChoices(page);
  await page.locator('#btn-tool-load-info').click();
  await expect(page.locator('#tool-load-model-dialog')).toBeVisible();
  await expect(page.locator('#tool-load-model-select option')).toHaveText(['1. Clamp <A>', '2. Gripper B']);
  await page.locator('#tool-load-model-cancel').click();
  await expect(page.locator('#tool-load-info-panel')).toBeHidden();
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('9');
  await page.locator('#inorobot-language-select').selectOption('en');
  await page.locator('#btn-tool-load-info').click();
  await expect(page.locator('#tool-load-model-dialog p')).toHaveText('Select the Tool model whose load information you want to view.');
  await expect(page.locator('#tool-load-model-confirm')).toHaveText('Load information');
  await page.locator('#tool-load-model-select').selectOption('1');
  await page.locator('#tool-load-model-confirm').click();
  await expect(page.locator('#tool-load-info-panel')).toBeVisible();
  await expect(page.locator('#tool-load-selected-name')).toContainText('Gripper B');
  await expect(page.locator('#tool-load-result-mass')).toHaveText('7.0000 kg');
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('9');
  await page.locator('#tool-load-info-panel').screenshot({ path: 'tmp/tool-load-info-button-preview.png' });
});

test('여러 Tool 모델은 선택 창에서 하나를 골라 가져오고 취소·Escape 시 값을 유지한다', async ({ page }) => {
  test.setTimeout(90000);
  await addToolLoadChoices(page);
  await page.locator('#btn-tool-load-from-models').click();
  await expect(page.locator('#tool-load-model-dialog')).toBeVisible();
  await expect(page.locator('#tool-load-model-select option')).toHaveText(['1. Clamp <A>', '2. Gripper B', '모두 다']);
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('9');
  await page.locator('#tool-load-model-cancel').click();
  await expect(page.locator('#tool-load-model-dialog')).toHaveCount(0);
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('9');
  await page.locator('#btn-tool-load-from-models').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tool-load-model-dialog')).toHaveCount(0);
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('9');
  await page.locator('#inorobot-language-select').selectOption('en');
  await page.locator('#btn-tool-load-from-models').click();
  await expect(page.locator('#tool-load-model-dialog h2')).toHaveText('Select Tool model');
  await page.locator('#tool-load-model-select').selectOption('1');
  await page.locator('#tool-load-model-confirm').click();
  await expect(page.locator('#tool-load-model-dialog')).toHaveCount(0);
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('7');
  await expect(page.locator('[data-tool-load="cogX"]')).toHaveValue('10');
  await expect(page.locator('[data-tool-load="cogY"]')).toHaveValue('20');
  await expect(page.locator('[data-tool-load="cogZ"]')).toHaveValue('30');
});

test('모두 다는 Tool 모델들의 질량·무게중심·회전·평행축 관성을 합산하고 저장·내보낸다', async ({ page }) => {
  test.setTimeout(90000);
  await addToolLoadChoices(page);
  await page.evaluate(() => {
    window.__toolWobj.state.models.find(model => model.name === 'Gripper B').rotation.z = Math.PI / 2;
  });
  await page.locator('#btn-tool-load-from-models').click();
  await expect(page.locator('#tool-load-model-select option')).toHaveText(['1. Clamp <A>', '2. Gripper B', '모두 다']);
  await page.locator('#tool-load-model-select').selectOption('all');
  await page.locator('#tool-load-model-dialog').screenshot({ path: 'tmp/tool-load-all-choice.png' });
  await page.locator('#tool-load-model-confirm').click();
  // 3 kg at (0,0,0) and 7 kg at (10,20,30); the 100 kg scene object is excluded.
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('10');
  for (const [key, value] of Object.entries({ cogX: 7, cogY: 14, cogZ: 21 })) {
    await expect(page.locator(`[data-tool-load="${key}"]`)).toHaveValue(String(value));
  }
  // 10x20x30 mm cuboids, second rotated 90 degrees about Z. About combined CoG:
  // Ixx = 0.000325 + 0.000583333333 + 0.00273, and similarly for Y and Z.
  for (const [key, value] of Object.entries({ ix: 0.003638333333, iy: 0.003108333333, iz: 0.001466666667 })) {
    expect(Number(await page.locator(`[data-tool-load="${key}"]`).inputValue())).toBeCloseTo(value, 8);
  }
  await page.locator('#btn-apply-tcp-profile').click();
  await page.evaluate(async () => {
    const a = window.__toolWobj;
    // Applied Tool data is independent of the source models after import.
    a.state.models = a.state.models.filter(model => {
      if (!model.userData.uploaded) return true;
      model.removeFromParent(); return false;
    });
    await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
  });
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('10');
  const records = await exportParameters(page, 'Tool');
  expect(records[1].TLoad.mass).toBe(10);
  expect(records[1].TLoad.cog[1]).toBe(14);
  expect(records[1].TLoad.inertia[0]).toBeCloseTo(0.003638333, 9);
});

for (const failure of ['deleted', 'invalid-geometry']) test(`모두 다의 일부 모델을 사용할 수 없으면 기존 부하 값을 유지한다 (${failure})`, async ({ page }) => {
  test.setTimeout(90000);
  await addToolLoadChoices(page);
  await page.locator('#btn-tool-load-from-models').click();
  await expect(page.locator('#tool-load-model-select option[value="all"]')).toHaveText('모두 다');
  await page.locator('#tool-load-model-select').selectOption('all');
  await page.evaluate(failure => {
    const a = window.__toolWobj, model = a.state.models.find(model => model.name === 'Gripper B');
    if (failure === 'deleted') a.state.models = a.state.models.filter(item => item !== model);
    else model.geometry = new a.THREE.BufferGeometry();
  }, failure);
  await page.locator('#tool-load-model-confirm').click();
  await expect(page.locator('#tcp-profile-status')).toHaveClass(/error/);
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('9');
  await expect(page.locator('[data-tool-load="cogX"]')).toHaveValue('0');
});

test('Tool 모델 선택 중 편집 번호가 바뀌거나 모델이 삭제되면 다른 설정에 부하를 덮어쓰지 않는다', async ({ page }) => {
  test.setTimeout(90000);
  await addToolLoadChoices(page);
  await page.locator('#btn-tool-load-from-models').click();
  await expect(page.locator('#tool-load-model-dialog')).toBeVisible();
  await page.evaluate(() => window.__toolWobj.selectTcpProfile(2));
  await page.locator('#tool-load-model-confirm').click();
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('0');
  await page.locator('[data-tcp-profile="1"]').click();
  await page.locator('#btn-tool-load-from-models').click();
  await page.locator('#tool-load-model-select').selectOption('1');
  await page.evaluate(() => {
    const a = window.__toolWobj;
    a.state.models = a.state.models.filter(model => model.name !== 'Gripper B');
  });
  await page.locator('#tool-load-model-confirm').click();
  await expect(page.locator('[data-tool-load="mass"]')).toHaveValue('0');
  await expect(page.locator('#tcp-profile-status')).toHaveClass(/error/);
});

test('분리한 Tool 설정 창에서도 모델을 선택하여 해당 부하만 가져온다', async ({ page }) => {
  test.setTimeout(90000);
  await addToolLoadChoices(page);
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-panel-action="popout"][data-panel-id="tcp-profile-panel"]').click();
  const popup = await popupPromise;
  try {
    await popup.locator('#btn-tool-load-from-models').click();
    await expect(popup.locator('#tool-load-model-dialog')).toBeVisible();
    await expect(page.locator('#tool-load-model-dialog')).toHaveCount(0);
    await expect(popup.locator('#tool-load-model-dialog')).toHaveCSS('background-color', 'rgb(17, 24, 39)');
    await popup.locator('#tool-load-model-dialog').screenshot({ path: 'tmp/tool-load-model-choice-preview.png' });
    await popup.locator('#tool-load-model-select').selectOption('0');
    await popup.locator('#tool-load-model-confirm').click();
    await expect(popup.locator('[data-tool-load="mass"]')).toHaveValue('3');
    await popup.locator('#btn-tool-load-info').click();
    await expect(popup.locator('#tool-load-model-dialog')).toBeVisible();
    await popup.locator('#tool-load-model-select').selectOption('1');
    await popup.locator('#tool-load-model-confirm').click();
    await expect(page.locator('#tool-load-info-panel')).toBeVisible();
    await expect(page.locator('#tool-load-selected-name')).toContainText('Gripper B');
    await expect(page.locator('#tool-load-result-mass')).toHaveText('7.0000 kg');
    await expect(popup.locator('[data-tool-load="mass"]')).toHaveValue('3');
    const records = await exportParameters(popup, 'Tool');
    expect(records[1].TLoad.mass).toBe(3);
  } finally { await popup.close(); }
});

test('Wobj 스냅은 3D 장면에서 선택한 면의 꼭짓점을 클릭하여 원점을 설정한다', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  await page.locator('[data-panel-toggle="workobject-panel"]').click();
  await page.locator('[data-work-object-index="1"]').click();
  await page.locator('#workobject-snap-type').selectOption('vertex');
  await page.evaluate(() => {
    const { state, THREE } = window.__toolWobj;
    const model = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial());
    state.activeArticulatedModel.visible = false;
    model.userData = { uploaded: true, placement: 'scene' };
    state.scene.add(model); state.models.push(model);
    state.camera.position.set(0, -500, 0);
    state.controls.target.set(0, 0, 0); state.controls.update();
  });
  await page.locator('#btn-workobject-snap').click();
  async function point(x, y, z) {
    return page.evaluate(([x, y, z]) => {
      const { state, THREE } = window.__toolWobj;
      const p = new THREE.Vector3(x, y, z).project(state.camera), r = state.renderer.domElement.getBoundingClientRect();
      return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
    }, [x, y, z]);
  }
  const panelLeft = (await page.locator('#workobject-panel').boundingBox()).x;
  const facePoints = await Promise.all([point(30, -50, 0), point(-30, -50, 0)]);
  const p = facePoints.find(point => point.x < panelLeft - 12);
  expect(p, 'face point must be outside the settings panel').toBeTruthy();
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.__toolWobj.state.snapCandidatesReady && window.__toolWobj.state.snapFaceSelections.length > 0);
  // Select a visible marker outside the floating settings panel.
  const target = await page.evaluate(() => {
    const { state } = window.__toolWobj;
    const rect = state.renderer.domElement.getBoundingClientRect();
    const panel = document.querySelector('#workobject-panel').getBoundingClientRect();
    for (const candidate of state.snapCandidates.filter(candidate => candidate.type === 'vertex')) {
      const world = candidate.localPoint.clone().applyMatrix4(candidate.mesh.matrixWorld);
      const projected = world.clone().project(state.camera);
      const x = rect.left + (projected.x + 1) * rect.width / 2;
      const y = rect.top + (1 - projected.y) * rect.height / 2;
      if (x > 330 && x < panel.left - 20 && y > 140 && y < 600) return { x, y, world: world.toArray() };
    }
    throw new Error('No unobstructed vertex marker');
  });
  await page.mouse.move(target.x, target.y); await page.mouse.click(target.x, target.y);
  for (const [index, axis] of ['x', 'y', 'z'].entries()) {
    const baseOffset = [36.5, 0, 155];
    await expect(page.locator(`[data-workobject-pose="${axis}"]`)).toHaveValue(String(target.world[index] - baseOffset[index]));
  }
  expect(errors).toEqual([]);
});

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) test(`이동·회전한 로봇의 Wobj 화면·스냅·내보내기·저장은 같은 Wobj 0 기준을 사용한다 (${model})`, async ({ page }) => {
  test.setTimeout(90000);
  await setup(page, model);
  await page.locator('[data-panel-toggle="workobject-panel"]').click();
  await page.locator('[data-work-object-index="1"]').click();
  const expectedWorld = await page.evaluate(() => {
    const a = window.__toolWobj, robot = a.state.activeArticulatedModel;
    robot.position.set(1000, -500, 200); robot.rotation.z = Math.PI / 2;
    robot.updateMatrixWorld(true); a.renderWorkObjectPanel(robot);
    const base = a.getRobotControllerBaseFrame(robot).getWorldPosition(new a.THREE.Vector3());
    return [base.x - 20, base.y + 10, base.z + 30];
  });
  for (const axis of ['x', 'y', 'z', 'rx', 'ry', 'rz']) await expect(page.locator(`[data-workobject-pose="${axis}"]`)).toHaveValue('0');
  await fillNumber(page, '[data-workobject-pose="rz"]', '40');
  await page.locator('#btn-workobject-snap').click();
  await page.evaluate(world => {
    const a = window.__toolWobj; a.applyTcpSnapPoint(new a.THREE.Vector3().fromArray(world));
  }, expectedWorld);
  for (const [index, axis] of ['x', 'y', 'z'].entries()) await expect(page.locator(`[data-workobject-pose="${axis}"]`)).toHaveValue(String([10, 20, 30][index]));
  await page.locator('#btn-apply-workobject').click();
  const saved = await page.evaluate(() => {
    const a = window.__toolWobj, robot = a.state.activeArticulatedModel;
    return { ...robot.userData.workObjects[1], visual: a.state.workObjectVisuals.find(entry => entry.robot === robot && entry.index === 1).group.position.toArray() };
  });
  saved.position.forEach((value, index) => expect(value).toBeCloseTo(expectedWorld[index], 6));
  saved.visual.forEach((value, index) => expect(value).toBeCloseTo(expectedWorld[index], 6));
  expect(saved.rotation[2]).toBeCloseTo(130, 6);
  // Numeric edits are also relative to Wobj 0, with one conversion on apply.
  await fillNumber(page, '[data-workobject-pose="x"]', '12.5');
  await page.locator('#btn-apply-workobject').click();
  await page.evaluate(async () => {
    const a = window.__toolWobj;
    await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
  });
  await expect(page.locator('[data-workobject-pose="x"]')).toHaveValue('12.5');
  await expect(page.locator('[data-workobject-pose="rz"]')).toHaveValue('40');
  // Export an already-saved frame and the current, unapplied slot together.
  await page.locator('[data-work-object-index="15"]').click();
  await fillNumber(page, '[data-workobject-pose="x"]', '99');
  const records = await exportParameters(page, 'Wobj');
  expect(records[1].UFrame.Data).toEqual([12.5, 20, 30, 40, 0, 0]);
  expect(records[15].UFrame.Data).toEqual([99, 0, 0, 0, 0, 0]);
  expect(records[2].UFrame.Data).toEqual([0, 0, 0, 0, 0, 0]);
});

test('Tool dat는 다른 번호의 저장된 값과 현재 입력값을 함께 내보내며 Wobj 분리 창도 dat를 저장한다', async ({ page }) => {
  test.setTimeout(90000);
  await setup(page);
  await page.locator('[data-panel-toggle="tcp-profile-panel"]').click();
  await page.locator('[data-tcp-profile="1"]').click();
  await fillNumber(page, '[data-tcp-offset="x"]', '11');
  await page.locator('#btn-apply-tcp-profile').click();
  await page.locator('[data-tcp-profile="15"]').click();
  for (const [key, value] of Object.entries({ x: '123.4567', rx: '10', ry: '20', rz: '30' })) {
    await fillNumber(page, `[data-tcp-offset="${key}"]`, value);
  }
  await fillNumber(page, '[data-tool-load="mass"]', '7');
  const tools = await exportParameters(page, 'Tool');
  expect(tools[1].TFrame.Data).toEqual([11, 0, 0, 0, 0, 0]);
  expect(tools[15].TFrame.Data).toEqual([123.4567, 0, 0, 30, 20, 10]);
  expect(tools[15].TLoad.mass).toBe(7);
  expect(await page.evaluate(() => window.__toolWobj.state.activeArticulatedModel.userData.tcpProfiles[15].load.mass)).toBe(0);
  await page.locator('[data-panel-action="hide"][data-panel-id="tcp-profile-panel"]').click();
  await page.locator('[data-panel-toggle="workobject-panel"]').click();
  await page.locator('[data-work-object-index="15"]').click();
  await fillNumber(page, '[data-workobject-pose="z"]', '77');
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-panel-action="popout"][data-panel-id="workobject-panel"]').click();
  const popup = await popupPromise;
  try {
    const workObjects = await exportParameters(popup, 'Wobj');
    expect(workObjects[15].UFrame.Data).toEqual([0, 0, 77, 0, 0, 0]);
    expect(workObjects[0].UFrame.Data).toEqual([0, 0, 0, 0, 0, 0]);
    await popup.locator('#workobject-panel').screenshot({ path: 'tmp/wobj-dat-export-preview.png' });
  } finally { await popup.close(); }
});
