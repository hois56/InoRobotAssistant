import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEquipmentDefinition, stepEquipmentPosition, equipmentFeedback, resolveEquipmentCommand, validateEquipmentDefinitions, equipmentMotionGroups, normalizeEquipmentBindings } from '../../2_3DSimulation/equipment-core.mjs';
import { createFilmState, stepFilm, filmLengthError } from '../../2_3DSimulation/film-peeling-core.mjs';
import { normalizeIoFunctionMapping } from '../../2_3DSimulation/io-function-mapping-core.mjs';
import * as filmCore from '../../2_3DSimulation/film-peeling-core.mjs';

test('오브젝트는 IO와 이동 설정 없이 등록하고 진공은 패드만 지정한다',()=>{
    const object=normalizeEquipmentDefinition({id:'object',type:'OBJECT',movingRefs:['part-a','part-b'],speed:'invalid',feedbackHome:512});
    assert.deepEqual(equipmentMotionGroups(object),[]);assert.deepEqual(object.movingRefs,['part-a','part-b']);assert.equal(object.feedbackHome,null);
    const vacuum=normalizeEquipmentDefinition({id:'vacuum',type:'VACUUM',movingRef:'pad',travel:'invalid',feedbackGrip:514});
    assert.deepEqual(equipmentMotionGroups(vacuum),[]);assert.equal(vacuum.feedbackGrip,514);
    assert.throws(()=>normalizeEquipmentDefinition({...vacuum,feedbackGrip:100}),/센서 주소/);
    assert.throws(()=>validateEquipmentDefinitions([vacuum,{...vacuum,id:'other',movingRef:'other-pad'}]),/센서 입력 주소/);
    validateEquipmentDefinitions([object,vacuum]);
    assert.equal(normalizeIoFunctionMapping({id:'vacuum-io',action:'VACUUM',direction:'IN',address:512,gripObjectRef:'equipment:vacuum'}).direction,'OUT');
    assert.throws(()=>normalizeIoFunctionMapping({id:'object-io',action:'OBJECT',address:512}),/동작|지원|action|매핑/);
});

test('등록 오브젝트의 초기 위치는 프로젝트 정규화·복사 후에도 보존한다', () => {
    const matrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 10,20,30,1];
    const source = { id: 'original-object', type: 'OBJECT', movingRef: 'part-a', origins: { objectWorld: { 'part-a': matrix } } };
    const restored = normalizeEquipmentDefinition(JSON.parse(JSON.stringify(source)));
    assert.deepEqual(restored.origins, source.origins);
    restored.origins.objectWorld['part-a'][12] = 900;
    assert.equal(matrix[12], 10);
    assert.deepEqual(normalizeEquipmentDefinition({ id: 'legacy-object', type: 'OBJECT', movingRef: 'part-a' }).origins, {});
});

test('실린더·외부 축은 속도로 이동하고 중간 반전과 끝단 센서를 처리한다', () => {
    assert.equal(stepEquipmentPosition(0, 100, 50, 2), 100);
    assert.equal(stepEquipmentPosition(40, 0, 50, 0.2), 30);
    assert.deepEqual(equipmentFeedback(40, 100), { home: false, end: false });
    assert.deepEqual(equipmentFeedback(100, 100), { home: false, end: true });
    assert.equal(resolveEquipmentCommand(['FORWARD', 'REVERSE']).command, 'STOP');
    assert.ok(resolveEquipmentCommand(['FORWARD', 'REVERSE']).error);
});
test('설비 정의는 중복 가동부·센서·E축과 잘못된 그리퍼 설정을 거부한다', () => {
    const a = { id: 'a', type: 'CYLINDER', movingRef: 'model:a', feedbackHome: 512 };
    assert.throws(() => validateEquipmentDefinitions([a, { ...a, id: 'b' }]), /가동부/);
    assert.throws(() => validateEquipmentDefinitions([a, { ...a, id: 'b', movingRef: 'model:b' }]), /센서/);
    assert.throws(() => normalizeEquipmentDefinition({ ...a, type: 'GRIPPER' }), /손가락/);
});
test('필름은 부착면과 파지점을 유지하며 굽히고 무한히 늘어나지 않는다', () => {
    const state = createFilmState(300, 80, 30, 4);
    for (let frame = 0; frame < 180; frame++) stepFilm(state, 120, 1 / 60);
    assert.ok(state.points.some(p => p[2] > 5));
    assert.deepEqual(state.points[30 * 5], [300, -40, 0]);
    assert.ok(filmLengthError(state) < 3);
    assert.match(stepFilm(state, 120, 1 / 60, { anchor: [-1000, 0, 100] }).error, /초과/);
    assert.ok(state.points.flat().every(Number.isFinite));
});

