import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
window.__robotWobj = { state, getArticulatedRobots, selectSceneModel, setJogRobotSelection,
  serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, renderWorkObjectPanel, undoLastAction, redoLastAction };` });
  });
  await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__robotWobj?.state.renderer);
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.waitForFunction(() => window.__robotWobj.getArticulatedRobots().length === 1);
  await page.locator('[data-panel-toggle="workobject-panel"]').click();
}

async function setFrame(page, index, x, name) {
  await page.locator(`[data-work-object-index="${index}"]`).click();
  const input = page.locator('[data-workobject-pose="x"]');
  await input.focus(); await input.fill(String(x));
  await page.locator('#workobject-name').fill(name);
  await page.locator('#btn-apply-workobject').click();
}

async function addSecond(page) {
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.locator('#btn-add-robot-model-choice').click();
  await page.waitForFunction(() => window.__robotWobj.getArticulatedRobots().length === 2);
  return page.evaluate(() => window.__robotWobj.getArticulatedRobots().map(robot => robot.userData.motionInstanceId));
}

async function selectRobot(page, index) {
  await page.locator('#model-tree .model-tree-button').nth(index).click();
}

async function expectFrame(page, robotId, index, x, name) {
  await expect(page.locator('#workobject-target-robot')).toHaveValue(robotId);
  await expect(page.locator(`[data-work-object-index="${index}"]`)).toHaveClass(/active/);
  await expect(page.locator('[data-workobject-pose="x"]')).toHaveValue(String(x));
  if (name) await expect(page.locator('#workobject-name')).toHaveValue(name);
}

test('두 로봇은 같은 번호의 Wobj도 각각 편집하고 로봇·JOG 전환에서 활성 번호를 유지한다', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  await setFrame(page, 1, 100, 'Robot A');
  const ids = await addSecond(page);
  await expectFrame(page, ids[1], 0, 0);
  await setFrame(page, 1, 700, 'Robot B');
  await setFrame(page, 2, 900, 'Robot B second');
  await selectRobot(page, 0);
  await expectFrame(page, ids[0], 1, 100, 'Robot A');
  await expect(page.locator('#wobj-launcher-label')).toHaveText('Wobj 1');
  await selectRobot(page, 1);
  await expectFrame(page, ids[1], 2, 900, 'Robot B second');
  await expect(page.locator('#wobj-launcher-label')).toHaveText('Wobj 2');
  await page.locator('[data-workobject-pose="x"]').focus();
  await page.locator('[data-workobject-pose="x"]').fill('1234');
  await page.evaluate(() => {
    const a = window.__robotWobj;
    a.selectSceneModel(a.getArticulatedRobots()[0]);
  });
  await expectFrame(page, ids[0], 1, 100, 'Robot A');
  await page.locator('[data-workobject-pose="x"]').press('Tab');
  await selectRobot(page, 1);
  await page.locator('#workobject-target-robot').selectOption(ids[0]);
  await expectFrame(page, ids[0], 1, 100, 'Robot A');
  await page.locator('#workobject-target-robot').selectOption(ids[1]);
  await page.locator('[data-work-object-index="1"]').click();
  await expectFrame(page, ids[1], 1, 700, 'Robot B');
  await page.locator('[data-work-object-index="2"]').click();
  await page.evaluate(() => {
    const a = window.__robotWobj;
    a.setJogRobotSelection(new Set([a.getArticulatedRobots()[0].userData.motionInstanceId]));
  });
  await expectFrame(page, ids[0], 1, 100, 'Robot A');
  await page.locator('#inorobot-language-select').selectOption('en');
  await expectFrame(page, ids[0], 1, 100, 'Robot A');
  expect(await page.evaluate(() => window.__robotWobj.getArticulatedRobots().map(robot => robot.userData.activeWorkObjectIndex))).toEqual([1, 2]);
  expect(errors).toEqual([]);
});

test('저장·복원과 실행 취소는 로봇별 Wobj 원점·회전·활성 번호를 보존한다', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  await setFrame(page, 1, 100, 'Robot A');
  const ids = await addSecond(page);
  await setFrame(page, 1, 700, 'Robot B');
  await setFrame(page, 2, 900, 'Robot B second');
  const rotation = page.locator('[data-workobject-pose="rz"]');
  await rotation.focus(); await rotation.fill('90'); await rotation.press('Enter'); await rotation.press('Tab');
  await page.evaluate(() => window.__robotWobj.undoLastAction());
  await expectFrame(page, ids[1], 2, 900, 'Robot B second');
  await expect(rotation).toHaveValue('0');
  await page.evaluate(() => window.__robotWobj.redoLastAction());
  await expect(rotation).toHaveValue('90');
  await page.evaluate(async () => {
    const a = window.__robotWobj;
    await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
  });
  await expectFrame(page, ids[1], 2, 900, 'Robot B second');
  await selectRobot(page, 0);
  await expectFrame(page, ids[0], 1, 100, 'Robot A');
  await expect(rotation).toHaveValue('0');
  await selectRobot(page, 1);
  await expectFrame(page, ids[1], 2, 900, 'Robot B second');
  await expect(rotation).toHaveValue('90');
  expect(errors).toEqual([]);
});
