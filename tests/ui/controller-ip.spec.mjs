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
  expect(result).toEqual({initial:{value:'127.0.0.1',disabled:false,readOnly:false},edited:'192.168.1.20',connectionIp:'192.168.1.20',clonedIp:'192.168.1.20',real:'192.168.0.1',virtual:'192.168.1.20'});
});

test('controller kind and each IP are remembered after reload and reopening the connection panel', async ({ page }) => {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__savedController = {state,togglePanelVisibility};' });
  });
  const openPanel = async () => {
    await page.waitForFunction(() => window.__savedController?.state.workspaceRecovery.ready
      || document.querySelector('#workspace-recovery-dialog')?.open);
    if (await page.locator('#workspace-recovery-dialog').isVisible()) {
      await page.getByRole('button', { name: '새 작업 시작', exact: true }).click();
    }
    await page.waitForFunction(() => window.__savedController?.state.workspaceRecovery.ready);
    await page.evaluate(() => window.__savedController.togglePanelVisibility('virtual-controller-panel'));
  };
  await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
  await openPanel();
  const kind = page.locator('#virtual-controller-kind');
  const ip = page.locator('#virtual-controller-ip');
  await kind.selectOption('real');
  await ip.fill('192.168.50.20');
  await page.locator('#virtual-controller-panel [data-panel-action="hide"]').click();
  await openPanel();
  await expect(kind).toHaveValue('real');
  await expect(ip).toHaveValue('192.168.50.20');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openPanel();
  await expect(kind).toHaveValue('real');
  await expect(ip).toHaveValue('192.168.50.20');
  await kind.selectOption('virtual');
  await expect(ip).toHaveValue('127.0.0.1');
  await ip.fill('127.0.0.8');
  await kind.selectOption('real');
  await expect(ip).toHaveValue('192.168.50.20');
  await kind.selectOption('virtual');
  await expect(ip).toHaveValue('127.0.0.8');
  await page.locator('#virtual-controller-add').click();
  await expect(kind).toHaveValue('virtual');
  await expect(ip).toHaveValue('127.0.0.8');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openPanel();
  await expect(kind).toHaveValue('virtual');
  await expect(ip).toHaveValue('127.0.0.8');
  expect(await page.evaluate(() => window.__savedController.state.virtualController.wanted)).toBe(false);
});
