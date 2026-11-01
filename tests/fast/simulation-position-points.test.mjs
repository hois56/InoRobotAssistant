import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneMotionProgram, createEmptyMotionProgram, normalizeRegisteredPositions } from '../../2_3DSimulation/motion-program-core.mjs';
import { nextPositionPointMetadata, applyPositionPointCellEdit, buildPositionPointPaste } from '../../2_3DSimulation/position-points-ui.mjs';
import { generateProjectSamples } from '../support/project-generator-samples.mjs';

const point = () => ({ id: 'stored', motion: 'MOVJ', pointIndex: 42, label: 'Pick', speed: 100,
    joints: [10, 20, -30, 40], tcp: { position: [100, 200, 300], quaternion: [0, 0, 0, 1] },
    armParameters: [1, 0, 0, -2], armParametersExplicit: true, externalAxes: [10, 20, 30, 40, 50, 60] });

test('등록 위치는 동작 없이 로봇별 복사·실행 취소에 보존되고 원본과 분리된다', () => {
    const original = { ...createEmptyMotionProgram(), positions: [point()] };
    const copy = cloneMotionProgram(original);
    assert.equal(copy.steps.length, 0);
    assert.equal(copy.positions[0].armParametersExplicit, true);
    assert.deepEqual(copy.positions[0].externalAxes, [10, 20, 30, 40, 50, 60]);
    copy.positions[0].tcp.position[0] = 999;
    copy.positions[0].armParameters[0] = -1;
    assert.equal(original.positions[0].tcp.position[0], 100);
    assert.equal(original.positions[0].armParameters[0], 1);
    assert.deepEqual(createEmptyMotionProgram().positions, []);
    assert.deepEqual(normalizeRegisteredPositions(undefined, [], 4), []);
});

test('위치 파일은 동작·위치 사이 중복 번호와 잘못된 좌표·Arm·외부축을 거부한다', () => {
    assert.equal(normalizeRegisteredPositions([point()], [], 4)[0].pointIndex, 42);
    assert.throws(() => normalizeRegisteredPositions([point()], [{ ...point(), id: 'step' }], 4), /Duplicate/);
    assert.throws(() => normalizeRegisteredPositions([point(), { ...point(), id: 'other' }], [], 4), /Duplicate/);
    assert.throws(() => normalizeRegisteredPositions([{ ...point(), joints: [NaN, 0, 0, 0] }], [], 4));
    assert.throws(() => normalizeRegisteredPositions([{ ...point(), armParameters: [0.5, 0, 0, 0] }], [], 4));
    assert.throws(() => normalizeRegisteredPositions([{ ...point(), externalAxes: [0] }], [], 4));
});

test('표준화 포인트는 요청한 역순으로 공정을 이어가고 실제 생성기 라벨과 일치한다', () => {
    const records = [];
    const expected = [111, 110, 101, 100, 211, 210, 201, 200, 311, 310, 301, 300];
    const generated = generateProjectSamples()['P.pts'];
    for (const index of expected) {
        const actual = nextPositionPointMetadata(records);
        assert.equal(actual.index, index);
        const line = generated.split('\n').find(line => line.startsWith(`P[${index}]`));
        assert.ok(line.includes(`Name = ${actual.label};`), `${index}: ${actual.label}`);
        records.push({ ...actual, symbol: 'P' });
    }
    assert.equal(nextPositionPointMetadata([{ index: 111 }, { index: 100 }]).index, 110);
    assert.deepEqual(nextPositionPointMetadata([{ index: 111, symbol: 'LP' }]), { index: 111, label: 'P1_Work' });
});

test('표준화 해제는 0부터 시작하며 빈 번호를 채우지 않고 가장 높은 P 번호 다음을 쓴다', () => {
    assert.deepEqual(nextPositionPointMetadata([], false), { index: 0, label: '' });
    assert.deepEqual(nextPositionPointMetadata([{ index: 100 }], false), { index: 101, label: '' });
    assert.equal(nextPositionPointMetadata([{ index: 2 }, { index: 0 }, { index: 99 }], false).index, 100);
    assert.equal(nextPositionPointMetadata([{ index: 100 }, { index: 999, symbol: 'LP' }], false).index, 101);
    assert.equal(nextPositionPointMetadata([{ index: 9998 }], false).index, 9999);
    assert.throws(() => nextPositionPointMetadata([{ index: 9999 }], false), /사용 가능한/);
});