test('필름은 초기화 시 평평하고 박리 진행량에 따라 연속적으로 들린다', () => {
    const state = createFilmState(300, 80);
    const flat = structuredClone(state.points);
    stepFilm(state, 0, 0);
    assert.deepEqual(state.points, flat);
    const first = stepFilm(state, 60, 1 / 60);
    const edge = [...state.points[3]];
    const next = stepFilm(state, 60.5, 1 / 60);
    assert.equal(first.freeLength, 60);
    assert.equal(next.freeLength, 60.5);
    assert.ok(state.points[3][2] > edge[2], '파지점이 격자 간격마다 멈추거나 튀면 안 된다');
    for (let row = 9; row <= state.rows; row++) assert.deepEqual(state.points[row * 7], [row * 7.5, -40, 0]);
});

test('필름은 완전히 벗겨지기 전에는 해제할 수 없고 완료 후에도 놓기 전까지 파지한다', () => {
    const state = createFilmState(300, 80);
    stepFilm(state, 299.995, 1 / 60);
    const before = structuredClone(state.points);
    assert.match(stepFilm(state, 299.995, 1 / 60, { released: true }).error, /완전히/);
    assert.deepEqual(state.points, before);
    stepFilm(state, 300, 1 / 60);
    const grip = [...state.points[3]];
    for (let i = 0; i < 60; i++) stepFilm(state, 300, 1 / 60);
    assert.deepEqual(state.points[3], grip);
    stepFilm(state, 300, 1 / 60, { released: true });
    assert.ok(state.points[3][2] < grip[2]);
});

test('필름 박리의 완료 행정은 필름 전체 길이와 일치한다', () => {
    const def = normalizeEquipmentDefinition({ id: 'film', type: 'FILM_PEEL', movingRef: 'film', travel: 100, filmLength: 300 });
    assert.equal(def.travel, 300);
});

test('별도 파지 모델로 당기는 필름도 부착 끝과 파지점을 유지한다', () => {
    const state = createFilmState(300, 80);
    stepFilm(state, 120.5, 1 / 60);
    const anchor = [...state.points[3]];
    const gripEdge = structuredClone(state.points.slice(0, 7));
    for (let i = 0; i < 120; i++) assert.equal(stepFilm(state, 120.5, 1 / 60, { anchor, gripEdge }).error, '');
    assert.deepEqual(state.points.slice(0, 7), gripEdge);
    for (let row = 17; row <= 40; row++) assert.deepEqual(state.points[row * 7], [row * 7.5, -40, 0]);
    assert.ok(filmLengthError(state) < 3);
    const before = structuredClone(state.points);
    assert.match(stepFilm(state, 120.5, 1 / 60, { anchor: [-1000, 0, 100] }).error, /초과/);
    assert.deepEqual(state.points, before);
});

test('필름 손잡이는 네 변에서 지정하고 작은 파지 구간만 그리퍼에 고정한다', () => {
    const film = { filmLength: 300, filmWidth: 100, filmGripOffset: 25, filmGripWidth: 12 };
    for (const side of ['X-', 'X+', 'Y-', 'Y+']) {
        const layout = filmCore.getFilmGripLayout({ ...film, filmGripSide: side });
        assert.equal(layout.length, side.startsWith('Y') ? 100 : 300);
        assert.equal(layout.width, side.startsWith('Y') ? 300 : 100);
        assert.equal(layout.gripOffset, 0.25);
    }
    const state = createFilmState(300, 100, 40, 10, { gripOffset: 0.2, gripWidth: 12 });
    stepFilm(state, 100, 1 / 60);
    const anchor = [30, -30, 60];
    for (let i = 0; i < 120; i++) assert.equal(stepFilm(state, 100, 1 / 60, { anchor }).error, '');
    assert.deepEqual(state.points[2], anchor);
    assert.notDeepEqual(state.points[10], [30, 50, 60], '파지하지 않은 가장자리까지 그리퍼에 고정하면 안 된다');
    assert.deepEqual(state.points.at(-1), [300, 50, 0]);
});

