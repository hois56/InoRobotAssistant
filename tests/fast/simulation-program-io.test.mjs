import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneMotionProgram, normalizeProgramIoStep} from '../../2_3DSimulation/motion-program-core.mjs';
import {normalizeEquipmentBindings} from '../../2_3DSimulation/equipment-core.mjs';

test('프로그램 IO 명령은 저장 시 주소와 ON/OFF를 보존하고 잘못된 주소를 거부한다', () => {
    const steps=['IO_OUT','IO_WAIT'].map((motion,i)=>({id:String(i),motion,ioAddress:600+i,ioValue:i,joints:[0],tcp:{position:[0,0,0],quaternion:[0,0,0,1]}}));
    assert.deepEqual(cloneMotionProgram({steps}).steps.map(step=>[step.motion,step.ioAddress,step.ioValue]),[['IO_OUT',600,0],['IO_WAIT',601,1]]);
    assert.throws(()=>normalizeProgramIoStep({ioAddress:65,ioValue:1}),/IO 번호/);
    assert.throws(()=>normalizeProgramIoStep({ioAddress:512,ioValue:2}),/IO 값/);
    assert.throws(()=>normalizeEquipmentBindings({forward:512,reverse:512}),/서로 다른/);
});
