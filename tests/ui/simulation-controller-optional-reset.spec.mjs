import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__optionalReset={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,ensureVirtualControllerCore,handleVirtualControllerMessage,readInterferenceZoneFromController,readInterferenceToolFromController,renderInterferenceZonePanel,refreshVirtualControllerUi,writeOlpAddress,setOlpInputFromIoSimulator,readOlpSimulatorBit,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,openIoFunctionMappingDialog};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__optionalReset);
}

test('가상컨트롤러의 간섭영역·Tool 설정과 IO를 가져오고 미지원 항목은 기존 값과 연결을 유지한다', async ({ page }) => {
  await setup(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const a = window.__optionalReset, c = a.state.virtualController;
    await a.ensureVirtualControllerCore(c);
    const sent = [];
    Object.assign(c, { wanted: true, status: 'streaming', source: 'bridge', controllerKind: 'virtual',
      socket: { readyState: 1, send: value => sent.push(JSON.parse(value)) }, streamWatchdogTimer: 1 });
    a.renderInterferenceZonePanel(); a.refreshVirtualControllerUi();
    const enabled = !document.querySelector('[data-interference-zone-read]').disabled;
    a.readInterferenceZoneFromController(0, c); a.readInterferenceToolFromController(5, c);
    const event = (type, result) => a.handleVirtualControllerMessage(JSON.stringify({ type, result }), c);
    event('interferenceZoneReadResult', { success: true, zoneNumber: 0,
      zone: { setType: 0, diagonal: [10, 20, 30, 40, 50, 60], input: 2, output: 3, scope: 0, isAlert: 0, safeL: 5 } });
    event('interferenceToolReadResult', { success: true, toolNumber: 5, tool: { type: 2, zPos: 125, ballR: 45 } });
    const before = JSON.stringify([a.state.interferenceZones, a.state.endMonitoringObjects]);
    const statusBefore = document.getElementById('stat-status').textContent;
    a.readInterferenceZoneFromController(0, c); a.readInterferenceToolFromController(5, c);
    event('interferenceZoneReadResult', { success: false, zoneNumber: 0, message: 'unsupported zone' });
    event('interferenceToolReadResult', { success: false, toolNumber: 5, message: 'unsupported tool' });
    a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: { joints: [1, 2, 3, 4, 5, 6], outputs: { 0: 1, 16: 0 } } }), c);
    a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: { joints: [2, 3, 4, 5, 6, 7] } }), c);
    return { enabled, sent: sent.map(item => item.type), zone: a.state.interferenceZones[0].geometry,
      sphere: a.state.endMonitoringObjects[5].sphere, unchanged: before === JSON.stringify([a.state.interferenceZones, a.state.endMonitoringObjects]),
      pending: c.pendingInterferenceReads.size + c.pendingInterferenceToolReads.size,
      status: c.status, out: a.readOlpSimulatorBit('OUT', 0), statusBefore, statusText: document.getElementById('stat-status').textContent };
  });
  expect(result.enabled).toBe(true); expect(result.sent).toHaveLength(4);
  expect(result.zone.p1).toEqual([10, 20, 30]); expect(result.zone.p2).toEqual([40, 50, 60]);
  expect(result.sphere).toEqual({ centerZ: 125, radius: 45 }); expect(result.unchanged).toBe(true);
  expect(result.pending).toBe(0); expect(result.status).toBe('streaming'); expect(result.out).toBe(1);
  expect(result.statusText).toBe(result.statusBefore); expect(result.statusText).not.toContain('unsupported'); expect(errors).toEqual([]);
});

test('가상컨트롤러가 설정 요청에 응답하지 않아도 가져오기 버튼이 다시 활성화된다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const a = window.__optionalReset, c = a.state.virtualController;
    Object.assign(c, { wanted: true, status: 'streaming', source: 'bridge', controllerKind: 'virtual', socket: { readyState: 1, send() {} } });
    a.renderInterferenceZonePanel(); a.readInterferenceZoneFromController(0, c);
  });
  await expect(page.locator('[data-interference-zone-read]').first()).toBeDisabled();
  await expect(page.locator('[data-interference-zone-read]').first()).toBeEnabled({ timeout: 5000 });
});