test('실제 손잡이 부품 위치로 가까운 박리 변과 파지 위치를 찾는다', () => {
    const layout = filmCore.getFilmGripLayout({ filmLength: 300, filmWidth: 100, filmGripWidth: 12 }, [225, 60, 0]);
    assert.equal(layout.side, 'Y+');
    assert.equal(layout.gripOffset, 0.75);
    assert.equal(layout.length, 100);
});

test('그리퍼 이동 위치가 박리량을 정하고 완료된 필름은 자유롭게 따라간다', () => {
    const state = createFilmState(300, 100, 40, 16, {gripOffset:0.25,gripWidth:12});
    assert.equal(filmCore.getFilmPeelFromGrip(state,[0,-25,0]),0);
    for(const peel of [5,50,150,300]) assert.ok(Math.abs(filmCore.getFilmPeelFromGrip(state,[peel/2,-25,peel*Math.sqrt(0.75)])-peel)<1e-8);
    assert.throws(()=>filmCore.getFilmPeelFromGrip(state,[-10,-25,30]),/안쪽/);
    stepFilm(state,300,1/60);
    assert.equal(stepFilm(state,300,1/60,{anchor:[500,-25,500]}).error,'');
});

test('다중 가동부와 양쪽 손가락 그룹을 보존하고 기존 단일 부품 설정도 읽는다', () => {
    const old = normalizeEquipmentDefinition({ id: 'old', type: 'CYLINDER', movingRef: 'rod' });
    assert.deepEqual(old.movingRefs, ['rod']);
    const grip = normalizeEquipmentDefinition({ id: 'grip', type: 'GRIPPER', movingRefs: ['right', 'right-bolt'], secondRefs: ['left', 'left-bolt'] });
    assert.deepEqual(equipmentMotionGroups(grip), [['right', 1], ['right-bolt', 1], ['left', -1], ['left-bolt', -1]]);
    assert.deepEqual(normalizeEquipmentDefinition(JSON.parse(JSON.stringify(grip))).movingRefs, grip.movingRefs);
    assert.throws(() => normalizeEquipmentDefinition({ ...grip, secondRefs: ['left', 'right-bolt'] }), /이동 그룹/);
    assert.throws(() => validateEquipmentDefinitions([grip, { id: 'other', type: 'CYLINDER', movingRefs: ['right-bolt'] }]), /가동부/);
    assert.throws(() => normalizeEquipmentDefinition({ ...old, bodyRef: 'bolt', movingRefs: ['rod', 'bolt'] }), /고정부/);
});

test('실린더와 그리퍼는 양방향에 같은 속도를 사용하고 제어 신호는 Output으로 고정한다', () => {
    for (const type of ['CYLINDER', 'GRIPPER']) {
        const def = normalizeEquipmentDefinition({ id: 'speed', type, movingRef: 'a', secondRef: 'b', speed: 45, reverseSpeed: 90 });
        assert.equal(def.reverseSpeed, 45);
    }
    assert.equal(normalizeEquipmentBindings({ direction: 'IN', forward: 512 }).direction, 'OUT');
    for (const action of ['CYLINDER', 'GRIPPER', 'LINEAR_AXIS', 'ROTARY_AXIS', 'FILM_PEEL', 'CONVEYOR']) {
        assert.equal(normalizeIoFunctionMapping({ action, direction: 'IN', address: 512 }).direction, 'OUT');
    }
    assert.equal(normalizeIoFunctionMapping({ action: 'VIEW', direction: 'IN', address: 512 }).direction, 'IN');
});
