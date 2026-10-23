import { test, expect } from '@playwright/test';

async function openSimulation(page, model = 'IR-S7-60Z20') {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + '\nwindow.__teach={state,THREE,ensureMotionProgram,captureRobotMotionStep,showMotionProgramPanel,renderMotionProgramPanel,requestRender,teachingPointWorldPose,collectTeachingPoints,getRobotControllerBaseFrame,getCurrentTcpPoseBase,setJointAngle,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,handleOlpFolderImport,renderOlpSelectedFile,getOlpProject,applyRobotTravelAxis,selectTeachingPoint,updateTeachingPointDisplay};' });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__teach?.state.workspaceRecovery.ready);
    if (!model) return;
    await page.locator('#model-select').selectOption(`robot:${model}`);
    await page.waitForFunction(() => window.__teach.state.activeProgramRobot?.userData.tcpFrame);
    await page.evaluate(() => window.__teach.showMotionProgramPanel());
}

test('티칭 위치·가려진 위치·텍스트 표시는 기본으로 켜지고 포인트가 자동 표시된다', async ({ page }) => {
    await openSimulation(page, null);
    await expect(page.locator('#program-toggle-teaching-points')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#teaching-point-labels')).toBeChecked();
    await expect(page.locator('#teaching-point-xray')).toBeChecked();
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__teach.state.activeProgramRobot?.userData.tcpFrame);
    await page.evaluate(() => {
        const a = window.__teach, robot = a.state.activeProgramRobot, program = a.ensureMotionProgram(robot);
        program.steps = [a.captureRobotMotionStep(robot)];
        a.showMotionProgramPanel(); a.renderMotionProgramPanel(); a.requestRender();
    });
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene?.points.length)).toBe(1);
    await expect(page.locator('#teaching-point-controls')).toBeVisible();
});

test('티칭 글자는 선택 전후에 텍스처와 같은 비율로 표시된다', async ({ page }) => {
    await openSimulation(page);
    const ratios = await page.evaluate(() => {
        const a = window.__teach, r = a.state.activeProgramRobot, p = a.ensureMotionProgram(r);
        const first = a.captureRobotMotionStep(r); first.label = '긴 라벨 Pickup Position';
        p.steps = [first]; p.selectedStepId = first.id; a.state.teachingPoints.enabled = true;
        const ratios = [];
        for (const labelMode of ['id', 'label', 'both']) {
            a.state.teachingPoints.labelMode = labelMode; a.updateTeachingPointDisplay();
            const scene = a.state.teachingPoints.scene;
            ratios.push(...[...scene.labels, scene.detailLabel].filter(Boolean).map(label => ({
                texture: label.material.map.image.width / label.material.map.image.height,
                sprite: label.scale.x / label.scale.y
            })));
        }
        return ratios;
    });
    for (const ratio of ratios) expect(ratio.sprite).toBeCloseTo(ratio.texture, 7);
});

