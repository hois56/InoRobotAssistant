import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__objectReset={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,writeOlpAddress,readOlpSimulatorBit,updateConveyorSimulation};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__objectReset?.state.workspaceRecovery.ready);
}

test('오브젝트 편집의 저장 버튼 옆에서 해당 등록만 원위치로 되돌린다', async ({ page }) => {
  await setup(page);
  await page.waitForFunction(() => window.__objectReset.state.workspaceRecovery.ready);
  const expected = await page.evaluate(() => {
    const a = window.__objectReset, app = a.equipmentApp;
    const box = name => { const m = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name }); a.state.scene.add(m); a.state.models.push(m); return m; };
    const target = box('원위치 대상'), other = box('다른 등록');
    target.position.set(10, 20, 30); target.rotation.set(0.2, 0.4, 0.6); target.updateWorldMatrix(true, false);
    const original = target.matrixWorld.toArray();
    const ref = m => 'equipment-model:' + a.ensureWorkspaceModelId(m) + '/-1';
    app.save({ id: 'editor-reset-object', type: 'OBJECT', movingRef: ref(target) });
    app.save({ id: 'editor-other-object', type: 'OBJECT', movingRef: ref(other) });
    target.position.set(300, 400, 500); target.rotation.set(1, 2, 3); other.position.set(600, 700, 800);
    app.ui.open(ref(target));
    return { original, targetRef: ref(target), otherRef: ref(other) };
  });
  await page.locator('#equipment-registered').evaluate(node => node.open = true);
  await page.locator('[data-equipment-id="editor-reset-object"] [data-equipment-command="EDIT"]').click();
  const reset = page.locator('#equipment-form .equipment-toolbar #equipment-object-reset');
  await expect(reset).toBeVisible(); await expect(reset).toBeEnabled(); await reset.click();
  const actual = await page.evaluate(({ targetRef, otherRef }) => {
    const app = window.__objectReset.equipmentApp, target = app.resolve(targetRef).object;
    target.updateWorldMatrix(true, false);
    return { matrix: target.matrixWorld.toArray(), other: app.resolve(otherRef).object.position.toArray(), id: document.querySelector('#equipment-form [name="id"]').value };
  }, expected);
  actual.matrix.forEach((value, index) => expect(value).toBeCloseTo(expected.original[index], 6));
  expect(actual.other).toEqual([600, 700, 800]); expect(actual.id).toBe('editor-reset-object');
});

test('오브젝트 원위치는 첫 등록 뒤 활성화되고 다른 동작 설정에서는 숨긴다', async ({ page }) => {
  await setup(page);
  await page.waitForFunction(() => window.__objectReset.state.workspaceRecovery.ready);
  await page.evaluate(() => {
    const a = window.__objectReset, m = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '신규 오브젝트' });
    a.state.scene.add(m); a.state.models.push(m); a.equipmentApp.ui.open('equipment-model:' + a.ensureWorkspaceModelId(m) + '/-1');
  });
  const form = page.locator('#equipment-form'), reset = form.locator('#equipment-object-reset');
  await form.locator('[name="type"]').selectOption('OBJECT');
  await expect(reset).toBeVisible(); await expect(reset).toBeDisabled();
  await form.locator('button[type="submit"]').click(); await expect(reset).toBeEnabled();
  await expect(page.locator('#equipment-current-controls [data-equipment-command="RESET"]')).toBeVisible();
  await form.locator('[name="type"]').selectOption('CYLINDER'); await expect(reset).toBeHidden();
});

test('모두 원위치는 등록 당시 위치·회전을 프로젝트 복원 후에도 유지한다', async ({ page }) => {
  await setup(page);
  const expected = await page.evaluate(async () => {
    const a = window.__objectReset, app = a.equipmentApp;
    const make = (name, xyz) => {
      const model = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name });
      model.position.fromArray(xyz); model.rotation.set(0.2, 0.4, 0.6);
      a.state.scene.add(model); a.state.models.push(model); return model;
    };
    const first = make('복원 제품 A', [10, 20, 30]), second = make('복원 제품 B', [100, 200, 300]);
    const ref = model => 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
    const refs = [ref(first), ref(second)];
    app.save({ id: 'reset-products', type: 'OBJECT', movingRefs: refs });
    const original = [first, second].map(model => { model.updateWorldMatrix(true, false); return model.matrixWorld.toArray(); });
    first.position.set(500, 0, 0); first.rotation.set(1, 2, 3);
    second.position.set(-500, 0, 0); second.rotation.set(-1, -2, -3);
    // Editing the registration must not replace its original pose with the moved pose.
    app.save({ id: 'reset-products', type: 'OBJECT', movingRefs: refs });
    await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
    app.ui.open(refs[0]);
    return { refs, original };
  });
  await page.locator('#equipment-registered').evaluate(node => node.open = true);
  await page.locator('[data-equipment-global="reset"]').click();
  const actual = await page.evaluate(refs => refs.map(ref => {
    const object = window.__objectReset.equipmentApp.resolve(ref).object;
    object.updateWorldMatrix(true, false); return object.matrixWorld.toArray();
  }), expected.refs);
  actual.forEach((matrix, index) => matrix.forEach((value, element) => expect(value).toBeCloseTo(expected.original[index][element], 6)));
});

