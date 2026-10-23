import { test, expect } from '@playwright/test';

async function openPositionValueDialog(page) {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);\s*$/m, 'window.__positionDialogReady = init();');
        await route.fulfill({ response, body: source + '\nwindow.__positionDialogCheck = { state, addCurrentMotionStep };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__positionDialogReady && window.__positionDialogCheck);
    await page.evaluate(() => window.__positionDialogReady);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__positionDialogCheck.state.activeProgramRobot);
    await page.evaluate(() => window.__positionDialogCheck.addCurrentMotionStep());
    await page.locator('[data-panel-toggle="program-panel"]').click();
    await page.locator('#program-step-list [data-program-step-id]').first().click({ button: 'right' });
    await page.locator('#program-show-position-value').click();
    const dialog = page.locator('#position-value-dialog');
    await expect(dialog).toBeVisible();
    return dialog;
}

test('위치 값 확인 창은 배경을 흐리게 하지 않는다', async ({ page }) => {
    const dialog = await openPositionValueDialog(page);
    const backdrop = await dialog.evaluate(node => {
        const style = getComputedStyle(node, '::backdrop');
        return { filter: style.backdropFilter, background: style.backgroundColor };
    });
    expect(backdrop.filter).toBe('none');
    expect(backdrop.background).toBe('rgba(0, 0, 0, 0)');
});

test('위치 값 확인 창은 제목 영역을 끌어 이동하고 입력 칸 드래그로는 이동하지 않는다', async ({ page }) => {
    const dialog = await openPositionValueDialog(page);
    const before = await dialog.boundingBox();
    const header = dialog.locator('.position-value-dialog-header h2');
    const start = await header.boundingBox();
    await page.mouse.move(start.x + 10, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x - 110, start.y + start.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    const moved = await dialog.boundingBox();
    expect(moved.x).toBeCloseTo(before.x - 120, 0);
    expect(moved.y).toBeCloseTo(before.y + 60, 0);

    const input = dialog.locator('[data-position-value="x"]');
    const inputBox = await input.boundingBox();
    await page.mouse.move(inputBox.x + 10, inputBox.y + inputBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(inputBox.x + 120, inputBox.y + inputBox.height / 2 + 80, { steps: 6 });
    await page.mouse.up();
    const afterInputDrag = await dialog.boundingBox();
    expect(afterInputDrag.x).toBeCloseTo(moved.x, 0);
    expect(afterInputDrag.y).toBeCloseTo(moved.y, 0);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
});

async function loadSixAxisRobot(page) {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);\s*$/m, 'window.__armReady = init();');
        await route.fulfill({ response, body: source + '\nwindow.__armCheck = { state, setJointAngle, calculatePointArmParameters, getRobotControllerBaseFrame };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__armReady && window.__armCheck);
    await page.evaluate(() => window.__armReady);
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__armCheck.state.activeProgramRobot);
}

test('6축 Arm 3은 실제 모델의 손목 중심·엘보·J5 방향과 일치한다', async ({ page }) => {
    await loadSixAxisRobot(page);
    const results = await page.evaluate(() => {
        const { state, setJointAngle, calculatePointArmParameters, getRobotControllerBaseFrame } = window.__armCheck;
        const robot = state.activeProgramRobot;
        const joints = robot.userData.joints;
        const base = getRobotControllerBaseFrame(robot);
        const local = (object) => base.worldToLocal(object.getWorldPosition(new window.__armCheck.state.camera.position.constructor()));
        const sample = (angles) => {
            angles.forEach((angle, index) => setJointAngle(joints[index], angle, false));
            robot.updateMatrixWorld(true);
            const shoulder = local(joints[1].group), elbow = local(joints[2].group), wrist = local(joints[4].group);
            const radial = (point) => point.x * Math.cos(angles[0] * Math.PI / 180) + point.y * Math.sin(angles[0] * Math.PI / 180);
            const upper = [radial(elbow) - radial(shoulder), elbow.z - shoulder.z];
            const fore = [radial(wrist) - radial(elbow), wrist.z - elbow.z];
            const flange = local(joints[5].group);
            return {
                arm: calculatePointArmParameters(robot),
                wristBentUp: flange.z - wrist.z > 1e-6,
                wristBehindJ1: radial(wrist) < 0,
                cross: upper[0] * fore[1] - upper[1] * fore[0]
            };
        };
        const poses = [[0, 0, 0, 0, -90, 0], [30, 0, 0, 0, 40, 0], [0, -40, 100, 0, -10, 0], [-45, 60, 0, 0, -10, 0], [0, 0, 120, 0, 10, 0]];
        return poses.map(sample);
    });
    const home = results[0];
    expect(home.arm).toEqual([0, 0, 0, 1]);
    for (const result of results) {
        const waistBackward = result.wristBehindJ1;
        const elbowDownward = Math.sign(result.cross) !== Math.sign(home.cross);
        expect(result.arm[3] & 4 ? true : false).toBe(waistBackward);
        expect(result.arm[3] & 2 ? true : false).toBe(elbowDownward);
    }
    // At J2=J3=0 the forearm is horizontal, so a positive J5 bends the wrist upward (flipped).
    expect(results[1].wristBentUp).toBe(true);
    expect(results[0].wristBentUp).toBe(false);
    expect(results.map(result => result.arm[3])).toEqual([1, 0, 3, 5, 6]);
});
