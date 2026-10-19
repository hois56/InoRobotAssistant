import { test, expect } from '@playwright/test';

async function setup(page, models = ['IR-S7-60Z20', 'IR-S4-40Z15', 'IR-S7-60Z20']) {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
window.__multiJog = { state, THREE, getArticulatedRobots, getJogTargetRobot, getJogTargetRobots,
    selectSceneModel, setJointAngle, syncJointControls, captureCurrentTcpTarget, getCurrentTcpPoseBase,
    getJogReadoutPose, beginBaseJogGizmoDrag, applyBaseJogGizmoTarget, endBaseJogGizmoDrag,
    setBaseJogGizmoEnabled, undoLastAction, redoLastAction, deleteSelectedModel, updateMotionUiLock };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__multiJog);
    await expect(page.locator('#jog-robot-selection')).toBeHidden();
    await expect(page.locator('#jog-robot-summary')).toHaveCount(0);
    for (let index = 0; index < models.length; index++) {
        await page.locator('#model-select').selectOption(`robot:${models[index]}`);
        if (index) await page.locator('#btn-add-robot-model-choice').click();
        await page.waitForFunction(count => window.__multiJog.getArticulatedRobots().length === count, index + 1);
        if (index) await expect(page.locator('#jog-robot-selection')).toBeVisible();
        else await expect(page.locator('#jog-robot-selection')).toBeHidden();
    }
    await page.evaluate(() => {
        const a = window.__multiJog;
        a.getArticulatedRobots().forEach((robot, index) => {
            [20 + 10 * index, -55, -40, 10].forEach((angle, joint) => a.setJointAngle(robot.userData.joints[joint], angle));
            robot.position.x = index * 1000;
            a.captureCurrentTcpTarget(robot);
        });
        a.selectSceneModel(a.getArticulatedRobots()[0]);
    });
}

async function poses(page) {
    return page.evaluate(() => {
        const a = window.__multiJog;
        return a.getArticulatedRobots().map(robot => {
            const pose = a.getCurrentTcpPoseBase(robot);
            return { position: pose.position.toArray(), rotation: pose.quaternion.toArray(),
                joints: robot.userData.joints.map(joint => joint.angle) };
        });
    });
}

async function fillNumber(input, value) {
    await input.focus();
    await input.fill(String(value));
}

async function worldPoses(page) {
    return page.evaluate(() => {
        const a = window.__multiJog;
        return a.getArticulatedRobots().map(robot => {
            robot.updateWorldMatrix(true, true);
            return { position: robot.userData.tcpFrame.getWorldPosition(new a.THREE.Vector3()).toArray(),
                rotation: robot.userData.tcpFrame.getWorldQuaternion(new a.THREE.Quaternion()).toArray() };
        });
    });
}

function expectWorldTranslation(before, after, delta, selected = [0, 1]) {
    after.forEach((pose, index) => {
        pose.position.forEach((value, axis) => expect(value - before[index].position[axis])
            .toBeCloseTo(selected.includes(index) ? delta[axis] : 0, 2));
    });
}

test('체크한 로봇의 관절·BASE 버튼·좌표 입력·3D 핸들을 함께 조작하고 원점 복귀한다', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    const checks = page.locator('#jog-robot-list input');
    await expect(checks).toHaveCount(3);
    await expect(checks.nth(0)).toBeChecked();
    await expect(checks.nth(1)).not.toBeChecked();
    await checks.nth(1).check();
    await expect(page.locator('#jog-select-all')).toHaveJSProperty('indeterminate', true);
    await page.locator('#btn-jog-joint-mode').click();
    const before = await poses(page);
    await fillNumber(page.locator('#jog-controls .jog-value input').first(), 35);
    await page.locator('#jog-controls .jog-value input').first().press('Tab');
    const jointMove = await poses(page);
    expect(errors).toEqual([]);
    expect(jointMove.map(pose => pose.joints[0])).toEqual([35, 45, 40]);
    expect(jointMove[2]).toEqual(before[2]);

    await page.locator('#btn-jog-base-mode').click();
    await fillNumber(page.locator('#base-move-step'), 1);
    await page.locator('[data-base-jog="move"][data-axis="y"][data-direction="1"]').click();
    const baseMove = await poses(page);
    for (const index of [0, 1]) expect(baseMove[index].position[1] - jointMove[index].position[1]).toBeCloseTo(1, 2);
    expect(baseMove[2]).toEqual(before[2]);

    await fillNumber(page.locator('#tcp-z'), baseMove[0].position[2] + 2);
    await page.locator('#tcp-z').press('Tab');
    const numericMove = await poses(page);
    for (const index of [0, 1]) expect(numericMove[index].position[2] - baseMove[index].position[2]).toBeCloseTo(2, 2);

    await page.evaluate(() => {
        const a = window.__multiJog;
        a.setBaseJogGizmoEnabled(true);
        a.beginBaseJogGizmoDrag();
        a.state.baseJogGizmoTarget.position.z += 3;
        a.applyBaseJogGizmoTarget();
        a.endBaseJogGizmoDrag();
    });
    const gizmoMove = await poses(page);
    for (const index of [0, 1]) expect(gizmoMove[index].position[2] - numericMove[index].position[2]).toBeCloseTo(3, 2);
    expect(gizmoMove[2]).toEqual(before[2]);
    await page.evaluate(() => window.__multiJog.undoLastAction());
    const undone = await poses(page);
    undone.forEach((pose, index) => pose.joints.forEach((angle, joint) => expect(angle).toBeCloseTo(numericMove[index].joints[joint], 6)));
    await page.evaluate(() => window.__multiJog.redoLastAction());
    const redone = await poses(page);
    redone.forEach((pose, index) => pose.joints.forEach((angle, joint) => expect(angle).toBeCloseTo(gizmoMove[index].joints[joint], 6)));
    await page.screenshot({ path: test.info().outputPath('multi-jog-desktop.png') });

    await page.locator('#btn-reset-joints').click();
    const reset = await poses(page);
    expect(reset[0].joints).toEqual([0, 0, 0, 0]);
    expect(reset[1].joints).toEqual([0, 0, 0, 0]);
    expect(reset[2]).toEqual(before[2]);
    expect(errors).toEqual([]);
});

