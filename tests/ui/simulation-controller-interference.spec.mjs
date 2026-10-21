import { test, expect } from '@playwright/test';

test('controller sphere and rectangular monitoring imports preserve shape, dimensions and editor fields', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__interferenceImport = {state,ensureVirtualControllerCore,handleVirtualControllerMessage,openEndMonitoringEditor};' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__interferenceImport);
  await page.locator('#model-select').selectOption('robot:IR-R7H-90');
  await page.waitForFunction(() => window.__interferenceImport.state.models.some(model => model.userData.tcpFrame));
  await page.evaluate(async () => {
    const a = window.__interferenceImport;
    await a.ensureVirtualControllerCore(a.state.virtualController);
    a.state.virtualController.wanted = true;
    Object.assign(a.state.interferenceZones[0], { activate: true, monitoringObjectId: 5 });
  });
  for (const shape of [
    { type: 2, expected: 'sphere', geometry: 'SphereGeometry', zPos: 125, ballR: 45 },
    { type: 1, expected: 'cuboid', geometry: 'BoxGeometry', setType: 0, diagonal: [-10, -20, -30, 40, 50, 60] }
  ]) {
    const result = await page.evaluate(shape => {
      const a = window.__interferenceImport;
      a.handleVirtualControllerMessage(JSON.stringify({ type: 'interferenceToolReadResult',
        result: { success: true, toolNumber: 5, tool: shape } }), a.state.virtualController);
      a.openEndMonitoringEditor(5);
      const mesh = a.state.endMonitoringVisuals[0].group.children[0];
      return { type: a.state.endMonitoringObjects[5].type, geometry: mesh.geometry.type,
        parameters: mesh.geometry.parameters, z: mesh.position.z };
    }, shape);
    expect(result.type).toBe(shape.expected);
    expect(result.geometry).toBe(shape.geometry);
    await expect(page.locator('#end-monitoring-type')).toHaveValue(shape.expected);
    await expect(page.locator(`#end-monitoring-${shape.expected}-fields`)).toBeVisible();
    if (shape.expected === 'sphere') {
      expect(result.parameters.radius).toBe(45);
      expect(result.z).toBe(125);
      await expect(page.locator('#end-monitoring-sphere-center-z')).toHaveValue('125');
      await expect(page.locator('#end-monitoring-sphere-radius')).toHaveValue('45');
    } else {
      expect([result.parameters.width, result.parameters.height, result.parameters.depth]).toEqual([50, 70, 90]);
      await expect(page.locator('[data-end-monitoring-point="p2"][data-axis="2"]')).toHaveValue('60');
    }
    await page.locator('#end-monitoring-close').click();
  }
  expect(errors).toEqual([]);
});
