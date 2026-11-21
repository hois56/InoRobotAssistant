import { test, expect } from '@playwright/test';

test('두 컨트롤러는 각 로봇 Tool의 진공을 따로 켜고 파기하며 공통 Out 표시는 어느 쪽이든 ON이면 켜진다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('init();\n', 'window.__simulationReady = init();\n') + '\nwindow.__multiIo={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,getRobotToolMountFrame,handleVirtualControllerMessage,ensureVirtualControllerCore,registerVirtualControllerSession,createVirtualControllerSession,renderIoFunctionMappingList,readOlpSimulatorBit};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__multiIo);
  await page.evaluate(() => window.__simulationReady);
  await page.waitForFunction(() => window.__multiIo.state.workspaceRecovery.ready);
  for(let i=0;i<2;i++){await page.locator('#model-select').selectOption('robot:IR-R7H-90');if(i)await page.locator('#btn-add-robot-model-choice').click();await page.waitForFunction(n=>window.__multiIo.state.models.filter(m=>m.userData.tcpFrame).length===n,i+1);}
  const initial = await page.evaluate(async () => {
    const a = window.__multiIo;
    const first = a.state.virtualController;
    const second = a.createVirtualControllerSession();
    const robots = a.state.models.filter(m => m.userData.tcpFrame);
    // New robots are added at the origin; keep the two Tools (and their workpieces) apart.
    robots[1].position.x = robots[0].position.x + 1500;
    robots[1].updateMatrixWorld(true);
    for (const [index, controller] of [first, second].entries()) {
      await a.ensureVirtualControllerCore(controller);
      a.registerVirtualControllerSession(controller);
      Object.assign(controller, { wanted: true, status: 'streaming', targetRobotId: robots[index].userData.motionInstanceId, streamWatchdogTimer: 1 });
    }
    const T = a.THREE;
    const ref = m => 'equipment-model:' + a.ensureWorkspaceModelId(m) + '/-1';
    const defs = [];
    // Each robot carries its own vacuum tool, so its controller's outputs drive that tool only.
    for (const [i] of ['robot-a', 'robot-b'].entries()) {
      const robot = a.state.models.filter(m => m.userData.tcpFrame)[i];
      const pad = a.createPrimitiveShapeRoot('box', { x:20, y:20, z:20 }, { name: 'pad-' + i });
      a.getRobotToolMountFrame(robot).add(pad); pad.userData.placement = 'tcp'; pad.userData.attachmentHost = robot; a.state.models.push(pad); pad.updateWorldMatrix(true, true);
      const object = a.createPrimitiveShapeRoot('box', { x:20, y:20, z:20 }, { name: 'object-' + i });
      object.position.copy(pad.localToWorld(new T.Vector3(0, 0, 21))); object.quaternion.copy(pad.getWorldQuaternion(new T.Quaternion()));
      a.state.scene.add(object); a.state.models.push(object);
      a.equipmentApp.save({ id: 'object-' + i, type: 'OBJECT', movingRef: ref(object) });
      defs.push(a.equipmentApp.save({ id: 'vacuum-' + i, type: 'VACUUM', movingRef: ref(pad), vacuumMode: 'WHOLE' }, { forward: 0, reverse: 1 }));
    }
    a.renderIoFunctionMappingList();
    const send = (controller, value, release = 0) => a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: { joints: [0,0,0,0,0,0], outputs: {0:value,1:release} } }), controller);
    const update = time => { a.equipmentApp.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time); a.equipmentApp.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time + 20); };
    const held = () => defs.map(def => (def.runtime.heldObjects || []).length);
    send(first, 1); send(second, 0); update(0);
    window.__multiFixture = { first, second, defs, send, update, held };
    return { held: held(), output: a.readOlpSimulatorBit('OUT', 0) };
  });
  // Only robot A's controller turned its Out[0] on, but the shared Out display shows it.
  expect(initial).toEqual({ held: [1, 0], output: 1 });
  const changed = await page.evaluate(() => {
    const f = window.__multiFixture; f.send(f.second, 1); f.send(f.first, 0); f.update(40);
    return { held: f.held(), output: window.__multiIo.readOlpSimulatorBit('OUT', 0) };
  });
  // Turning the vacuum signal off keeps holding until the release signal.
  expect(changed).toEqual({ held: [1, 1], output: 1 });
  const off = await page.evaluate(() => {
    const f = window.__multiFixture; f.send(f.second, 0); f.update(80);
    return { held: f.held(), output: window.__multiIo.readOlpSimulatorBit('OUT', 0) };
  });
  expect(off).toEqual({ held: [1, 1], output: 0 });
  const released = await page.evaluate(() => {
    const f = window.__multiFixture; f.send(f.second, 0, 1); f.update(100);
    const afterSecond = f.held(); f.send(f.first, 0, 1); f.update(120);
    return [afterSecond, f.held()];
  });
  expect(released).toEqual([[1, 0], [0, 0]]);
  const disconnected = await page.evaluate(() => {
    const a = window.__multiIo, f = window.__multiFixture;
    f.send(f.second, 1); f.update(140);
    a.handleVirtualControllerMessage(JSON.stringify({ type: 'controllerConnectionLost', message: 'test disconnect' }), f.second); f.update(180);
    return { held: f.held(), output: a.readOlpSimulatorBit('OUT', 0) };
  });
  expect(disconnected).toEqual({ held: [0, 1], output: 0 });
  expect(errors).toEqual([]);
});