test('티칭 마커 선택·편집·삭제·복구는 원본과 로봇 자세를 보존한다', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openSimulation(page);
    await page.evaluate(() => {
        const a = window.__teach, r = a.state.activeProgramRobot, p = a.ensureMotionProgram(r);
        const first = a.captureRobotMotionStep(r); first.label = 'Pick';
        const second = { ...structuredClone(first), id: 'second', pointIndex: 1, label: 'Place' };
        second.tcp.position[0] += 100;
        p.steps = [first, second]; p.selectedStepId = first.id;
        a.renderMotionProgramPanel(); a.requestRender();
    });
    await expect(page.locator('#program-toggle-teaching-points')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene?.points.length)).toBe(2);
    await expect(page.locator('#teaching-point-select, #teaching-point-details')).toHaveCount(0);
    const initial = await page.evaluate(() => {
        const a = window.__teach, r = a.state.activeProgramRobot;
        return { joints: r.userData.joints.map(j => j.angle), steps: JSON.stringify(a.ensureMotionProgram(r).steps),
            position: a.state.teachingPoints.scene.points[0].position.toArray(),
            expected: r.userData.tcpFrame.getWorldPosition(new a.THREE.Vector3()).toArray() };
    });
    expect(Math.hypot(...initial.position.map((v, i) => v - initial.expected[i]))).toBeLessThan(0.01);
    await page.locator('[data-program-step-id="second"] .program-step-line-number').click();
    expect(await page.evaluate(() => window.__teach.ensureMotionProgram(window.__teach.state.activeProgramRobot).selectedStepId)).toBe('second');
    await page.locator('#teaching-point-label-mode').selectOption('both');
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene.detailLabel?.userData.text)).toBe('P[1] · Place');
    await page.locator('#teaching-point-xray').check();
    await page.locator('#teaching-point-fit').click();
    await page.waitForTimeout(100);
    const location = await page.evaluate(() => {
        const a = window.__teach, s = a.state.teachingPoints.scene, rect = a.state.renderer.domElement.getBoundingClientRect();
        const p = s.points[0].position.clone().project(a.state.camera);
        return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2,
            camera: a.state.camera.position.toArray(), target: a.state.controls.target.toArray() };
    });
    await page.locator('#program-panel').evaluate(panel => { panel.style.visibility = 'hidden'; });
    await page.mouse.click(location.x, location.y);
    await page.locator('#program-panel').evaluate(panel => { panel.style.visibility = ''; });
    const viewAfter = await page.evaluate(() => ({ camera: window.__teach.state.camera.position.toArray(), target: window.__teach.state.controls.target.toArray() }));
    for (const key of ['camera', 'target']) viewAfter[key].forEach((value, index) => expect(value).toBeCloseTo(location[key][index], 7));
    expect(await page.evaluate(() => window.__teach.ensureMotionProgram(window.__teach.state.activeProgramRobot).selectedStepId)).not.toBe('second');
    const after = await page.evaluate(() => {
        const a = window.__teach, r = a.state.activeProgramRobot;
        return { joints: r.userData.joints.map(j => j.angle), steps: JSON.stringify(a.ensureMotionProgram(r).steps) };
    });
    expect(after.joints).toEqual(initial.joints); expect(after.steps).toEqual(initial.steps);
    await page.screenshot({ path: '.codex/teaching-points-ui.png' });
    const restored = await page.evaluate(async () => {
        const a = window.__teach, snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        await a.restoreWorkspaceSnapshot(snapshot); a.requestRender();
        return snapshot.teachingPoints;
    });
    expect(restored).toEqual({ enabled: true, labels: true, xray: true, labelMode: 'both' });
    await expect(page.locator('#teaching-point-label-mode')).toHaveValue('both');
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene?.points.length)).toBe(2);
    await page.evaluate(() => {
        const a = window.__teach, p = a.ensureMotionProgram(a.state.activeProgramRobot);
        p.steps[0].tcp.position[0] += 25; p.steps.splice(1, 1); a.requestRender();
    });
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene?.points.length)).toBe(1);
    await page.locator('#program-toggle-teaching-points').click();
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene === null)).toBe(true);
    expect(errors).toEqual([]);
});

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) test(`OLP P·LP·JP 표시와 좌표 변환 (${model})`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openSimulation(page, model);
    const result = await page.evaluate(async () => {
        const a = window.__teach, r = a.state.activeProgramRobot;
        r.userData.joints.forEach((joint, i) => a.setJointAngle(joint, [20, -40, -30, 10, 15, -20][i], false));
        const joints = r.userData.joints.map(j => j.angle);
        await a.handleOlpFolderImport([
            new File(['Start\nEnd'], 'main.pro', { type: 'text/plain' }),
            new File(['P[0]=500,100,50,20,0,0;0,0,0,1;0,0,0,0,0,0;Name=Pick;\nLP[0]=600,100,50,0,0,0;0,0,0,1;0,0,0,0,0,0;Name=Place;'], 'P.pts', { type: 'text/plain' }),
            new File([`JP[0]=${joints.join(',')};`], 'JP.pts', { type: 'text/plain' })
        ]);
        a.state.olp.selectedFile = 'P.pts'; a.renderOlpSelectedFile();
        a.state.teachingPoints.enabled = true; a.updateTeachingPointDisplay();
        const p = a.state.teachingPoints.scene.points;
        const keys = p.map(point => point.key);
        const world = p[0].position.toArray();
        const expected = a.getRobotControllerBaseFrame(r).localToWorld(new a.THREE.Vector3(500, 100, 50)).toArray();
        a.state.olp.selectedFile = 'JP.pts'; a.renderOlpSelectedFile(); a.updateTeachingPointDisplay();
        const jp = a.state.teachingPoints.scene.points[0];
        const actualTcp = r.userData.tcpFrame.getWorldPosition(new a.THREE.Vector3());
        const jpError = jp.position.distanceTo(actualTcp);
        const jpRotationError = jp.quaternion.angleTo(r.userData.tcpFrame.getWorldQuaternion(new a.THREE.Quaternion()));
        const finalJoints = r.userData.joints.map(j => j.angle);
        a.state.olp.selectedFile = 'P.pts'; a.renderOlpSelectedFile(); a.updateTeachingPointDisplay();
        return { keys, world, expected, jpError, jpRotationError, joints, finalJoints };
    });
    expect(new Set(result.keys).size).toBe(2); expect(result.world).toEqual(result.expected);
    expect(result.jpError).toBeLessThan(0.01); expect(result.jpRotationError).toBeLessThan(0.0001);
    expect(result.finalJoints).toEqual(result.joints);
    await page.locator('[data-olp-point-row]').nth(1).click();
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene.detailLabel?.userData.text)).toBe('LP[0]');
    expect(errors).toEqual([]);
});

