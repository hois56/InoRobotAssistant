import test from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPMENT_TYPES, EQUIPMENT_IO_TYPES, normalizeEquipmentDefinition } from '../../2_3DSimulation/equipment-core.mjs';

test('진공은 Tool 동작이고 오브젝트는 IO 없는 등록만 지원하며 그리퍼 선택은 제거한다', () => {
    assert.ok(EQUIPMENT_TYPES.includes('VACUUM'));
    assert.equal(EQUIPMENT_TYPES.includes('GRIPPER'), false);
    assert.equal(EQUIPMENT_IO_TYPES.includes('OBJECT'), false);
    const object = normalizeEquipmentDefinition({ id: 'object', type: 'OBJECT', movingRef: 'product', toolRef: 'old-tool', robotRef: 'old-robot', feedbackGrip: 514 });
    assert.equal(object.toolRef, ''); assert.equal(object.robotRef, ''); assert.equal(object.feedbackGrip, null);
});

test('선택 면과 전체 부품의 진공 설정 및 사용자 동작 이름을 보존한다', () => {
    const face = { meshPath: [0, 1], triangleRanges: [{ first: 2, last: 7 }] };
    const def = normalizeEquipmentDefinition({ id: 'vacuum', type: 'VACUUM', movingRef: 'pad', vacuumMode: 'FACE', vacuumFace: face, name: '제품 진공', customName: true });
    assert.deepEqual(def.vacuumFace, face); assert.equal(def.customName, true); assert.equal(def.name, '제품 진공');
    assert.equal(normalizeEquipmentDefinition({ ...def, vacuumMode: 'WHOLE', vacuumFace: null }).vacuumMode, 'WHOLE');
});
