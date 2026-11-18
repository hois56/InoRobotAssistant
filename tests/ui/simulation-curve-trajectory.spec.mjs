import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function fillNumber(page, selector, value) {
    const input = page.locator(selector);
    await input.click(); // Shared numeric editing changes the input type on focus.
    await input.fill(value);
    await input.blur();
    await expect(input).toHaveValue(value);
}

async function setup(page, model = 'IR-S7-60Z20') {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
window.__curveTest = { THREE, state, setJointAngle, captureRobotMotionStep, ensureMotionProgram, getCurrentTcpPoseBase,
getRobotControllerBaseFrame, curveTrajectoryApp, collectCurveTrajectoryFeatures, applyCurveTrajectory, captureSceneSnapshot, undoLastAction,
createPrimitiveShapeRoot, serializeMotionProject, openViewWindow, getPositionPointRecords, formatPositionPointRecord,
buildCurvePositionData, motionStepTargetPose, handleOlpFolderImport, getOlpProject, restorePositionPointHistory };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__curveTest);
    await page.waitForFunction(() => window.__curveTest.state.workspaceRecovery.ready);
    await page.selectOption('#model-select', `robot:${model}`);
    await page.waitForFunction(() => window.__curveTest.state.models.some(m => m.userData.tcpFrame));
    await expect(page.locator('#model-select')).toHaveValue('');
    const initialState = await page.evaluate(() => {
        const a = window.__curveTest, robot = a.state.models.find(m => m.userData.tcpFrame);
        const initial = robot.userData.joints.length === 4 ? [-30, 70, -50, -40] : [20, -35, 60, 15, 35, 20];
        initial.forEach((angle, i) => a.setJointAngle(robot.userData.joints[i], angle, false));
        const pose = a.getCurrentTcpPoseBase(robot), base = a.getRobotControllerBaseFrame(robot);
        const curve = new a.THREE.Group();
        curve.name = 'Trajectory fixture'; curve.userData.modelName = curve.name;
        curve.userData.sketchProfiles = [{ id: 'line', type: 'line', start: [0, 0], end: [-30, 30] }];
        curve.add(new a.THREE.Line(new a.THREE.BufferGeometry().setFromPoints([new a.THREE.Vector3(), new a.THREE.Vector3(-30, 30, 0)]), new a.THREE.LineBasicMaterial({ color: 0xffffff })));
        curve.position.copy(base.localToWorld(pose.position.clone()));
        curve.quaternion.copy(base.getWorldQuaternion(new a.THREE.Quaternion()));
        a.state.scene.add(curve); a.state.models.push(curve);
        const program = a.ensureMotionProgram(robot);
        const prior = a.captureRobotMotionStep(robot, { motion: 'MOVJ', pointIndex: 1 });
        program.steps = [prior]; a.state.activeProgramRobot = robot;
        program.positions = [a.captureRobotMotionStep(robot, { motion: 'MOVJ', pointIndex: 2, label: 'Reserved' })];
        document.getElementById('program-panel').classList.remove('panel-user-hidden');
        return { initial, first: pose.position.toArray(), prior: prior.id };
    });
    await page.locator('#program-curve-trajectory').click();
    return initialState;
}

