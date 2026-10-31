import { test, expect } from '@playwright/test';

async function expectFullView(surface) {
  await expect(surface.locator('.view-window-header')).toHaveCount(0);
  await expect.poll(() => surface.locator('#view-window').evaluate(root => {
    const grid = root.querySelector('#view-window-grid').getBoundingClientRect();
    const rect = root.getBoundingClientRect();
    const style = getComputedStyle(root);
    const actions = root.querySelector('.view-window-actions').getBoundingClientRect();
    return {
      top: Math.round(grid.top - rect.top - parseFloat(style.borderTopWidth)),
      height: Math.round(rect.height - grid.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)),
      overlay: actions.top >= grid.top && actions.bottom <= grid.bottom && actions.right <= grid.right,
      detachedPadding: root.classList.contains('panel-popout') ? getComputedStyle(document.body).padding : '0px'
    };
  })).toEqual({ top: 0, height: 0, overlay: true, detachedPadding: '0px' });
}

test('고정 뷰 맨 앞으로 고정의 켜기, 끄기, 닫기와 기존 팝업 전환', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__pinTest = { state, openViewWindow };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__pinTest?.state.renderer);
  await page.evaluate(() => {
    window.__pinTest.openViewWindow(0);
    // A normal popup models the PiP document lifecycle in headless Chromium.
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow: async () => {
        const popup = window.open('', 'pin-test', 'popup,width=800,height=600');
        popup.addEventListener('beforeunload', () => popup.dispatchEvent(new Event('pagehide')));
        return popup;
      }
    }});
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expectFullView(page);
  const panel = page.locator('#view-window');
  const initial = await panel.boundingBox();
  const actions = await page.locator('.view-window-actions').boundingBox();
  await page.mouse.move(actions.x + 5, actions.y + actions.height / 2);
  await page.mouse.down();
  await page.mouse.move(actions.x - 35, actions.y + actions.height / 2 + 45);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await panel.boundingBox()).y - initial.y)).toBe(45);
  await panel.screenshot({ path: testInfo.outputPath('inline-view.png') });
  const first = page.waitForEvent('popup');
  await page.locator('#view-window-pin').click();
  const pinned = await first;
  await expect(pinned.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'true');
  await expect(pinned.locator('.view-window-canvas')).toBeVisible();
  await expectFullView(pinned);
  await pinned.screenshot({ path: testInfo.outputPath('pinned-view.png') });
  await pinned.locator('#view-window-pin').click();
  await expect(page.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#view-window')).toBeVisible();
  const second = page.waitForEvent('popup');
  await page.locator('#view-window-popout').click();
  const regular = await second;
  await expectFullView(regular);
  await regular.screenshot({ path: testInfo.outputPath('detached-view.png') });
  await regular.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', {
    configurable: true, value: window.opener.documentPictureInPicture
  }));
  const third = page.waitForEvent('popup');
  await regular.locator('#view-window-pin').click();
  const repinned = await third;
  await expect(repinned.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'true');
  await repinned.close();
  await expect(page.locator('#view-window')).toBeHidden();
  await page.evaluate(() => window.__pinTest.openViewWindow(0));
  await expect(page.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: undefined }));
  await page.locator('#view-window-pin').click();
  await expect(page.locator('#view-window')).toBeVisible();
  await expect(page.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('새 창에서 고정 요청이 거절되어도 기존 뷰 창을 유지한다', async ({ page }) => {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__pinTest = { state, openViewWindow };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__pinTest?.state.renderer);
  await page.evaluate(() => window.__pinTest.openViewWindow(0));
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#view-window-popout').click();
  const popup = await popupPromise;
  await popup.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', {
    configurable: true, value: { requestWindow: async () => { throw new DOMException('Blocked', 'NotAllowedError'); } }
  }));
  await popup.locator('#view-window-pin').click();
  await expect(popup.locator('.view-window-canvas')).toBeVisible();
  await expect(popup.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => {
    const view = window.__pinTest.state.viewWindow;
    return !view.pinPending && !view.popup.closed && view.root.ownerDocument === view.popup.document && !view.alwaysOnTop;
  })).toBe(true);
});
