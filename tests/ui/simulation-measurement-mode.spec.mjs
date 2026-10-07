import { test, expect } from '@playwright/test';

test('P1·P2 선택 후 직선과 직각 치수 전환은 기존 점과 측정 표시를 유지한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__measurementMode = { state, THREE, handleMeasurementSnapSelection };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__measurementMode?.state.renderer);
  await page.locator('[data-panel-toggle="measurement-panel"]').click();
  await page.evaluate(() => {
    const a = window.__measurementMode;
    const mesh = new a.THREE.Mesh(new a.THREE.BoxGeometry(10, 10, 10), new a.THREE.MeshBasicMaterial());
    mesh.userData.uploaded = true;
    a.state.scene.add(mesh);
    a.state.models.push(mesh);
    for (const coords of [[0, 0, 0], [30, -40, 120]]) {
      const point = new a.THREE.Vector3(...coords);
      a.handleMeasurementSnapSelection({ mesh, localPoint: point, worldPoint: point, type: 'vertex' });
    }
    window.__originalMeasurementPoints = [...a.state.measurement.points];
  });
  await expect(page.locator('#measurement-diagonal-result')).toContainText('130');
  for (const mode of ['orthogonal', 'diagonal', 'orthogonal']) {
    await page.locator(`[name="measurement-display-mode"][value="${mode}"]`).check();
    expect(await page.evaluate(() => {
      const m = window.__measurementMode.state.measurement;
      return { samePoints: m.points.every((p, i) => p === window.__originalMeasurementPoints[i]),
        points: m.points.map(p => p?.worldPoint.toArray()),
        values: [m.result?.diagonal, m.result?.orthogonalX, m.result?.orthogonalY, m.result?.orthogonalZ],
        complete: m.statusMessage === '측정 완료' };
    })).toEqual({ samePoints: true, points: [[0, 0, 0], [30, -40, 120]], values: [130, 30, 40, 120], complete: true });
    if (mode === 'orthogonal') {
      await expect(page.locator('#measurement-orthogonal-result')).toBeVisible();
      await expect(page.locator('#measurement-orthogonal-result')).toContainText('X = 30');
      await expect(page.locator('#measurement-orthogonal-result')).toContainText('Y = 40');
      await expect(page.locator('#measurement-orthogonal-result')).toContainText('Z = 120');
      expect(await page.evaluate(() => ['x', 'y', 'z'].every(axis => window.__measurementMode.state.measurement.lines[axis]?.visible))).toBe(true);
    } else {
      await expect(page.locator('#measurement-diagonal-result')).toContainText('130');
      await expect(page.locator('#measurement-orthogonal-result')).toBeHidden();
    }
  }
  expect(errors).toEqual([]);
});