test('고정 행렬 하위 부품도 기준 월드 위치로 복원하고 미등록 부품은 유지한다', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const a = window.__objectReset, app = a.equipmentApp;
    const root = new a.THREE.Group(); root.userData.uploaded = true; root.userData.placement = 'scene';
    const part = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '등록 부품' });
    const ignored = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '미등록 부품' });
    part.position.set(10, 20, 30); ignored.position.x = 100; root.add(part, ignored);
    root.userData.importedParts = [part, ignored]; a.state.scene.add(root); a.state.models.push(root);
    part.updateMatrix(); part.matrixAutoUpdate = false;
    const ref = 'equipment-model:' + a.ensureWorkspaceModelId(root) + '/0';
    app.save({ id: 'part-reset', type: 'OBJECT', movingRef: ref });
    part.updateWorldMatrix(true, false); const original = part.matrixWorld.toArray();
    root.position.set(1000, 2000, 3000); root.rotation.z = 0.4;
    part.position.set(300, 400, 500); part.rotation.x = 0.8; part.updateMatrix();
    app.ui.open(ref);
    return { ref, original, ignored: ignored.position.toArray(), root: root.position.toArray() };
  });
  await expect(page.locator('[data-equipment-global="reset"]')).toBeVisible();
  await page.locator('[data-equipment-global="reset"]').click();
  const actual = await page.evaluate(ref => {
    const target = window.__objectReset.equipmentApp.resolve(ref);
    target.object.updateWorldMatrix(true, false);
    return { matrix: target.object.matrixWorld.toArray(), ignored: target.model.children[1].position.toArray(), root: target.model.position.toArray() };
  }, result.ref);
  actual.matrix.forEach((value, index) => expect(value).toBeCloseTo(result.original[index], 6));
  expect(actual.ignored).toEqual(result.ignored); expect(actual.root).toEqual(result.root);
});

test('흡착 중 모두 원위치는 물체를 놓고 복원하며 재개 전에는 다시 이동하지 않는다', async ({ page }) => {
  await setup(page);
  await page.waitForFunction(() => window.__objectReset.state.workspaceRecovery.ready);
  await page.locator('#model-select').selectOption('robot:IR-R7H-90');
  await page.waitForFunction(() => window.__objectReset.state.models.some(m => m.userData.tcpFrame));
  await page.evaluate(() => {
    const a = window.__objectReset, app = a.equipmentApp;
    const box = (name, z) => {
      const model = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name });
      model.position.z = z; a.state.scene.add(model); a.state.models.push(model); return model;
    };
    const pad = box('초기화 패드', 20), object = box('초기화 제품', 0);
    const ref = model => 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
    const robot = a.state.models.find(m => m.userData.tcpFrame);
    const def = app.save({ id: 'held-object', type: 'OBJECT', movingRef: ref(object), robotRef: ref(robot), feedbackGrip: 600 }, { forward: 512, reverse: null });
    a.writeOlpAddress('Out[512]', 1); app.runtime.start();
    app.runtime.applyVacuum(def, true); robot.position.x += 200; app.runtime.followVacuum(def);
    if (!def.runtime.heldRef || Math.abs(object.getWorldPosition(new a.THREE.Vector3()).x - 200) > 1e-6) throw new Error('흡착 이동 재현 실패');
    app.ui.open(ref(object));
  });
  await page.locator('[data-equipment-global="reset"]').click();
  const result = await page.evaluate(() => {
    const a = window.__objectReset, app = a.equipmentApp;
    const vacuum = a.state.equipmentDefinitions.find(def => def.id === 'held-vacuum');
    const object = app.resolve(a.state.equipmentDefinitions.find(def => def.id === 'held-object').movingRef).object;
    app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, 0);
    app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, 100);
    return { position: object.position.toArray(), held: vacuum.runtime.heldRef, owner: object.userData.equipmentOwner || '', suspended: app.runtime.suspended, sensor: a.readOlpSimulatorBit('IN', 600) };
  });
  expect(result).toEqual({ position: [0, 0, 0], held: '', owner: '', suspended: true, sensor: 0 });
});

