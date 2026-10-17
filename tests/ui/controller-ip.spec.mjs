import { test, expect } from '@playwright/test';
test('controller IP defaults, editing and connection address', async ({ page }) => {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__ipTest = { state, refreshVirtualControllerUi, connectVirtualController, createVirtualControllerSession };' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__ipTest);
  const result = await page.evaluate(async () => {
    const api=window.__ipTest, ip=document.querySelector('#virtual-controller-ip'), kind=document.querySelector('#virtual-controller-kind');
    api.refreshVirtualControllerUi();
    const initial={value:ip.value,disabled:ip.disabled,readOnly:ip.readOnly};
    ip.value='192.168.1.20'; ip.dispatchEvent(new Event('input')); api.refreshVirtualControllerUi();
    const edited=ip.value;
    await api.connectVirtualController();
    const connectionIp=api.state.virtualController.ipAddress;
    const clonedIp=api.createVirtualControllerSession(api.state.virtualController).ipAddress;
    kind.value='real';kind.dispatchEvent(new Event('change'));const real=ip.value;
    kind.value='virtual';kind.dispatchEvent(new Event('change'));const virtual=ip.value;
    return {initial,edited,connectionIp,clonedIp,real,virtual};
  });
  expect(result).toEqual({initial:{value:'127.0.0.1',disabled:false,readOnly:false},edited:'192.168.1.20',connectionIp:'192.168.1.20',clonedIp:'192.168.1.20',real:'192.168.0.1',virtual:'127.0.0.1'});
});
