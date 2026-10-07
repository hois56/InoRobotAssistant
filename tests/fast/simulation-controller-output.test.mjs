import test from 'node:test';import assert from 'node:assert/strict';import {parseVirtualControllerMessage} from '../../2_3DSimulation/virtual-controller-core.mjs';
test('컨트롤러와 Trace 출력 0~16은 OFF를 포함해 읽고 실패·범위 밖 값은 제외한다',()=>{
 const a=parseVirtualControllerMessage({type:'robotState',data:{joints:[0,0,0,0],outputs:{0:1,1:0,16:1,17:1,2:null,3:'bad'}}});assert.deepEqual(a.outputs,{'0':1,'1':0,'16':1});
 const b=parseVirtualControllerMessage({type:'traceData',data:{joints:[0,0,0,0],do_0:1,do_16:0,do_17:1}});assert.deepEqual(b.outputs,{'0':1,'16':0});
 assert.deepEqual(parseVirtualControllerMessage({type:'robotState',data:{joints:[0,0,0,0]}}).outputs,{});
});
