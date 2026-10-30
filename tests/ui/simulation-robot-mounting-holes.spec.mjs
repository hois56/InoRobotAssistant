import { test, expect } from '@playwright/test';

test('S25-120 설치 구멍 스냅은 베이스를 따라 이동하고 미지원 모델에는 추가되지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__mountingHoleTest = { state, THREE, getSimulationSnapRobotMountingHoleCandidates, getSimulationSnapRobotSpecialCandidates, isSimulationSnapReferenceCandidate };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__mountingHoleTest?.state.renderer);
  await page.locator('#model-select').selectOption('robot:IR-S25-120Z42');
  await page.waitForFunction(() => window.__mountingHoleTest.state.models.some(m => m.userData.motionModelFolder === 'IR-S25-120Z42'));
  const result = await page.evaluate(() => {
    const api = window.__mountingHoleTest;
    const robot = api.state.models.find(m => m.userData.motionModelFolder === 'IR-S25-120Z42');
    const candidates = api.getSimulationSnapRobotSpecialCandidates('measurement').filter(c => c.robotMountingHole);
    robot.updateMatrixWorld(true);
    const before = candidates.map(c => c.localPoint.clone().applyMatrix4(c.mesh.matrixWorld).toArray());
    robot.position.set(400, 200, 30);
    robot.rotation.z = Math.PI / 2;
    robot.updateMatrixWorld(true);
    const after = candidates.map(c => c.localPoint.clone().applyMatrix4(c.mesh.matrixWorld).toArray());
    const allReferences = candidates.every(c => c.type === 'hole-center' && api.isSimulationSnapReferenceCandidate(c));
    robot.userData.motionModelFolder = 'unsupported-model';
    const other = api.getSimulationSnapRobotMountingHoleCandidates('measurement').length;
    return { before, after, allReferences, other };
  });
  expect(result.before).toHaveLength(4);
  expect(result.allReferences).toBe(true);
  expect(result.other).toBe(0);
  for (let i = 0; i < 4; i++) {
    expect(result.after[i][0]).toBeCloseTo(400 - result.before[i][1], 4);
    expect(result.after[i][1]).toBeCloseTo(200 + result.before[i][0], 4);
    expect(result.after[i][2]).toBeCloseTo(30 + result.before[i][2], 4);
  }
});
for (const [model, expected] of [['IR-R7H-90', 6], ['IR-R10H-120', 6], ['IR-R15H-145', 6], ['IR-R25-178', 10], ['IR-S4-40Z15', 7], ['IR-TS4-35Z15', 10], ['IR-TS5-55Z15', 10]]) {
  test(`${model} 모델의 설치 구멍 스냅을 생성한다`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nwindow.__mountingHoleTest = { state, getSimulationSnapRobotSpecialCandidates };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__mountingHoleTest?.state.renderer);
    await page.locator('#model-select').selectOption(`robot:${model}`);
    await page.waitForFunction(name => window.__mountingHoleTest.state.models.some(m => m.userData.motionModelFolder === name), model);
    const count = await page.evaluate(() => window.__mountingHoleTest.getSimulationSnapRobotSpecialCandidates('measurement').filter(c => c.robotMountingHole).length);
    expect(count).toBe(expected);
  });
}