test('원위치 IO 매핑은 선택 오브젝트·전체, OFF 조건, 프로젝트 복원과 한 번 실행을 지원한다', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const a = window.__optionalReset;
    for (const [name, x] of [['first', 10], ['second', 100]]) {
      const model = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name });
      model.position.set(x, 20, 30); model.rotation.set(.2, .4, .6);
      a.state.scene.add(model); a.state.models.push(model);
      const ref = 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
      a.equipmentApp.save({ id: name, type: 'OBJECT', movingRef: ref });
    }
    a.openIoFunctionMappingDialog();
  });
  await page.locator('#io-function-mapping-action').selectOption('OBJECT_RESET');
  await expect(page.locator('#io-function-mapping-direction')).toBeEnabled();
  await expect(page.locator('#io-equipment-command-field')).toBeHidden();
  await page.locator('#io-function-mapping-direction').selectOption('IN');
  await page.locator('#io-function-mapping-grip-target').selectOption('equipment:first');
  await page.locator('#io-function-mapping-add').click();
  const first = await page.evaluate(async () => {
    const a = window.__optionalReset;
    const object = id => a.equipmentApp.resolve(a.state.equipmentDefinitions.find(d => d.id === id).movingRef).object;
    object('first').position.x = 500; object('first').rotation.set(1, 2, 3); object('second').position.x = 600;
    await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
    const input = { direction: 'IN', bitStart: 512, bitEnd: 512, bitWidth: 1, mode: 'bit', runtimeAddress: 'In[512]' };
    a.setOlpInputFromIoSimulator(input, 1);
    const reset = { xyz: object('first').position.toArray(), rotation: object('first').rotation.toArray().slice(0, 3), other: object('second').position.x };
    object('first').position.x = 777; a.setOlpInputFromIoSimulator(input, 1);
    return { ...reset, afterSameSignal: object('first').position.x, action: a.state.ioFunctionMappings[0].action };
  });
  expect(first.xyz).toEqual([10, 20, 30]); first.rotation.forEach((value, i) => expect(value).toBeCloseTo([.2, .4, .6][i], 6));
  expect(first.other).toBe(600); expect(first.afterSameSignal).toBe(777); expect(first.action).toBe('OBJECT_RESET');
  await page.evaluate(() => window.__optionalReset.openIoFunctionMappingDialog());
  await page.locator('#io-function-mapping-action').selectOption('OBJECT_RESET');
  await page.locator('#io-function-mapping-direction').selectOption('OUT');
  await page.locator('#io-function-mapping-address').evaluate(input => { input.value = ''; });
  await page.locator('#io-function-mapping-address').fill('513');
  await expect(page.locator('#io-function-mapping-address')).toHaveValue('513');
  await page.locator('#io-function-mapping-trigger').selectOption('0');
  await page.locator('#io-function-mapping-grip-target').selectOption('all');
  await page.evaluate(() => window.__optionalReset.writeOlpAddress('Out[513]', 1));
  await page.locator('#io-function-mapping-add').click();
  await expect(page.locator('#io-function-mapping-count')).toHaveText('2');
  const all = await page.evaluate(() => {
    const a = window.__optionalReset; a.writeOlpAddress('Out[513]', 0);
    return a.state.equipmentDefinitions.filter(d => d.type === 'OBJECT').map(d => a.equipmentApp.resolve(d.movingRef).object.position.x);
  });
  expect(all).toEqual([10, 100]);
});

test('IO 원위치는 흡착을 해제하고 선택하지 않은 오브젝트와 설비 위치를 보존한다', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const a = window.__optionalReset, app = a.equipmentApp;
    const make = (name, z) => {
      const model = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name });
      model.position.z = z; a.state.scene.add(model); a.state.models.push(model); return model;
    };
    const ref = model => 'equipment-model:' + a.ensureWorkspaceModelId(model) + '/-1';
    const pad = make('pad', 20), product = make('product', 0), other = make('other', 100);
    app.save({ id: 'product', type: 'OBJECT', movingRef: ref(product) });
    app.save({ id: 'other', type: 'OBJECT', movingRef: ref(other) });
    const vacuum = app.save({ id: 'vacuum', type: 'VACUUM', movingRef: ref(pad), feedbackGrip: 600 }, { forward: 512, reverse: null });
    a.writeOlpAddress('Out[512]', 1); app.runtime.start(); app.runtime.applyVacuum(vacuum, true);
    pad.position.x = 200; app.runtime.followVacuum(vacuum); other.position.x = 300;
    if (product.position.x !== 200 || !vacuum.runtime.heldRef) throw new Error('흡착 재현 실패');
    app.resetObjects('equipment:product');
    app.runtime.followVacuum(vacuum);
    return { product: product.position.toArray(), other: other.position.x, pad: pad.position.x,
      held: vacuum.runtime.heldRef, feedback: a.readOlpSimulatorBit('IN', 600) };
  });
  expect(result).toEqual({ product: [0, 0, 0], other: 300, pad: 200, held: '', feedback: 0 });
});