test('길게 누르기는 모든 선택 로봇을 함께 이동시키고 해제 시 정지한다', async ({ page }) => {
    test.setTimeout(120000);
    await setup(page);
    await page.locator('#jog-select-all').check();
    await expect(page.locator('#jog-robot-list input:checked')).toHaveCount(3);
    await fillNumber(page.locator('#base-move-step'), 1);
    const before = await poses(page);
    const button = page.locator('[data-base-jog="move"][data-axis="z"][data-direction="1"]');
    await button.hover(); await page.mouse.down();
    await page.waitForFunction(() => window.__multiJog.getArticulatedRobots()[0].userData.joints[2].angle >= -37);
    await page.mouse.up();
    const after = await poses(page);
    const delta = after[0].position[2] - before[0].position[2];
    expect(delta).toBeGreaterThanOrEqual(3);
    for (const pose of after) expect(pose.position[2] - before[0].position[2]).toBeCloseTo(delta, 2);
    await expect.poll(() => page.evaluate(() => window.__multiJog.state.baseJogHold)).toBeNull();
    await page.locator('#jog-select-all').uncheck();
    await expect(button).toBeDisabled();
    await expect(page.locator('#btn-reset-joints')).toBeDisabled();
    await page.evaluate(() => window.__multiJog.updateMotionUiLock());
    await expect(button).toBeDisabled();
});

test('한 로봇의 한계를 넘는 BASE 입력은 전체 복원하고 혼합 모델의 공통 관절만 활성화한다', async ({ page }) => {
    test.setTimeout(120000);
    await setup(page, ['IR-S7-60Z20', 'IR-R10H-120']);
    await page.locator('#jog-select-all').check();
    await page.locator('#btn-jog-joint-mode').click();
    await expect(page.locator('#jog-controls .jog-value input').nth(2)).toBeDisabled();
    await expect(page.locator('#jog-controls .jog-value input').nth(0)).toBeEnabled();
    await page.locator('#btn-jog-base-mode').click();
    await expect(page.locator('[data-base-rotation-row="x"]')).toBeHidden();
    await expect(page.locator('[data-base-rotation-row="y"]')).toBeHidden();
    await expect(page.locator('[data-base-rotation-row="z"]')).toBeVisible();
    const before = await poses(page);
    await fillNumber(page.locator('#tcp-z'), 99999); await page.locator('#tcp-z').press('Tab');
    const after = await poses(page);
    after.forEach((pose, index) => pose.joints.forEach((angle, joint) => expect(angle).toBeCloseTo(before[index].joints[joint], 7)));
    await expect(page.locator('#base-jog-status')).toBeVisible();
});

