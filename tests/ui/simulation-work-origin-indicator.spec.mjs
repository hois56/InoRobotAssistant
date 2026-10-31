import { test, expect } from '@playwright/test';

async function setup(page, model = 'IR-S7-60Z20') {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
window.__workOrigin = { state, setJointAngle, captureCurrentTcpTarget, getArticulatedRobots,
  getOlpHomeTargetAngles, updateWorkOriginButtonUi, ensureMotionProgram, syncWorkOriginOutputStates };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__workOrigin?.state.renderer);
  await page.locator('#model-select').selectOption(`robot:${model}`);
  await expect(page.locator('#program-work-origin-robot')).toBeVisible();
}

async function setLastJoint(page, value) {
  await page.evaluate(value => {
    const a = window.__workOrigin, robot = a.state.activeArticulatedModel;
    a.setJointAngle(robot.userData.joints.at(-1), value);
    a.captureCurrentTcpTarget(robot);
  }, value);
}

async function expectReached(page, reached) {
  const icon = page.locator('#program-work-origin-robot > i');
  if (reached) await expect(icon).toHaveCSS('color', 'rgb(74, 222, 128)');
  else await expect(icon).not.toHaveCSS('color', 'rgb(74, 222, 128)');
}

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) {
  test(`${model} 작업 원점 아이콘은 등록·이탈·복귀와 OLP 원점 도달을 따라간다`, async ({ page }) => {
    await setup(page, model);
    await expectReached(page, false);
    await setLastJoint(page, 10);
    const button = page.locator('#program-work-origin-robot');
    await button.click();
    await expectReached(page, false);
    await page.locator('#btn-register-work-origin').click();
    await expectReached(page, true);
    await button.click();
    await expect(page.locator('#work-origin-dialog')).not.toBeVisible();
    await expectReached(page, true);

    await setLastJoint(page, 11);
    await expectReached(page, false);
    await button.click();
    await expectReached(page, false);
    await page.locator('#btn-move-work-origin').click();
    await expect(button).toBeEnabled();
    await expectReached(page, true);

    // OLP uses fixed Work Origin 0 rather than the simulation's saved origin.
    await page.evaluate(() => {
      const a = window.__workOrigin, robot = a.state.activeArticulatedModel;
      a.state.olp.projects.set(robot.userData.motionInstanceId, { labels: {} });
      a.state.olp.enabled = true;
      a.updateWorkOriginButtonUi();
    });
    await expectReached(page, false);
    await page.evaluate(() => {
      const a = window.__workOrigin, robot = a.state.activeArticulatedModel;
      a.getOlpHomeTargetAngles(robot, 0).forEach((value, i) => a.setJointAngle(robot.userData.joints[i], value));
    });
    await expectReached(page, true);
    await setLastJoint(page, 0.2);
    await expectReached(page, false);
    await setLastJoint(page, 0);
    await expectReached(page, true);
  });
}

test('작업 원점 아이콘은 선택한 로봇의 등록 상태를 표시한다', async ({ page }) => {
  await setup(page);
  await page.locator('#program-work-origin-robot').click();
  await page.locator('#btn-register-work-origin').click();
  await page.locator('#program-work-origin-robot').click();
  await expectReached(page, true);
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.locator('#btn-add-robot-model-choice').click();
  await page.waitForFunction(() => window.__workOrigin.getArticulatedRobots().length === 2);
  await expectReached(page, false);
  await page.locator('#model-tree .model-tree-button').nth(0).click();
  await expectReached(page, true);
  await page.locator('#model-tree .model-tree-button').nth(1).click();
  await expectReached(page, false);
});
