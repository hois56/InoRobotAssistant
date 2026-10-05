import test from 'node:test';
import assert from 'node:assert/strict';
import {isRobotAttachedCollisionModel,isSimulationCollisionPair,shouldReportSimulationCollision} from '../../2_3DSimulation/collision-policy-core.mjs';
test('로봇 하위 모델의 장애물 접촉만 감지하고 Tool·오브젝트와 오브젝트끼리는 제외한다',()=>{
 const robot={userData:{tcpFrame:{}}},tool={userData:{attachmentHost:robot,placement:'tcp'}},held={userData:{attachmentHost:robot,placement:'grip-object'}},object={userData:{object:true}},base={userData:{}},module={userData:{}},nested={userData:{attachmentHost:tool}};
 const report=(left,right)=>shouldReportSimulationCollision({objectA:left,objectB:right},model=>Boolean(model.userData.object));
 for(const [left,right,expected] of [[base,module,false],[robot,base,false],[tool,base,true],[held,base,true],[tool,object,false],[tool,held,false],[held,object,false],[held,held,false],[tool,robot,true],[held,robot,true],[nested,base,true]]){assert.equal(report(left,right),expected);assert.equal(report(right,left),expected);}
 assert.equal(isSimulationCollisionPair(base,module),false);assert.equal(isRobotAttachedCollisionModel(nested),true);const cycle={userData:{}};cycle.userData.attachmentHost=cycle;assert.equal(isRobotAttachedCollisionModel(cycle),false);
});
test('오브젝트로 등록된 하위 부품은 해당 메시 접촉만 제외한다',()=>{
 const robot={userData:{tcpFrame:{}}},tool={userData:{attachmentHost:robot}},assembly={userData:{}},part={},fixed={};
 const registered=(model,mesh)=>model===assembly&&mesh===part;
 assert.equal(shouldReportSimulationCollision({objectA:tool,objectB:assembly,meshB:part},registered),false);
 assert.equal(shouldReportSimulationCollision({objectA:tool,objectB:assembly,meshB:fixed},registered),true);
});
