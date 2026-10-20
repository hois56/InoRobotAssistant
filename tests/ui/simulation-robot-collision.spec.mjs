import { test, expect } from '@playwright/test';

test('여러 로봇의 본체 접촉을 화면과 경로 검사에서 감지하고 분리하면 해제한다', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
window.__robotCollision = { state, getArticulatedRobots, checkSceneCollisions,
    markSceneCollisionDirty, createAutoPathCollisionEvaluator };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__robotCollision);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__robotCollision.getArticulatedRobots().length === 1);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.locator('#btn-add-robot-model-choice').click();
    await page.waitForFunction(() => window.__robotCollision.getArticulatedRobots().length === 2);

    const result = await page.evaluate(() => {
        const a = window.__robotCollision;
        const [left, right] = a.getArticulatedRobots();
        a.state.collision.enabled = true;
        const scan = (offset, force) => {
            right.position.copy(left.position);
            right.position.x += offset;
            right.quaternion.copy(left.quaternion);
            right.scale.copy(left.scale);
            a.markSceneCollisionDirty(right);
            a.state.collision.lastCheckAt = 0;
            const hits = a.checkSceneCollisions({ force });
            return {
                hits: hits.filter(hit => (hit.objectA === left && hit.objectB === right)
                    || (hit.objectA === right && hit.objectB === left)).length,
                highlights: a.state.collision.highlightedMaterials.size
            };
        };
        const separated = scan(10000, true);
        const touching = scan(20, false);
        const planning = [left, right].map(robot => {
            const angles = robot.userData.joints.map(joint => joint.angle);
            return a.createAutoPathCollisionEvaluator(robot, angles).isSafe(angles);
        });
        const separatedAgain = scan(10000, true);
        const reentered = scan(20, false);
        right.userData.collisionEnabled = false;
        const excluded = a.checkSceneCollisions({ force: true }).length;
        return { separated, touching, planning, separatedAgain, reentered, excluded };
    });
    expect(result.separated.hits).toBe(0);
    expect(result.touching.hits).toBeGreaterThan(0);
    expect(result.touching.highlights).toBeGreaterThan(0);
    expect(result.planning).toEqual([false, false]);
    expect(result.separatedAgain).toEqual({ hits: 0, highlights: 0 });
    expect(result.reentered.hits).toBeGreaterThan(0);
    expect(result.excluded).toBe(0);
    expect(errors).toEqual([]);
});