test('표준화는 이미 등록된 값을 덮어쓰지 않고 마지막 공정까지 진행한 후 종료한다', () => {
    const records = [];
    for (let i = 0; i < 99 * 4; i++) records.push(nextPositionPointMetadata(records));
    assert.equal(records.at(-1).index, 9900);
    assert.equal(records.at(-1).label, 'P99_Safe');
    assert.throws(() => nextPositionPointMetadata(records), /사용 가능한/);
    const before = JSON.stringify(records);
    assert.equal(nextPositionPointMetadata(records.filter(record => record.index !== 9910)).index, 9910);
    assert.equal(JSON.stringify(records), before);
});

test('목록 셀 수정은 선택한 값만 바꾸고 원본 및 다른 정밀 좌표를 유지한다', () => {
    const record = { key: 'r1:111', index: 111, symbol: 'P', label: 'P1_Work',
        values: [123.123456789, 20, 30, 0, 0, 0], armParameters: [0, 0, 0, 1], externalAxes: [0, 0, 0, 0, 0, 0] };
    const renamed = applyPositionPointCellEdit(record, 'label', null, ' Custom ');
    assert.equal(renamed.label, 'Custom'); assert.equal(renamed.values[0], 123.123456789);
    const numeric = applyPositionPointCellEdit(record, 'values', 2, '-12.345678');
    assert.equal(numeric.values[2], -12.345678); assert.equal(record.values[2], 30);
    const arm = applyPositionPointCellEdit(record, 'armParameters', 1, '-2');
    assert.deepEqual(arm.armParameters, [0, -2, 0, 1]);
    const external = applyPositionPointCellEdit(record, 'externalAxes', 5, '90.25');
    assert.equal(external.externalAxes[5], 90.25); assert.equal(record.externalAxes[5], 0);
    assert.equal(applyPositionPointCellEdit(record, 'index', null, '500').index, 500);
    assert.throws(() => applyPositionPointCellEdit(record, 'index', null, '110', [{ key: 'other', index: 110, symbol: 'P' }]), /이미 사용/);
    assert.equal(applyPositionPointCellEdit(record, 'index', null, '110', [{ key: 'other', index: 110, symbol: 'LP' }]).index, 110);
    for (const value of ['', 'NaN', 'Infinity']) assert.throws(() => applyPositionPointCellEdit(record, 'values', 0, value));
    assert.throws(() => applyPositionPointCellEdit(record, 'armParameters', 0, '1.5'));
    for (const value of ['-1', '10000', '1.5']) assert.throws(() => applyPositionPointCellEdit(record, 'index', null, value));
});

test('엑셀 범위 붙여넣기는 정밀도·P/LP 구분을 유지하고 범위·중복·숫자를 전체 검증한다', () => {
    const record = { key: 'P:7', index: 7, symbol: 'P', label: 'Original', values: [123.123456789, 2, 3, 4, 5, 6],
        armParameters: [0, 0, 0, 1], externalAxes: [0, 0, 0, 0, 0, 0] };
    const records = [record, { ...record, key: 'LP:7', symbol: 'LP', label: 'Local' }];
    const original = JSON.stringify(records);
    const updates = buildPositionPointPaste(records, 'P:7', 12, '12.123456789\t23.234567891\r\n34\t45\r\n');
    assert.deepEqual(updates[0].record.externalAxes.slice(0, 2), [12.123456789, 23.234567891]);
    assert.deepEqual(updates[1].record.externalAxes.slice(0, 2), [34, 45]);
    assert.equal(updates[0].record.values[0], 123.123456789);
    const ids = buildPositionPointPaste(records, 'P:7', 0, '8\tRenamed\n8\tLocal');
    assert.deepEqual(ids.map(u => [u.record.index, u.record.symbol]), [[8, 'P'], [8, 'LP']]);
    assert.throws(() => buildPositionPointPaste(records, 'P:7', 12, '1\t2\n3\tNaN'));
    assert.throws(() => buildPositionPointPaste(records, 'P:7', 9, '1.5'));
    assert.throws(() => buildPositionPointPaste(records, 'LP:7', 12, '1\n2'), /범위/);
    assert.throws(() => buildPositionPointPaste(records, 'P:7', 17, '1\t2'), /범위/);
    assert.throws(() => buildPositionPointPaste([record, { ...record, key: 'P:8', index: 8 }], 'P:7', 0, '8'), /이미 사용/);
    assert.equal(JSON.stringify(records), original);
});
