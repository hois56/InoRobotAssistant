import {test,expect} from '@playwright/test';
test('all65 web Input buttons write independently, show confirmed snapshots, and turn OFF',async({page})=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__di={state,standardInputClient,handleVirtualControllerMessage,ensureVirtualControllerCore,registerVirtualControllerSession,refreshStandardInputUi};'});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__di?.state.workspaceRecovery.ready);await page.locator('#btn-io-simulator').click();
 await page.evaluate(async()=>{
  const a=window.__di,c=a.state.virtualController;window.__diSent=[];window.__actualInputs=Object.fromEntries(Array.from({length:65},(_,i)=>[i,0]));
  await a.ensureVirtualControllerCore(c);a.registerVirtualControllerSession(c);
  Object.assign(c,{wanted:true,status:'streaming',targetRobotId:'fixture',streamWatchdogTimer:1,ipAddress:'127.0.0.2',socket:{readyState:1,send(raw){
   const m=JSON.parse(raw);window.__diSent.push(m);if(!['readStandardInputs','setStandardInput'].includes(m.type))return;
   if(window.__rejectDi){setTimeout(()=>a.handleVirtualControllerMessage({type:'standardInputResult',requestId:m.requestId,address:m.address,success:false,message:'test read failure'},c),15);return;}
   if(m.type==='setStandardInput')window.__actualInputs[m.address]=m.value;
   setTimeout(()=>a.handleVirtualControllerMessage({type:'standardInputResult',requestId:m.requestId,address:m.address,success:true,value:window.__actualInputs[m.address],inputs:{...window.__actualInputs}},c),15);
  }}});a.standardInputClient.tick(c);
 });
 const bit=i=>page.locator(`[data-io-simulator-entry="IN:bit:${i}"]`);
 await expect(bit(64)).toBeEnabled();
 for(let i=0;i<=64;i++)await bit(i).click();
 await expect(page.locator('#io-simulator-list [data-io-simulator-entry].on')).toHaveCount(65);
 await expect(page.locator('#io-standard-input-status')).toContainText('ON 65 / 65');
 await bit(64).click();await expect(bit(64)).toHaveAttribute('aria-pressed','false');await expect(bit(0)).toHaveAttribute('aria-pressed','true');
 for(let i=0;i<64;i++)await bit(i).click();
 await expect(page.locator('#io-simulator-list [data-io-simulator-entry].on')).toHaveCount(0);
 const writes=await page.evaluate(()=>window.__diSent.filter(m=>m.type==='setStandardInput'));
 expect(writes.filter(m=>m.value===1).map(m=>m.address)).toEqual(Array.from({length:65},(_,i)=>i));expect(writes.filter(m=>m.value===0)).toHaveLength(65);
 await page.evaluate(()=>{window.__actualInputs[32]=1;window.__actualInputs[64]=1;});await expect(bit(32)).toHaveAttribute('aria-pressed','true');await expect(bit(64)).toHaveAttribute('aria-pressed','true');await expect(bit(0)).toHaveAttribute('aria-pressed','false');
 await page.evaluate(()=>{window.__rejectDi=true;});await expect(bit(64).locator('.io-simulator-entry-value')).toHaveText('—');await expect(bit(0)).toBeDisabled();
 await page.evaluate(()=>{window.__di.state.virtualController.wanted=false;window.__di.refreshStandardInputUi();});await expect(bit(63).locator('.io-simulator-entry-value')).toHaveText('—');expect(errors).toEqual([]);
});
