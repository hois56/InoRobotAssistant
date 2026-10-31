import { test, expect } from '@playwright/test';

for (const detached of [false, true]) test(`${detached ? '분리 창' : '페이지'} 고정 뷰에서는 이동·회전 JOG 핸들을 그리지 않고 메인 조작을 유지한다`, async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/^init\(\);/m, 'window.__simulationReady = init();');
    await route.fulfill({ response, body: `${source}\nwindow.__viewJog = { state, getJogTargetRobot, setBaseJogGizmoEnabled, setBaseJogGizmoMode, openViewWindow, requestRender };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__viewJog);
  await page.evaluate(() => window.__simulationReady);
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.waitForFunction(() => window.__viewJog.getJogTargetRobot()?.userData.tcpFrame);
  await page.locator('#btn-jog-base-mode').click();
  await page.evaluate(() => {
    const a = window.__viewJog, { state } = a;
    a.setBaseJogGizmoEnabled(true);
    a.openViewWindow(0); a.openViewWindow(1);
    window.__jogSamples = {};
    const draws = new Map();
    state.baseJogTransformControls.traverse(object => {
      if (!object.isMesh && !object.isLine) return;
      const original = object.onBeforeRender;
      object.onBeforeRender = function(...args) {
        draws.set(args[0], (draws.get(args[0]) || 0) + 1);
        return original.apply(this, args);
      };
    });
    for (const [key, renderer, camera] of [['main', state.renderer, state.camera],
      ...[...state.viewWindow.cells.values()].map(cell => [String(cell.slot), cell.renderer, cell.camera])]) {
      const original = renderer.render;
      renderer.render = function(scene, renderCamera) {
        const before = draws.get(renderer) || 0;
        const visible = state.baseJogTransformControls.visible;
        const result = original.call(this, scene, renderCamera);
        if (scene === state.scene && renderCamera === camera) window.__jogSamples[key] = {
          frame: (window.__jogSamples[key]?.frame || 0) + 1, visible,
          draws: (draws.get(renderer) || 0) - before };
        return result;
      };
    }
    a.requestRender();
  });
  let popup = null;
  if (detached) {
    const opened = page.waitForEvent('popup');
    await page.locator('#view-window-popout').click(); popup = await opened;
  }
  for (const mode of ['translate', 'rotate']) {
    const frame = await page.evaluate(mode => {
      const a = window.__viewJog, frame = window.__jogSamples['1']?.frame || 0;
      a.setBaseJogGizmoMode(mode); a.requestRender(); return frame;
    }, mode);
    await expect.poll(() => page.evaluate(() => window.__jogSamples['1']?.frame || 0)).toBeGreaterThan(frame);
    const result = await page.evaluate(() => {
      const { state } = window.__viewJog, controls = state.baseJogTransformControls;
      return { samples: window.__jogSamples, visible: controls.visible, enabled: controls.enabled,
        attached: controls.object === state.baseJogGizmoTarget };
    });
    expect(result.samples.main.visible).toBe(true);
    expect(result.samples.main.draws).toBeGreaterThan(0);
    for (const key of ['0', '1']) {
      expect(result.samples[key].visible).toBe(false);
      expect(result.samples[key].draws).toBe(0);
    }
    expect(result.visible && result.enabled && result.attached).toBe(true);
  }
  await (popup || page).locator('#view-window').screenshot({ path: testInfo.outputPath('fixed-view-without-jog.png') });
  await page.evaluate(() => { const a = window.__viewJog; a.setBaseJogGizmoEnabled(false); a.requestRender(); });
  expect(await page.evaluate(() => {
    const controls = window.__viewJog.state.baseJogTransformControls;
    return !controls.visible && !controls.enabled && !controls.object;
  })).toBe(true);
  expect(errors).toEqual([]);
});
