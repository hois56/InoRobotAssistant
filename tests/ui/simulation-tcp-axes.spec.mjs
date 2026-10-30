import { test, expect } from '@playwright/test';

test('TCP axes can stay hidden through robot loading, controller feedback and workspace restore', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__tcpAxes = {state,THREE,ensureVirtualControllerCore,registerVirtualControllerSession,handleVirtualControllerMessage,applyVirtualControllerFrameForController,getRobotWorldTcpPoint,disconnectVirtualController,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,applyWorkspaceDisplayState};' });
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
