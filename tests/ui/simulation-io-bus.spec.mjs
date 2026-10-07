import { test, expect } from '@playwright/test';
test('가상 버스 InW[37]과 Input 화면은 수신값을 반영한다', async({page})=>{
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:`${await response.text()}\nwindow.__io={state,readOlpAddress,connectOlpVirtualBus};`});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__io);
 await page.locator('#btn-io-simulator').click();
 await page.evaluate(()=>{
 window.WebSocket=class {static OPEN=1;static CONNECTING=0;readyState=1;listeners={};constructor(){window.__bus=this;}addEventListener(t,f){this.listeners[t]=f;}send(){}close(){}};
 window.__io.state.olp.virtualBusWanted=true;window.__io.connectOlpVirtualBus();window.__io.state.olp.busConnected=true;
 window.__bus.listeners.message({data:JSON.stringify({type:'inputSnapshot',words:Array(128).fill(0),mappedValues:{'InW[37]':1234,'In[1]':1}})});
 });
 expect(await page.evaluate(()=>window.__io.readOlpAddress('InW[37]'))).toBe(1234);
 await expect(page.locator('[data-io-simulator-entry="IN:bit:1"]')).toHaveAttribute('aria-pressed','true');
});
