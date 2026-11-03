import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);$/m, 'window.__programPointsReady = init();');
        await route.fulfill({ response, body: source + '\nwindow.__programPoints = { state, ensureMotionProgram, captureRobotMotionStep, renderMotionProgramPanel, setJointAngle, getPositionPointRecords, serializeMotionProgramFile, restoreMotionProgramFileData, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot };' });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__programPointsReady && window.__programPoints);
    await page.evaluate(() => window.__programPointsReady);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__programPoints.state.activeProgramRobot);
    await page.locator('[data-panel-toggle="program-panel"]').click();
    return errors;
}

const metadata = page => page.evaluate(() => {
    const a = window.__programPoints;
    return a.ensureMotionProgram(a.state.activeProgramRobot).steps.map(step => ({ index: step.pointIndex, label: step.label }));
});

test('표준화 모드에서 추가한 프로그램 명령은 번호와 라벨을 자동 생성하고 저장·복원한다', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await setup(page);
    const expected = [
        { index: 111, label: 'P1_Work' }, { index: 110, label: 'P1_Pre_work' },
        { index: 101, label: 'P1_Wait' }, { index: 100, label: 'P1_Safe' }, { index: 211, label: 'P2_Work' }
    ];
    for (let i = 0; i < expected.length; i++) {
        await page.evaluate(index => {
            const a = window.__programPoints, robot = a.state.activeProgramRobot;
            a.setJointAngle(robot.userData.joints[2], -40 - index, false);
            robot.updateMatrixWorld(true);
        }, i);
        await page.locator('#program-add-step').click();
        expect(await metadata(page)).toEqual(expected.slice(0, i + 1));
        await expect(page.locator('[data-program-step-label]').last()).toHaveValue(expected[i].label);
    }
    await expect(page.locator('#program-point-standardized')).toBeChecked();
    expect(await page.evaluate(() => {
        const a = window.__programPoints;
        return a.ensureMotionProgram(a.state.activeProgramRobot).steps.map(step => step.joints[2]);
    })).toEqual([-40, -41, -42, -43, -44]);
    await page.locator('#btn-undo').click();
    expect(await metadata(page)).toEqual(expected.slice(0, -1));
    await page.locator('#btn-redo').click();
    expect(await metadata(page)).toEqual(expected);
    await page.evaluate(async () => {
        const a = window.__programPoints;
        a.restoreMotionProgramFileData(JSON.parse(JSON.stringify(a.serializeMotionProgramFile())));
        await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
    });
    expect(await metadata(page)).toEqual(expected);
    const points = await page.evaluate(() => window.__programPoints.getPositionPointRecords().map(point => ({ index: point.index, label: point.label })));
    expect(points).toEqual([...expected].sort((left, right) => left.index - right.index));
    await page.screenshot({ path: test.info().outputPath('program-standardized-labels.png') });
    expect(errors).toEqual([]);
});

test('프로그램 표준화는 P.pts 등록 번호를 건너뛰고 로봇마다 독립적으로 생성한다', async ({ page }) => {
    const errors = await setup(page);
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.locator('[data-pts-new]').click();
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.locator('#program-add-step').click();
    expect(await metadata(page)).toEqual([{ index: 110, label: 'P1_Pre_work' }]);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.locator('#btn-add-robot-model-choice').click();
    await page.waitForFunction(() => window.__programPoints.state.models.filter(model => model.userData.tcpFrame).length === 2);
    await page.locator('#program-add-step').click();
    expect(await metadata(page)).toEqual([{ index: 111, label: 'P1_Work' }]);
    expect(errors).toEqual([]);
});

test('일반 명령을 이동 명령으로 바꾸면 표준 라벨을 생성하고 기존 라벨은 보존한다', async ({ page }) => {
    const errors = await setup(page);
    await page.locator('#program-add-io-output').click();
    await page.locator('#program-add-delay').click();
    expect(await metadata(page)).toEqual([{}, {}]);
    await page.locator('[data-program-step-motion]').first().selectOption('MOVL');
    await page.locator('[data-program-step-motion]').nth(1).selectOption('MOVJ');
    expect(await metadata(page)).toEqual([{ index: 111, label: 'P1_Work' }, { index: 110, label: 'P1_Pre_work' }]);
    await page.locator('[data-program-step-label]').first().fill('Custom_Pick');
    await page.locator('[data-program-step-label]').first().press('Tab');
    await page.locator('[data-program-step-motion]').first().selectOption('MOVJ');
    await page.locator('#program-point-standardized').uncheck();
    await page.locator('#program-add-step').click();
    expect(await metadata(page)).toEqual([{ index: 111, label: 'Custom_Pick' }, { index: 110, label: 'P1_Pre_work' }, { index: 0, label: '' }]);
    await page.locator('#program-point-standardized').check();
    await page.locator('#program-add-step').click();
    expect((await metadata(page)).at(-1)).toEqual({ index: 101, label: 'P1_Wait' });
    expect(errors).toEqual([]);
});

test('프로그램 표준화 해제는 기존 번호 규칙을 유지하고 새로 열어도 설정을 기억한다', async ({ page }) => {
    const errors = await setup(page);
    await page.locator('#program-point-standardized').uncheck();
    await page.locator('#program-add-step').click();
    await page.evaluate(() => {
        const a = window.__programPoints, robot = a.state.activeProgramRobot;
        a.ensureMotionProgram(robot).positions.push(a.captureRobotMotionStep(robot, { pointIndex: 2, label: 'Reserved' }));
        a.renderMotionProgramPanel();
    });
    await page.locator('#program-add-step').click();
    expect(await metadata(page)).toEqual([{ index: 0, label: '' }, { index: 1, label: '' }]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__programPointsReady && window.__programPoints);
    await page.waitForFunction(() => window.__programPoints.state.workspaceRecovery.ready
        || document.querySelector('#workspace-recovery-dialog')?.open);
    if (await page.locator('#workspace-recovery-dialog').isVisible()) {
        await page.getByRole('button', { name: '새 작업 시작', exact: true }).click();
    }
    await page.evaluate(() => window.__programPointsReady);
    await expect(page.locator('#program-point-standardized')).not.toBeChecked();
    await expect(page.locator('[data-pts-standardized]')).toBeChecked();
    expect(errors).toEqual([]);
});

test('프로그램 패널을 별도 창으로 열어도 표준화 모드와 자동 라벨이 동작한다', async ({ page }) => {
    const errors = await setup(page);
    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-panel-action="popout"][data-panel-id="program-panel"]').click();
    const popup = await popupPromise;
    await expect(popup.locator('#program-point-standardized')).toBeChecked();
    await popup.locator('#program-add-step').click();
    await expect(popup.locator('[data-program-step-label]')).toHaveValue('P1_Work');
    await popup.locator('#program-point-standardized').uncheck();
    await popup.locator('#program-add-step').click();
    expect(await metadata(page)).toEqual([{ index: 111, label: 'P1_Work' }, { index: 0, label: '' }]);
    await popup.close();
    expect(errors).toEqual([]);
});
