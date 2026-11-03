import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [], commands = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1:5055/api/health', route => route.fulfill({ json: { service: 'InoRobotVirtualControllerBridge', pairingToken: 'config-test-token' } }));
    await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:(5000|5055)\/ws/, socket => {
        socket.onMessage(raw => {
            const command = JSON.parse(raw); commands.push(command);
            if (command.type === 'connect') socket.send(JSON.stringify({ type: 'connectResult', success: true }));
        });
    });
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + '\nwindow.__controllerConfig={state,togglePanelVisibility,refreshVirtualControllerUi,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,getArticulatedRobots,saveMotionProjectNow,connectVirtualController};' });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__controllerConfig?.state.workspaceRecovery.ready);
    await page.evaluate(() => window.__controllerConfig.togglePanelVisibility('virtual-controller-panel'));
    return { errors, commands };
}

test('미연결 구성도 순서대로 가상 IP를 배정하고 종류별 주소를 유지한다', async ({ page }) => {
    const { errors } = await setup(page);
    const ip = page.locator('#virtual-controller-ip'), kind = page.locator('#virtual-controller-kind');
    await expect(ip).toHaveValue('127.0.0.1');
    await kind.selectOption('real'); await ip.fill('192.168.50.20');
    await page.locator('#virtual-controller-add').click(); await kind.selectOption('virtual');
    await expect(ip).toHaveValue('127.0.0.2');
    await kind.selectOption('real'); await expect(ip).toHaveValue('192.168.50.20');
    await kind.selectOption('virtual'); await expect(ip).toHaveValue('127.0.0.2');
    await page.locator('#virtual-controller-add').click(); await expect(ip).toHaveValue('127.0.0.3');
    await expect(page.locator('.virtual-controller-connection-row')).toHaveCount(3);
    expect(errors).toEqual([]);
});

test('두 연결의 프로젝트 설정을 복원하면 자동 연결 없이 목록·IP·대상 로봇이 남는다', async ({ page }) => {
    const { errors, commands } = await setup(page);
    for (let i = 0; i < 2; i++) {
        await page.locator('#model-select').selectOption('robot:IR-R7H-90');
        if (i) await page.locator('#btn-add-robot-model-choice').click();
        await page.waitForFunction(count => window.__controllerConfig.getArticulatedRobots().length === count, i + 1);
    }
    await page.locator('#virtual-controller-connect').click();
    await expect(page.locator('.virtual-controller-connection-row.connected')).toHaveCount(1);
    await page.locator('#virtual-controller-add').click();
    await page.locator('#virtual-controller-connect').click();
    await expect(page.locator('.virtual-controller-connection-row.connected')).toHaveCount(2);
    const beforeConnects = commands.filter(command => command.type === 'connect').length;
    const result = await page.evaluate(async () => {
        const a = window.__controllerConfig, snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        const before = snapshot.controllerConnections;
        await a.restoreWorkspaceSnapshot(snapshot);
        return { before, after: a.serializeWorkspaceSnapshot().controllerConnections,
            sessions: a.state.virtualControllers.map(c => ({ ip: c.ipAddress, wanted: c.wanted, status: c.status, token: c.bridgeToken, socket: c.socket })) };
    });
    expect(result.before.controllers).toHaveLength(2); expect(result.after).toEqual(result.before);
    expect(result.sessions).toEqual(['127.0.0.1', '127.0.0.2'].map(ip => ({ ip, wanted: false, status: 'disconnected', token: null, socket: null })));
    expect(JSON.stringify(result.before)).not.toContain('config-test-token');
    expect(commands.filter(command => command.type === 'connect')).toHaveLength(beforeConnects);
    await expect(page.locator('.virtual-controller-connection-row')).toHaveCount(2);
    await expect(page.locator('#virtual-controller-ip')).toHaveValue('127.0.0.2');
    expect(errors).toEqual([]);
});

test('컨트롤러 구성만 수정해도 자동 저장되고 새로고침 후 연결 없이 복원된다', async ({ page }) => {
    const { errors, commands } = await setup(page);
    await page.locator('#virtual-controller-ip').fill('127.0.0.9');
    await page.locator('#virtual-controller-add').click();
    await page.locator('#virtual-controller-source').selectOption('trace');
    await expect.poll(() => page.evaluate(() => {
        const controllers = window.__controllerConfig.state.workspaceRecovery.workspace?.state.controllerConnections?.controllers;
        return controllers?.length === 2 && controllers[1].source === 'trace';
    })).toBe(true);
    const before = await page.evaluate(() => window.__controllerConfig.state.workspaceRecovery.workspace.state.controllerConnections);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#btn-workspace-restore').click();
    await page.waitForFunction(() => window.__controllerConfig?.state.workspaceRecovery.ready);
    const after = await page.evaluate(() => ({ config: window.__controllerConfig.serializeWorkspaceSnapshot().controllerConnections, active: window.__controllerConfig.state.virtualControllers.some(c => c.wanted) }));
    expect(after.config).toEqual(before); expect(after.active).toBe(false);
    expect(commands.filter(command => command.type === 'connect')).toHaveLength(0); expect(errors).toEqual([]);
});

