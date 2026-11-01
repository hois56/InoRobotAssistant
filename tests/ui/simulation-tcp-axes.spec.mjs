import { test, expect } from '@playwright/test';

test('TCP axes can stay hidden through robot loading, controller feedback and workspace restore', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__tcpAxes = {state,THREE,ensureVirtualControllerCore,registerVirtualControllerSession,handleVirtualControllerMessage,applyVirtualControllerFrameForController,getRobotWorldTcpPoint,disconnectVirtualController,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,applyWorkspaceDisplayState,updateMotionUiLock};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__tcpAxes?.state.workspaceRecovery.ready);
  await expect(page.locator('#btn-toggle-tcp-axes')).toHaveCount(0);
  await page.locator('#model-select').selectOption('robot:IR-R7H-90');
  await page.waitForFunction(() => window.__tcpAxes.state.models.some(model => model.userData.tcpFrame));
  const launcher = page.locator('[data-panel-toggle="tcp-profile-panel"]');
  await launcher.click();
  const toggle = page.locator('#tcp-profile-panel #tcp-axes-visible');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  const feedback = await page.evaluate(async () => {
    const a = window.__tcpAxes;
    const robot = a.state.activeArticulatedModel;
    const controller = a.state.virtualController;
    await a.ensureVirtualControllerCore(controller);
    a.registerVirtualControllerSession(controller);
    controller.targetRobotId = robot.userData.motionInstanceId;
    controller.source = 'bridge';
    controller.wanted = true;
    controller.status = 'streaming';
    a.updateMotionUiLock();
    const axesHiddenBeforeFeedback = !robot.userData.toolAxesAtTcp.visible;
    const frameVisible = robot.userData.tcpFrame.visible;
    for (const tcp of [[708, -292, 215, 0, 0, 180], [808, -192, 315, 20, 30, 40]]) {
      a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: {
        joints: [20, -30, 40, -110, 60, 200], tcp
      } }), controller);
      a.applyVirtualControllerFrameForController(performance.now(), controller);
    }
    return { axesHiddenBeforeFeedback, frameVisible, axesHiddenAfterFeedback: !robot.userData.toolAxesAtTcp.visible,
      point: a.getRobotWorldTcpPoint(robot), joints: robot.userData.joints.map(joint => joint.angle) };
  });
  expect(feedback.axesHiddenBeforeFeedback).toBe(true);
  expect(feedback.frameVisible).toBe(true);
  expect(feedback.axesHiddenAfterFeedback).toBe(true);
  expect(feedback.joints).toEqual([20, -30, 40, -110, 60, 200]);
  await expect(toggle).toBeEnabled();
  await toggle.check();
  await expect(toggle).toBeChecked();
  const shown = await page.evaluate(() => {
    const a = window.__tcpAxes, robot = a.state.activeArticulatedModel;
    return { visible: robot.userData.toolAxesAtTcp.visible, point: a.getRobotWorldTcpPoint(robot) };
  });
  expect(shown.visible).toBe(true);
  expect(shown.point).toEqual(feedback.point);
  await toggle.uncheck();
  await page.evaluate(() => window.__tcpAxes.disconnectVirtualController(window.__tcpAxes.state.virtualController));
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.locator('#btn-add-robot-model-choice').click();
  await page.waitForFunction(() => window.__tcpAxes.state.models.filter(model => model.userData.tcpFrame).length === 2);
  const restored = await page.evaluate(async () => {
    const a = window.__tcpAxes;
    const hiddenBeforeRestore = a.state.models.filter(model => model.userData.tcpFrame)
      .every(model => !model.userData.toolAxesAtTcp.visible);
    const snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
    await a.restoreWorkspaceSnapshot(snapshot);
    return { savedVisible: snapshot.display.tcpAxesVisible, hiddenBeforeRestore,
      robotCount: a.state.models.filter(model => model.userData.tcpFrame).length,
      hidden: a.state.models.filter(model => model.userData.tcpFrame).every(model => !model.userData.toolAxesAtTcp.visible) };
  });
  expect(restored.savedVisible).toBe(false);
  expect(restored.hiddenBeforeRestore).toBe(true);
  expect(restored.robotCount).toBe(2);
  expect(restored.hidden).toBe(true);
  if (!await toggle.isVisible()) await launcher.click();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  expect(await page.evaluate(() => window.__tcpAxes.state.models.filter(model => model.userData.tcpFrame)
    .every(model => model.userData.toolAxesAtTcp.visible))).toBe(true);
  await toggle.uncheck();
  await page.screenshot({ path: test.info().outputPath('tcp-axes-hidden.png') });
  await page.evaluate(() => window.__tcpAxes.applyWorkspaceDisplayState({ display: {} }));
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => window.__tcpAxes.state.models.filter(model => model.userData.tcpFrame)
    .every(model => model.userData.toolAxesAtTcp.visible))).toBe(true);
  expect(errors).toEqual([]);
});

