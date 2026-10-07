import { test, expect } from '@playwright/test';
test('수동 Input은 ON/OFF를 유지하고 OLP 대기 조건에 반영된다', async ({ page }) => {
 const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 await page.route('**/2_3DSimulation/main.js*', async route=> { const response=await route.fetch(); await route.fulfill({response,body:`${await response.text()}\nwindow.__io={state,readOlpAddress,readOlpSimulatorBit,connectOlpVirtualBus};`}); });
 await page.goto('/2_3DSimulation/index.html'); await page.waitForFunction(()=>window.__io);
 await page.locator('#btn-io-simulator').click();
 for(const bit of [0,1,37]) {
  const button=page.locator(`[data-io-simulator-entry="IN:bit:${bit}"]`);
  await button.click(); await expect(button).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(150); expect(await page.evaluate(bit=>window.__io.readOlpAddress(`In[${bit}]`),bit)).toBe(1);
  await button.click(); await expect(button).toHaveAttribute('aria-pressed','false');
 }
 expect(errors).toEqual([]);
});

test('가상 버스 반복 수신 중에도 수동 입력을 전환하고 InW[37] 주소별 값을 읽는다', async ({ page }) => {
 await page.route('**/2_3DSimulation/main.js*', async route=> { const response=await route.fetch(); await route.fulfill({response,body:`${await response.text()}\nwindow.__io={state,readOlpAddress,connectOlpVirtualBus};`}); });
 await page.goto('/2_3DSimulation/index.html'); await page.waitForFunction(()=>window.__io);
 await page.evaluate(()=>{
  window.WebSocket=class { static OPEN=1; static CONNECTING=0; readyState=1; listeners={}; constructor(){window.__bus=this;} addEventListener(type,fn){this.listeners[type]=fn;} send(){} close(){} };
  window.__io.state.olp.virtualBusWanted=true; window.__io.connectOlpVirtualBus(); window.__io.state.olp.busConnected=true;
  window.__snapshot=(mappedValues={})=>window.__bus.listeners.message({data:JSON.stringify({type:'inputSnapshot',words:Array(128).fill(0),mappedValues})});
  window.__snapshot();
 });
 await page.locator('#btn-io-simulator').click();
 for(const bit of [0,1]) {
  const button=page.locator(`[data-io-simulator-entry="IN:bit:${bit}"]`);
  await button.click(); await page.evaluate(()=>window.__snapshot());
  expect(await page.evaluate(bit=>window.__io.readOlpAddress(`In[${bit}]`),bit)).toBe(1);
  await expect(button).toHaveAttribute('aria-pressed','true');
  await button.click(); await page.evaluate(()=>window.__snapshot());
  await expect(button).toHaveAttribute('aria-pressed','false');
 }
 await page.evaluate(()=>window.__snapshot({'InW[37]':1234,'In[1]':1}));
 expect(await page.evaluate(()=>window.__io.readOlpAddress('InW[37]'))).toBe(1234);
 await expect(page.locator('[data-io-simulator-entry="IN:bit:1"]')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>window.__snapshot({'InW[37]':0,'In[1]':0}));
 expect(await page.evaluate(()=>window.__io.readOlpAddress('InW[37]'))).toBe(0);
 await expect(page.locator('[data-io-simulator-entry="IN:bit:1"]')).toHaveAttribute('aria-pressed','false');
});
