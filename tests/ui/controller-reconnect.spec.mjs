import { test, expect } from '@playwright/test';

async function setup(page, robotCount = 1) {
  const commands = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:5055/api/health', route => route.fulfill({
    json: { service: 'InoRobotVirtualControllerBridge', pairingToken: 'test-token' }
  }));
  await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:(5000|5055)\/ws/, socket => {
    socket.onMessage(raw => {
      const command = JSON.parse(raw);
      commands.push(command);
      if (command.type === 'connect') socket.send(JSON.stringify({ type: 'connectResult', success: true }));
    });
  });
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
window.__controllerReconnect = { state, getArticulatedRobots, togglePanelVisibility, isVirtualControllerActiveForRobot };` });
  });
  await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__controllerReconnect?.state.workspaceRecovery.ready);
  for (let index = 0; index < robotCount; index++) {
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    if (index) await page.locator('#btn-add-robot-model-choice').click();
    await page.waitForFunction(count => window.__controllerReconnect.getArticulatedRobots().length === count, index + 1);
  }
  await page.evaluate(() => {
    window.__controllerReconnect.state.virtualController.bridgeToken = 'test-token';
    window.__controllerReconnect.togglePanelVisibility('virtual-controller-panel');
  });
  return { commands, errors };
}

for (const source of ['bridge', 'trace']) {
  test(`${source}: 연결 해제 후 목록·설정을 유지하고 같은 항목으로 다시 연결한다`, async ({ page }) => {
    test.setTimeout(60000);
    const { commands, errors } = await setup(page);
    await page.locator('#virtual-controller-source').selectOption(source);
    await page.locator('#virtual-controller-kind').selectOption('real');
    await page.locator('#virtual-controller-ip').fill('192.168.50.20');
    await page.locator('#virtual-controller-connect').click();
    const row = page.locator('.virtual-controller-connection-row');
    await expect(row).toHaveClass(/\bconnected\b/);
    const sessionId = await row.getAttribute('data-virtual-controller-session');
    const targetRobotId = await page.locator('#virtual-controller-robot').inputValue();

    await page.locator('#virtual-controller-connect').click();
    await expect(row).toHaveCount(1);
    await expect(row).toHaveClass(/disconnected/);
    await expect(row).toContainText('연결 안 됨');
    await expect(page.locator('#virtual-controller-ip')).toHaveValue('192.168.50.20');
    await expect(page.locator('#virtual-controller-kind')).toHaveValue('real');
    await expect(page.locator('#virtual-controller-source')).toHaveValue(source);
    await expect(page.locator('#virtual-controller-robot')).toHaveValue(targetRobotId);
    await test.info().attach('disconnected-controller', {
      body: await page.locator('#virtual-controller-panel').screenshot(), contentType: 'image/png'
    });
    expect(await page.evaluate(() => {
      const a = window.__controllerReconnect, c = a.state.virtualController;
      return { wanted: c.wanted, socket: c.socket, reconnectTimer: c.reconnectTimer,
        watchdog: c.streamWatchdogTimer, robotLocked: a.isVirtualControllerActiveForRobot(a.getArticulatedRobots()[0]) };
    })).toEqual({ wanted: false, socket: null, reconnectTimer: null, watchdog: null, robotLocked: false });

    await row.getByRole('button', { name: '연결', exact: true }).click();
    await expect(row).toHaveClass(/\bconnected\b/);
    await expect(row).toHaveAttribute('data-virtual-controller-session', sessionId);
    await row.getByRole('button', { name: '연결 해제', exact: true }).click();
    await expect(row).toHaveClass(/disconnected/);
    await page.locator('#virtual-controller-connect').click();
    await expect(row).toHaveClass(/\bconnected\b/);
    await expect(row).toHaveCount(1);
    expect(commands.filter(c => c.type === 'connect').map(c => c.ip)).toEqual(Array(3).fill('192.168.50.20'));
    expect(commands.filter(c => c.type === 'disconnect')).toHaveLength(2);
    expect(errors).toEqual([]);
  });
}

test('다른 컨트롤러를 선택한 상태에서도 해제된 항목을 원래 IP·로봇으로 재연결한다', async ({ page }) => {
  test.setTimeout(90000);
  const { commands, errors } = await setup(page, 2);
  await page.locator('#virtual-controller-source').selectOption('bridge');
  await page.locator('#virtual-controller-ip').fill('127.0.0.8');
  await page.locator('#virtual-controller-connect').click();
  const first = page.locator('.virtual-controller-connection-row').first();
  await expect(first).toHaveClass(/\bconnected\b/);
  const firstId = await first.getAttribute('data-virtual-controller-session');
  const firstRobotId = await page.locator('#virtual-controller-robot').inputValue();
  await first.getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect(first).toHaveClass(/disconnected/);

  await page.locator('#virtual-controller-add').click();
  const otherRobot = await page.locator('#virtual-controller-robot option').evaluateAll((options, id) =>
    options.find(option => option.value && option.value !== id).value, firstRobotId);
  await page.locator('#virtual-controller-robot').selectOption(otherRobot);
  await page.locator('#virtual-controller-ip').fill('127.0.0.9');
  await page.locator('#virtual-controller-connect').click();
  await expect(page.locator('.virtual-controller-connection-row')).toHaveCount(2);
  const second = page.locator('.virtual-controller-connection-row').last();
  await expect(second).toHaveClass(/\bconnected\b/);

  await first.getByRole('button', { name: '연결', exact: true }).click();
  await expect(first).toHaveClass(/\bconnected\b/);
  await expect(first).toHaveAttribute('data-virtual-controller-session', firstId);
  await expect(page.locator('#virtual-controller-ip')).toHaveValue('127.0.0.8');
  await expect(page.locator('#virtual-controller-robot')).toHaveValue(firstRobotId);
  await expect(second).toHaveClass(/\bconnected\b/);
  await expect(page.locator('.virtual-controller-connection-row')).toHaveCount(2);
  expect(commands.filter(c => c.type === 'connect').map(c => c.ip)).toEqual(['127.0.0.8', '127.0.0.9', '127.0.0.8']);
  expect(errors).toEqual([]);
});
