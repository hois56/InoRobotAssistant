import { test, expect } from '@playwright/test';

for (const [kind, dialogId, inputId, closeId] of [
  ['zone', 'interference-zone-dialog', 'interference-zone-remarks', 'interference-zone-close'],
  ['monitoring', 'end-monitoring-dialog', 'end-monitoring-remarks', 'end-monitoring-close']
]) {
  test(`${kind} interference settings can be dragged from the centered position and keep controls usable`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__interferenceDrag = {openInterferenceZoneEditor,openEndMonitoringEditor};' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__interferenceDrag);
    await page.evaluate(kind => {
      const a = window.__interferenceDrag;
      if (kind === 'zone') a.openInterferenceZoneEditor(0);
      else a.openEndMonitoringEditor(0);
    }, kind);
    const dialog = page.locator('#' + dialogId);
    await expect(dialog).toBeVisible();
    const before = await dialog.boundingBox();
    const header = await dialog.locator('.interference-zone-dialog-header').boundingBox();
    await page.mouse.move(header.x + 100, header.y + 25);
    await page.mouse.down();
    await page.mouse.move(header.x + 210, header.y + 95, { steps: 8 });
    await page.mouse.up();
    const moved = await dialog.boundingBox();
    expect(moved.x - before.x).toBeCloseTo(110, 0);
    expect(moved.y - before.y).toBeCloseTo(70, 0);

    await page.locator('#' + inputId).fill('dragged settings');
    expect(await dialog.boundingBox()).toEqual(moved);
    const movedHeader = await dialog.locator('.interference-zone-dialog-header').boundingBox();
    await page.mouse.move(movedHeader.x + 100, movedHeader.y + 25);
    await page.mouse.down();
    await page.mouse.move(-100, -100, { steps: 8 });
    await page.mouse.up();
    const bounded = await dialog.boundingBox();
    expect(bounded.x).toBeCloseTo(0, 0);
    const topbar = await page.locator('#topbar').boundingBox();
    expect(bounded.y).toBeCloseTo(topbar.y + topbar.height, 0);
    await expect(dialog).not.toHaveClass(/interference-zone-is-dragging/);
    await page.locator('#' + closeId).click();
    await expect(dialog).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
