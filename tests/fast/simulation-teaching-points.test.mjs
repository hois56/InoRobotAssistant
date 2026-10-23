import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { collectTeachingPoints, normalizeTeachingPointSettings, formatTeachingPointLabel } from '../../2_3DSimulation/teaching-point-core.mjs';

test('티칭 마커는 이동 포인트만 수집하고 잘못된 좌표를 원점으로 바꾸지 않는다', () => {
    const tcp = { position: [1, 2, 3], quaternion: [0, 0, 0, 1] };
    const result = collectTeachingPoints('r1', [
        { id: 'a', motion: 'MOVJ', pointIndex: 0, tcp }, { id: 'b', motion: 'MOVL', pointIndex: 1, tcp },
        { id: 'c', motion: 'DELAY', tcp }, { id: 'd', motion: 'HOME', tcp },
        { id: 'e', motion: 'MOVJ', pointIndex: 2, tcp: { ...tcp, position: [NaN, 0, 0] } },
        { id: 'f', motion: 'MOVJ', pointIndex: 3, tcp: { ...tcp, quaternion: [0, 0, 0, 0] } }
    ]);
    assert.equal(result.points.length, 2); assert.deepEqual(result.rejected, ['P[2]', 'P[3]']);
});

test('JP 순기구학은 현재 로봇을 변경하지 않고 회전·직선축·TCP를 계산한다', async () => {
    const source = fs.readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
    const THREE = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const sceneSource = fs.readFileSync(new URL('../../2_3DSimulation/teaching-point-scene.mjs', import.meta.url), 'utf8');
    const context = vm.createContext({ THREE });
    vm.runInContext(sceneSource.match(/export function teachingJointMatrix\([^]*?\n\}/)[0].replace('export ', ''), context);
    const robot = new THREE.Group(), base = new THREE.Group(), flange = new THREE.Group(), tcp = new THREE.Group();
    robot.add(base); base.position.set(10, 0, 20);
    const joints = [];
    let parent = base;
    for (const [type, axis, position] of [['revolute', [0, 0, 1], [100, 0, 0]], ['prismatic', [0, 0, 1], [80, 0, 0]]]) {
        const group = new THREE.Group(); group.position.fromArray(position); parent.add(group);
        joints.push({ definition: { type }, group, basePosition: group.position.clone(), axis: new THREE.Vector3(...axis), angle: 0 }); parent = group;
    }
    parent.add(flange); flange.add(tcp); flange.position.set(15, 0, 5); tcp.position.set(4, 3, -10);
    flange.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    robot.userData = { joints, controllerBaseFrame: base, tcpFrame: tcp };
    const before = robot.toJSON();
    const actual = context.teachingJointMatrix(robot, [90, -30]);
    assert.deepEqual(robot.toJSON(), before);
    joints[0].group.quaternion.setFromAxisAngle(joints[0].axis, Math.PI / 2);
    joints[1].group.position.addScaledVector(joints[1].axis, -30);
    tcp.updateWorldMatrix(true, false);
    const expected = base.matrixWorld.clone().invert().multiply(tcp.matrixWorld);
    actual.elements.forEach((value, i) => assert.ok(Math.abs(value - expected.elements[i]) < 1e-10));
    assert.throws(() => context.teachingJointMatrix(robot, [90]), /JP/);
});

test('OLP 포인트는 로봇·파일·심볼·번호별로 구분하고 원본을 보존한다', () => {
    const records = ['P', 'LP'].map(sourceSymbol => ({ sourceSymbol, index: 0, values: [1, 2, 3, 0, 0, 0] }));
    const original = JSON.stringify(records);
    const keys = [];
    for (const robot of ['r1', 'r2']) for (const path of ['a/P.pts', 'b/P.pts']) {
        keys.push(...collectTeachingPoints(robot, [], { path, kind: 'point', records }).points.map(p => p.key));
    }
    assert.equal(new Set(keys).size, 8); assert.equal(JSON.stringify(records), original);
    assert.equal(collectTeachingPoints('r1', [], { path: 'JP.pts', kind: 'jointPoint', records: [{ index: 0, values: [10, 20, -30, 40] }] }).points[0].joint, true);
    assert.deepEqual(normalizeTeachingPointSettings(), { enabled: true, labels: true, xray: true, labelMode: 'id' });
});

test('티칭 표시 기본값은 모두 켜고 저장된 끄기 설정은 유지한다', () => {
    const defaults = { enabled: true, labels: true, xray: true, labelMode: 'id' };
    for (const value of [undefined, null, {}]) assert.deepEqual(normalizeTeachingPointSettings(value), defaults);
    assert.deepEqual(normalizeTeachingPointSettings({ enabled: false, labels: false, xray: false }),
        { enabled: false, labels: false, xray: false, labelMode: 'id' });
});

test('OLP 기본 이름 P0·LP0·JP0는 라벨로 중복 표시하지 않는다', () => {
    const records = ['P', 'LP', 'JP'].map(sourceSymbol => ({ sourceSymbol, index: 0,
        name: `${sourceSymbol}0`, values: [1, 2, 3, 0, 0, 0] }));
    const { points } = collectTeachingPoints('r1', [], { path: 'P.pts', kind: 'point', records });
    points.forEach(point => {
        assert.equal(point.label, '');
        assert.equal(formatTeachingPointLabel(point, 'id'), point.name);
        assert.equal(formatTeachingPointLabel(point, 'label'), '');
        assert.equal(formatTeachingPointLabel(point, 'both'), point.name);
    });
    assert.equal(records[0].name, 'P0');
});

test('포인트 표시 방식은 ID만·라벨명만·둘 다를 구분하고 저장한다', () => {
    const point = { name: 'P[0]', label: '픽업 위치' };
    assert.equal(formatTeachingPointLabel(point, 'id'), 'P[0]');
    assert.equal(formatTeachingPointLabel(point, 'label'), '픽업 위치');
    assert.equal(formatTeachingPointLabel(point, 'both'), 'P[0] · 픽업 위치');
    for (const labelMode of ['id', 'label', 'both']) {
        assert.equal(normalizeTeachingPointSettings({ labelMode }).labelMode, labelMode);
    }
    assert.equal(normalizeTeachingPointSettings({ labelMode: 'invalid' }).labelMode, 'id');
    assert.equal(normalizeTeachingPointSettings({ labels: false }).labels, false);
});

test('겹친 포인트의 연속 클릭은 다음 렌더링 전에도 각각 선택한다', () => {
    const source = fs.readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
    const points = ['first', 'second'].map(key => ({ key, source: 'motion', record: { id: key } }));
    const program = { selectedStepId: 'first' };
    const context = vm.createContext({
        state: { teachingPoints: { enabled: true, scene: { points, selectedKey: 'first' } } },
        getTeachingPointContext: () => ({ program }),
        selectTeachingPoint: key => { program.selectedStepId = key; }
    });
    vm.runInContext(source.match(/function pickTeachingPoint\([^]*?\n\}/)[0], context);
    context.pickTeachingPoint({}, ['first', 'second']);
    assert.equal(program.selectedStepId, 'second');
    context.pickTeachingPoint({}, ['first', 'second']);
    assert.equal(program.selectedStepId, 'first');
});
