import { test, expect } from '@playwright/test';

async function setup(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__controllerUndo = { state, THREE, equipmentApp, ensureWorkspaceModelId, createPrimitiveShapeRoot, captureSceneSnapshot, recordHistory, updateHistoryButtons, updateMotionUiLock, ensureVirtualControllerCore, registerVirtualControllerSession, handleVirtualControllerMessage, applyVirtualControllerFrameForController, undoLastAction, redoLastAction, selectTcpProfile, applyTcpProfileEditor, selectWorkObject, applyWorkObjectEditor, disconnectVirtualController, updateUIStatus, openModelContextMenu };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__controllerUndo?.state.workspaceRecovery.ready);
  await page.evaluate(() => { window.__historyEmpty = window.__controllerUndo.captureSceneSnapshot(); });
  await page.locator('#model-select').selectOption('robot:IR-R7H-90');
  await page.waitForFunction(() => window.__controllerUndo.state.activeArticulatedModel?.userData.tcpFrame);
  await page.evaluate(async () => {
    const a = window.__controllerUndo, robot = a.state.activeArticulatedModel;
    const box = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '되돌릴 모델' });
    a.state.scene.add(box); a.state.models.push(box);
    const controller = a.state.virtualController;
    await a.ensureVirtualControllerCore(controller); a.registerVirtualControllerSession(controller);
    controller.targetRobotId = robot.userData.motionInstanceId;
    controller.source = 'bridge'; controller.wanted = true; controller.status = 'streaming'; controller.streamWatchdogTimer = 1;
    const send = offset => {
      const joints = [20 + offset, -30, 40, -110, 60, 200];
      a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: { joints, tcp: [708 + offset, -292, 215, 0, 0, 180] } }), controller);
      a.applyVirtualControllerFrameForController(performance.now(), controller);
    };
    window.__historyBox = box; window.__historyFeedback = send;
    send(0);
    a.state.undoStack = []; a.state.redoStack = [];
    const before = a.captureSceneSnapshot();
    box.position.x = 25; box.updateMatrixWorld(true);
    a.recordHistory('모델 이동', before, a.captureSceneSnapshot());
    send(1); a.updateMotionUiLock();
  });
  return errors;
}

test('컨트롤러 연결 중 편집을 되돌리고 다시 실행해도 최신 관절 자세를 유지한다', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await setup(page);
  await expect(page.locator('#btn-undo')).toBeEnabled();
  await page.locator('#btn-undo').click();
  expect(await page.evaluate(() => ({ x: window.__historyBox.position.x,
    joints: window.__controllerUndo.state.activeArticulatedModel.userData.joints.map(joint => joint.angle),
    suspended: window.__controllerUndo.state.historySuspended })))
    .toEqual({ x: 0, joints: [21, -30, 40, -110, 60, 200], suspended: false });
  await expect(page.locator('#btn-redo')).toBeEnabled();
  await page.evaluate(() => window.__historyFeedback(2));
  await page.keyboard.press('Control+y');
  expect(await page.evaluate(() => ({ x: window.__historyBox.position.x,
    joints: window.__controllerUndo.state.activeArticulatedModel.userData.joints.map(joint => joint.angle),
    connected: window.__controllerUndo.state.virtualController.wanted })))
    .toEqual({ x: 25, joints: [22, -30, 40, -110, 60, 200], connected: true });
  expect(errors).toEqual([]);
});

