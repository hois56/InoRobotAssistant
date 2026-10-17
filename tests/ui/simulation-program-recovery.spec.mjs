import { test, expect } from '@playwright/test';

test('프로그램 패널 프로젝트와 편집 내용은 작업 복원 후에도 유지된다', async ({ page }) => {
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__recovery={state,handleOlpFolderImport,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,getOlpProject,saveMotionProjectNow,addCurrentMotionStep,addDelayMotionStep};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__recovery?.state.workspaceRecovery.ready);
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.waitForFunction(() => window.__recovery.state.models.some(model => model.userData.joints));
  const result = await page.evaluate(async () => {
    const a = window.__recovery;
    a.addCurrentMotionStep();
    a.addDelayMotionStep();
    const file = new File(['DELAY 1\nEND\n'], 'main.pro', { type: 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'SavedProject/Program/main.pro' });
    await a.handleOlpFolderImport([file]);
    const snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
    const before = snapshot.olpProjects;
    const restored = await a.restoreWorkspaceSnapshot(snapshot);
    return { before, restored, paths: [...(a.getOlpProject()?.files?.keys() || [])] };
  });
  expect(result.before).toHaveLength(1);
  expect(result.paths).toEqual(result.before[0].files.map(file => file.path));
  expect(warnings.filter(message => message.includes('OLP project restore failed'))).toEqual([]);
  await page.evaluate(() => window.__recovery.saveMotionProjectNow());
  await page.goto('/0_Home/ko/index.html');
  await page.goto('/2_3DSimulation/index.html');
  await page.locator('#btn-workspace-restore').click();
  await page.waitForFunction(() => window.__recovery?.state.workspaceRecovery.ready);
  expect(await page.evaluate(() => [...(window.__recovery.getOlpProject()?.files?.keys() || [])])).toEqual(result.paths);
  expect(await page.evaluate(() => window.__recovery.serializeWorkspaceSnapshot().motionProject.robots[0].steps.map(step => step.motion))).toEqual(['MOVJ', 'DELAY']);
  await expect(page.locator('#olp-file-select option')).toHaveCount(result.paths.length);
});

test('포인트 추가 직후 화면을 떠나도 이전 작업에서 복구된다', async ({ page }) => {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__recovery={state,addCurrentMotionStep,serializeWorkspaceSnapshot,saveMotionProjectNow};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__recovery?.state.workspaceRecovery.ready);
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.waitForFunction(() => window.__recovery.state.activeProgramRobot);
  await page.evaluate(() => window.__recovery.saveMotionProjectNow());
  await page.evaluate(() => {
    // Simulate a final IndexedDB write that cannot finish before navigation.
    window.__recovery.state.workspaceRecovery.db.saveWorkspaceWithLease = () => new Promise(() => {});
    window.__recovery.addCurrentMotionStep();
    location.href = '/0_Home/ko/index.html';
  });
  await page.waitForURL('**/0_Home/ko/index.html');
  await page.goto('/2_3DSimulation/index.html');
  await page.locator('#btn-workspace-restore').click();
  await page.waitForFunction(() => window.__recovery?.state.workspaceRecovery.ready);
  expect(await page.evaluate(() => window.__recovery.serializeWorkspaceSnapshot().motionProject.robots[0].steps.map(step => step.motion))).toEqual(['MOVJ']);
});
