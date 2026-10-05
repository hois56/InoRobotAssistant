import {test,expect} from '@playwright/test';

async function openSimulation(page,url='/2_3DSimulation/index.html') {
 await page.route('**/2_3DSimulation/main.js*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:(await response.text()).replace('init();\n','window.__ready=init();\n')+'\nwindow.__wobj={state,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot};'});
 });
 await page.goto(url);await page.waitForFunction(()=>window.__wobj);await page.evaluate(()=>window.__ready);
}

test('새 화면에서 프로젝트를 복원하면 Wobj 버튼과 저장된 좌표계 편집을 사용할 수 있다',async({page,browser})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await openSimulation(page);
 await expect(page.locator('[data-panel-toggle="workobject-panel"]')).toBeDisabled();
 await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');
 await expect(page.locator('[data-panel-toggle="workobject-panel"]')).toBeEnabled();
 const snapshot=await page.evaluate(()=>{
  const api=window.__wobj,robot=api.state.models.find(m=>m.userData.tcpFrame);
  robot.userData.activeWorkObjectIndex=2;
  robot.userData.workObjects[2].defined=true;robot.userData.workObjects[2].position=[100,200,300];
  return api.serializeWorkspaceSnapshot();
 });
 const context=await browser.newContext();const restored=await context.newPage();restored.on('pageerror',e=>errors.push(e.message));
 try {
  await openSimulation(restored,page.url());
  await restored.evaluate(snapshot=>window.__wobj.restoreWorkspaceSnapshot(snapshot),snapshot);
  const launcher=restored.locator('[data-panel-toggle="workobject-panel"]');
  await expect(launcher).toBeEnabled();await launcher.click();
  await expect(restored.locator('#workobject-panel')).toBeVisible();
  await expect(restored.locator('#btn-focus-workobject')).toHaveCount(0);
  await expect(restored.locator('#btn-register-workobject')).toBeEnabled();
  await expect(restored.locator('#btn-reset-workobject')).toBeEnabled();
  await expect(restored.locator('#workobject-target-robot option')).toHaveCount(1);
  await expect(restored.locator('#workobject-list [data-work-object-index="2"]')).toHaveClass(/active/);
  await expect(restored.locator('[data-workobject-pose="x"]')).toHaveValue('100');
  await expect(restored.locator('#btn-apply-workobject')).toBeEnabled();
  expect(errors).toEqual([]);
 } finally {await context.close();}
});