async function clickFixtureCurve(page) {
    const point = await page.evaluate(() => {
        const a = window.__curveTest, model = a.state.models.find(m => m.userData.sketchProfiles);
        // The fixture starts at the TCP flange. Hide the wrist while selecting this test curve.
        a.state.activeProgramRobot.visible = false;
        model.updateWorldMatrix(true, true);
        const center = model.localToWorld(new a.THREE.Vector3(-15, 15, 0));
        a.state.camera.position.copy(center).add(new a.THREE.Vector3(50, -180, -250));
        a.state.controls.target.copy(center); a.state.controls.update();
        a.state.camera.updateMatrixWorld(true);
        const p = center.project(a.state.camera), rect = a.state.renderer.domElement.getBoundingClientRect();
        return { x: rect.left + (1 + p.x) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(1);
    await page.evaluate(() => { window.__curveTest.state.activeProgramRobot.visible = true; });
}

for (const locale of ['ko', 'en']) test(`${locale}: 숫자 설정을 클릭하고 편집해도 입력칸과 주변 배치를 유지한다`, async ({ page }, testInfo) => {
    await setup(page);
    await page.evaluate(locale => window.InoRobotI18n.setLocale(locale), locale);
    const layout = input => input.evaluate(element => {
        const grid = element.closest('.trajectory-settings'), origin = grid.getBoundingClientRect();
        const rect = node => {
            const box = node.getBoundingClientRect();
            return [box.x - origin.x, box.y - origin.y, box.width, box.height].map(value => Math.round(value * 100) / 100);
        };
        return { grid: [origin.width, origin.height], fields: [...grid.querySelectorAll('label, input, select')].map(rect) };
    });
    const checkInput = async input => {
        const before = await layout(input);
        await input.click();
        await expect(input).toHaveAttribute('type', 'text');
        expect(await layout(input), await input.getAttribute('id')).toEqual(before);
        await input.fill(await input.getAttribute('id') === 'trajectory-first' ? '100' : '5');
        expect(await layout(input), '값 입력 중 배치').toEqual(before);
        await input.blur();
        await expect(input).toHaveAttribute('type', 'number');
        expect(await layout(input), '입력 종료 후 배치').toEqual(before);
    };
    await checkInput(page.locator('#trajectory-step'));
    await checkInput(page.locator('#trajectory-first'));
    await page.locator('#curve-trajectory-panel summary').click();
    for (const input of await page.locator('#curve-trajectory-panel details input:not([type=checkbox])').all()) await checkInput(input);
    await page.locator('#trajectory-step').click();
    await page.locator('#curve-trajectory-panel').screenshot({ path: testInfo.outputPath(`stable-numeric-settings-${locale}.png`) });
});

async function setupBox(page) {
    await setup(page);
    return page.evaluate(() => {
        const a = window.__curveTest;
        const box = a.createPrimitiveShapeRoot('box', { x: 160, y: 120, z: 100 }, { name: 'Click edges' });
        box.position.set(1500, 0, 200); a.state.scene.add(box); a.state.models.push(box);
        a.state.camera.position.set(1850, -500, 550); a.state.controls.target.set(1500, 0, 250); a.state.controls.update();
        a.state.camera.updateMatrixWorld(true);
        a.curveTrajectoryApp.close(); a.curveTrajectoryApp.open();
        const curves = a.collectCurveTrajectoryFeatures(box);
        const z = Math.max(...curves.flatMap(c => c.points.map(p => p[2])));
        const y = Math.min(...curves.flatMap(c => c.points.map(p => p[1])));
        const bottom = Math.min(...curves.flatMap(c => c.points.map(p => p[2])));
        const back = Math.max(...curves.flatMap(c => c.points.map(p => p[1])));
        const front = curves.find(c => c.points.every(p => Math.abs(p[2] - z) < 0.01 && Math.abs(p[1] - y) < 0.01));
        const side = curves.find(c => c !== front && c.points.every(p => Math.abs(p[2] - z) < 0.01) && c.points.some(p => p.every((v,i) => Math.abs(v - front.points[1][i]) < 0.01)));
        const hidden = curves.find(c => c.points.every(p => Math.abs(p[2] - bottom) < 0.01 && Math.abs(p[1] - back) < 0.01));
        const rect = a.state.renderer.domElement.getBoundingClientRect();
        const screen = (curve, ratio = 0.5) => { const p = new a.THREE.Vector3(...curve.points[0]).lerp(new a.THREE.Vector3(...curve.points.at(-1)), ratio).project(a.state.camera);
            return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }; };
        const topCenter = new a.THREE.Vector3(1500, 0, z).project(a.state.camera);
        return { front: screen(front), side: screen(side), hidden: screen(hidden, 0.25), frontWorld: front.points,
            face: { x: rect.left + (topCenter.x + 1) * rect.width / 2, y: rect.top + (1 - topCenter.y) * rect.height / 2 },
            hiddenWorld: hidden.points,
            camera: a.state.camera.position.toArray(), selectedModel: a.state.selectedModel?.uuid };
    });
}

test('선택한 곡선은 두꺼운 강조선으로 유지하고 순서 표시는 작게 표시한다', async ({ page }, testInfo) => {
    const points = await setupBox(page);
    await page.mouse.click(points.front.x, points.front.y);
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => window.__curveTest.state.scene.children.find(g => g.userData.curveTrajectoryPreview)
        ?.children.filter(child => child.userData.trajectoryHighlight === 'selected')
        .every(line => line.material.resolution.x > 100 && line.material.resolution.y > 100));
    const visuals = await page.evaluate(() => {
        const a = window.__curveTest, group = a.state.scene.children.find(g => g.userData.curveTrajectoryPreview);
        const lines = group.children.filter(child => child.userData.trajectoryHighlight === 'selected');
        const marker = group.children.find(child => child.isSprite);
        const height = a.state.renderer.domElement.getBoundingClientRect().height;
        return { widths: lines.map(line => line.material.linewidth), resolutions: lines.map(line => line.material.resolution.toArray()),
            markerPixels: marker.scale.y * a.state.camera.projectionMatrix.elements[5] * height / 2 };
    });
    expect(Math.max(...visuals.widths)).toBeGreaterThanOrEqual(3);
    expect(visuals.resolutions.every(([width, height]) => width > 100 && height > 100)).toBe(true);
    expect(visuals.markerPixels).toBeGreaterThanOrEqual(16);
    expect(visuals.markerPixels).toBeLessThanOrEqual(24);
    await page.screenshot({ path: testInfo.outputPath('compact-selected-curve.png') });
});

test('면을 클릭하면 외곽선만 연결 순서로 선택하고 다시 클릭하면 해제한다', async ({ page }, testInfo) => {
    const points = await setupBox(page);
    await page.mouse.move(points.face.x, points.face.y);
    await page.mouse.click(points.face.x, points.face.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(4);
    await page.locator('#trajectory-generate').click();
    await expect(page.locator('#trajectory-apply'), await page.locator('#trajectory-status').textContent()).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('selected-face-boundary.png') });
    await page.mouse.click(points.face.x, points.face.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(0);
    await expect(page.locator('#trajectory-apply')).toBeDisabled();
    await page.mouse.click(points.front.x, points.front.y);
    await page.mouse.click(points.face.x, points.face.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(4);
    await page.locator('#trajectory-clear').click();
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(0);
});

for (const kind of ['cad', 'mesh', 'sketch']) test(`${kind} 모델도 변환된 면의 외곽선만 선택한다`, async ({ page }) => {
    await setup(page);
    const points = await page.evaluate(kind => {
        const cadFace = kind === 'cad';
        const a = window.__curveTest, root = new a.THREE.Group();
        root.name = 'Transformed face'; root.userData.modelName = root.name;
        if (kind === 'sketch') root.userData.sketchProfiles = [{ id: 'line', type: 'line', start: [-80,-60], end: [80,-60] }];
        let geometry;
        if (cadFace) {
            const shape = new a.THREE.Shape();
            shape.moveTo(-80, -60); shape.lineTo(80, -60); shape.lineTo(80, 60); shape.lineTo(-80, 60); shape.closePath();
            const hole = new a.THREE.Path(); hole.absarc(0, 0, 20, 0, Math.PI * 2, true); shape.holes.push(hole);
            geometry = new a.THREE.ShapeGeometry(shape, 24);
        } else geometry = new a.THREE.BoxGeometry(160, 120, 100).toNonIndexed();
        const mesh = new a.THREE.Mesh(geometry, new a.THREE.MeshBasicMaterial({ color: 0xaaaaaa, side: a.THREE.DoubleSide }));
        if (cadFace) mesh.userData.stepBrepFaces = [{ first: 0, last: geometry.index.count / 3 - 1 }];
        root.add(mesh); root.position.set(1500, 0, 400); root.rotation.set(0.2, -0.1, 0.3); root.scale.set(1.2, 0.8, 1.3);
        a.state.scene.add(root); a.state.models.push(root); root.updateWorldMatrix(true, true);
        const center = root.localToWorld(new a.THREE.Vector3(0, 0, cadFace ? 0 : 50));
        const normal = new a.THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
        a.state.camera.position.copy(center).addScaledVector(normal, 550);
        a.state.controls.target.copy(center); a.state.controls.update(); a.state.camera.updateMatrixWorld(true);
        const rect = a.state.renderer.domElement.getBoundingClientRect();
        const screen = (x, y) => {
            const p = root.localToWorld(new a.THREE.Vector3(x, y, cadFace ? 0 : 50)).project(a.state.camera);
            return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
        };
        return { face: screen(50, 0), otherTriangle: screen(-50, 0), edge: screen(0, -60) };
    }, kind);
    await page.mouse.click(points.face.x, points.face.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(kind === 'cad' ? 5 : 4);
    await page.mouse.click(points.otherTriangle.x, points.otherTriangle.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(0);
    if (kind === 'sketch') {
        await page.mouse.click(points.face.x, points.face.y);
        await page.mouse.click(points.edge.x, points.edge.y);
        await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(3);
        await page.locator('#trajectory-generate').click();
        await expect(page.locator('#trajectory-apply'), await page.locator('#trajectory-status').textContent()).toBeEnabled();
    }
});

test('3D 모서리를 바로 클릭해 순서대로 선택하고 드래그와 숨은 모서리는 선택하지 않는다', async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const points = await setupBox(page);
    await page.mouse.move(points.front.x, points.front.y);
    expect(await page.evaluate(() => window.__curveTest.state.scene.children
        .find(group => group.userData.curveTrajectoryPreview)?.children.some(child => child.userData.trajectoryHighlight === 'hover'))).toBe(true);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(0);
    await page.mouse.click(points.front.x, points.front.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(1);
    await page.mouse.click(points.side.x, points.side.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(2);
    const selected = await page.evaluate(() => {
        const a = window.__curveTest;
        return { camera: a.state.camera.position.toArray(), selectedModel: a.state.selectedModel?.uuid,
            markers: a.state.scene.children.find(group => group.userData.curveTrajectoryPreview).children.filter(child => child.isSprite).length };
    });
    selected.camera.forEach((value, index) => expect(value).toBeCloseTo(points.camera[index], 6));
    expect(selected.selectedModel).toBe(points.selectedModel);
    expect(selected.markers).toBe(2);
    await page.mouse.move(points.hidden.x, points.hidden.y);
    const hiddenHighlighted = await page.evaluate(points => {
        const a = window.__curveTest;
        return a.state.scene.children.find(group => group.userData.curveTrajectoryPreview).children.some(line => {
            if (!line.userData.trajectoryHighlight) return false;
            const start = new a.THREE.Vector3().fromBufferAttribute(line.geometry.getAttribute('instanceStart'), 0);
            const end = new a.THREE.Vector3().fromBufferAttribute(line.geometry.getAttribute('instanceEnd'), 0);
            return points.every(point => start.distanceTo(new a.THREE.Vector3(...point)) < 0.01 || end.distanceTo(new a.THREE.Vector3(...point)) < 0.01);
        });
    }, points.hiddenWorld);
    expect(hiddenHighlighted).toBe(false);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('direct-3d-curve-selection.png') });
    await page.mouse.click(points.front.x, points.front.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(1);
    await page.mouse.move(points.front.x, points.front.y);
    await page.mouse.down(); await page.mouse.move(points.front.x + 50, points.front.y + 20, { steps: 5 }); await page.mouse.up();
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(1);
    const rotated = await page.evaluate(() => window.__curveTest.state.camera.position.toArray());
    expect(rotated).not.toEqual(selected.camera);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(points.front.x + 80, points.front.y + 40, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(1);
    const panned = await page.evaluate(() => window.__curveTest.state.controls.target.toArray());
    expect(panned).not.toEqual([1500, 0, 250]);
    const beforeZoom = await page.evaluate(() => window.__curveTest.state.camera.position.distanceTo(window.__curveTest.state.controls.target));
    await page.mouse.wheel(0, -120);
    await expect.poll(() => page.evaluate(() => window.__curveTest.state.camera.position.distanceTo(window.__curveTest.state.controls.target))).toBeLessThan(beforeZoom);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#curve-trajectory-panel')).toBeHidden();
    expect(errors).toEqual([]);
});

for (const detached of [false, true]) test(`${detached ? '분리 창' : '페이지'} 고정 뷰도 해당 카메라의 곡선을 클릭해 선택한다`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const fixture = await setupBox(page);
    await page.evaluate(() => {
        const a = window.__curveTest;
        a.state.viewPresets[0] = null; a.openViewWindow(0);
        a.state.camera.position.set(-1000, -1000, 500);
        a.state.controls.target.set(0, 0, 0); a.state.controls.update();
    });
    let popup;
    if (detached) {
        const opened = page.waitForEvent('popup');
        await page.locator('#view-window-popout').click(); popup = await opened;
        popup.on('pageerror', error => errors.push(error.message));
    }
    const viewport = popup || page;
    await expect(viewport.locator('.view-window-canvas')).toBeVisible();
    const point = await page.evaluate(points => {
        const a = window.__curveTest, cell = a.state.viewWindow.cells.get(0);
        cell.camera.updateMatrixWorld(true);
        const p = new a.THREE.Vector3(...points[0]).lerp(new a.THREE.Vector3(...points.at(-1)), 0.5).project(cell.camera);
        const rect = cell.canvas.getBoundingClientRect();
        return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
    }, fixture.frontWorld);
    await viewport.mouse.click(point.x, point.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(1);
    const facePoint = await page.evaluate(() => {
        const a = window.__curveTest, cell = a.state.viewWindow.cells.get(0);
        const p = new a.THREE.Vector3(1500, 0, 300).project(cell.camera), rect = cell.canvas.getBoundingClientRect();
        return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
    });
    await viewport.mouse.click(facePoint.x, facePoint.y);
    await expect(page.locator('#trajectory-curves [data-selected-curve]')).toHaveCount(4);
    await viewport.keyboard.press('Escape');
    await expect(page.locator('#curve-trajectory-panel')).toBeHidden();
    if (popup) await popup.close();
    expect(errors).toEqual([]);
});

test('곡선에서 만든 위치값은 이동 명령을 추가하지 않고 P.pts 목록에 저장한다', async ({ page }) => {
    await setup(page);
    await clickFixtureCurve(page);
    await page.locator('#trajectory-generate').click();
    await page.locator('#trajectory-apply').click();
    await expect(page.locator('#curve-trajectory-panel')).toBeHidden({ timeout: 65000 });
    const program = await page.evaluate(() => window.__curveTest.ensureMotionProgram(window.__curveTest.state.activeProgramRobot));
    expect(program.steps).toHaveLength(1);
    expect(program.positions).toHaveLength(7);
    await expect(page.locator('#position-points-panel')).toBeVisible();
    await expect(page.locator('[data-pts-row]')).toHaveCount(8);
});

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) {
    test(`${model}: 위치 미리보기와 P.pts 저장·내보내기·실행 취소는 이동 명령과 로봇 자세를 보존한다`, async ({ page }, testInfo) => {
        test.setTimeout(90000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        const before = await setup(page, model);
        await expect(page.locator('#curve-trajectory-panel')).not.toContainText('legacy.');
        await page.evaluate(() => window.InoRobotI18n.setLocale('en'));
        await expect(page.locator('#trajectory-generate')).toHaveText('Preview positions');
        await expect(page.locator('#curve-trajectory-panel')).not.toContainText('legacy.');
        await page.evaluate(() => window.InoRobotI18n.setLocale('ko'));
        await expect(page.locator('#curve-trajectory-panel details')).not.toHaveAttribute('open');
        await expect(page.locator('#trajectory-first')).toHaveValue('3');
        await fillNumber(page, '#trajectory-first', '100');
        await clickFixtureCurve(page);
        await page.click('#trajectory-generate');
        await expect(page.locator('#trajectory-apply'), await page.locator('#trajectory-status').textContent()).toBeEnabled();
        await expect(page.locator('#trajectory-values tr')).toHaveCount(6);
        await expect(page.locator('#trajectory-status')).toContainText('P[100] ~ P[105]');
        await page.locator('#trajectory-preview').scrollIntoViewIfNeeded();
        await page.locator('#curve-trajectory-panel').screenshot({ path: testInfo.outputPath('trajectory-panel.png') });
        await page.click('#trajectory-apply');
        await expect(page.locator('#curve-trajectory-panel'), await page.locator('#trajectory-status').textContent()).toBeHidden({ timeout: 65000 });
        const after = await page.evaluate(() => {
            const a = window.__curveTest, robot = a.state.activeProgramRobot;
            return { steps: a.ensureMotionProgram(robot).steps, positions: a.ensureMotionProgram(robot).positions, angles: robot.userData.joints.map(j => j.angle),
                saved: JSON.parse(JSON.stringify(a.serializeMotionProject())).robots[0].positions,
                records: a.getPositionPointRecords(), code: a.ensureMotionProgram(robot).positions.slice(1).map(point => a.formatPositionPointRecord(robot, point)),
                history: a.state.undoStack.at(-1)?.label };
        });
        expect(after.steps).toHaveLength(1);
        expect(after.steps[0].id).toBe(before.prior);
        expect(after.positions).toHaveLength(7);
        expect(after.positions[0].pointIndex).toBe(2);
        expect(after.positions.slice(1).map(s => s.pointIndex)).toEqual([100,101,102,103,104,105]);
        expect(after.code.every((line, index) => line.includes(`P[${100 + index}]`) && line.includes(`Curve_${100 + index}`))).toBe(true);
        const first = after.records.find(record => record.index === 100);
        first.values.slice(0, 3).forEach((value, index) => expect(value).toBeCloseTo(before.first[index], 5));
        expect(after.angles).toEqual(before.initial);
        expect(after.saved.map(s => s.id)).toEqual(after.positions.map(s => s.id));
        expect(after.history).toBe('자동 궤적 생성');
        await page.evaluate(() => { window.showSaveFilePicker = undefined; });
        const downloaded = page.waitForEvent('download');
        await page.locator('[data-pts-export]').click();
        const download = await downloaded;
        expect(download.suggestedFilename()).toBe('P.pts');
        const file = await readFile(await download.path(), 'utf8');
        expect(file).toContain('P[100]'); expect(file).toContain('Curve_105');
        expect(file).not.toContain('MOVL');
        expect(errors).toEqual([]);
        await page.evaluate(() => window.__curveTest.undoLastAction());
        expect(await page.evaluate(() => window.__curveTest.ensureMotionProgram(window.__curveTest.state.activeProgramRobot).steps.map(s => s.id))).toEqual([before.prior]);
        expect(await page.evaluate(() => window.__curveTest.ensureMotionProgram(window.__curveTest.state.activeProgramRobot).positions.map(s => s.pointIndex))).toEqual([2]);
    });
}

test('위치 생성은 도달 범위 밖의 좌표도 저장하며 중복 번호를 덮어쓰지 않는다', async ({ page }) => {
    test.setTimeout(90000);
    const before = await setup(page);
    await clickFixtureCurve(page);
    await fillNumber(page, '#trajectory-first', '1');
    await page.locator('#trajectory-generate').click();
    await expect(page.locator('#trajectory-status')).toContainText('이미 사용 중인');
    await expect(page.locator('#trajectory-apply')).toBeDisabled();
    await fillNumber(page, '#trajectory-first', '9999');
    await page.locator('#trajectory-generate').click();
    await expect(page.locator('#trajectory-apply')).toBeDisabled();
    await fillNumber(page, '#trajectory-first', '100');
    await page.locator('#curve-trajectory-panel summary').click();
    await expect(page.locator('#curve-trajectory-panel details')).toHaveAttribute('open');
    await fillNumber(page, '#trajectory-x', '10000');
    await page.click('#trajectory-generate');
    await page.click('#trajectory-apply');
    await expect(page.locator('#position-points-panel')).toBeVisible();
    const result = await page.evaluate(async () => {
        const a = window.__curveTest, robot = a.state.activeProgramRobot;
        return { records: a.getPositionPointRecords(), steps: a.ensureMotionProgram(robot).steps, angles: robot.userData.joints.map(j => j.angle) };
    });
    expect(result.records.find(record => record.index === 100).values[0]).toBeCloseTo(before.first[0] + 10000, 5);
    expect(result.steps.map(s => s.id)).toEqual([before.prior]);
    expect(result.angles).toEqual(before.initial);
});

test('CAD·스케치의 변환 좌표를 선택 Wobj 기준 위치값으로 변환한다', async ({ page }) => {
    test.setTimeout(90000);
    const before = await setup(page);
    const result = await page.evaluate(async () => {
        const a = window.__curveTest, robot = a.state.activeProgramRobot;
        const box = a.createPrimitiveShapeRoot('box', { x: 20, y: 30, z: 40 });
        box.position.set(1500, 800, 600); box.rotation.z = Math.PI / 2; box.scale.set(2, 1, 1);
        a.state.scene.add(box); a.state.models.push(box);
        const edges = a.collectCurveTrajectoryFeatures(box);
        const lengths = edges.map(c => new a.THREE.Vector3(...c.points[0]).distanceTo(new a.THREE.Vector3(...c.points.at(-1))));
        const sketch = a.state.models.find(m => m.userData.sketchProfiles);
        sketch.userData.sketchOriginOffset = [10, 20, 0]; sketch.rotation.z += Math.PI / 2;
        const expected = sketch.localToWorld(new a.THREE.Vector3(-10, -20, 0)).toArray();
        const actual = a.collectCurveTrajectoryFeatures(sketch)[0].points[0];
        const origin = a.getRobotControllerBaseFrame(robot).localToWorld(a.getCurrentTcpPoseBase(robot).position.clone());
        robot.userData.workObjects[1] = { ...robot.userData.workObjects[1], defined: true, position: [100,200,30], rotation: [0,0,45] };
        robot.userData.activeWorkObjectIndex = 1;
        const route = { robot, points: [origin.clone().add(new a.THREE.Vector3(-20, 20, 0)).toArray()], options: { rotation: [0,0,0], firstIndex: 100 } };
        const data = a.buildCurvePositionData(route);
        const restored = a.getRobotControllerBaseFrame(robot).localToWorld(a.motionStepTargetPose(data.positions[0], robot).position).toArray();
        return { lengths, expected, actual, restored, source: route.points[0], steps: a.ensureMotionProgram(robot).steps.map(s => s.id) };
    });
    expect(result.lengths).toHaveLength(12);
    expect(result.lengths.every(length => Math.abs(length - 40) < 1e-6 || Math.abs(length - 30) < 1e-6)).toBeTruthy();
    result.actual.forEach((value, i) => expect(value).toBeCloseTo(result.expected[i], 5));
    result.restored.forEach((value, index) => expect(value).toBeCloseTo(result.source[index], 5));
    expect(result.steps).toEqual([before.prior]);
});

test('P.pts에서 곡선 생성을 열고 OLP 위치 파일에 추가한 결과를 한 번에 되돌린다', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => {
        const a = window.__curveTest;
        a.curveTrajectoryApp.close();
        await a.handleOlpFolderImport([
            new File(['Start\nEnd'], 'main.pro'),
            new File(['P[7]=1,2,3,4,5,6;0,0,0,0;0,0,0,0,0,0;Name=Original;'], 'P.pts')
        ], { connectBus: false });
    });
    const original = await page.evaluate(() => window.__curveTest.getOlpProject().files.get('P.pts').text);
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    await page.locator('[data-pts-trajectory]').click();
    await expect(page.locator('#curve-trajectory-panel')).toBeVisible();
    await expect(page.locator('#position-points-panel')).toBeHidden();
    await expect(page.locator('#trajectory-first')).toHaveValue('8');
    await clickFixtureCurve(page);
    await page.locator('#trajectory-generate').click();
    await page.locator('#trajectory-apply').click();
    await expect(page.locator('[data-pts-row]')).toHaveCount(7);
    const saved = await page.evaluate(() => {
        const project = window.__curveTest.getOlpProject();
        return { positions: project.files.get('P.pts').text, program: project.files.get('main.pro').text };
    });
    expect(saved.positions).toContain(original.trim());
    expect(saved.positions).toContain('Curve_8');
    expect(saved.positions).toContain('P[13]');
    expect(saved.program.trim()).toBe('Start\nEnd');
    await page.evaluate(() => window.__curveTest.restorePositionPointHistory());
    expect(await page.evaluate(() => window.__curveTest.getOlpProject().files.get('P.pts').text)).toBe(original);
});