test('컨베이어가 이송한 오브젝트도 이송 시작점 대신 등록 기준점으로 복원한다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const a = window.__objectReset, app = a.equipmentApp;
    const box = (name, dimensions, xyz) => {
      const model = a.createPrimitiveShapeRoot('box', dimensions, { name }); model.position.fromArray(xyz);
      a.state.scene.add(model); a.state.models.push(model); return model;
    };
    const belt = box('복원 벨트', { x: 800, y: 160, z: 30 }, [0, 0, 0]);
    const object = box('이송 제품', { x: 20, y: 20, z: 20 }, [-100, 0, 30]);
    const ref = 'equipment-model:' + a.ensureWorkspaceModelId(object) + '/-1';
    app.save({ id: 'belt-object-reset', type: 'OBJECT', movingRef: ref });
    object.position.x = -80;
    a.state.ioFunctionMappings = [{ id: 'reset-belt', enabled: true, action: 'CONVEYOR', direction: 'OUT', address: 512, triggerValue: 1,
      gripObjectRef: 'conveyor:' + a.ensureWorkspaceModelId(belt), conveyorAxis: 'X', conveyorSpeed: 100 }];
    a.writeOlpAddress('Out[512]', 1); a.updateConveyorSimulation(0); a.updateConveyorSimulation(100);
    if (Math.abs(object.position.x + 70) > 0.001) throw new Error('컨베이어 이동 재현 실패');
    app.ui.open(ref);
  });
  await page.locator('[data-equipment-global="reset"]').click();
  expect(await page.evaluate(() => {
    const a = window.__objectReset;
    a.updateConveyorSimulation(200); a.updateConveyorSimulation(300);
    return a.equipmentApp.resolve(a.state.equipmentDefinitions.find(def => def.id === 'belt-object-reset').movingRef).object.position.toArray();
  })).toEqual([-100, 0, 30]);
});