test('후속 로봇의 실제 IK 실패 시 전체를 복원하고 삭제 후 선택 대상을 갱신한다', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    await page.locator('#jog-robot-list input').nth(1).check();
    await page.evaluate(() => {
        const a = window.__multiJog, second = a.getArticulatedRobots()[1];
        a.setJointAngle(second.userData.joints[2], second.userData.joints[2].definition.min);
        a.captureCurrentTcpTarget(second);
    });
    const before = await poses(page);
    await fillNumber(page.locator('#base-move-step'), 1);
    await page.locator('[data-base-jog="move"][data-axis="z"][data-direction="-1"]').click();
    const after = await poses(page);
    after.forEach((pose, index) => pose.joints.forEach((angle, joint) => expect(angle).toBeCloseTo(before[index].joints[joint], 7)));
    await expect(page.locator('#base-jog-status')).toBeVisible();
    await page.evaluate(() => window.__multiJog.deleteSelectedModel());
    await expect(page.locator('#jog-robot-list input')).toHaveCount(2);
    await expect(page.locator('#jog-robot-list input:checked')).toHaveCount(1);
    expect(await page.evaluate(() => {
        const a = window.__multiJog;
        return a.getJogTargetRobot() === a.getJogTargetRobots()[0]
            && a.state.activeArticulatedModel === a.getJogTargetRobot();
    })).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: test.info().outputPath('multi-jog-mobile.png') });
    await page.evaluate(() => {
        const a = window.__multiJog;
        a.selectSceneModel(a.getArticulatedRobots()[0]);
        a.deleteSelectedModel();
    });
    await expect(page.locator('#jog-robot-selection')).toBeHidden();
    await expect(page.locator('#jog-controls .jog-value input').first()).toBeEnabled();
    await expect(page.locator('#btn-reset-joints')).toBeEnabled();
    expect(errors).toEqual([]);
});

test('6축 로봇 두 대의 회전 버튼과 회전 좌표 입력을 동시에 적용한다', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page, ['IR-R10H-120', 'IR-R10H-120']);
    await page.locator('#jog-select-all').check();
    await fillNumber(page.locator('#base-rotate-step'), 1);
    const before = await poses(page);
    await page.locator('[data-base-jog="rotate"][data-axis="z"][data-direction="1"]').click();
    const rotated = await poses(page);
    for (const index of [0, 1]) {
        const angle = await page.evaluate(({ before, after }) => {
            const T = window.__multiJog.THREE;
            return new T.Quaternion().fromArray(before).angleTo(new T.Quaternion().fromArray(after));
        }, { before: before[index].rotation, after: rotated[index].rotation });
        expect(angle).toBeCloseTo(Math.PI / 180, 3);
    }
    const rz = Number(await page.locator('#tcp-rz').inputValue());
    await fillNumber(page.locator('#tcp-rz'), rz + 1); await page.locator('#tcp-rz').press('Tab');
    const numeric = await poses(page);
    for (const index of [0, 1]) {
        const angle = await page.evaluate(({ before, after }) => {
            const T = window.__multiJog.THREE;
            return new T.Quaternion().fromArray(before).angleTo(new T.Quaternion().fromArray(after));
        }, { before: rotated[index].rotation, after: numeric[index].rotation });
        expect(angle).toBeCloseTo(Math.PI / 180, 3);
    }
    expect(errors).toEqual([]);
});

test('마주 보는 로봇도 BASE 버튼·좌표 입력·3D 핸들로 같은 공간 방향으로 이동한다', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    await page.evaluate(() => {
        const a = window.__multiJog, robots = a.getArticulatedRobots();
        robots[1].rotation.z = Math.PI;
        robots[2].rotation.z = Math.PI / 2;
        robots.forEach(robot => a.captureCurrentTcpTarget(robot));
    });
    await page.locator('#jog-robot-list input').nth(1).check();
    await fillNumber(page.locator('#base-move-step'), 1);
    let before = await worldPoses(page);
    await page.locator('[data-base-jog="move"][data-axis="x"][data-direction="1"]').click();
    expectWorldTranslation(before, await worldPoses(page), [1, 0, 0]);

    before = await worldPoses(page);
    const y = Number(await page.locator('#tcp-y').inputValue());
    await fillNumber(page.locator('#tcp-y'), y + 2); await page.locator('#tcp-y').press('Tab');
    expectWorldTranslation(before, await worldPoses(page), [0, 2, 0]);

    before = await worldPoses(page);
    await page.evaluate(() => {
        const a = window.__multiJog;
        a.setBaseJogGizmoEnabled(true);
        a.beginBaseJogGizmoDrag();
        a.state.baseJogGizmoTarget.position.x += 2;
        a.applyBaseJogGizmoTarget(); a.endBaseJogGizmoDrag();
    });
    expectWorldTranslation(before, await worldPoses(page), [2, 0, 0]);
    await page.evaluate(() => window.__multiJog.undoLastAction());
    expectWorldTranslation(before, await worldPoses(page), [0, 0, 0]);
    await page.evaluate(() => window.__multiJog.redoLastAction());

    await page.evaluate(() => {
        const a = window.__multiJog;
        a.selectSceneModel(a.getArticulatedRobots()[1]);
    });
    before = await worldPoses(page);
    await page.locator('[data-base-jog="move"][data-axis="x"][data-direction="1"]').click();
    expectWorldTranslation(before, await worldPoses(page), [-1, 0, 0]);
    expect(errors).toEqual([]);
});

