import {test,expect} from '@playwright/test';
test('컨트롤러 Out[0] 수신이 IO 테스트와 진공 흡착·해제로 연결되고 Out[16]도 표시된다',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__hardware={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,handleVirtualControllerMessage,ensureVirtualControllerCore,registerVirtualControllerSession,writeOlpAddress,readOlpSimulatorBit};'});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__hardware);
 await page.locator('#btn-io-simulator').click();await page.locator('[data-io-simulator-direction="OUT"]').first().click();
 const result=await page.evaluate(async()=>{
 const a=window.__hardware,app=a.equipmentApp,controller=a.state.virtualController;await a.ensureVirtualControllerCore(controller);a.registerVirtualControllerSession(controller);controller.wanted=true;controller.status='streaming';controller.streamWatchdogTimer=1;
 const box=(name,z)=>{const m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});m.position.z=z;a.state.scene.add(m);a.state.models.push(m);return m;};const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';const pad=box('패드',20),obj=box('물체',0);
 app.save({id:'hardware-object',type:'OBJECT',movingRef:ref(obj)});const def=app.save({id:'hardware-vacuum',type:'VACUUM',movingRef:ref(pad)},{forward:0,reverse:null});
 a.handleVirtualControllerMessage(JSON.stringify({type:'robotState',data:{joints:[0,0,0,0,0,0],outputs:{0:1,16:1}}}),controller);a.writeOlpAddress('Out[0]',0);a.writeOlpAddress('OutB[0]',0);app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,0);app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,20);
 window.__hardwareDef=def;return {held:def.runtime.heldRef,expected:ref(obj),out0:a.readOlpSimulatorBit('OUT',0),out16:a.readOlpSimulatorBit('OUT',16)};
 });
 expect(result.held).toBe(result.expected);expect(result.out0).toBe(1);expect(result.out16).toBe(1);
 await expect(page.locator('[data-io-simulator-entry="OUT:bit:0"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-io-simulator-entry="OUT:bit:16"]')).toHaveAttribute('aria-pressed','true');
 const off=await page.evaluate(()=>{const a=window.__hardware;a.handleVirtualControllerMessage(JSON.stringify({type:'robotState',data:{joints:[0,0,0,0,0,0],outputs:{0:0,16:0}}}));a.equipmentApp.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,40);return window.__hardwareDef.runtime.heldRef;});expect(off).toBe('');
 await expect(page.locator('[data-io-simulator-entry="OUT:bit:0"]')).toHaveAttribute('aria-pressed','false');await expect(page.locator('[data-io-simulator-entry="OUT:bit:16"]')).toHaveAttribute('aria-pressed','false');
 expect(errors).toEqual([]);
});