test('재배치·외부 축·회전 Wobj의 티칭 위치와 다국어 표시', async ({ page }) => {
    await openSimulation(page);
    const result = await page.evaluate(() => {
        const a = window.__teach, r = a.state.activeProgramRobot, p = a.ensureMotionProgram(r);
        const step = a.captureRobotMotionStep(r);
        step.tcp.position = [10, 20, 30]; step.externalAxes = [50, 0, 0, 0, 0, 90];
        r.position.set(100, 200, 0); r.quaternion.setFromAxisAngle(new a.THREE.Vector3(0, 0, 1), Math.PI / 2);
        r.updateMatrixWorld(true);
        const point = a.collectTeachingPoints(r.userData.motionInstanceId, [step]).points[0];
        const root = new a.THREE.Matrix4().compose(new a.THREE.Vector3(150, 200, 0),
            new a.THREE.Quaternion().setFromAxisAngle(new a.THREE.Vector3(0, 0, 1), Math.PI), r.scale);
        const frame = a.getRobotControllerBaseFrame(r);
        const localFrame = new a.THREE.Matrix4().compose(frame.position, frame.quaternion, frame.scale);
        const expected = new a.THREE.Vector3(10, 20, 30).applyMatrix4(root.multiply(localFrame));
        const externalError = a.teachingPointWorldPose(r, point).position.distanceTo(expected);
        r.userData.activeWorkObjectIndex = 1;
        Object.assign(r.userData.workObjects[1], { defined: true, position: [200, 300, 400], rotation: [0, 0, 90] });
        const workExpected = new a.THREE.Vector3(180, 310, 430);
        const workError = a.teachingPointWorldPose(r, point).position.distanceTo(workExpected);
        const olp = { source: 'P.pts', joint: false, record: { values: [10, 20, 30, 0, 0, 0], externalAxes: step.externalAxes } };
        const olpError = a.teachingPointWorldPose(r, olp).position.distanceTo(workExpected);
        p.steps = [step]; p.selectedStepId = step.id; a.state.teachingPoints.enabled = true; a.requestRender();
        return { externalError, workError, olpError };
    });
    expect(result.externalError).toBeLessThan(0.01); expect(result.workError).toBeLessThan(0.01); expect(result.olpError).toBeLessThan(0.01);
    await page.locator('#inorobot-language-select').selectOption('en');
    await expect(page.locator('#program-toggle-teaching-points')).toContainText('Teaching positions');
    await expect(page.locator('#teaching-point-label-mode option[value="both"]')).toHaveText('Both');
    await expect(page.locator('#teaching-point-controls')).not.toContainText('legacy.');
});

