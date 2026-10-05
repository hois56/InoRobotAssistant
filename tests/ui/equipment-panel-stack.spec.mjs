import {test,expect} from '@playwright/test';
test('동작 설정은 최근 열거나 클릭한 패널과 같은 겹침 순서를 따른다',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__panelStack={state,equipmentApp,createPrimitiveShapeRoot,ensureWorkspaceModelId};'});});await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__panelStack);await page.locator('[data-panel-toggle="model-browser-panel"]').click();
 const open=()=>page.evaluate(()=>{const a=window.__panelStack;let m=a.state.models[0];if(!m){m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'패널 대상'});a.state.scene.add(m);a.state.models.push(m);}a.equipmentApp.ui.open('equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1');});await open();
 const equipment=page.locator('#equipment-dialog'),io=page.locator('#io-simulator-panel');const clickIo=async()=>{const b=await io.boundingBox();await page.mouse.click(b.x+35,b.y+25);};await page.locator('#btn-io-simulator').click();await expect(io).toBeVisible();
 const front=()=>page.evaluate(()=>{const doc=document;return Number(getComputedStyle(doc.getElementById('io-simulator-panel')).zIndex)>Number(getComputedStyle(doc.getElementById('equipment-dialog')).zIndex)?'io':'equipment';});await expect.poll(front).toBe('io');
 await page.evaluate(()=>{Object.assign(document.getElementById('equipment-dialog').style,{left:'250px',top:'180px',width:'520px',height:'400px',right:'auto'});Object.assign(document.getElementById('io-simulator-panel').style,{left:'120px',top:'100px',width:'450px',height:'450px',right:'auto',bottom:'auto'});});
 const overlap=()=>page.evaluate(()=>document.elementFromPoint(350,240)?.closest('#equipment-dialog,#io-simulator-panel')?.id);await expect.poll(overlap).toBe('io-simulator-panel');
 await page.mouse.click(650,205);await expect.poll(front).toBe('equipment');await expect.poll(overlap).toBe('equipment-dialog');
 await clickIo();await expect.poll(front).toBe('io');await expect.poll(overlap).toBe('io-simulator-panel');
 await open();await expect.poll(front).toBe('equipment');await equipment.locator('#equipment-close').click();await expect(equipment).not.toBeVisible();await clickIo();expect(await page.evaluate(()=>window.__panelStack.state.panelOpenOrder.includes('equipment-dialog'))).toBe(false);
 await open();await expect.poll(front).toBe('equipment');expect(errors).toEqual([]);
});