test('긴 연결 해제·오류 문구는 좁은 컨트롤러 창에도 가로 스크롤을 만들지 않는다', async ({ page }) => {
    const { errors } = await setup(page);
    await page.locator('#virtual-controller-ip').fill('127.0.0.1');
    const widths = await page.evaluate(() => {
        const a = window.__controllerConfig, panel = document.querySelector('#virtual-controller-panel');
        panel.style.width = '260px'; panel.style.maxHeight = '380px';
        a.state.virtualController.status = 'error';
        a.state.virtualController.statusMessage = '연결이끊어져컨트롤러에다시연결하지못했습니다'.repeat(40);
        a.refreshVirtualControllerUi();
        return [panel, panel.querySelector('.virtual-controller-content'), panel.querySelector('.virtual-controller-connections')]
            .map(node => ({ client: node.clientWidth, scroll: node.scrollWidth }));
    });
    for (const width of widths) expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    expect(errors).toEqual([]);
});

test('연결 설정이 없는 예전 프로젝트에 다른 프로젝트의 구성을 섞지 않는다', async ({ page }) => {
    const { errors } = await setup(page);
    await page.locator('#virtual-controller-ip').fill('127.0.0.9');
    await page.locator('#virtual-controller-add').click();
    const result = await page.evaluate(async () => {
        const a = window.__controllerConfig, snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        delete snapshot.controllerConnections;
        await a.restoreWorkspaceSnapshot(snapshot);
        return { config: a.serializeWorkspaceSnapshot().controllerConnections, wanted: a.state.virtualController.wanted };
    });
    expect(result).toEqual({ config: { controllers: [], selectedIndex: -1 }, wanted: false });
    expect(errors).toEqual([]);
});

