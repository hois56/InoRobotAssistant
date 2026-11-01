import { test, expect } from '@playwright/test';

for (const placement of ['scene', 'tcp', 'object']) test(`잡기·놓기·초기화는 ${placement}의 대형 CAD 트리를 다시 만들지 않는다`, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
const objectPerf = {};
for (const [name, original, replace] of [
  ['tree', renderModelTree, fn => renderModelTree = fn],
  ['snapshot', captureSceneSnapshot, fn => captureSceneSnapshot = fn],
  ['serialize', serializeWorkspaceSnapshot, fn => serializeWorkspaceSnapshot = fn],
  ['status', updateUIStatus, fn => updateUIStatus = fn],
  ['program', renderMotionProgramPanel, fn => renderMotionProgramPanel = fn]
]) replace((...args) => { const start = performance.now(); try { return original(...args); } finally { (objectPerf[name] ||= []).push(performance.now() - start); } });
window.__objectPerf = { state, THREE, equipmentApp, createPrimitiveShapeRoot, ensureWorkspaceModelId,
  renderModelTree, attachEquipmentObject, detachEquipmentObject, getRobotToolMountFrame, objectPerf };
` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.locator('#model-select').selectOption('robot:IR-R10H-120');
  await page.waitForFunction(() => window.__objectPerf?.state.activeArticulatedModel?.userData.tcpFrame);
  await page.evaluate(placement => {
    const a = window.__objectPerf;
    const cad = new a.THREE.Group();
    cad.userData.uploaded = true; cad.userData.placement = 'scene'; cad.userData.modelName = '대형 고정 설비';
    cad.userData.importedParts = [];
    const geometry = new a.THREE.BoxGeometry(1, 1, 1), material = new a.THREE.MeshStandardMaterial();
    for (let i = 0; i < 600; i++) {
      const part = new a.THREE.Mesh(geometry, material);
      part.position.set(i * 2, 5000, 0);
      part.userData.modelPartId = 'perf-part-' + i; part.userData.modelPartName = '고정 부품 ' + i;
      cad.add(part); cad.userData.importedParts.push(part);
    }
    a.state.scene.add(cad); a.state.models.push(cad);
    if (placement === 'tcp') {
      const robot = a.state.activeArticulatedModel;
      a.getRobotToolMountFrame(robot).attach(cad);
      cad.userData.attachmentHost = robot; cad.userData.placement = 'tcp';
    }
    const object = placement === 'object' ? cad : a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '성능 시험 제품' });
    if (object !== cad) { a.state.scene.add(object); a.state.models.push(object); }
    const ref = 'equipment-model:' + a.ensureWorkspaceModelId(object) + '/-1';
    a.equipmentApp.save({ id: 'perf-object', type: 'OBJECT', movingRef: ref });
    a.renderModelTree();
    a.object = object; a.cad = cad;
    a.cadNode = document.querySelector('[data-tree-order-key="model:' + a.ensureWorkspaceModelId(cad) + '"]');
    a.cadParts = a.cadNode?.querySelector('.model-tree-children');
    a.firstPart = a.cadNode?.querySelector('[data-model-part-id]');
    if (!a.cadNode || a.cadNode.querySelectorAll('[data-model-part-id]').length < 600) throw Error('대형 트리 재현 실패');
  }, placement);
  const results = [];
  for (const action of ['grab', 'release', 'grab', 'reset', 'manual-grab', 'manual-release']) {
    results.push(await page.evaluate(async action => {
      const a = window.__objectPerf;
      for (const key of Object.keys(a.objectPerf)) a.objectPerf[key] = [];
      const start = performance.now();
      if (action.endsWith('grab')) a.attachEquipmentObject(a.object, null, a.state.activeArticulatedModel,
        action.startsWith('manual') ? {} : { recordHistory: false, select: false, announce: false, deferUi: true });
      else if (action.endsWith('release')) a.detachEquipmentObject(a.object,
        action.startsWith('manual') ? {} : { recordHistory: false, select: false, announce: false, deferUi: true });
      else { a.object.position.x = 100; a.equipmentApp.resetObjects('equipment:perf-object'); }
      const operationMs = performance.now() - start;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { action, operationMs, profile: JSON.parse(JSON.stringify(a.objectPerf)),
        retained: a.cadNode.isConnected && a.cadNode.querySelector('.model-tree-children') === a.cadParts
          && a.cadNode.querySelector('[data-model-part-id]') === a.firstPart,
        position: a.object.getWorldPosition(new a.THREE.Vector3()).toArray(),
        placement: a.object.userData.placement };
    }, action));
  }
  console.log('object-transition-profile ' + JSON.stringify(results));
  expect(results.every(result => result.retained)).toBe(true);
  expect(results.map(result => result.placement)).toEqual(['grip-object', 'scene', 'grip-object', 'scene', 'grip-object', 'scene']);
  expect(results[3].position).toEqual([0, 0, 0]);
  expect(results.slice(0, 4).every(result => (result.profile.tree || []).length === 1)).toBe(true);
  if (placement === 'scene') {
    const order = await page.evaluate(() => {
      const a = window.__objectPerf, key = 'model:' + a.ensureWorkspaceModelId(a.object);
      const source = document.querySelector('[data-tree-order-key="' + key + '"] > .model-tree-node-row');
      const target = a.cadNode.querySelector(':scope > .model-tree-node-row');
      const dataTransfer = new DataTransfer(), rect = target.getBoundingClientRect();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer, clientY: rect.top + 1 }));
      return { actual: a.state.modelTreeOrder.root, object: key, cad: a.cadNode.dataset.treeOrderKey };
    });
    expect(order.actual.indexOf(order.object)).toBeLessThan(order.actual.indexOf(order.cad));
  }
  expect(errors).toEqual([]);
});
