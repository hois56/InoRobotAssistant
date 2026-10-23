import { test, expect } from '@playwright/test';

for (const [detached, closeSource] of [[false, false], [true, false], [true, true]]) {
  test(`${detached ? '새 창' : '페이지'}에서 실제 고정 후 ${closeSource ? '원래 창을 닫아도 뷰를 복원한다' : '해제해도 뷰 상태를 유지한다'}`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nwindow.__nativePinTest = { state, openViewWindow };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__nativePinTest?.state.renderer);
    await page.evaluate(() => {
      const api = window.__nativePinTest;
      api.openViewWindow(0);
      api.openViewWindow(1);
      const view = api.state.viewWindow, cell = view.cells.get(0);
      cell.camera.position.set(650, -800, 450);
      cell.controls.target.set(20, 30, 40);
      cell.controls.update();
      window.__nativePinBefore = { view, cell, camera: cell.camera.position.toArray(), target: cell.controls.target.toArray() };
    });
    let regular = null;
    if (detached) {
      const popup = page.waitForEvent('popup');
      await page.locator('#view-window-popout').click();
      regular = await popup;
      regular.on('pageerror', error => errors.push(error.message));
      // Expire the opener's activation; only the actual button's window receives the new click.
      await page.waitForTimeout(6000);
    }
    await (regular || page).locator('#view-window-pin').click();
    await expect.poll(() => page.evaluate(() => window.__nativePinTest.state.viewWindow?.alwaysOnTop)).toBe(true);
    const result = await page.evaluate(() => {
      const view = window.__nativePinTest.state.viewWindow, before = window.__nativePinBefore;
      window.__nativePinnedPopup = view.popup;
      window.__nativePinOwner = view.pinSourcePopup;
      return { connected: view.root.isConnected, open: !view.popup.closed, cells: view.cells.size,
        sameView: view === before.view, sameCell: view.cells.get(0) === before.cell,
        camera: view.cells.get(0).camera.position.toArray(), target: view.cells.get(0).controls.target.toArray(),
        beforeCamera: before.camera, beforeTarget: before.target,
        realPip: (view.pinSourcePopup || window).documentPictureInPicture.window === view.popup,
        contexts: [...view.cells.values()].every(cell => !cell.renderer.getContext().isContextLost()) };
    });
    expect(result.connected && result.open && result.sameView && result.sameCell && result.realPip && result.contexts).toBe(true);
    expect(result.cells).toBe(2);
    expect(result.camera).toEqual(result.beforeCamera);
    expect(result.target).toEqual(result.beforeTarget);
    if (closeSource) {
      await regular.close({ runBeforeUnload: true });
      await expect.poll(() => regular.isClosed()).toBe(true);
      await expect(page.locator('#view-window')).toBeHidden();
      await page.evaluate(() => window.__nativePinTest.openViewWindow(0));
    } else {
      await page.evaluate(() => window.__nativePinTest.state.viewWindow.root.querySelector('#view-window-pin').click());
    }
    await expect(page.locator('#view-window')).toBeVisible();
    await expect(page.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => window.__nativePinnedPopup.closed)).toBe(true);
    if (regular && !closeSource) await expect.poll(() => regular.isClosed()).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__nativePinTest.state.viewWindow.pinSourcePopup)).toBe(null);
    expect(errors).toEqual([]);
  });
}
