import { test, expect } from '@playwright/test';

test('3D 모델을 불러온 장면에서도 새 로봇은 원점에 배치된다', async ({ page }) => {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__robotPlacement = { state, getArticulatedRobots };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__robotPlacement?.state.workspaceRecovery.ready);

    await page.locator('#input-import-3d').setInputFiles('2_3DSimulation/test-assets/Vacuum_Tool_X200mm.stl');
    await page.locator('#import-placement').selectOption('scene');
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(() => window.__robotPlacement.state.models.length === 1);
    const importedPosition = await page.evaluate(() => window.__robotPlacement.state.models[0].position.toArray());

    const modelSelect = page.locator('#model-select');
    await modelSelect.selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__robotPlacement.getArticulatedRobots().length === 1);
    await modelSelect.selectOption('robot:IR-R7H-90');
    await page.locator('#btn-add-robot-model-choice').click();
    await page.waitForFunction(() => window.__robotPlacement.getArticulatedRobots().length === 2);

    const positions = await page.evaluate(() => {
        const { state, getArticulatedRobots } = window.__robotPlacement;
        return {
            imported: state.models[0].position.toArray(),
            robots: getArticulatedRobots().map(robot => robot.position.toArray())
        };
    });
    expect(positions.imported).toEqual(importedPosition);
    expect(positions.robots).toEqual([[0, 0, 0], [0, 0, 0]]);
});