test('마주 보는 6축 로봇의 회전 버튼과 숫자·3D 회전도 같은 공간 축을 따른다', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page, ['IR-R10H-120', 'IR-R10H-120']);
    await page.evaluate(() => {
        const a = window.__multiJog, robots = a.getArticulatedRobots();
        robots[1].rotation.z = Math.PI;
        robots.forEach(robot => {
            [20, -40, 55, 25, 45, -10].forEach((angle, index) => a.setJointAngle(robot.userData.joints[index], angle));
            a.captureCurrentTcpTarget(robot);
        });
        a.syncJointControls(a.getJogTargetRobot());
    });
    await page.locator('#jog-select-all').check();
    await fillNumber(page.locator('#base-rotate-step'), 1);
    const compareDeltas = async (before, after) => {
        const result = await page.evaluate(({ before, after }) => {
            const T = window.__multiJog.THREE;
            const deltas = after.map((pose, index) => new T.Quaternion().fromArray(pose.rotation)
                .multiply(new T.Quaternion().fromArray(before[index].rotation).invert()));
            return { difference: deltas[0].angleTo(deltas[1]), magnitude: deltas[0].angleTo(new T.Quaternion()) };
        }, { before, after });
        expect(result.difference).toBeLessThan(0.0001);
        expect(result.magnitude).toBeCloseTo(Math.PI / 180, 3);
        expectWorldTranslation(before, after, [0, 0, 0]);
    };
    let before = await worldPoses(page);
    await page.locator('[data-base-jog="rotate"][data-axis="x"][data-direction="1"]').click();
    await compareDeltas(before, await worldPoses(page));

    before = await worldPoses(page);
    const ry = Number(await page.locator('#tcp-ry').inputValue());
    await fillNumber(page.locator('#tcp-ry'), ry + 1); await page.locator('#tcp-ry').press('Tab');
    await compareDeltas(before, await worldPoses(page));

    await page.locator('#btn-base-gizmo-rotate').click();
    before = await worldPoses(page);
    await page.evaluate(() => {
        const a = window.__multiJog;
        a.setBaseJogGizmoEnabled(true); a.beginBaseJogGizmoDrag();
        a.state.baseJogGizmoTarget.quaternion.setFromAxisAngle(new a.THREE.Vector3(1, 0, 0), Math.PI / 180);
        a.applyBaseJogGizmoTarget(); a.endBaseJogGizmoDrag();
    });
    await compareDeltas(before, await worldPoses(page));
    expect(errors).toEqual([]);
});

test('JOG 위치·회전 제목은 언어와 BASE·Wobj 전환 및 이동 후에도 번역을 유지한다', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page, ['IR-S7-60Z20']);
    await fillNumber(page.locator('#base-move-step'), 0.1);
    const titles = page.locator('#base-jog-view .base-jog-title');
    const expected = {
        ko: ['TCP 위치 /', 'TCP 회전 /', '베이스'],
        en: ['TCP Position /', 'TCP Rotation /', 'Base'],
        'zh-CN': ['TCP 位置 /', 'TCP 旋转 /', '基座'],
        vi: ['Vị trí TCP /', 'Góc xoay TCP /', 'Đế'],
        tr: ['TCP Konumu /', 'TCP Dönüşü /', 'Taban'],
        ru: ['Позиция TCP /', 'Вращение TCP /', 'База']
    };
    for (const locale of ['ko', 'en', 'zh-CN', 'vi', 'tr', 'ru', 'ko']) {
        const [position, rotation, base] = expected[locale];
        await page.locator('#inorobot-language-select').selectOption(locale);
        await expect(titles.nth(0)).toHaveText(`${position} ${base}`);
        await expect(titles.nth(1)).toHaveText(`${rotation} ${base}`);
        await page.evaluate(() => {
            const a = window.__multiJog, robot = a.getJogTargetRobot();
            robot.userData.activeWorkObjectIndex = 2;
            a.captureCurrentTcpTarget(robot);
        });
        await expect(titles.nth(0)).toHaveText(`${position} Wobj[2]`);
        await expect(titles.nth(1)).toHaveText(`${rotation} Wobj[2]`);
        await page.locator('[data-base-jog="move"][data-axis="z"][data-direction="1"]').click();
        await expect(titles.nth(0)).toHaveText(`${position} Wobj[2]`);
        await expect(titles.nth(1)).toHaveText(`${rotation} Wobj[2]`);
        await page.evaluate(() => {
            const a = window.__multiJog, robot = a.getJogTargetRobot();
            robot.userData.activeWorkObjectIndex = 0;
            a.captureCurrentTcpTarget(robot);
        });
        await expect(titles.nth(0)).toHaveText(`${position} ${base}`);
        await expect(titles.nth(1)).toHaveText(`${rotation} ${base}`);
    }
    expect(errors).toEqual([]);
});