test('같은 IP의 저장된 구성 하나를 삭제하고 다시 열어도 남은 구성만 복원한다', async ({ page }) => {
    const { errors } = await setup(page);
    await page.locator('#virtual-controller-ip').fill('127.0.0.9');
    await page.locator('#virtual-controller-add').click();
    await page.locator('#virtual-controller-ip').fill('127.0.0.9');
    const rows = page.locator('.virtual-controller-connection-row');
    await expect(rows).toHaveCount(2);
    const selectedId = await rows.last().getAttribute('data-virtual-controller-session');
    await rows.first().getByRole('button', { name: '삭제', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveAttribute('data-virtual-controller-session', selectedId);
    await expect(rows).toHaveClass(/selected/);
    await expect.poll(() => page.evaluate(() =>
        window.__controllerConfig.state.workspaceRecovery.workspace?.state.controllerConnections?.controllers.length
    )).toBe(1);
    const saved = await page.evaluate(() => window.__controllerConfig.serializeWorkspaceSnapshot().controllerConnections);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#btn-workspace-restore').click();
    await page.waitForFunction(() => window.__controllerConfig?.state.workspaceRecovery.ready);
    expect(await page.evaluate(() => window.__controllerConfig.serializeWorkspaceSnapshot().controllerConnections)).toEqual(saved);
    await expect(rows).toHaveCount(1);
    expect(errors).toEqual([]);
});

test('선택한 구성과 마지막 구성도 삭제하고 빈 목록에서 새 설정을 저장할 수 있다', async ({ page }) => {
    const { errors } = await setup(page);
    await page.locator('#virtual-controller-ip').fill('127.0.0.8');
    await page.locator('#virtual-controller-add').click();
    const rows = page.locator('.virtual-controller-connection-row');
    const firstId = await rows.first().getAttribute('data-virtual-controller-session');
    await rows.last().getByRole('button', { name: '삭제', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveAttribute('data-virtual-controller-session', firstId);
    await expect(page.locator('#virtual-controller-ip')).toHaveValue('127.0.0.8');
    await rows.getByRole('button', { name: '삭제', exact: true }).click();
    await expect(rows).toHaveCount(0);
    await expect.poll(() => page.evaluate(() =>
        window.__controllerConfig.state.workspaceRecovery.workspace?.state.controllerConnections
    )).toEqual({ controllers: [], selectedIndex: -1 });
    const restored = await page.evaluate(async () => {
        const a = window.__controllerConfig, snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        await a.restoreWorkspaceSnapshot(snapshot);
        return a.serializeWorkspaceSnapshot().controllerConnections;
    });
    expect(restored).toEqual({ controllers: [], selectedIndex: -1 });
    await page.locator('#virtual-controller-ip').fill('127.0.0.7');
    await expect(rows).toHaveCount(1);
    expect(await page.evaluate(() => window.__controllerConfig.serializeWorkspaceSnapshot().controllerConnections.controllers[0].ipAddress)).toBe('127.0.0.7');
    expect(errors).toEqual([]);
});

test('연결된 항목을 삭제하면 해당 소켓만 종료하고 다른 컨트롤러 연결을 유지한다', async ({ page }) => {
    test.setTimeout(60_000);
    const { errors, commands } = await setup(page);
    for (let index = 0; index < 2; index++) {
        await page.locator('#model-select').selectOption('robot:IR-R7H-90');
        if (index) await page.locator('#btn-add-robot-model-choice').click();
        await page.waitForFunction(count => window.__controllerConfig.getArticulatedRobots().length === count, index + 1);
    }
    await page.locator('#virtual-controller-connect').click();
    await expect(page.locator('.virtual-controller-connection-row.connected')).toHaveCount(1);
    await page.locator('#virtual-controller-add').click();
    await page.locator('#virtual-controller-connect').click();
    await expect(page.locator('.virtual-controller-connection-row.connected')).toHaveCount(2);
    await page.evaluate(() => {
        const sessions = window.__controllerConfig.state.virtualControllers;
        window.__deletedController = sessions[0];
        window.__remainingController = sessions[1];
        window.__remainingControllerSocket = sessions[1].socket;
    });
    await page.locator('.virtual-controller-connection-row').first().getByRole('button', { name: '삭제', exact: true }).click();
    await expect(page.locator('.virtual-controller-connection-row.connected')).toHaveCount(1);
    const result = await page.evaluate(() => {
        const a = window.__controllerConfig, removed = window.__deletedController;
        return { count: a.state.virtualControllers.length, selected: a.state.virtualController === window.__remainingController,
            remainingLive: window.__remainingController.wanted && window.__remainingController.socket === window.__remainingControllerSocket,
            removed: { wanted: removed.wanted, socket: removed.socket, reconnectTimer: removed.reconnectTimer,
                streamWatchdogTimer: removed.streamWatchdogTimer, bridgeHealthTimer: removed.bridgeHealthTimer } };
    });
    expect(result).toEqual({ count: 1, selected: true, remainingLive: true,
        removed: { wanted: false, socket: null, reconnectTimer: null, streamWatchdogTimer: null, bridgeHealthTimer: null } });
    await expect.poll(() => commands.filter(command => command.type === 'disconnect').length).toBe(1);
    expect(errors).toEqual([]);
});

test('연결 준비 중 삭제한 설정은 인증 응답이 늦게 도착해도 다시 등록하거나 연결하지 않는다', async ({ page }) => {
    const { errors, commands } = await setup(page);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__controllerConfig.getArticulatedRobots().length === 1);
    await page.evaluate(() => {
        const controller = window.__controllerConfig.state.virtualController;
        clearTimeout(controller.bridgeHealthTimer);
        controller.bridgeHealthTimer = null;
        controller.bridgeHealthMonitorGeneration += 1;
        controller.bridgeToken = null;
    });
    let releaseHealth;
    const pendingHealth = new Promise(resolve => { releaseHealth = resolve; });
    let requested = false;
    await page.route('http://127.0.0.1:5055/api/health', async route => {
        requested = true;
        await pendingHealth;
        await route.fulfill({ json: { service: 'InoRobotVirtualControllerBridge', pairingToken: 'delayed-test-token' } });
    });
    await page.evaluate(() => { window.__pendingControllerConnect = window.__controllerConfig.connectVirtualController(); });
    try {
        await expect.poll(() => requested).toBe(true);
        await page.locator('.virtual-controller-connection-row').getByRole('button', { name: '삭제', exact: true }).click();
    } finally {
        releaseHealth();
    }
    await page.evaluate(() => window.__pendingControllerConnect);
    await expect(page.locator('.virtual-controller-connection-row')).toHaveCount(0);
    expect(commands.filter(command => command.type === 'connect')).toHaveLength(0);
    expect(await page.evaluate(() => window.__controllerConfig.serializeWorkspaceSnapshot().controllerConnections))
        .toEqual({ controllers: [], selectedIndex: -1 });
    expect(errors).toEqual([]);
});
