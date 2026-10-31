import { test, expect } from '@playwright/test';

async function setup(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/^init\(\);/m, 'window.__viewTransitionReady = init();');
    await route.fulfill({ response, body: `${source}\nwindow.__viewTransition = {
      state, THREE, applyViewPreset, captureViewPreset, serializeViewConfiguration,
      restoreWorkspaceViewConfiguration, beginSimulationViewNavigation, recreateMainOrbitControls,
      ensureMotionProgram, captureRobotMotionStep, createMotionSegment, advanceMotionSegment,
      setMotionSessionPaused, stopRobotMotions, renderMotionProgramPanel, addViewMotionStep,
      serializeMotionProgramFile, normalizeMotionProgramFile, serializeWorkspaceSnapshot, executeIoFunctionMapping,
      openViewWindow, hideViewWindow, openIoFunctionMappingDialog, addIoFunctionMapping, restoreWorkspaceSnapshot,
      updateMainViewTransition: typeof updateMainViewTransition === 'function' ? updateMainViewTransition : null
    };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__viewTransitionReady && window.__viewTransition?.state.renderer);
  await page.evaluate(() => window.__viewTransitionReady);
  await page.evaluate(() => {
    const a = window.__viewTransition;
    a.state.camera.position.set(0, -500, 100);
    a.state.controls.target.set(0, 0, 0);
    a.state.controls.update();
    a.state.viewPresets[0] = a.captureViewPreset(0);
    a.state.camera.position.set(500, 0, 100);
    a.state.controls.update();
  });
  return errors;
}

test('10개 뷰의 전환 시간을 이름 옆에서 따로 저장하고 IO가 저장된 시간을 사용한다', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await setup(page);
  await page.locator('[data-panel-toggle="view-presets-panel"]').click();
  await expect(page.locator('[data-view-seconds]')).toHaveCount(10);
  await expect(page.locator('#view-transition-seconds')).toHaveCount(0);
  const times = Array.from({ length: 10 }, (_, slot) => slot === 0 ? 0 : slot + 0.5);
  for (let slot = 0; slot < 10; slot++) {
    const row = page.locator(`[data-view-slot="${slot}"]`);
    const input = row.locator('[data-view-seconds]');
    await input.fill('');
    await input.fill(String(times[slot]));
    await input.blur();
    await row.locator('[data-view-save]').click();
  }
  const result = await page.evaluate(() => {
    const a = window.__viewTransition, config = a.serializeViewConfiguration();
    a.state.viewPresets = [];
    a.restoreWorkspaceViewConfiguration(config);
    const restored = a.state.viewPresets.map(preset => preset.transitionSeconds);
    a.state.viewTransitionSeconds = 99;
    a.executeIoFunctionMapping({ action: 'VIEW', viewSlot: 9, address: 512, direction: 'IN' });
    const duration = a.state.viewTransition.duration;
    a.executeIoFunctionMapping({ action: 'VIEW', viewSlot: 0, address: 513, direction: 'IN' });
    const instant = a.state.viewTransition === null;
    const legacy = { viewTransitionSeconds: 2.5, viewPresets: config.viewPresets.map(preset => {
      const copy = structuredClone(preset); delete copy.transitionSeconds; return copy;
    }) };
    a.restoreWorkspaceViewConfiguration(legacy);
    const migrated = a.state.viewPresets.map(preset => preset.transitionSeconds);
    a.restoreWorkspaceViewConfiguration(config);
    return { restored, migrated, duration, instant, hasGlobalTime: Object.hasOwn(config, 'viewTransitionSeconds') };
  });
  expect(result).toEqual({ restored: times, migrated: times.map(() => 2.5), duration: 9500, instant: true, hasGlobalTime: false });
  const last = page.locator('[data-view-slot="9"]');
  await expect(last.locator('[data-view-seconds]')).toHaveValue('9.5');
  await last.scrollIntoViewIfNeeded();
  const layout = await last.evaluate(row => {
    const name = row.querySelector('[data-view-name]').getBoundingClientRect();
    const seconds = row.querySelector('.view-preset-duration').getBoundingClientRect();
    const save = row.querySelector('[data-view-save]').getBoundingClientRect();
    return { nameRight: name.right, secondsLeft: seconds.left, secondsRight: seconds.right, saveLeft: save.left,
      lastRight: row.lastElementChild.getBoundingClientRect().right, rowRight: row.getBoundingClientRect().right };
  });
  expect(layout.nameRight).toBeLessThanOrEqual(layout.secondsLeft);
  expect(layout.secondsRight).toBeLessThanOrEqual(layout.saveLeft);
  expect(layout.lastRight).toBeLessThanOrEqual(layout.rowRight + 1);
  await page.screenshot({ path: test.info().outputPath('per-view-times.png') });
  expect(errors).toEqual([]);
});

test('사용자 뷰 V1~V10을 저장·적용하고 프로그램·IO 및 작업공간에서 V10을 유지한다', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await setup(page);
  await page.locator('[data-panel-toggle="view-presets-panel"]').click();
  await expect(page.locator('#view-presets-list [data-view-slot]')).toHaveCount(10);
  const row = page.locator('[data-view-slot="9"]');
  await expect(row.locator('[data-view-name]')).toHaveValue('View 10');
  await row.locator('[data-view-seconds]').fill('');
  await row.locator('[data-view-seconds]').fill('0');
  await row.locator('[data-view-seconds]').blur();
  await row.locator('[data-view-save]').click();
  await page.evaluate(() => {
    const a = window.__viewTransition;
    a.state.camera.position.set(-300, -200, 400);
    a.state.controls.update();
  });
  await row.locator('[data-view-apply]').click();
  expect(await page.evaluate(() => window.__viewTransition.state.activeViewSlot)).toBe(9);
  expect(await page.evaluate(() => window.__viewTransition.state.camera.position.x)).toBeCloseTo(500, 6);
  await row.locator('[data-view-monitor]').click();
  await expect(page.locator('.view-window-cell')).toHaveCount(1);
  expect(await page.evaluate(() => window.__viewTransition.state.viewWindow.cells.has(9))).toBe(true);
  await page.evaluate(() => window.__viewTransition.hideViewWindow());
  await page.locator('#model-select').selectOption('robot:IR-R10H-120');
  await page.waitForFunction(() => window.__viewTransition.state.models.some(m => m.userData.tcpFrame));
  await page.locator('[data-panel-toggle="program-panel"]').click();
  await page.evaluate(() => window.__viewTransition.addViewMotionStep());
  const viewSelect = page.locator('[data-program-step-view-slot]');
  await expect(viewSelect.locator('option')).toHaveCount(10);
  await viewSelect.selectOption('9');
  await expect(page.locator('.program-command-name')).toHaveText('View 10');
  await page.evaluate(() => window.__viewTransition.openIoFunctionMappingDialog());
  const ioSelect = page.locator('#io-function-mapping-view-target');
  await expect(ioSelect.locator('option')).toHaveCount(10);
  await ioSelect.selectOption('9');
  await page.locator('#io-function-mapping-add').click();
  const ioRowSelect = page.locator('[data-io-function-mapping-field="viewSlot"]');
  await expect(ioRowSelect).toHaveValue('9');
  await ioRowSelect.selectOption('0');
  await ioRowSelect.selectOption('9');
  const restored = await page.evaluate(async () => {
    const a = window.__viewTransition;
    const file = a.normalizeMotionProgramFile(a.serializeMotionProgramFile());
    const snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
    await a.restoreWorkspaceSnapshot(snapshot);
    const robot = a.state.models.find(m => m.userData.tcpFrame);
    const config = a.serializeViewConfiguration();
    for (let slot = 0; slot < 10; slot++) a.openViewWindow(slot);
    const grid = a.state.viewWindow.grid;
    const gridRect = grid.getBoundingClientRect();
    const cellsFit = [...a.state.viewWindow.cells.values()].every(cell => {
      const rect = cell.element.getBoundingClientRect();
      return rect.width > 10 && rect.height > 10 && rect.bottom <= gridRect.bottom + 1;
    });
    return { fileSlot: file.robots[0].steps[0].viewSlot, slots: config.viewPresets.length,
      name: config.viewPresets[9]?.name, step: a.ensureMotionProgram(robot).steps[0].viewSlot,
      io: a.state.ioFunctionMappings[0].viewSlot, cells: a.state.viewWindow.cells.size, cellsFit,
      columns: new Set([...a.state.viewWindow.cells.values()].map(cell => Math.round(cell.element.getBoundingClientRect().x))).size };
  });
  expect(restored).toEqual({ fileSlot: 9, slots: 10, name: 'View 10', step: 9, io: 9, cells: 10, cellsFit: true, columns: 3 });
  expect(errors).toEqual([]);
});

test('뷰 전환은 설정한 시간 동안 이동하고 설정은 작업공간에 저장한다', async ({ page }) => {
  const errors = await setup(page);
  await page.locator('[data-panel-toggle="view-presets-panel"]').click();
  const input = page.locator('[data-view-slot="0"] [data-view-seconds]');
  await expect(input).toHaveValue('1');
  await page.screenshot({ path: test.info().outputPath('user-view-controls.png') });
  await input.fill('');
  await input.fill('0.4');
  await input.blur();
  expect(await page.evaluate(() => {
    const a = window.__viewTransition;
    a.applyViewPreset(0);
    return a.state.camera.position.x;
  })).toBeCloseTo(500, 5);
  await expect.poll(() => page.evaluate(() => window.__viewTransition.state.camera.position.x)).toBeLessThan(499);
  await expect.poll(() => page.evaluate(() => window.__viewTransition.state.viewTransition === null)).toBe(true);
  expect(await page.evaluate(() => window.__viewTransition.state.camera.position.x)).toBeCloseTo(0, 6);
  const saved = await page.evaluate(() => {
    const a = window.__viewTransition;
    const config = a.serializeViewConfiguration();
    a.state.viewTransitionSeconds = 9;
    a.restoreWorkspaceViewConfiguration(config);
    return { config, seconds: a.state.viewPresets[0].transitionSeconds };
  });
  expect(saved.seconds).toBe(0.4);
  await expect(input).toHaveValue('0.4');
  await input.fill('');
  await input.fill('0');
  await input.blur();
  expect(await page.evaluate(() => {
    const a = window.__viewTransition;
    a.state.camera.position.set(500, 0, 100);
    a.applyViewPreset(0);
    return { x: a.state.camera.position.x, transition: a.state.viewTransition };
  })).toEqual({ x: expect.closeTo(0, 6), transition: null });
  expect(errors).toEqual([]);
});

test('반대쪽 뷰도 중심을 관통하지 않고 이동하며 새 뷰와 마우스 조작은 현재 위치에서 이어진다', async ({ page }) => {
  const errors = await setup(page);
  const result = await page.evaluate(() => {
    const a = window.__viewTransition, { state } = a;
    state.camera.position.set(500, 0, 100);
    state.controls.update();
    state.viewPresets[1] = a.captureViewPreset(1);
    state.camera.position.set(-500, 0, -100);
    state.camera.zoom = 2;
    state.controls.update();
    state.viewPresets[0] = a.captureViewPreset(0);
    state.camera.position.set(500, 0, 100);
    state.camera.zoom = 1;
    state.controls.update();
    a.applyViewPreset(0, { durationSeconds: 2, timestamp: 1000 });
    a.updateMainViewTransition(2000);
    const mid = { distance: state.camera.position.distanceTo(state.controls.target), zoom: state.camera.zoom,
      position: state.camera.position.toArray() };
    a.applyViewPreset(1, { durationSeconds: 2, timestamp: 2000 });
    const nextStart = state.camera.position.toArray();
    a.updateMainViewTransition(4000);
    const end = { position: state.camera.position.toArray(), up: state.camera.up.toArray() };
    a.applyViewPreset(0, { durationSeconds: 2, timestamp: 4000 });
    a.updateMainViewTransition(4500);
    a.beginSimulationViewNavigation({ surfaceWheelZoom: true });
    const interrupted = state.camera.position.toArray();
    a.updateMainViewTransition(6000);
    return { mid, nextStart, end, interrupted, after: state.camera.position.toArray(), transition: state.viewTransition };
  });
  expect(result.mid.distance).toBeCloseTo(Math.hypot(500, 100), 6);
  expect(result.mid.zoom).toBeCloseTo(1.5, 6);
  result.nextStart.forEach((n, i) => expect(n).toBeCloseTo(result.mid.position[i], 8));
  result.end.position.forEach((n, i) => expect(n).toBeCloseTo([500, 0, 100][i], 6));
  expect(result.end.up).toEqual([0, 0, 1]);
  expect(result.after).toEqual(result.interrupted);
  expect(result.transition).toBeNull();
  expect(errors).toEqual([]);
});

test('IO 전환도 시간 설정을 따르고 중심·확대·up 축을 복원하며 스케치와 카메라 교체 시 중단한다', async ({ page }) => {
  const errors = await setup(page);
  const result = await page.evaluate(() => {
    const a = window.__viewTransition, { state } = a;
    state.camera.position.set(200, 100, 600);
    state.camera.up.set(1, 0, 0);
    state.camera.zoom = 1.8;
    state.controls.target.set(100, 40, 30);
    state.controls.update();
    state.viewPresets[0] = a.captureViewPreset(0);
    const expected = structuredClone(state.viewPresets[0].camera);
    state.camera.up.set(0, 0, 1);
    state.camera.zoom = 1;
    state.controls.target.set(0, 0, 0);
    state.camera.position.set(500, 0, 100);
    a.recreateMainOrbitControls();
    state.controls.update();
    state.viewPresets[0].transitionSeconds = 3;
    a.executeIoFunctionMapping({ action: 'VIEW', viewSlot: 0, address: 512, direction: 'IN' });
    const duration = state.viewTransition.duration;
    a.updateMainViewTransition(state.viewTransition.startTime + duration);
    const actual = { position: state.camera.position.toArray(), target: state.controls.target.toArray(),
      up: state.camera.up.toArray(), zoom: state.camera.zoom };
    a.applyViewPreset(0, { durationSeconds: 1 });
    a.recreateMainOrbitControls();
    const afterReplace = state.viewTransition;
    state.sketch.active = true;
    const sketchAccepted = a.applyViewPreset(0, { announce: false });
    state.sketch.active = false;
    return { expected, actual, duration, afterReplace, sketchAccepted };
  });
  expect(result.duration).toBe(3000);
  for (const key of ['position', 'target', 'up']) result.actual[key].forEach((n, i) => expect(n).toBeCloseTo(result.expected[key][i], 6));
  expect(result.actual.zoom).toBeCloseTo(result.expected.zoom, 6);
  expect(result.afterReplace).toBeNull();
  expect(result.sketchAccepted).toBe(false);
  expect(errors).toEqual([]);
});

test('프로그램 View 명령은 뷰에 저장된 시간으로 전환하고 일시정지·정지를 지원한다', async ({ page }) => {
  const errors = await setup(page);
  await page.locator('[data-panel-toggle="view-presets-panel"]').click();
  const duration = page.locator('[data-view-slot="0"] [data-view-seconds]');
  await duration.fill('');
  await duration.fill('2');
  await duration.blur();
  await page.locator('#model-select').selectOption('robot:IR-R10H-120');
  await page.waitForFunction(() => window.__viewTransition.state.models.some(m => m.userData.tcpFrame));
  await page.locator('[data-panel-toggle="program-panel"]').click();
  await page.evaluate(() => window.__viewTransition.addViewMotionStep());
  await expect(page.locator('[data-program-step-view-seconds]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('program-view-controls.png') });
  const result = await page.evaluate(() => {
    const a = window.__viewTransition, { state } = a;
    const robot = state.models.find(m => m.userData.tcpFrame), program = a.ensureMotionProgram(robot);
    const step = program.steps[0];
    const hasStepTime = Number.isFinite(step.viewTransitionSeconds);
    // Older program files may contain an override; the saved view now owns timing.
    step.viewTransitionSeconds = 9;
    const file = a.normalizeMotionProgramFile(a.serializeMotionProgramFile());
    const session = { robot, steps: [step], cursor: 0, direction: 1, repeat: false, reverseRepeat: false,
      reachedStepIds: new Set(), status: 'running', startAt: 0, nextSegmentStartAt: 0 };
    session.segment = a.createMotionSegment(session, 1000);
    state.motionSessions.set(robot.userData.motionInstanceId, session);
    const startDone = a.advanceMotionSegment(session, 1000);
    const midDone = a.advanceMotionSegment(session, 2000);
    a.setMotionSessionPaused(session, true, 2000);
    const pausedPosition = state.camera.position.toArray();
    a.updateMainViewTransition(9000);
    const afterPause = state.camera.position.toArray();
    a.setMotionSessionPaused(session, false, 9000);
    const beforeEnd = a.advanceMotionSegment(session, 9500);
    const endDone = a.advanceMotionSegment(session, 10000);
    a.applyViewPreset(0, { durationSeconds: 2, timestamp: 10000, session });
    a.stopRobotMotions([robot]);
    return { startDone, midDone, pausedPosition, afterPause, beforeEnd, endDone,
      seconds: state.viewPresets[0].transitionSeconds, hasStepTime,
      file: JSON.stringify(file), snapshot: JSON.stringify(a.serializeWorkspaceSnapshot()),
      stopped: state.viewTransition };
  });
  expect(result).toMatchObject({ startDone: false, midDone: false, beforeEnd: false, endDone: true, seconds: 2, hasStepTime: false, stopped: null });
  expect(result.afterPause).toEqual(result.pausedPosition);
  expect(result.file).toContain('"viewTransitionSeconds":9');
  expect(result.snapshot).toContain('"transitionSeconds":2');
  expect(errors).toEqual([]);
});
