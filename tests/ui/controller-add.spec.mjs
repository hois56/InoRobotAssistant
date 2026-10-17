import { test, expect } from '@playwright/test';

test('새 컨트롤러 연결은 로봇·협업·기존 연결 상태와 관계없이 새 설정을 연다', async ({ page }) => {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__controllerAdd = { state, refreshVirtualControllerUi, togglePanelVisibility };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__controllerAdd?.state.renderer);
  await page.evaluate(() => window.__controllerAdd.togglePanelVisibility('virtual-controller-panel'));
  const button = page.locator('#virtual-controller-add');
  for (const collaboration of [false, true]) {
    for (const status of ['disconnected', 'connecting', 'connected', 'streaming', 'reconnecting', 'error']) {
      const previous = await page.evaluate(({ collaboration, status }) => {
        const { state, refreshVirtualControllerUi } = window.__controllerAdd;
        state.collaboration.enabled = collaboration;
        state.virtualController.status = status;
        state.virtualController.wanted = status !== 'disconnected';
        refreshVirtualControllerUi();
        return state.virtualController.sessionId;
      }, { collaboration, status });
      await expect(button).toBeEnabled();
      await button.click();
      const current = await page.evaluate(() => {
        const c = window.__controllerAdd.state.virtualController;
        return { sessionId: c.sessionId, wanted: c.wanted, status: c.status };
      });
      expect(current.sessionId).not.toBe(previous);
      expect(current.wanted).toBe(false);
      expect(current.status).toBe('disconnected');
      await expect(button).toBeEnabled();
    }
  }
});
