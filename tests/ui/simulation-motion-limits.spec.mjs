import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const definitions = JSON.parse(fs.readFileSync(new URL('../../2_3DSimulation/models/models.json', import.meta.url), 'utf8'))
    .filter(d => d.type === 'articulated-stl');

test('all catalog manifests keep motion limits and OLP follows the selected planner', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() +
            '\nwindow.__motionLimits={state,createRobotManifest,calculateMovjDuration,sCurveProgress,getRobotRapidMoveOptions,createRapidMoveState,animateOlpJointMove,setJointAngle};' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__motionLimits);
    const manifests = await page.evaluate(defs => defs.map(def => {
        const m = window.__motionLimits.createRobotManifest(def);
        return { folder: def.folder, enabled: m.rapidMove?.enabled, joints: m.joints.map(j =>
            [j.maxSpeed, j.maxAcceleration, j.maxDeceleration]) };
    }), definitions);
    expect(manifests).toHaveLength(31);
    manifests.forEach((m, i) => {
        expect(m.enabled).toBe(true);
        expect(m.joints).toEqual(definitions[i].jointSpeeds.map((v, j) =>
            [v, definitions[i].jointAccelerations[j], definitions[i].jointDecelerations[j]]));
    });
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__motionLimits.state.models.some(m => m.userData.motionModelFolder === 'IR-R7H-90'));
    const results = await page.evaluate(async () => {
        const api = window.__motionLimits;
        const robot = api.state.models.find(m => m.userData.motionModelFolder === 'IR-R7H-90');
        api.state.programSpeedOverride = 100;
        const start = [0, -30, 40, 0, 20, 0], target = [10, -30, 40, 0, 20, 0];
        const results = [];
        for (const enabled of [false, true]) {
            start.forEach((v, i) => api.setJointAngle(robot.userData.joints[i], v, false));
            const settings = { rapidMove: { ptp: enabled }, acceleration: 100, deceleration: 10 };
            const plan = api.createRapidMoveState(start, target, robot.userData.joints, 50, api.getRobotRapidMoveOptions(robot, settings));
            const expected = enabled ? plan.durationSeconds
                : api.calculateMovjDuration(start, target, robot.userData.joints, 50, settings);
            const samples = [];
            await api.animateOlpJointMove(robot, target, 50, { motion: 'MOVJ', motionOptions: settings,
                onProgress: m => samples.push({ ...m, q: robot.userData.joints[0].angle }) });
            const curveError = enabled ? null : Math.max(...samples.map(m => Math.abs(m.q - 10 * api.sCurveProgress(m.progress))));
            results.push({ enabled, expected, actual: samples.at(-1).durationSeconds,
                curveError, final: robot.userData.joints.map(j => j.angle), target, planner: plan.planner });
        }
        return results;
    });
    for (const result of results) {
        expect(result.actual).toBeCloseTo(result.expected, 9);
        expect(result.final).toEqual(result.target);
        if (!result.enabled) expect(result.curveError).toBeLessThan(1e-8);
        else expect(result.planner).toBe('firmware-rapid-dynamics');
    }
    expect(errors).toEqual([]);
});