test('오브젝트 설정의 원위치 Output·전체 원위치·무작위 범위를 저장하고 IO로 실행한다', async ({ page }) => {
  await setup(page);
  await page.waitForFunction(() => window.__objectReset.state.workspaceRecovery.ready);
  const refs = await page.evaluate(() => {
    const a = window.__objectReset;
    const box = (name, xyz, rz) => {
      const model = a.createPrimitiveShapeRoot('box', { x: 40, y: 20, z: 10 }, { name });
      model.position.fromArray(xyz); model.rotation.z = rz; a.state.scene.add(model); a.state.models.push(model); return model;
    };
    const ref = model => 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
    const first = box('비전 제품 A', [100, 50, 5], 0.3), second = box('비전 제품 B', [300, 0, 5], 0);
    a.equipmentApp.ui.open(ref(first));
    return { first: ref(first), second: ref(second) };
  });
  const form = page.locator('#equipment-form');
  // Number fields select their text on the first click; clear them so typing replaces the default.
  const fillNumber = async (input, value) => { await input.evaluate(node => { node.value = ''; }); await input.fill(value); await expect(input).toHaveValue(value); };
  await form.locator('[name="type"]').selectOption('OBJECT');
  await expect(page.locator('#equipment-forward-label')).toHaveText('원위치 Output 번호');
  await expect(form.locator('[name="reverseAddress"]')).toBeHidden();
  await expect(form.locator('[name="resetAll"]')).toBeVisible();
  await expect(form.locator('[name="randomRangeX"]')).toBeDisabled();
  await fillNumber(form.locator('[name="forwardAddress"]'), '600');
  await form.locator('[name="randomHome"]').check();
  await expect(form.locator('[name="randomRangeX"]')).toBeEnabled();
  await fillNumber(form.locator('[name="randomRangeX"]'), '20');
  await fillNumber(form.locator('[name="randomRangeY"]'), '30');
  await fillNumber(form.locator('[name="randomRangeRz"]'), '15');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#equipment-error')).toContainText('등록');

  // An Output that already matches the condition must not move anything on save.
  await page.evaluate(({ first, second }) => {
    const a = window.__objectReset, app = a.equipmentApp;
    app.resolve(first).object.position.set(900, 900, 5);
    a.writeOlpAddress('Out[601]', 1);
    app.ui.open(second);
  }, refs);
  await form.locator('[name="type"]').selectOption('OBJECT');
  await fillNumber(form.locator('[name="forwardAddress"]'), '601');
  await form.locator('[name="resetAll"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#equipment-error')).toContainText('등록');

  const result = await page.evaluate(async ({ first, second }) => {
    const a = window.__objectReset, app = a.equipmentApp, THREE = a.THREE;
    const objectOf = ref => app.resolve(ref).object;
    const pose = ref => {
      const object = objectOf(ref); object.updateWorldMatrix(true, true);
      return { center: new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).toArray(), rz: new THREE.Euler().setFromRotationMatrix(object.matrixWorld).z, z: object.matrixWorld.elements[14] };
    };
    const homeOf = ref => a.state.equipmentDefinitions.find(def => def.type === 'OBJECT' && def.movingRef === ref);
    const savedPosition = objectOf(first).position.toArray();
    app.runtime.adapter.random = () => 0.9;
    a.writeOlpAddress('Out[601]', 0);
    const afterOff = objectOf(first).position.toArray();
    objectOf(second).position.set(-400, -400, 5);
    a.writeOlpAddress('Out[601]', 1);
    const all = { first: pose(first), second: pose(second) };
    objectOf(first).position.set(700, 0, 5); objectOf(second).position.set(-700, 0, 5);
    a.writeOlpAddress('Out[600]', 1);
    const single = { first: pose(first), second: objectOf(second).position.toArray() };
    const owners = a.state.ioFunctionMappings.filter(m => m.action === 'OBJECT_RESET').map(m => [m.address, m.gripObjectRef, m.objectResetOwner]);
    await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
    const restored = homeOf(first);
    const restoredOwners = a.state.ioFunctionMappings.filter(m => m.action === 'OBJECT_RESET').map(m => [m.address, m.gripObjectRef, m.objectResetOwner]);
    objectOf(first).position.set(800, 0, 5);
    a.writeOlpAddress('Out[600]', 0); a.writeOlpAddress('Out[600]', 1);
    const afterRestore = pose(first);
    return { savedPosition, afterOff, all, single, owners, restoredOwners, afterRestore,
      ids: { first: homeOf(first).id, second: homeOf(second).id },
      random: [restored.randomHome, restored.randomRangeX, restored.randomRangeY, restored.randomRangeRz] };
  }, refs);
  // 0.9 maps to +80% of each range: X +16 mm, Y +24 mm, R +12 deg about the part center.
  const near = (actual, expected) => actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 4));
  expect(result.savedPosition).toEqual([900, 900, 5]); expect(result.afterOff).toEqual([900, 900, 5]);
  near(result.all.first.center, [116, 74, 10]); expect(result.all.first.rz).toBeCloseTo(0.3 + 12 * Math.PI / 180, 6); expect(result.all.first.z).toBeCloseTo(5, 6);
  near(result.all.second.center, [300, 0, 10]); expect(result.all.second.rz).toBeCloseTo(0, 6);
  near(result.single.first.center, [116, 74, 10]); expect(result.single.second).toEqual([-700, 0, 5]);
  expect(result.owners).toEqual([[600, 'equipment:' + result.ids.first, result.ids.first], [601, 'all', result.ids.second]]);
  expect(result.restoredOwners).toEqual(result.owners); expect(result.random).toEqual([true, 20, 30, 15]);
  // After a project restore the default random source is used, so the pose stays inside the range.
  expect(Math.abs(result.afterRestore.center[0] - 100)).toBeLessThanOrEqual(20 + 1e-6);
  expect(Math.abs(result.afterRestore.center[1] - 50)).toBeLessThanOrEqual(30 + 1e-6);
  expect(Math.abs(result.afterRestore.rz - 0.3)).toBeLessThanOrEqual(15 * Math.PI / 180 + 1e-6);

  await page.evaluate(ref => window.__objectReset.equipmentApp.ui.open(ref), refs.second);
  await page.locator('#equipment-registered').evaluate(node => node.open = true);
  await page.locator(`[data-equipment-id="${result.ids.second}"] [data-equipment-command="EDIT"]`).click();
  await expect(form.locator('[name="forwardAddress"]')).toHaveValue('601');
  await expect(form.locator('[name="resetAll"]')).toBeChecked();
  await expect(form.locator('[name="randomHome"]')).not.toBeChecked();
  await page.locator(`[data-equipment-id="${result.ids.first}"] [data-equipment-command="EDIT"]`).click();
  await expect(form.locator('[name="forwardAddress"]')).toHaveValue('600');
  await expect(form.locator('[name="resetAll"]')).not.toBeChecked();
  await expect(form.locator('[name="randomHome"]')).toBeChecked();
  await expect(form.locator('[name="randomRangeY"]')).toHaveValue('30');
  // Removing a registration also removes the home IO configured in its settings.
  expect(await page.evaluate(id => {
    const a = window.__objectReset; a.equipmentApp.remove(id);
    return a.state.ioFunctionMappings.filter(m => m.action === 'OBJECT_RESET').map(m => m.address);
  }, result.ids.second)).toEqual([600]);
});

