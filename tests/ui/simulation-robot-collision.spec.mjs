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

test('S25 네 대의 동시 접촉은 본체와 샤프트를 모두 표시하고 이전 충돌 모듈 캐시를 사용하지 않는다', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // A browser may still have the attachment-only policy cached at this URL.
    await page.route('**/2_3DSimulation/collision-policy-core.mjs', route => route.fulfill({
        contentType: 'text/javascript', body: `
export const isSimulationCollisionPair = (a, b) => Boolean(a?.userData?.attachmentHost || b?.userData?.attachmentHost);
export const shouldReportSimulationCollision = h => isSimulationCollisionPair(h.objectA, h.objectB);`
    }));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
window.__s25Contacts = { state, getArticulatedRobots, restoreRobotControllerBaseTransform,
    setJointAngle, markSceneCollisionDirty, checkSceneCollisions, createAutoPathCollisionEvaluator };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__s25Contacts);
    for (let index = 0; index < 4; index++) {
        await page.locator('#model-select').selectOption('robot:IR-S25-120Z42');
        if (index) await page.locator('#btn-add-robot-model-choice').click();
        await page.waitForFunction(count => window.__s25Contacts.getArticulatedRobots().length === count, index + 1);
    }
    const result = await page.evaluate(() => {
        const a = window.__s25Contacts, robots = a.getArticulatedRobots();
        const poses = [
            { p: [-110.5, -100, 357.5], q: [0, 0, 0, 1], j: [-1.980655, 84.260830, 0, -82.280174] },
            { p: [-110.5, -660, 357.5], q: [0, 0, 0, 1], j: [19.437766, 56.366715, -85, 14.195520] },
            { p: [1641.5, -100, 357.5], q: [0, 0, 1, 0], j: [-47.732130, 69.027387, -7.75, 13.704743] },
            { p: [1641.5, -660, 357.5], q: [0, 0, 1, 0], j: [-29.195447, -13.307146, -7.75, 7.502592] }
        ];
        robots.forEach((robot, index) => {
            const pose = poses[index];
            a.restoreRobotControllerBaseTransform(robot, { position: pose.p, quaternion: pose.q, scale: [1, 1, 1] });
            pose.j.forEach((angle, joint) => a.setJointAngle(robot.userData.joints[joint], angle, false));
        });
        a.state.collision.enabled = true;
        a.markSceneCollisionDirty();
        const hits = a.checkSceneCollisions({ force: true });
        const parts = new Map();
        for (const hit of hits) for (const [root, mesh] of [[hit.objectA, hit.meshA], [hit.objectB, hit.meshB]]) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            parts.set(`${robots.indexOf(root)}:J${mesh.userData.robotJointIndex + 1}`, materials.map(material => material.color.getHex()));
        }
        const angles = robots[2].userData.joints.map(joint => joint.angle);
        return { parts: Object.fromEntries(parts), planningSafe: a.createAutoPathCollisionEvaluator(robots[2], angles).isSafe(angles) };
    });
    for (const part of ['0:J1', '0:J2', '1:J2', '1:J4', '2:J2', '2:J4', '3:J2', '3:J4']) {
        expect(result.parts[part]?.length, part).toBeGreaterThan(0);
        expect(result.parts[part].every(color => color === 0xef4444), part).toBe(true);
    }
    expect(result.planningSafe).toBe(false);
    await expect(page.locator('#collision-status')).toBeVisible();
    expect(errors).toEqual([]);
});