test('연결 중 Tool·Wobj·동작 설정을 되돌리고 다시 실행해도 수신 자세와 설정을 보존한다', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await setup(page);
  await page.evaluate(() => {
    const a = window.__controllerUndo;
    a.selectTcpProfile(2);
    document.querySelector('[data-tcp-offset="z"]').value = '149.2';
    a.applyTcpProfileEditor();
  });
  await page.locator('#btn-undo').click();
  expect(await page.evaluate(() => window.__controllerUndo.state.activeArticulatedModel.userData.tcpProfiles[2].position.z)).toBe(0);
  await page.locator('#btn-redo').click();
  expect(await page.evaluate(() => window.__controllerUndo.state.activeArticulatedModel.userData.tcpProfiles[2].position.z)).toBe(149.2);
  const liveFlange = await page.evaluate(() => {
    const a = window.__controllerUndo;
    return a.state.activeArticulatedModel.userData.flangeFrame.getWorldPosition(new a.THREE.Vector3()).toArray();
  });
  await page.evaluate(() => {
    const a = window.__controllerUndo;
    a.selectWorkObject(1);
    document.querySelector('[data-workobject-pose="x"]').value = '100';
    a.applyWorkObjectEditor();
  });
  await page.locator('#btn-undo').click();
  expect(await page.evaluate(() => window.__controllerUndo.state.activeArticulatedModel.userData.workObjects[1].position[0])).toBe(0);
  await page.evaluate(() => window.__historyFeedback(1));
  await page.locator('#btn-redo').click();
  expect(await page.evaluate(() => window.__controllerUndo.state.activeArticulatedModel.userData.workObjects[1].position[0])).toBe(100);
  await page.evaluate(() => window.__historyFeedback(1));
  const distance = await page.evaluate(before => {
    const a = window.__controllerUndo;
    return a.state.activeArticulatedModel.userData.flangeFrame.getWorldPosition(new a.THREE.Vector3())
      .distanceTo(new a.THREE.Vector3().fromArray(before));
  }, liveFlange);
  expect(distance).toBeLessThan(1e-7);
  await page.evaluate(() => {
    const a = window.__controllerUndo;
    a.equipmentApp.save({ id: 'undo-cylinder', type: 'CYLINDER',
      movingRef: `equipment-model:${a.ensureWorkspaceModelId(window.__historyBox)}/-1`, axis: 'Z', travel: 10, speed: 100 });
  });
  await page.locator('#btn-undo').click();
  expect(await page.evaluate(() => window.__controllerUndo.state.equipmentDefinitions.some(def => def.id === 'undo-cylinder'))).toBe(false);
  await page.locator('#btn-redo').click();
  const restored = await page.evaluate(() => ({
    definitions: window.__controllerUndo.state.equipmentDefinitions.map(def => def.id),
    undo: window.__controllerUndo.state.undoStack.map(entry => entry.label),
    redo: window.__controllerUndo.state.redoStack.map(entry => entry.label),
    suspended: window.__controllerUndo.state.historySuspended
  }));
  expect(restored.definitions, JSON.stringify({ restored, errors })).toContain('undo-cylinder');
  expect(errors).toEqual([]);
});

test('연결된 로봇이 사라지는 기록은 연결 해제 후 되돌리고 다시 실행한다', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await setup(page);
  await page.evaluate(() => {
    const a = window.__controllerUndo;
    a.state.undoStack = []; a.state.redoStack = [];
    a.recordHistory('로봇 추가', window.__historyEmpty, a.captureSceneSnapshot());
  });
  await expect(page.locator('#btn-undo')).toBeDisabled();
  await page.evaluate(() => window.__controllerUndo.undoLastAction());
  expect(await page.evaluate(() => ({ models: window.__controllerUndo.state.models.length,
    entries: window.__controllerUndo.state.undoStack.length }))).toEqual({ models: 2, entries: 1 });
  await page.evaluate(() => {
    const a = window.__controllerUndo;
    a.disconnectVirtualController(a.state.virtualController); a.updateHistoryButtons();
  });
  await expect(page.locator('#btn-undo')).toBeEnabled();
  await page.locator('#btn-undo').click();
  expect(await page.evaluate(() => window.__controllerUndo.state.models.length)).toBe(0);
  await page.locator('#btn-redo').click();
  expect(await page.evaluate(() => window.__controllerUndo.state.models.length)).toBe(2);
  expect(errors).toEqual([]);
});

for (const connected of [false, true]) {
  test(`가져온 모델의 색상 변경을 되돌리면 각 부품의 원래 색을 복원한다 (${connected ? '연결' : '미연결'})`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await setup(page);
    await page.evaluate(connected => {
      const a = window.__controllerUndo, T = a.THREE;
      if (!connected) a.disconnectVirtualController(a.state.virtualController);
      const model = new T.Group();
      model.userData = { uploaded: true, modelName: '색상 확인 모델' };
      for (const [index, color] of ['#ff0000', '#0000ff'].entries()) {
        const part = new T.Mesh(new T.BoxGeometry(10, 10, 10), new T.MeshStandardMaterial({ color }));
        part.position.x = index * 20;
        part.userData = { modelPartId: `history-color-${index}`, modelPartName: `부품 ${index}` };
        model.add(part);
      }
      model.userData.importedParts = [...model.children];
      a.state.scene.add(model); a.state.models.push(model); a.updateUIStatus();
      window.__historyColorModel = model;
      a.state.undoStack = []; a.state.redoStack = []; a.updateHistoryButtons();
      a.openModelContextMenu({ clientX: 300, clientY: 200 }, model);
    }, connected);
    await page.locator('#model-color-picker').evaluate(input => {
      for (const color of ['#00ffff', '#ffff00', '#00ff00']) {
        input.value = color;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const colors = () => page.evaluate(() => window.__historyColorModel.children.map(part => part.material.color.getHexString()));
    expect(await colors()).toEqual(['00ff00', '00ff00']);
    expect(await page.evaluate(() => window.__controllerUndo.state.undoStack.length)).toBe(1);
    await expect(page.locator('#btn-undo')).toBeEnabled();
    await page.locator('#btn-undo').click();
    expect(await colors()).toEqual(['ff0000', '0000ff']);
    await page.locator('#btn-redo').click();
    expect(await colors()).toEqual(['00ff00', '00ff00']);
    expect(errors).toEqual([]);
  });
}
