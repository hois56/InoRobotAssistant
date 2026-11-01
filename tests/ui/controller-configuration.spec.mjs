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
        await route.fulfill({ response, body: await response.text() + '\nwindow.__controllerConfig={state,togglePanelVisibility,refreshVirtualControllerUi,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,getArticulatedRobots,saveMotionProjectNow};' });
    });
    await page.goto('/2_3DSimulation/index.html');
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
    await page.reload();
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
