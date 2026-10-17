import { test, expect } from '@playwright/test';

test('고정 뷰 맨 앞으로 고정의 켜기, 끄기, 닫기와 기존 팝업 전환', async ({ page }) => {
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
  const first = page.waitForEvent('popup');
  await page.locator('#view-window-pin').click();
  const pinned = await first;
  await expect(pinned.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'true');
  await expect(pinned.locator('.view-window-canvas')).toBeVisible();
  await pinned.locator('#view-window-pin').click();
  await expect(page.locator('#view-window-pin')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#view-window')).toBeVisible();
  const second = page.waitForEvent('popup');
  await page.locator('#view-window-popout').click();
  const regular = await second;
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
