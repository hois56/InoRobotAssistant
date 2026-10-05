import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceConveyorObject, conveyorElapsedSeconds } from '../../2_3DSimulation/conveyor-core.mjs';
import { normalizeIoFunctionMapping, cloneIoFunctionMappings } from '../../2_3DSimulation/io-function-mapping-core.mjs';
const belt = { min: { x: -300, y: -100, z: 0 }, max: { x: 300, y: 100, z: 30 } };
const box = { min: { x: -20, y: -20, z: 30 }, max: { x: 20, y: 20, z: 70 } };
test('컨베이어 속도와 경과 시간으로 이동하며 끝단에서 정지한다', () => {
    assert.equal(advanceConveyorObject(belt, box, 'X', 100, 1), 100);
    assert.equal(advanceConveyorObject(belt, box, 'X', 100, 10), 280);
    assert.equal(advanceConveyorObject(belt, box, '-X', 100, 10), -280);
    assert.equal(advanceConveyorObject(belt, box, 'Y', 100, 10), 80);
    assert.equal(advanceConveyorObject(belt, box, '-Y', 100, 10), -80);
});
test('상면 밖에 있는 물체는 이송하지 않는다', () => {
    assert.equal(advanceConveyorObject(belt, { ...box, min: { ...box.min, z: 80 } }, 'X', 100, 1), 0);
    assert.equal(advanceConveyorObject(belt, { ...box, max: { ...box.max, y: 150 } }, 'X', 100, 1), 0);
});
test('프레임률에 관계없이 이송 거리가 같고 긴 중단 후에는 점프하지 않는다', () => {
    for (const fps of [30, 60, 120]) {
        let distance = 0;
        for (let i = 0; i < fps; i++) distance += advanceConveyorObject(belt, box, 'X', 100, 1 / fps);
        assert.ok(Math.abs(distance - 100) < 1e-9);
    }
    assert.equal(conveyorElapsedSeconds(null, 1000), 0);
    assert.equal(conveyorElapsedSeconds(1000, 2000), 0);
    assert.equal(conveyorElapsedSeconds(1000, 1100), 0.1);
});
test('컨베이어 설정은 매핑 저장에서 보존하고 기존 매핑은 유지한다', () => {
    const mapping = normalizeIoFunctionMapping({ action: 'CONVEYOR', gripObjectRef: 'conveyor:belt', conveyorAxis: '-Y', conveyorSpeed: 250 });
    assert.deepEqual(cloneIoFunctionMappings([mapping])[0], mapping);
    assert.equal(mapping.conveyorSpeed, 250);
    assert.equal(normalizeIoFunctionMapping({ action: 'CONVEYOR', conveyorSpeed: -1 }).conveyorSpeed, 100);
    assert.equal(normalizeIoFunctionMapping({ action: 'VIEW', viewSlot: 2 }).viewSlot, 2);
});

test('IO 미연결 컨베이어와 벨트 부품 대상은 저장·복원에서 유지한다',()=>{const mapping=normalizeIoFunctionMapping({action:'CONVEYOR',gripObjectRef:'conveyor:assembly/1',conveyorManualOnly:true,enabled:false,conveyorAxis:'Y',conveyorSpeed:140});assert.deepEqual(cloneIoFunctionMappings([mapping])[0],mapping);assert.equal(mapping.enabled,false);assert.equal(mapping.conveyorManualOnly,true);assert.equal(mapping.gripObjectRef,'conveyor:assembly/1');});
