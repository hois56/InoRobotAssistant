import { test, expect } from '@playwright/test';

test('두 컨트롤러의 공통 Out 매핑은 어느 쪽이든 ON이면 흡착하고 파기 신호로 해제된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__multiIo={state,equipmentApp,createPrimitiveShapeRoot,ensureWorkspaceModelId,handleVirtualControllerMessage,ensureVirtualControllerCore,registerVirtualControllerSession,createVirtualControllerSession,renderIoFunctionMappingList,readOlpSimulatorBit};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__multiIo);
  await page.waitForFunction(() => window.__multiIo.state.workspaceRecovery.ready);
  for(let i=0;i<2;i++){await page.locator('#model-select').selectOption('robot:IR-R7H-90');if(i)await page.locator('#btn-add-robot-model-choice').click();await page.waitForFunction(n=>window.__multiIo.state.models.filter(m=>m.userData.tcpFrame).length===n,i+1);}
  const initial = await page.evaluate(async () => {
    const a = window.__multiIo;
    const first = a.state.virtualController;
    const second = a.createVirtualControllerSession();
    for (const [controller, id] of [[first, 'robot-a'], [second, 'robot-b']]) {
      await a.ensureVirtualControllerCore(controller);
      a.registerVirtualControllerSession(controller);
      Object.assign(controller, { wanted: true, status: 'streaming', targetRobotId: id, streamWatchdogTimer: 1 });
    }
    const box = (name, x, z) => {
      const model = a.createPrimitiveShapeRoot('box', { x:20, y:20, z:20 }, { name });
      model.position.set(x, 0, z); a.state.scene.add(model); a.state.models.push(model); return model;
    };
    const ref = m => 'equipment-model:' + a.ensureWorkspaceModelId(m) + '/-1';
    const defs = [];
    for (const [i, id] of ['robot-a', 'robot-b'].entries()) {
      const pad = box('pad-' + i, i * 100, 20), object = box('object-' + i, i * 100, 0);
      const robot=a.state.models.filter(m=>m.userData.tcpFrame)[i];
      const def = a.equipmentApp.save({ id: 'object-' + i, type: 'OBJECT', movingRef: ref(object), robotRef: ref(robot) }, { forward: 0, reverse: 1 });
      defs.push(def);
    }
    a.renderIoFunctionMappingList();
    const send = (controller, value, release = 0) => a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: { joints: [0,0,0,0,0,0], outputs: {0:value,1:release} } }), controller);
    const update = time => { a.equipmentApp.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time); a.equipmentApp.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time + 20); };
    send(first, 1); send(second, 0); update(0);
    window.__multiFixture = { first, second, defs, send, update };
    return defs.map(def => def.runtime.heldObjects.length);
  });
  expect(initial).toEqual([1, 1]);
  const changed = await page.evaluate(() => {
    const f = window.__multiFixture; f.send(f.second, 1); f.send(f.first, 0); f.update(40);
    return { held: f.defs.map(def => def.runtime.heldObjects.length), output: window.__multiIo.readOlpSimulatorBit('OUT', 0) };
  });
  expect(changed).toEqual({ held: [1, 1], output: 1 });
  const off = await page.evaluate(() => {
    const f = window.__multiFixture; f.send(f.second, 0); f.update(80);
    return { held: f.defs.map(def => def.runtime.heldObjects.length), output: window.__multiIo.readOlpSimulatorBit('OUT', 0) };
  });
  expect(off).toEqual({ held: [1, 1], output: 0 });
  const released = await page.evaluate(() => {
    const f = window.__multiFixture; f.send(f.second, 0, 1); f.update(100);
    return f.defs.map(def => def.runtime.heldObjects.length);
  });
  expect(released).toEqual([0, 0]);
  const disconnected = await page.evaluate(() => {
    const a = window.__multiIo, f = window.__multiFixture;
    f.send(f.second, 1); f.update(120);
    a.handleVirtualControllerMessage(JSON.stringify({ type: 'controllerConnectionLost', message: 'test disconnect' }), f.second); f.update(160);
    return { held: f.defs.map(def => def.runtime.heldObjects.length), output: a.readOlpSimulatorBit('OUT', 0) };
  });
  expect(disconnected).toEqual({ held: [1, 1], output: 0 });
  expect(errors).toEqual([]);
});
