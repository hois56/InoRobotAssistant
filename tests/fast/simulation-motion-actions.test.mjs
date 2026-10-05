import test from 'node:test';
import assert from 'node:assert/strict';
import {IO_FUNCTION_MAPPING_ACTIONS,normalizeIoFunctionMapping,normalizeIoFunctionMappings} from '../../2_3DSimulation/io-function-mapping-core.mjs';
import {equipmentCommandOptions} from '../../2_3DSimulation/equipment-core.mjs';
import {cloneMotionProgram} from '../../2_3DSimulation/motion-program-core.mjs';
test('기존 물건 잡기·놓기 IO와 프로그램 명령은 지원하지 않고 복원 시 제외한다',()=>{
 for(const action of ['GRIP_USE','GRIP_RELEASE']){assert.equal(IO_FUNCTION_MAPPING_ACTIONS[action],undefined);assert.throws(()=>normalizeIoFunctionMapping({action}),/지원|제거/);}
 const mappings=normalizeIoFunctionMappings([{action:'GRIP_USE'},{action:'GRIP_RELEASE'},{action:'VACUUM',equipmentCommand:'REVERSE',address:513}]);assert.equal(mappings.length,1);assert.equal(mappings[0].equipmentCommand,'REVERSE');
 const program=cloneMotionProgram({steps:[{id:'old1',motion:'GRIP_USE'},{id:'old2',motion:'GRIP_RELEASE'},{id:'io',motion:'IO_OUT',ioAddress:512,ioValue:1,joints:[0],tcp:{position:[0,0,0],quaternion:[0,0,0,1]}}]});assert.deepEqual(program.steps.map(s=>s.motion),['IO_OUT']);
});

test('IO 동작 명령은 각 종류에 맞게 표시하고 진공은 흡착·파기만 허용한다',()=>{
 assert.deepEqual(equipmentCommandOptions('VACUUM'),[['FORWARD','흡착'],['REVERSE','파기']]);assert.deepEqual(equipmentCommandOptions('GRIPPER').slice(0,2),[['FORWARD','닫기'],['REVERSE','열기']]);assert.equal(equipmentCommandOptions('FILM_PEEL').some(([c])=>c==='REVERSE'),false);assert.deepEqual(equipmentCommandOptions('OBJECT'),[]);
 assert.equal(normalizeIoFunctionMapping({action:'VACUUM',equipmentCommand:'RESET'}).equipmentCommand,'FORWARD');
});
