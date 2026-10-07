import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__objectReset={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,writeOlpAddress,readOlpSimulatorBit,updateConveyorSimulation};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__objectReset);
}

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
  await page.evaluate(() => {
    const a = window.__objectReset, app = a.equipmentApp;
    const box = (name, z) => {
      const model = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name });
      model.position.z = z; a.state.scene.add(model); a.state.models.push(model); return model;
    };
    const pad = box('초기화 패드', 20), object = box('초기화 제품', 0);
    const ref = model => 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
    app.save({ id: 'held-object', type: 'OBJECT', movingRef: ref(object) });
    const def = app.save({ id: 'held-vacuum', type: 'VACUUM', movingRef: ref(pad), feedbackGrip: 600 }, { forward: 512, reverse: null });
    a.writeOlpAddress('Out[512]', 1); app.runtime.start();
    app.runtime.applyVacuum(def, true); pad.position.x = 200; app.runtime.followVacuum(def);
    if (!def.runtime.heldRef || object.position.x !== 200) throw new Error('흡착 이동 재현 실패');
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
