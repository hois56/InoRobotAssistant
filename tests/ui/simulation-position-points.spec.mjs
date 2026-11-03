import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function setup(page, model = 'IR-S7-60Z20') {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/^init\(\);\s*$/m, 'window.__ptsReady = init();');
        await route.fulfill({ response, body: `${source}\nwindow.__pts = { state, ensureMotionProgram, addCurrentMotionStep,
            serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, serializeMotionProgramFile, normalizeMotionProgramFile,
            restoreMotionProgramFileData, serializeMotionProject, normalizeMotionProject, getPositionPointRecords,
            formatPositionPointRecord, undoLastAction, redoLastAction, handleOlpFolderImport, getOlpProject,
            renderMotionProgramPanel, setJointAngle, capturePositionPointRecord, getMotionSession,
            applyRobotTravelAxis, savePositionPointRecord, stopActiveRobotMotion };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ptsReady && window.__pts);
    await page.evaluate(() => window.__ptsReady);
    await expect(page.locator('[data-panel-toggle="position-points-panel"]')).toBeDisabled();
    await page.locator('#model-select').selectOption(`robot:${model}`);
    await expect(page.locator('[data-panel-toggle="position-points-panel"]')).toBeEnabled();
    await page.evaluate(() => {
        const { state, setJointAngle } = window.__pts;
        const angles = state.activeProgramRobot.userData.joints.length === 4 ? [20, -45, -40, 15] : [10, -20, 30, 5, -45, 15];
        state.activeProgramRobot.userData.joints.forEach((joint, i) => setJointAngle(joint, angles[i], false));
        state.activeProgramRobot.updateMatrixWorld(true);
    });
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
}

async function currentPose(page) {
    return page.evaluate(() => {
        const a = window.__pts, r = a.state.activeProgramRobot;
        const { key, ...record } = a.capturePositionPointRecord();
        return { record, joints: r.userData.joints.map(j => j.angle),
            position: r.position.toArray(), quaternion: r.quaternion.toArray() };
    });
}

async function editCell(page, pointIndex, field, component, value, key = 'Enter') {
    const row = typeof pointIndex === 'string' ? page.locator(`[data-pts-row="${pointIndex}"]`)
        : page.locator('[data-pts-row]').filter({ hasText: `P[${pointIndex}]` });
    const cell = row.locator(`[data-pts-edit-field="${field}"]${component == null ? '' : `[data-pts-edit-index="${component}"]`}`);
    await expect(cell).toBeVisible();
    await cell.dblclick();
    const input = page.locator('[data-pts-cell-editor]');
    await expect(input).toBeFocused();
    await input.fill(String(value));
    await input.press(key);
}

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) {
    test(`위치 수정은 선택한 행을 현재 좌표·Arm·외부축으로 덮어쓰고 저장·복원된다 (${model})`, async ({ page }) => {
        test.setTimeout(90000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await setup(page, model);
        await expect(page.locator('[data-pts-update]')).toBeDisabled();
        await page.locator('[data-pts-new]').click();
        await expect(page.locator('[data-pts-row]')).toHaveCount(1);
        const original = await page.evaluate(() => window.__pts.getPositionPointRecords()[0]);
        await page.evaluate(() => {
            const a = window.__pts, r = a.state.activeProgramRobot;
            a.setJointAngle(r.userData.joints[0], r.userData.joints[0].angle + 10, false);
            a.applyRobotTravelAxis(r, [10, 20, 30, 40, 50, 60], { syncPresentation: false });
            r.updateMatrixWorld(true);
        });
        const expected = await currentPose(page);
        await page.locator('[data-pts-row]').click();
        await expect(page.locator('#position-points-panel form, [data-pts-fields]')).toHaveCount(0);
        expect(await page.evaluate(() => window.__pts.getPositionPointRecords()[0])).toEqual(original);
        await page.locator('[data-pts-update]').click();
        await expect(page.locator('[data-pts-error]')).toBeEmpty();
        const saved = await page.evaluate(() => {
            const a = window.__pts, r = a.state.activeProgramRobot, p = a.ensureMotionProgram(r);
            return { record: a.getPositionPointRecords()[0], normalized: a.normalizeMotionProject(a.serializeMotionProject()).robots[0].positions[0],
                program: a.normalizeMotionProgramFile(a.serializeMotionProgramFile()).robots[0].positions[0],
                code: a.formatPositionPointRecord(r, p.positions[0]), count: p.steps.length };
        });
        expect(saved.record.key).toBe(original.key); expect(saved.record.index).toBe(original.index);
        expect(saved.record.label).toBe(original.label);
        saved.record.values.forEach((value, i) => expect(value).toBeCloseTo(expected.record.values[i], 6));
        expect(saved.record.armParameters).toEqual(expected.record.armParameters);
        expect(saved.record.externalAxes).toEqual([10, 20, 30, 40, 50, 60]);
        expect(await currentPose(page)).toEqual(expected); expect(saved.count).toBe(0);
        expect(saved.normalized.externalAxes).toEqual(saved.record.externalAxes);
        expect(saved.program.armParameters).toEqual(saved.record.armParameters);
        expect(saved.code).toContain('10.000000, 20.000000, 30.000000, 40.000000, 50.000000, 60.000000');
        await page.evaluate(() => window.__pts.undoLastAction());
        expect(await page.evaluate(() => window.__pts.getPositionPointRecords()[0])).toEqual(original);
        await page.evaluate(() => window.__pts.redoLastAction());
        expect(await page.evaluate(() => window.__pts.getPositionPointRecords()[0])).toEqual(saved.record);
        await page.evaluate(async () => {
            const a = window.__pts;
            a.restoreMotionProgramFileData(JSON.parse(JSON.stringify(a.serializeMotionProgramFile())));
            await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
        });
        expect(await page.evaluate(() => window.__pts.getPositionPointRecords()[0])).toEqual(saved.record);
        expect(errors).toEqual([]);
    });
}

test('프로그램의 선택 위치만 수정하고 같은 모델의 다른 로봇 위치는 보존한다', async ({ page }) => {
    test.setTimeout(90000);
    await setup(page);
    const firstId = await page.locator('[data-pts-robot]').inputValue();
    const step = await page.evaluate(() => {
        const a = window.__pts; a.addCurrentMotionStep();
        return structuredClone(a.ensureMotionProgram(a.state.activeProgramRobot).steps[0]);
    });
    await page.locator('[data-pts-new]').click();
    const untouched = await page.evaluate(index => window.__pts.getPositionPointRecords().find(p => p.index !== index), step.pointIndex);
    await page.locator('[data-pts-row]').filter({ hasText: `P[${step.pointIndex}]` }).click();
    await page.evaluate(() => {
        const a = window.__pts, r = a.state.activeProgramRobot;
        a.setJointAngle(r.userData.joints[2], -41, false); r.updateMatrixWorld(true);
    });
    await page.locator('[data-pts-update]').click();
    const updated = await page.evaluate(() => window.__pts.ensureMotionProgram(window.__pts.state.activeProgramRobot).steps[0]);
    expect(updated.id).toBe(step.id); expect(updated.pointIndex).toBe(step.pointIndex);
    expect(updated.label).toBe(step.label); expect(updated.speed).toBe(step.speed);
    expect(updated.tcp.position[2]).toBeCloseTo(-41, 5);
    expect(await page.evaluate(index => window.__pts.getPositionPointRecords().find(p => p.index === index), untouched.index)).toEqual(untouched);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.locator('#btn-add-robot-model-choice').click();
    await expect(page.locator('[data-pts-robot] option')).toHaveCount(2);
    await expect(page.locator('[data-pts-row]')).toHaveCount(0);
    await expect(page.locator('[data-pts-update]')).toBeDisabled();
    await page.locator('[data-pts-new]').click();
    const second = await page.evaluate(() => window.__pts.getPositionPointRecords());
    await page.locator('[data-pts-robot]').selectOption(firstId);
    await expect(page.locator('[data-pts-row]')).toHaveCount(2);
    await expect(page.locator('[data-pts-update]')).toBeDisabled();
    expect(await page.evaluate(() => window.__pts.state.activeArticulatedModel.userData.motionInstanceId)).toBe(firstId);
    await page.locator('[data-pts-robot]').selectOption({ index: 1 });
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords())).toEqual(second);
});

test('실제 P.pts와 LP의 선택 위치만 현재 값으로 수정하고 라벨과 메타데이터를 보존한다', async ({ page }) => {
    test.setTimeout(90000);
    await setup(page);
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.evaluate(async () => {
        await window.__pts.handleOlpFolderImport([
            new File(['Start\nEnd'], 'main.pro'),
            new File(['P[7]=100,200,300,10,20,30;1,2,3,4;10,20,30,40,50,60;Notes="기존 위치";User=Keep;\nLP[7]=1,2,3,4,5,6;0,0,0,1;0,0,0,0,0,0;Name=Local;'], 'P.pts')
        ], { connectBus: false });
    });
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    const expected = await currentPose(page);
    await page.locator('[data-pts-row="P:7"]').click();
    await page.locator('[data-pts-update]').click();
    await expect(page.locator('[data-pts-error]')).toBeEmpty();
    const data = await page.evaluate(() => {
        const p = window.__pts.getOlpProject(); return { text: p.files.get('P.pts').text, points: p.pointFiles[0].records };
    });
    expect(data.text).toContain('User=Keep;');
    expect(data.points.find(p => p.sourceSymbol === 'LP').values).toEqual([1, 2, 3, 4, 5, 6]);
    const point = data.points.find(p => p.sourceSymbol === 'P');
    expect(point.name).toBe('기존 위치'); expect(point.index).toBe(7);
    point.values.forEach((value, i) => expect(value).toBeCloseTo(expected.record.values[i], 5));
    expect(point.armParameters).toEqual(expected.record.armParameters);
    expect(point.externalAxes).toEqual(expected.record.externalAxes);
    await page.locator('[data-pts-row="LP:7"]').click();
    await page.locator('[data-pts-update]').click();
    const local = await page.evaluate(() => window.__pts.getOlpProject().pointFiles[0].records.find(p => p.sourceSymbol === 'LP'));
    expect(local.name).toBe('Local');
    local.values.forEach((value, i) => expect(value).toBeCloseTo(expected.record.values[i], 5));
    await page.locator('[data-pts-new]').click();
    await expect(page.locator('[data-pts-row]')).toHaveCount(3);
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.evaluate(() => window.__pts.handleOlpFolderImport([new File(['Start\nEnd'], 'main.pro')],
        { suppressDiscardPrompt: true, connectBus: false }));
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await expect(page.locator('[data-pts-update]')).toBeDisabled();
    await page.locator('[data-pts-new]').click();
    await expect(page.locator('[data-pts-row]')).toContainText('P[111]');
});

test('표준화 등록은 생성기의 번호·라벨 순서와 매번 현재 위치를 사용한다', async ({ page }) => {
    test.setTimeout(60000);
    await setup(page);
    const sequence = [111, 110, 101, 100, 211];
    const labels = ['P1_Work', 'P1_Pre_work', 'P1_Wait', 'P1_Safe', 'P2_Work'];
    for (let i = 0; i < sequence.length; i++) {
        const current = await page.evaluate(index => {
            const a = window.__pts, r = a.state.activeProgramRobot;
            a.setJointAngle(r.userData.joints[2], -40 - index, false); r.updateMatrixWorld(true);
            return a.capturePositionPointRecord();
        }, i);
        await page.locator('[data-pts-new]').click();
        await expect(page.locator('[data-pts-row]')).toHaveCount(i + 1);
        await expect(page.locator('#position-points-panel form, [data-pts-fields]')).toHaveCount(0);
        const saved = await page.evaluate(index => window.__pts.getPositionPointRecords().find(p => p.index === index), sequence[i]);
        expect(saved.label).toBe(labels[i]);
        for (const group of ['values', 'armParameters', 'externalAxes']) {
            saved[group].forEach((value, index) => expect(value).toBeCloseTo(current[group][index], 6));
        }
    }
    expect(await page.evaluate(() => window.__pts.ensureMotionProgram(window.__pts.state.activeProgramRobot).positions.map(p => p.pointIndex))).toEqual(sequence);
});

test('표준화 해제는 빈 목록의 0과 최대 번호 다음 값을 사용하고 설정을 기억한다', async ({ page }) => {
    await setup(page);
    await page.locator('[data-pts-standardized]').uncheck();
    await page.locator('[data-pts-new]').click();
    await expect(page.locator('[data-pts-row]')).toContainText('P[0]');
    await page.evaluate(() => {
        const a = window.__pts, p = a.getPositionPointRecords()[0]; a.savePositionPointRecord({ ...p, index: 100 }, p.key);
    });
    await page.locator('[data-pts-new]').click();
    await expect(page.locator('[data-pts-row]')).toHaveCount(2);
    await expect(page.locator('[data-pts-row]').filter({ hasText: 'P[101]' })).toBeVisible();
    await page.evaluate(() => {
        const a = window.__pts, p = a.getPositionPointRecords().find(p => p.index === 100); a.savePositionPointRecord({ ...p, index: 500 }, p.key);
    });
    await page.locator('[data-pts-standardized]').check();
    await page.locator('[data-pts-new]').click();
    await expect(page.locator('[data-pts-row]').filter({ hasText: 'P[111]' })).toContainText('P1_Work');
    await page.locator('[data-pts-standardized]').uncheck();
    await page.locator('[data-pts-new]').click();
    await expect(page.locator('[data-pts-row]')).toHaveCount(4);
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords().find(p => p.index === 501).label)).toBe('');
    await page.reload();
    await page.waitForFunction(() => window.__pts?.state.renderer);
    await expect(page.locator('[data-pts-standardized]')).not.toBeChecked();
});

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) {
    test(`저장 위치로 이동하면 선택한 로봇의 좌표·Arm·외부축을 적용하고 데이터는 유지한다 (${model})`, async ({ page }) => {
        await setup(page, model);
        await expect(page.locator('[data-pts-move]')).toBeDisabled();
        await page.evaluate(() => {
            const a = window.__pts, r = a.state.activeProgramRobot;
            a.applyRobotTravelAxis(r, [30, 0, 0, 0, 0, 10], { syncPresentation: false }); r.updateMatrixWorld(true);
        });
        await page.locator('[data-pts-new]').click();
        const saved = await page.evaluate(() => {
            const a = window.__pts, r = a.state.activeProgramRobot, p = a.ensureMotionProgram(r);
            const record = a.getPositionPointRecords()[0];
            a.applyRobotTravelAxis(r, [0, 0, 0, 0, 0, 0], { syncPresentation: false });
            r.userData.joints.forEach((joint, i) => a.setJointAngle(joint, [5, -10, -15, 0, -20, 0][i], false));
            r.updateMatrixWorld(true);
            return { record, positions: JSON.stringify(p.positions), steps: JSON.stringify(p.steps) };
        });
        await page.locator('[data-pts-move]').click();
        await expect.poll(() => page.evaluate(() => window.__pts.ensureMotionProgram(window.__pts.state.activeProgramRobot).status)).toBe('completed');
        const reached = await currentPose(page);
        reached.record.values.forEach((value, i) => expect(value).toBeCloseTo(saved.record.values[i], 2));
        expect(reached.record.armParameters).toEqual(saved.record.armParameters);
        expect(reached.record.externalAxes).toEqual(saved.record.externalAxes);
        expect(await page.evaluate(() => {
            const p = window.__pts.ensureMotionProgram(window.__pts.state.activeProgramRobot);
            return { positions: JSON.stringify(p.positions), steps: JSON.stringify(p.steps) };
        })).toEqual({ positions: saved.positions, steps: saved.steps });
    });
}

test('실제 P.pts 위치도 이동하고 도달할 수 없는 위치는 로봇과 파일을 보존한다', async ({ page }) => {
    await setup(page);
    const record = (await currentPose(page)).record;
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.evaluate(async record => {
        const a = window.__pts;
        await a.handleOlpFolderImport([
            new File(['Start\nEnd'], 'main.pro'),
            new File([`P[7]=${record.values.join(',')};${record.armParameters.join(',')};0,0,0,0,0,0;Name=Target;\nP[8]=999999,999999,999999,0,0,0;0,0,0,1;10,0,0,0,0,0;Name=Unreachable;`], 'P.pts')
        ], { connectBus: false });
        const r = a.state.activeProgramRobot;
        [5, -10, -15, 0].forEach((angle, i) => a.setJointAngle(r.userData.joints[i], angle, false)); r.updateMatrixWorld(true);
    }, record);
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.locator('[data-pts-row="P:7"]').click();
    await page.locator('[data-pts-move]').click();
    await expect.poll(() => page.evaluate(() => window.__pts.ensureMotionProgram(window.__pts.state.activeProgramRobot).status)).toBe('completed');
    const before = await currentPose(page);
    before.record.values.forEach((value, i) => expect(value).toBeCloseTo(record.values[i], 2));
    const text = await page.evaluate(() => window.__pts.getOlpProject().files.get('P.pts').text);
    await page.locator('[data-pts-row="P:8"]').click();
    await page.locator('[data-pts-move]').click();
    await expect(page.locator('[data-pts-error]')).not.toBeEmpty();
    expect(await currentPose(page)).toEqual(before);
    expect(await page.evaluate(() => window.__pts.getOlpProject().files.get('P.pts').text)).toBe(text);
    expect(await page.evaluate(() => Boolean(window.__pts.getMotionSession(window.__pts.state.activeProgramRobot)))).toBe(false);
});

test('위치 이동 중에는 중복 실행·위치 수정을 막고 목록의 정지 버튼은 표시하지 않는다', async ({ page }) => {
    await setup(page);
    await page.locator('[data-pts-new]').click();
    await page.evaluate(() => {
        const a = window.__pts, r = a.state.activeProgramRobot;
        [0, 0, -10, 0].forEach((angle, i) => a.setJointAngle(r.userData.joints[i], angle, false));
        r.updateMatrixWorld(true); a.state.programSpeedOverride = 1;
    });
    await page.locator('[data-pts-move]').click();
    await expect(page.locator('[data-pts-move]')).toBeDisabled();
    await expect(page.locator('[data-pts-update]')).toBeDisabled();
    await expect(page.locator('[data-pts-stop]')).toHaveCount(0);
    await page.evaluate(() => window.__pts.stopActiveRobotMotion());
    expect(await page.evaluate(() => window.__pts.ensureMotionProgram(window.__pts.state.activeProgramRobot).status)).toBe('stopped');
    await expect(page.locator('[data-pts-update]')).toBeEnabled();
    await expect(page.locator('[data-pts-move]')).toBeEnabled();
});

test('창 높이를 늘리면 목록 높이도 함께 늘어나고 행 선택은 세부 창을 만들지 않는다', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await setup(page);
    for (let i = 0; i < 18; i++) await page.locator('[data-pts-new]').click();
    await expect(page.locator('[data-pts-row]')).toHaveCount(18);
    const panel = page.locator('#position-points-panel');
    const list = panel.locator('.position-points-table-scroll');
    const beforePanel = await panel.boundingBox();
    const beforeList = await list.boundingBox();
    await page.mouse.move(beforePanel.x + beforePanel.width / 2, beforePanel.y + beforePanel.height - 2);
    await page.mouse.down();
    await page.mouse.move(beforePanel.x + beforePanel.width / 2, beforePanel.y + beforePanel.height + 178, { steps: 8 });
    await page.mouse.up();
    const afterPanel = await panel.boundingBox();
    const afterList = await list.boundingBox();
    expect(afterPanel.height - beforePanel.height).toBeGreaterThan(150);
    expect(afterList.height - beforeList.height).toBeGreaterThan(150);
    await page.locator('[data-pts-row]').last().click();
    await expect(panel.locator('form, [data-pts-fields], [data-pts-value]')).toHaveCount(0);
    await expect(page.locator('[data-pts-row][aria-selected="true"]')).toHaveCount(1);
    expect((await list.boundingBox()).height).toBeCloseTo(afterList.height, 0);
    await page.screenshot({ path: 'tmp/position-points-list-resized.png' });
});

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) {
    test(`목록 셀에서 번호·이름·좌표·외부축을 직접 수정하고 취소할 수 있다 (${model})`, async ({ page }) => {
        test.setTimeout(60000);
        await setup(page, model);
        await page.locator('[data-pts-new]').click();
        const pose = await currentPose(page);
        await editCell(page, 111, 'index', null, '500');
        await expect(page.locator('[data-pts-error]')).toBeEmpty();
        await expect(page.locator('[data-pts-row]')).toContainText('P[500]');
        await editCell(page, 500, 'label', null, 'CustomPoint', 'Tab');
        await expect(page.locator('[data-pts-row]')).toContainText('CustomPoint');
        await editCell(page, 500, 'values', 2, pose.record.values[2] + 1);
        await editCell(page, 500, 'externalAxes', 0, '25');
        await expect(page.locator('[data-pts-error]')).toBeEmpty();
        const saved = await page.evaluate(() => window.__pts.getPositionPointRecords()[0]);
        expect(saved.index).toBe(500); expect(saved.label).toBe('CustomPoint');
        expect(saved.values[2]).toBeCloseTo(pose.record.values[2] + 1, 6);
        expect(saved.externalAxes[0]).toBe(25);
        expect(await currentPose(page)).toEqual(pose);
        await editCell(page, 500, 'label', null, 'Discard', 'Escape');
        expect(await page.evaluate(() => window.__pts.getPositionPointRecords()[0])).toEqual(saved);
        await page.evaluate(async () => {
            const a = window.__pts;
            await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
        });
        expect(await page.evaluate(() => window.__pts.getPositionPointRecords()[0])).toEqual(saved);
        await expect(page.locator('#position-points-panel form, [data-pts-fields]')).toHaveCount(0);
    });
}

test('목록 직접 편집은 중복 번호와 잘못된 숫자·이름을 거부하고 원래 값을 유지한다', async ({ page }) => {
    await setup(page);
    await page.locator('[data-pts-new]').click();
    await page.locator('[data-pts-new]').click();
    const original = await page.evaluate(() => window.__pts.getPositionPointRecords());
    for (const [field, component, value] of [['index', null, '110'], ['index', null, ''],
        ['values', 0, ''], ['values', 0, 'NaN'], ['armParameters', 1, '1.5'], ['label', null, '123Wrong']]) {
        await editCell(page, 111, field, component, value);
        await expect(page.locator('[data-pts-error]')).not.toBeEmpty();
        expect(await page.evaluate(() => window.__pts.getPositionPointRecords())).toEqual(original);
    }
});

test('실제 P.pts의 P·LP 번호와 이름·Arm·외부축을 셀에서 편집하고 다른 메타데이터를 보존한다', async ({ page }) => {
    await setup(page);
    const record = (await currentPose(page)).record;
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.evaluate(async record => {
        await window.__pts.handleOlpFolderImport([
            new File(['Start\nEnd'], 'main.pro'),
            new File([`P[7]=${record.values.join(',')};${record.armParameters.join(',')};0,0,0,0,0,0;Name=Original;User=Keep;\nLP[7]=${record.values.join(',')};${record.armParameters.join(',')};0,0,0,0,0,0;Name=Local;`], 'P.pts')
        ], { connectBus: false });
    }, record);
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await editCell(page, 'P:7', 'index', null, '8');
    await editCell(page, 'P:8', 'label', null, '투입 위치');
    await editCell(page, 'LP:7', 'index', null, '8');
    await editCell(page, 'LP:8', 'armParameters', 1, '2');
    await editCell(page, 'LP:8', 'externalAxes', 5, '27.125', 'Tab');
    await expect(page.locator('[data-pts-error]')).toBeEmpty();
    const data = await page.evaluate(() => {
        const p = window.__pts.getOlpProject(); return { text: p.files.get('P.pts').text, points: p.pointFiles[0].records };
    });
    expect(data.text).toContain('User=Keep;');
    const p = data.points.find(p => p.sourceSymbol === 'P'), lp = data.points.find(p => p.sourceSymbol === 'LP');
    expect(p.index).toBe(8); expect(p.name).toBe('투입 위치');
    expect(lp.index).toBe(8); expect(lp.name).toBe('Local');
    expect(lp.armParameters[1]).toBe(2); expect(lp.externalAxes[5]).toBe(27.125);
    await expect(page.locator('[data-pts-row="LP:8"]')).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({ path: 'tmp/position-points-inline-editing.png' });
});

test('번호와 이름만 바꾸면 저장 위치가 도달 불가여도 로봇 자세나 좌표를 변경하지 않는다', async ({ page }) => {
    await setup(page);
    await page.locator('[data-pts-new]').click();
    const pose = await currentPose(page);
    await page.evaluate(() => {
        const a = window.__pts, r = a.state.activeProgramRobot;
        a.ensureMotionProgram(r).positions[0].tcp.position[0] = 999999;
        a.renderMotionProgramPanel();
    });
    await editCell(page, 111, 'index', null, '1000');
    await editCell(page, 1000, 'label', null, 'Unreachable');
    await expect(page.locator('[data-pts-error]')).toBeEmpty();
    const record = await page.evaluate(() => window.__pts.getPositionPointRecords()[0]);
    expect(record.index).toBe(1000); expect(record.label).toBe('Unreachable');
    expect(record.values[0]).toBe(999999);
    expect(await currentPose(page)).toEqual(pose);
});

test('셀 화살표·Tab·Enter 이동과 바로 입력·F2 편집이 엑셀 방식으로 동작한다', async ({ page }) => {
    await setup(page);
    await page.locator('[data-pts-new]').click();
    await page.locator('[data-pts-new]').click();
    const row110 = page.locator('[data-pts-row]').filter({ hasText: 'P[110]' });
    const id110 = row110.locator('[data-pts-edit-field="index"]');
    await id110.click();
    await page.keyboard.press('ArrowRight');
    await expect(row110.locator('[data-pts-edit-field="label"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const row111 = page.locator('[data-pts-row]').filter({ hasText: 'P[111]' });
    await expect(row111.locator('[data-pts-edit-field="label"]')).toBeFocused();
    await page.keyboard.type('GridPoint');
    await expect(page.locator('[data-pts-cell-editor]')).toHaveValue('GridPoint');
    await page.keyboard.press('ArrowLeft');
    await expect(row111.locator('[data-pts-edit-field="index"]')).toBeFocused();
    await expect(row111).toContainText('GridPoint');
    await page.keyboard.press('F2');
    const input = page.locator('[data-pts-cell-editor]');
    await expect(page.locator('.position-points-index-prefix')).toHaveText('P[');
    await expect(page.locator('.position-points-index-suffix')).toHaveText(']');
    await expect(input).toHaveAttribute('maxlength', '4');
    await input.fill('500');
    await page.keyboard.press('ArrowLeft');
    await expect(input).toBeFocused();
    const caret = await input.evaluate(node => node.selectionStart);
    expect(caret).toBeLessThan(3);
    await page.keyboard.type('P[]-');
    await expect(input).toHaveValue('500');
    await page.keyboard.press('Enter');
    const row500 = page.locator('[data-pts-row]').filter({ hasText: 'P[500]' });
    await expect(row500.locator('[data-pts-edit-field="index"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(row500.locator('[data-pts-edit-field="label"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(row500.locator('[data-pts-edit-field="index"]')).toBeFocused();
    await page.keyboard.press('Control+Home');
    await expect(id110).toBeFocused();
    await row110.locator('[data-pts-edit-field="values"][data-pts-edit-index="2"]').click();
    await page.keyboard.type('-41');
    await page.keyboard.press('ArrowDown');
    await expect(row500.locator('[data-pts-edit-field="values"][data-pts-edit-index="2"]')).toBeFocused();
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords().find(p => p.index === 110).values[2])).toBeCloseTo(-41, 5);
    await page.keyboard.press('F2');
    await page.locator('[data-pts-cell-editor]').fill('-99');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords().find(p => p.index === 500).values[2])).toBeCloseTo(-40, 5);
});

test('P.pts 표기와 짧은 로봇 선택 및 내보내기는 현재 목록의 편집값을 저장한다', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#position-points-panel h2')).toContainText('P.pts');
    await expect(page.locator('[data-panel-toggle="position-points-panel"]')).toHaveText('P.pts');
    await expect(page.locator('[data-pts-export]')).toHaveText('P.pts 내보내기');
    await expect(page.locator('[data-pts-export]')).toBeDisabled();
    expect((await page.locator('[data-pts-robot]').boundingBox()).width).toBeLessThanOrEqual(230);
    await page.evaluate(() => {
        window.__ptsExports = [];
        window.showSaveFilePicker = async options => ({ name: options.suggestedName,
            createWritable: async () => ({ write: async value => window.__ptsExports.push({ name: options.suggestedName,
                text: typeof value === 'string' ? value : await value.text() }), close: async () => {} }) });
    });
    await page.locator('[data-pts-new]').click();
    await editCell(page, 111, 'index', null, '500');
    await editCell(page, 500, 'label', null, 'ExportPoint');
    await page.locator('[data-pts-export]').click();
    await expect.poll(() => page.evaluate(() => window.__ptsExports.length)).toBe(1);
    const saved = await page.evaluate(() => window.__ptsExports[0]);
    expect(saved.name).toBe('P.pts'); expect(saved.text).toContain('ProgramInfo\r\n');
    expect(saved.text).toContain('P[500]'); expect(saved.text).toContain('Name=ExportPoint;');
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.evaluate(async () => window.__pts.handleOlpFolderImport([
        new File(['Start\nEnd'], 'main.pro'), new File(['P[7]=1,2,3,4,5,6;0,0,0,1;10,20,30,40,50,60;Name=Imported;'], 'P.pts')
    ], { connectBus: false }));
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.locator('[data-pts-export]').click();
    await expect.poll(() => page.evaluate(() => window.__ptsExports.length)).toBe(2);
    const imported = await page.evaluate(() => window.__ptsExports[1]);
    expect(imported.name).toBe('P.pts'); expect(imported.text).toContain('P[7]=1,2,3,4,5,6;');
    expect(imported.text).toContain('10,20,30,40,50,60;Name=Imported;');
    await page.screenshot({ path: 'tmp/position-points-grid-export.png' });
    await page.locator('[data-pts-edit-field="index"]').dblclick();
    await page.screenshot({ path: 'tmp/position-points-number-editor.png' });
});

for (const olp of [false, true]) test(`P.pts 별도 창 내보내기는 해당 창에서 저장하고 취소 후 다시 저장한다 (${olp ? 'OLP' : '일반 위치'})`, async ({ page }) => {
    await setup(page);
    if (olp) {
        await page.locator('[data-panel-toggle="position-points-panel"]').click();
        await page.evaluate(async () => window.__pts.handleOlpFolderImport([
            new File(['Start\nEnd'], 'main.pro'),
            new File(['P[7]=1,2,3,4,5,6;0,0,0,1;10,20,30,40,50,60;Name=Imported;'], 'P.pts')
        ], { connectBus: false }));
        await page.locator('[data-panel-toggle="position-points-panel"]').click();
    } else {
        await page.locator('[data-pts-new]').click();
        await editCell(page, 111, 'label', null, 'PopupExport');
    }
    await page.evaluate(() => {
        window.__openerPtsPickerCalls = 0;
        window.showSaveFilePicker = async () => {
            window.__openerPtsPickerCalls++;
            throw new DOMException('The opener has no user activation.', 'SecurityError');
        };
    });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#position-points-panel [data-panel-action="popout"]').click();
    const popup = await popupPromise;
    await popup.evaluate(() => {
        window.__popupPtsPickerCalls = 0;
        window.__popupPtsExports = [];
        window.showSaveFilePicker = async options => {
            if (++window.__popupPtsPickerCalls === 1) throw new DOMException('Cancelled', 'AbortError');
            return { name: options.suggestedName, createWritable: async () => ({
                write: async blob => window.__popupPtsExports.push({ name: options.suggestedName, text: await blob.text() }),
                close: async () => {}
            }) };
        };
    });
    const button = popup.locator('[data-pts-export]');
    await button.click();
    await expect(button).toBeEnabled();
    expect(await page.evaluate(() => window.__openerPtsPickerCalls)).toBe(0);
    expect(await popup.evaluate(() => window.__popupPtsPickerCalls)).toBe(1);
    await button.click();
    await expect.poll(() => popup.evaluate(() => window.__popupPtsExports.length)).toBe(1);
    const saved = await popup.evaluate(() => window.__popupPtsExports[0]);
    expect(saved.name).toBe('P.pts');
    expect(saved.text).toContain('ProgramInfo\r\n');
    expect(saved.text).toContain(olp ? 'P[7]=1,2,3,4,5,6;' : 'P[111]');
    expect(saved.text).toContain(olp ? '10,20,30,40,50,60;Name=Imported;' : 'Name=PopupExport;');
    await expect(button).toBeEnabled();
    await popup.close();
});

test('P.pts 별도 창 내보내기는 저장 대화상자 API가 없어도 해당 창에서 다운로드한다', async ({ page }) => {
    await setup(page);
    await page.locator('[data-pts-new]').click();
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#position-points-panel [data-panel-action="popout"]').click();
    const popup = await popupPromise;
    await page.evaluate(() => {
        window.showSaveFilePicker = async () => { throw new Error('The opener must not handle popup exports.'); };
    });
    await popup.evaluate(() => { window.showSaveFilePicker = undefined; });
    const downloadPromise = popup.waitForEvent('download');
    await popup.locator('[data-pts-export]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('P.pts');
    const content = await readFile(await download.path(), 'utf8');
    expect(content).toContain('ProgramInfo\r\n');
    expect(content).toContain('P[111]');
    expect(content).toContain('Name=P1_Work;');
    await expect(popup.locator('[data-pts-export]')).toBeEnabled();
    await popup.close();
});

test('P.pts 창의 공통 분리·숨기기 버튼과 이름을 적용하고 편집 안내를 표시하지 않는다', async ({ page }) => {
    await setup(page);
    const panel = page.locator('#position-points-panel');
    await expect(panel.locator('[data-pts-new]')).toContainText('위치 추가');
    await expect(panel.locator('[data-pts-update]')).toContainText('위치 덮어쓰기');
    await expect(panel.locator('[data-pts-move]')).toContainText('위치로 이동');
    await expect(panel.locator('.position-points-note')).toHaveCount(0);
    await page.locator('[data-pts-new]').click();
    await expect(panel.locator('td[title]')).toHaveCount(0);
    const actions = panel.locator('.panel-header-actions');
    await expect(actions.locator('[data-panel-action="hide"] .fa-eye-slash')).toHaveCount(1);
    const popupPromise = page.waitForEvent('popup');
    await actions.locator('[data-panel-action="popout"]').click();
    const popup = await popupPromise;
    await expect(popup).toHaveTitle('3D Simulation - P.pts');
    await expect(popup.locator('#position-points-panel')).toBeVisible();
    expect((await popup.locator('#position-points-panel').boundingBox()).width).toBeGreaterThan(700);
    await popup.locator('[data-pts-new]').click();
    await expect(popup.locator('[data-pts-row]')).toHaveCount(2);
    await popup.locator('[data-pts-edit-field="label"]').first().click();
    await popup.keyboard.press('F2');
    await popup.locator('[data-pts-cell-editor]').fill('PopupPoint');
    await popup.keyboard.press('Enter');
    await expect(popup.locator('[data-pts-row]').first()).toContainText('PopupPoint');
    await popup.keyboard.press('a');
    await expect(popup.locator('[data-pts-row]')).toHaveCount(3);
    await popup.locator('[data-panel-action="hide"]').click();
    await expect.poll(() => popup.isClosed()).toBe(true);
    await expect(panel).toBeHidden();
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await expect(panel.locator('[data-pts-row]')).toHaveCount(3);
});

test('P.pts의 A·U·M 단축키는 현재 로봇에 적용하고 입력·숨김·반복 키에서는 실행하지 않는다', async ({ page }) => {
    await setup(page);
    await page.keyboard.press('a');
    await expect(page.locator('[data-pts-row]')).toHaveCount(1);
    const original = await currentPose(page);
    await page.evaluate(() => {
        const a = window.__pts, r = a.state.activeProgramRobot;
        a.setJointAngle(r.userData.joints[0], r.userData.joints[0].angle + 10, false);
        r.updateMatrixWorld(true);
    });
    const changed = await currentPose(page);
    await page.keyboard.press('u');
    expect((await page.evaluate(() => window.__pts.getPositionPointRecords()[0])).values).toEqual(changed.record.values);
    await page.keyboard.press('Control+z');
    expect((await page.evaluate(() => window.__pts.getPositionPointRecords()[0])).values).toEqual(original.record.values);
    await page.keyboard.press('m');
    await expect.poll(() => page.evaluate(() => Boolean(window.__pts.getMotionSession(window.__pts.state.activeProgramRobot)))).toBe(false);
    const moved = await currentPose(page);
    moved.record.values.forEach((v, i) => expect(v).toBeCloseTo(original.record.values[i], 3));
    const label = page.locator('[data-pts-edit-field="label"]');
    await label.click(); await page.keyboard.press('F2');
    await page.locator('[data-pts-cell-editor]').fill('');
    await page.keyboard.type('ArmUpdateMove');
    await expect(page.locator('[data-pts-cell-editor]')).toHaveValue('ArmUpdateMove');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-pts-row]')).toHaveCount(1);
    await page.locator('#position-points-panel').dispatchEvent('keydown', { key: 'a', code: 'KeyA', repeat: true });
    await expect(page.locator('[data-pts-row]')).toHaveCount(1);
    await page.locator('#position-points-panel [data-panel-action="hide"]').click();
    await page.keyboard.press('a');
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords().length)).toBe(1);
});

test('P.pts 범위의 Ctrl+C·V 복사·붙여넣기는 정밀값을 보존하고 Ctrl+Z·Y로 한 번에 되돌린다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await setup(page);
    await page.locator('[data-pts-new]').click(); await page.locator('[data-pts-new]').click();
    const original = await page.evaluate(() => window.__pts.getPositionPointRecords());
    const first = page.locator('[data-pts-row]').first();
    await first.locator('[data-pts-edit-field="externalAxes"][data-pts-edit-index="0"]').click();
    await page.evaluate(() => navigator.clipboard.writeText('12.123456789\t23.234567891\r\n34.345678912\t45.456789123\r\n'));
    await page.keyboard.press('Control+v');
    const pasted = await page.evaluate(() => window.__pts.getPositionPointRecords());
    expect(pasted[0].externalAxes.slice(0, 2)).toEqual([12.123456789, 23.234567891]);
    expect(pasted[1].externalAxes.slice(0, 2)).toEqual([34.345678912, 45.456789123]);
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords())).toEqual(original);
    await page.keyboard.press('Control+y');
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords())).toEqual(pasted);
    await first.locator('[data-pts-edit-field="externalAxes"][data-pts-edit-index="0"]').click();
    await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Control+c');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('12.123456789\t23.234567891\r\n34.345678912\t45.456789123');
    await page.evaluate(() => navigator.clipboard.writeText('7\t8\n9\tNaN'));
    await page.keyboard.press('Control+v');
    await expect(page.locator('[data-pts-error]')).not.toBeEmpty();
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords())).toEqual(pasted);
    await page.screenshot({ path: 'tmp/position-points-shortcuts.png' });
});

test('가져온 P.pts의 붙여넣기와 번호 편집도 Ctrl+Z·Y로 복원하며 메타데이터를 보존한다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await setup(page);
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.evaluate(async () => window.__pts.handleOlpFolderImport([
        new File(['Start\nEnd'], 'main.pro'), new File(['P[7]=1,2,3,4,5,6;0,0,0,1;10,20,30,40,50,60;Name=Original;User=Keep;\nLP[7]=1,2,3,4,5,6;0,0,0,1;10,20,30,40,50,60;Name=Local;'], 'P.pts')
    ], { connectBus: false }));
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    const original = await page.evaluate(() => window.__pts.getOlpProject().files.get('P.pts').text);
    await page.locator('[data-pts-row="P:7"] [data-pts-edit-field="externalAxes"][data-pts-edit-index="0"]').click();
    await page.evaluate(() => navigator.clipboard.writeText('11\t22\n33\t44'));
    await page.keyboard.press('Control+v');
    const edited = await page.evaluate(() => window.__pts.getOlpProject().files.get('P.pts').text);
    expect(edited).not.toBe(original); expect(edited).toContain('User=Keep;');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => window.__pts.getOlpProject().files.get('P.pts').text)).toBe(original);
    await page.keyboard.press('Control+y');
    expect(await page.evaluate(() => window.__pts.getOlpProject().files.get('P.pts').text)).toBe(edited);
    await editCell(page, 'P:7', 'index', null, '8');
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-pts-row="P:7"]')).toHaveCount(1);
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('[data-pts-row="P:8"]')).toHaveCount(1);
});

test('붙여넣기 중 뒤 행의 도달 범위 검증이 실패하면 앞 행과 실행 취소 기록도 보존한다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await setup(page);
    await page.locator('[data-pts-new]').click(); await page.locator('[data-pts-new]').click();
    const original = await page.evaluate(() => ({ records: window.__pts.getPositionPointRecords(), undo: window.__pts.state.undoStack.length }));
    const pose = await currentPose(page), [x, y, z] = original.records[0].values;
    await page.locator('[data-pts-row]').first().locator('[data-pts-edit-field="values"][data-pts-edit-index="0"]').click();
    await page.evaluate(text => navigator.clipboard.writeText(text), `${x}\t${y}\t${z + 1}\n999999\t${y}\t${z}`);
    await page.keyboard.press('Control+v');
    await expect(page.locator('[data-pts-error]')).not.toBeEmpty();
    expect(await page.evaluate(() => ({ records: window.__pts.getPositionPointRecords(), undo: window.__pts.state.undoStack.length }))).toEqual(original);
    expect(await currentPose(page)).toEqual(pose);
});

test('P.pts가 없는 OLP에서도 A로 파일을 생성하고 Ctrl+Z·Y로 추가를 되돌릴 수 있다', async ({ page }) => {
    await setup(page);
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.evaluate(async () => window.__pts.handleOlpFolderImport([new File(['Start\nEnd'], 'main.pro')], { connectBus: false }));
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.keyboard.press('a');
    await expect(page.locator('[data-pts-row]')).toHaveCount(1);
    expect(await page.evaluate(() => window.__pts.getOlpProject().files.has('P.pts'))).toBe(true);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-pts-row]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pts.getOlpProject().files.has('P.pts'))).toBe(false);
    await page.keyboard.press('Control+y');
    await expect(page.locator('[data-pts-row]')).toHaveCount(1);
    expect(await page.evaluate(() => window.__pts.getOlpProject().files.has('P.pts'))).toBe(true);
});

test('위치 표의 모든 헤더는 중앙 정렬하고 데이터 셀 정렬은 유지한다', async ({ page }) => {
    await setup(page);
    await page.locator('[data-pts-new]').click();
    const panel = page.locator('#position-points-panel');
    expect(await panel.locator('th').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).textAlign))).toEqual(Array(18).fill('center'));
    await expect(panel.locator('td').nth(0)).toHaveCSS('text-align', 'left');
    await expect(panel.locator('td').nth(2)).toHaveCSS('text-align', 'right');
});

test('Windows 방식 Shift·Ctrl 클릭으로 행을 범위·추가·해제 선택하고 선택한 행만 복사·붙여넣는다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await setup(page);
    for (let i = 0; i < 4; i++) await page.locator('[data-pts-new]').click();
    const row = index => page.locator('[data-pts-row]').filter({ hasText: `P[${index}]` });
    const cell = (index, column) => row(index).locator('td').nth(column);
    const selected = () => page.locator('[data-pts-row][aria-selected="true"]').evaluateAll(rows => rows.map(row => row.cells[0].textContent));
    await cell(100, 2).click();
    await cell(110, 5).click({ modifiers: ['Shift'] });
    expect(await selected()).toEqual(['P[100]', 'P[101]', 'P[110]']);
    await expect(page.locator('td.cell-selected')).toHaveCount(54);
    await expect(page.locator('[data-pts-update]')).toBeDisabled();
    await expect(page.locator('[data-pts-move]')).toBeDisabled();
    await cell(111, 5).click({ modifiers: ['Control'] });
    expect(await selected()).toHaveLength(4);
    await cell(101, 4).click({ modifiers: ['Control'] });
    expect(await selected()).toEqual(['P[100]', 'P[110]', 'P[111]']);
    await cell(100, 6).click({ modifiers: ['Control'] });
    expect(await selected()).toEqual(['P[110]', 'P[111]']);
    await cell(110, 2).click({ modifiers: ['Shift'] });
    expect(await selected()).toEqual(['P[100]', 'P[101]', 'P[110]']);
    await cell(111, 4).click({ modifiers: ['Control', 'Shift'] });
    expect(await selected()).toHaveLength(4);
    await cell(101, 2).click();
    expect(await selected()).toEqual(['P[101]']);
    await expect(page.locator('td.cell-selected')).toHaveCount(1);
    await cell(101, 3).click({ modifiers: ['Control'] });
    expect(await selected()).toEqual([]);
    await expect(page.locator('[data-pts-update]')).toBeDisabled();
    await cell(111, 12).click({ modifiers: ['Control'] });
    expect(await selected()).toEqual(['P[111]']);
    await expect(page.locator('[data-pts-update]')).toBeEnabled();
    await cell(100, 12).click({ modifiers: ['Shift'] });
    await cell(101, 13).click({ modifiers: ['Control'] });
    await cell(110, 12).click({ modifiers: ['Control'] });
    expect(await selected()).toEqual(['P[100]', 'P[111]']);
    const original = await page.evaluate(() => window.__pts.getPositionPointRecords());
    await page.evaluate(() => navigator.clipboard.writeText('12.3456789'));
    await page.keyboard.press('Control+v');
    const pasted = await page.evaluate(() => window.__pts.getPositionPointRecords());
    expect(pasted.map(p => p.externalAxes[0])).toEqual([12.3456789, 0, 0, 12.3456789]);
    expect(await selected()).toEqual(['P[100]', 'P[111]']);
    await page.keyboard.press('Control+c');
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/).map(line => line.split('\t'));
    expect(copied.map(cells => cells[0])).toEqual(['100', '111']);
    expect(copied.map(cells => cells.length)).toEqual([18, 18]);
    expect(copied.map(cells => cells[12])).toEqual(['12.3456789', '12.3456789']);
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords())).toEqual(original);
    await page.keyboard.press('Control+y');
    expect(await page.evaluate(() => window.__pts.getPositionPointRecords())).toEqual(pasted);
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#position-points-panel [data-panel-action="popout"]').click();
    const popup = await popupPromise;
    await expect(popup.locator('#position-points-panel')).toHaveCSS('display', 'flex');
    await expect(popup.locator('th').first()).toHaveCSS('text-align', 'center');
    await expect(popup.locator('[data-pts-row][aria-selected="true"]')).toHaveCount(2);
    await popup.locator('[data-pts-row]').filter({ hasText: 'P[100]' }).locator('td').first().click({ modifiers: ['Control'] });
    await expect(popup.locator('[data-pts-row][aria-selected="true"]')).toHaveCount(1);
    await popup.screenshot({ path: 'tmp/position-points-windows-selection.png' });
    await popup.locator('[data-panel-action="hide"]').click();
});