test('OLP ID·라벨 표시 선택은 기본 이름 중복을 없애고 작은 도구 모음으로 유지된다', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openSimulation(page, 'IR-R10H-120');
    await page.evaluate(async () => {
        const a = window.__teach;
        await a.handleOlpFolderImport([
            new File(['Start\nEnd'], 'main.pro', { type: 'text/plain' }),
            new File(['P[0]=400,100,500,0,0,0;\nP[1]=450,100,500,0,0,0;Name=픽업 위치;'], 'P.pts', { type: 'text/plain' })
        ]);
        a.state.olp.selectedFile = 'P.pts'; a.renderOlpSelectedFile();
        a.state.teachingPoints.enabled = true; a.requestRender();
    });
    await expect(page.locator('#teaching-point-controls')).toBeVisible();
    await expect(page.locator('#teaching-point-select, #teaching-point-details')).toHaveCount(0);
    const controls = await page.locator('#teaching-point-controls').boundingBox();
    expect(controls.height).toBeLessThan(100);
    await page.locator('[data-olp-point-row]').nth(0).click();
    await page.locator('#teaching-point-label-mode').selectOption('both');
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene.detailLabel?.userData.text)).toBe('P[0]');
    expect(await page.evaluate(() => window.__teach.getOlpProject().pointFiles[0].records[0].name)).toBe('P0');
    await page.locator('#teaching-point-label-mode').selectOption('label');
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene.detailLabel)).toBeNull();
    expect(await page.evaluate(() => window.__teach.state.teachingPoints.scene.selection.visible)).toBe(true);
    await page.locator('[data-olp-point-row]').nth(1).click();
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene.detailLabel?.userData.text)).toBe('픽업 위치');
    await page.locator('#teaching-point-label-mode').selectOption('id');
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene.detailLabel?.userData.text)).toBe('P[1]');
    await page.locator('#teaching-point-label-mode').selectOption('both');
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene.detailLabel?.userData.text)).toBe('P[1] · 픽업 위치');
    await page.locator('#teaching-point-fit').click();
    await page.screenshot({ path: '.codex/teaching-labels-ui.png' });
    await page.locator('#teaching-point-labels').uncheck();
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene.detailLabel.visible)).toBe(false);
    expect(errors).toEqual([]);
});

test('같은 위치의 포인트는 정보 목록 없이 반복 클릭하여 각각 선택한다', async ({ page }) => {
    await openSimulation(page);
    await page.evaluate(() => {
        const a = window.__teach, r = a.state.activeProgramRobot, p = a.ensureMotionProgram(r);
        const first = a.captureRobotMotionStep(r); first.id = 'overlap-first';
        const second = { ...structuredClone(first), id: 'overlap-second', pointIndex: 1 };
        p.steps = [first, second]; p.selectedStepId = first.id;
        a.state.teachingPoints.enabled = true; a.state.teachingPoints.xray = true;
        a.renderMotionProgramPanel(); a.requestRender();
    });
    await expect.poll(() => page.evaluate(() => window.__teach.state.teachingPoints.scene?.points.length)).toBe(2);
    await page.locator('#teaching-point-fit').click();
    await page.locator('#program-panel').evaluate(panel => { panel.style.visibility = 'hidden'; });
    const at = await page.evaluate(() => {
        const a = window.__teach, rect = a.state.renderer.domElement.getBoundingClientRect();
        const p = a.state.teachingPoints.scene.points[0].position.clone().project(a.state.camera);
        return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
    });
    for (const id of ['overlap-second', 'overlap-first']) {
        await page.mouse.click(at.x, at.y);
        await expect.poll(() => page.evaluate(() => window.__teach.ensureMotionProgram(window.__teach.state.activeProgramRobot).selectedStepId)).toBe(id);
    }
});
