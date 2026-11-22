import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const stl = fileURLToPath(new URL('../../2_3DSimulation/models/IR-R10H-120/P2.stl', import.meta.url));

test('CAD 모드의 부품 외곽선은 three.js EdgesGeometry와 같은 선을 그린다', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/3_ToolSelector/mode-d.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
window.__cadOutline = { state, THREE };` });
    });
    await page.goto('/3_ToolSelector/');
    await page.locator('[data-mode="cad"]').click();
    await page.locator('#cad-step-file').setInputFiles(stl);
    await page.waitForFunction(() => window.__cadOutline?.state.parts.length > 0, null, { timeout: 30000 });
    await page.locator('#cad-outline-toggle').click();
    await expect(page.locator('#cad-outline-toggle')).toHaveAttribute('aria-pressed', 'true');
    const result = await page.evaluate(() => {
        const { state, THREE } = window.__cadOutline;
        const mesh = state.parts[0].mesh;
        const drawn = mesh.userData.outlineLine.geometry.getAttribute('position').array;
        const expected = new THREE.EdgesGeometry(mesh.geometry, 28).getAttribute('position').array;
        return {
            segments: drawn.length / 6,
            engine: mesh.userData.outlineLine.geometry.type !== 'EdgesGeometry',
            identical: drawn.length === expected.length && drawn.every((value, i) => Object.is(value, expected[i]))
        };
    });
    expect(result.engine).toBe(true);
    expect(result.identical).toBe(true);
    expect(result.segments).toBeGreaterThan(100);
    expect(errors).toEqual([]);
});
