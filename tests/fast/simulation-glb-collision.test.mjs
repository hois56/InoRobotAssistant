import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../../',import.meta.url).href;
const threeUrl=base+'3_ToolSelector/vendor/three/three.module.js';
const THREE=await import(threeUrl);
const source=await readFile(new URL(base+'2_3DSimulation/collision-system.mjs'),'utf8');
const {MeshCollisionSystem}=await import('data:text/javascript;base64,'+Buffer.from(source.replace("from 'three';",`from '${threeUrl}';`)).toString('base64'));
const {isSimulationCollisionPair,shouldReportSimulationCollision}=await import(base+'2_3DSimulation/collision-policy-core.mjs');
function fixture(){
 const robot=new THREE.Group();robot.userData.tcpFrame={};robot.add(new THREE.Mesh(new THREE.BoxGeometry(100,100,100)));
 const model=new THREE.Group();model.userData={uploaded:true,placement:'scene',sourceExtension:'glb'};
 const metres=new THREE.Group();metres.scale.setScalar(.001);metres.add(new THREE.Mesh(new THREE.BoxGeometry(100,100,100)));
 const normalized=new THREE.Group();normalized.scale.setScalar(1000);normalized.add(metres);model.add(normalized);model.position.x=40;
 return {robot,model,system:new MeshCollisionSystem()};
}
const options={pairFilter:isSimulationCollisionPair,meshPairFilter:(a,ma,b,mb)=>shouldReportSimulationCollision({objectA:a,meshA:ma,objectB:b,meshB:mb})};
test('로봇 본체와 단위 보정된 GLB의 접촉을 실제 BVH로 감지한다',()=>{
 const {robot,model,system}=fixture();
 assert.ok(system.checkAll([robot,model],options).length>0);
 assert.ok(system.checkAll([model,robot],options).length>0);
 model.position.x=200;assert.equal(system.checkAll([robot,model],options).length,0);
});
test('숨김·충돌 해제 GLB와 고정 모델끼리는 감지하지 않는다',()=>{
 const {robot,model,system}=fixture();model.visible=false;
 assert.equal(system.checkAll([robot,model],options).length,0);
 model.visible=true;model.userData.collisionEnabled=false;
 assert.equal(system.checkAll([robot,model],options).length,0);
 model.userData.collisionEnabled=true;delete robot.userData.tcpFrame;
 assert.equal(system.checkAll([robot,model],options).length,0);
});