test('원위치로 등록 버튼은 현재 위치·회전을 새 원위치로 저장하고 되돌릴 수 있다', async ({ page }) => {
  await setup(page);
  await page.waitForFunction(() => window.__objectReset.state.workspaceRecovery.ready);
  const ref = await page.evaluate(() => {
    const a = window.__objectReset, app = a.equipmentApp;
    const model = a.createPrimitiveShapeRoot('box', { x: 40, y: 20, z: 10 }, { name: '원위치 변경 제품' });
    model.position.set(10, 20, 0); a.state.scene.add(model); a.state.models.push(model);
    const ref = 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
    app.save({ id: 'home-update-object', type: 'OBJECT', movingRef: ref });
    model.position.set(150, -40, 0); model.rotation.z = 0.5;
    app.ui.open(ref);
    return ref;
  });
  const form = page.locator('#equipment-form'), status = page.locator('#equipment-error');
  const pose = () => page.evaluate(ref => {
    const a = window.__objectReset, object = a.equipmentApp.resolve(ref).object;
    object.updateWorldMatrix(true, false);
    return { current: object.matrixWorld.toArray(), home: a.state.equipmentDefinitions.find(def => def.id === 'home-update-object').origins.objectWorld[ref], position: [...object.position.toArray(), object.rotation.z] };
  }, ref);
  const same = (actual, expected) => actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
  const registered = await pose();
  expect(registered.home[12]).toBeCloseTo(10, 6);

  await page.locator('#equipment-registered').evaluate(node => node.open = true);
  await page.locator('[data-equipment-id="home-update-object"] [data-equipment-command="EDIT"]').click();
  const setHome = form.locator('.equipment-toolbar #equipment-object-set-home');
  await expect(setHome).toBeVisible(); await expect(setHome).toBeEnabled();
  await expect(page.locator('#equipment-current-controls [data-equipment-command="SET_HOME"]')).toBeVisible();
  await setHome.click();
  await expect(status).toContainText('원위치로 등록했습니다');
  const first = await pose();
  same(first.home, first.current);

  // Moving away and homing returns to the newly registered pose, not the first registration.
  await page.evaluate(ref => { const object = window.__objectReset.equipmentApp.resolve(ref).object; object.position.set(500, 500, 0); object.rotation.z = 0; }, ref);
  await form.locator('#equipment-object-reset').click();
  same((await pose()).position, [150, -40, 0, 0.5]);

  // A registration in the list can be updated without opening its editor.
  await page.locator('#equipment-new').click();
  await page.evaluate(ref => { const object = window.__objectReset.equipmentApp.resolve(ref).object; object.position.set(-60, 80, 0); object.rotation.z = -0.2; }, ref);
  await page.locator('#equipment-list [data-equipment-id="home-update-object"] [data-equipment-command="SET_HOME"]').click();
  await expect(status).toContainText('원위치로 등록했습니다');
  const second = await pose();
  same(second.home, second.current);

  // A held object cannot become the home, and the registered pose stays unchanged.
  const refused = await page.evaluate(ref => {
    const app = window.__objectReset.equipmentApp, model = app.resolve(ref).model, saved = { ...model.userData };
    model.userData.placement = 'grip-object'; model.userData.attachmentHost = model.parent;
    try { app.command('home-update-object', 'SET_HOME'); return ''; } catch (error) { return error.message; }
    finally { model.userData.placement = saved.placement; model.userData.attachmentHost = saved.attachmentHost; }
  }, ref);
  expect(refused).toContain('흡착을 해제');
  same((await pose()).home, second.home);

  await page.evaluate(() => document.getElementById('btn-undo').click());
  same((await pose()).home, first.home);
});