for (const controllerKind of ['virtual', 'real']) {
  test(`${controllerKind} 컨트롤러 연결 중 Tool·Wobj 축 표시 체크를 조작한다`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nwindow.__axisControls = { state, registerVirtualControllerSession, updateMotionUiLock, renderWorkObjectPanel };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__axisControls?.state.workspaceRecovery.ready);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__axisControls.state.activeArticulatedModel?.userData.tcpFrame);
    await page.locator('[data-panel-toggle="workobject-panel"]').click();
    await page.locator('[data-work-object-index="1"]').click();
    await page.locator('#btn-apply-workobject').click();
    await page.evaluate(controllerKind => {
      const a = window.__axisControls, controller = a.state.virtualController;
      controller.controllerKind = controllerKind;
      controller.targetRobotId = a.state.activeArticulatedModel.userData.motionInstanceId;
      a.registerVirtualControllerSession(controller);
      controller.source = 'bridge'; controller.wanted = true; controller.status = 'streaming';
      a.updateMotionUiLock();
      a.renderWorkObjectPanel();
    }, controllerKind);
    const toolToggle = page.locator('#tcp-axes-visible'), wobjToggle = page.locator('#workobject-visible');
    async function setAxesChecked(checked) {
      // These floating panels share their default screen position.
      await page.locator('#workobject-panel [data-panel-action="hide"]').click();
      await page.locator('[data-panel-toggle="tcp-profile-panel"]').click();
      await toolToggle.setChecked(checked);
      await page.locator('#tcp-profile-panel [data-panel-action="hide"]').click();
      await page.locator('[data-panel-toggle="workobject-panel"]').click();
      await wobjToggle.setChecked(checked);
    }
    await expect(toolToggle).toBeEnabled();
    await expect(wobjToggle).toBeEnabled();
    const poseBefore = await page.evaluate(() => {
      const robot = window.__axisControls.state.activeArticulatedModel;
      return { joints: robot.userData.joints.map(joint => joint.angle),
        workObject: robot.userData.workObjects[1].position.slice() };
    });
    // Hiding axes must not apply pending coordinate edits.
    await page.locator('[data-workobject-pose="x"]').fill('123');
    for (const checked of [false, true]) {
      await setAxesChecked(checked);
      await expect.poll(() => page.evaluate(() => {
        const a = window.__axisControls, robot = a.state.activeArticulatedModel;
        return { tool: robot.userData.toolAxesAtTcp.visible,
          wobj: a.state.workObjectVisuals.find(entry => entry.robot === robot && entry.index === 1).group.visible };
      })).toEqual({ tool: checked, wobj: checked });
      await page.evaluate(() => { window.__axisControls.updateMotionUiLock(); window.__axisControls.renderWorkObjectPanel(); });
      await expect(toolToggle).toBeEnabled();
      await expect(wobjToggle).toBeEnabled();
      await expect(toolToggle).toBeChecked({ checked });
      await expect(wobjToggle).toBeChecked({ checked });
    }
    const poseAfter = await page.evaluate(() => {
      const robot = window.__axisControls.state.activeArticulatedModel;
      return { joints: robot.userData.joints.map(joint => joint.angle),
        workObject: robot.userData.workObjects[1].position.slice() };
    });
    expect(poseAfter).toEqual(poseBefore);
    await page.evaluate(() => {
      const a = window.__axisControls;
      a.state.olp.manualMoveBusy = true;
      a.updateMotionUiLock(); a.renderWorkObjectPanel();
    });
    await expect(page.locator('[data-workobject-pose="x"]')).toBeDisabled();
    await expect(toolToggle).toBeEnabled();
    await expect(wobjToggle).toBeEnabled();
    await setAxesChecked(false);
    expect(await page.evaluate(() => {
      const a = window.__axisControls, robot = a.state.activeArticulatedModel;
      return robot.userData.toolAxesAtTcp.visible || a.state.workObjectVisuals
        .find(entry => entry.robot === robot && entry.index === 1).group.visible;
    })).toBe(false);
    expect(errors).toEqual([]);
  });
}
