import { test, expect } from '@playwright/test';

test('1번 로봇 컨트롤러 연결은 2번 로봇 TCP 설정을 막지 않는다', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__perRobotTcp = {state, loadModelFromServer, selectSceneModel, refreshTcpProfileUi, registerVirtualControllerSession, selectTcpProfile, updateTcpProfileLive, applyTcpProfileEditor, resetActiveTcpProfile};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__perRobotTcp);
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.waitForFunction(() => window.__perRobotTcp.state.activeArticulatedModel?.userData.tcpFrame);
  const result = await page.evaluate(async () => {
    const a = window.__perRobotTcp, first = a.state.activeArticulatedModel;
    await a.loadModelFromServer(first.userData.motionModelDefinition, { append: true });
    const second = a.state.activeArticulatedModel;
    if (first === second) throw Error('Second robot not loaded');
    const controller = a.state.virtualController;
    a.registerVirtualControllerSession(controller);
    controller.targetRobotId = first.userData.motionInstanceId;
    controller.wanted = true; controller.status = 'streaming';
    a.selectSceneModel(second); a.refreshTcpProfileUi(second);
    const input = document.querySelector('[data-tcp-offset="x"]');
    a.selectTcpProfile(1);
    const secondDisabled = input.disabled;
    input.value = '123'; a.updateTcpProfileLive();
    const live = second.userData.tcpLiveProfile?.position.x;
    a.applyTcpProfileEditor();
    const applied = second.userData.tcpProfiles[1].position.x;
    a.resetActiveTcpProfile();
    const reset = second.userData.tcpProfiles[1].position.x;
    a.selectSceneModel(first); a.refreshTcpProfileUi(first);
    const firstDisabled = input.disabled;
    a.selectTcpProfile(1);
    return { secondDisabled, firstDisabled, live, applied, reset, firstIndex: first.userData.activeTcpProfileIndex };
  });
  expect(result).toEqual({ secondDisabled: false, firstDisabled: true, live: 123, applied: 123, reset: 0, firstIndex: 0 });
});
