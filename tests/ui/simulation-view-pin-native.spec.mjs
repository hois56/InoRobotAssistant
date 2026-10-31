import { test, expect } from '@playwright/test';

for (const count of [1, 10]) test(`새 창의 프레임이 멈춰도 ${count}개 뷰의 고정·해제 후 렌더링을 이어간다`, async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__pinFrames = { state, openViewWindow, requestRender };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__pinFrames?.state.renderer);
  await page.evaluate(count => {
    const a = window.__pinFrames;
    for (let slot = 0; slot < count; slot++) a.openViewWindow(slot);
  }, count);
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#view-window-popout').click();
  const regular = await popupPromise;
  regular.on('pageerror', error => errors.push(error.message));
  // A hidden/backgrounded source may keep a requestAnimationFrame pending.
  // Keep that callback suspended while the user transfers the live canvases.
  await regular.evaluate(() => {
    window.__suspendedViewFrames = [];
    window.requestAnimationFrame = callback => {
      window.__suspendedViewFrames.push(callback);
      return 100_000 + window.__suspendedViewFrames.length;
    };
  });
  await expect.poll(() => regular.evaluate(() => window.__suspendedViewFrames.length)).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.__pinFrames.state.renderer.info.render.frame);
  await regular.locator('#view-window-pin').click();
  await expect.poll(() => page.evaluate(() => window.__pinFrames.state.viewWindow?.alwaysOnTop)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__pinFrames.state.renderer.info.render.frame)).toBeGreaterThan(before);
  const fixed = await page.evaluate(() => {
    const a = window.__pinFrames, view = a.state.viewWindow;
    const pip = view.popup;
    const result = { connected: view.root.isConnected, cells: view.cells.size,
      pip: view.pinSourcePopup.documentPictureInPicture.window === pip,
      contexts: [...view.cells.values()].every(cell => !cell.renderer.getContext().isContextLost()) };
    const beforeStale = a.state.renderer.info.render.frame;
    view.pinSourcePopup.__suspendedViewFrames[0](performance.now());
    result.staleIgnored = a.state.renderer.info.render.frame === beforeStale;
    // Closing or unpinning the PiP must also release its pending frame.
    pip.requestAnimationFrame = () => 200_000;
    return result;
  });
  expect(fixed).toEqual({ connected: true, cells: count, pip: true, contexts: true, staleIgnored: true });
  await page.waitForTimeout(100);
  const pinnedFrame = await page.evaluate(() => window.__pinFrames.state.renderer.info.render.frame);
  await page.evaluate(() => window.__pinFrames.state.viewWindow.root.querySelector('#view-window-pin').click());
  await expect(page.locator('#view-window')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__pinFrames.state.renderer.info.render.frame)).toBeGreaterThan(pinnedFrame);
  await expect.poll(() => regular.isClosed()).toBe(true);
  expect(errors).toEqual([]);
});

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
