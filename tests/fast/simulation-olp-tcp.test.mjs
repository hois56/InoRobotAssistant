import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { OlpRuntime } from '../../2_3DSimulation/olp-runtime.mjs';
const threeSource=fs.readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js',import.meta.url),'utf8');
const THREE=await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');
function fixture(){
 const robot=new THREE.Group(),tcpFrame=new THREE.Group();robot.add(tcpFrame);
 robot.userData={tcpFrame,activeTcpProfileIndex:0,tcpProfiles:[10,20,30].map(x=>({position:new THREE.Vector3(x,2,3),quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),x/100)}))};
 const poses=[];
 const c=vm.createContext({THREE,TCP_PROFILE_COUNT:3,state:{olp:{}},getOlpRuntimeRobot:()=>robot,
 ensureRobotTcpProfiles:r=>r.userData.tcpProfiles,syncActiveTcpFrame(r,override){const p=override||r.userData.tcpLiveProfile||r.userData.tcpProfiles[r.userData.activeTcpProfileIndex];r.userData.tcpFrame.position.copy(p.position);r.userData.tcpFrame.quaternion.copy(p.quaternion);},
 refreshTcpProfileUi(){},captureCurrentTcpTarget(){},getOlpMotionTarget:()=>({kind:'point',name:'P0',values:[1,2,3,0,0,0]}),
 setOlpLastMotion(){},renderOlpIoMonitor(){},tryOlpZoneBlend:async()=>null,
 moveOlpTarget:async r=>{poses.push({index:r.userData.activeTcpProfileIndex,x:r.userData.tcpFrame.position.x,rotation:r.userData.tcpFrame.quaternion.toArray()});return {};}});
 for(const name of ['applyOlpTcpProfile','runOlpMove']) {const match=source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));if(match)vm.runInContext(match[0],c);}
 c.syncActiveTcpFrame(robot);return {c,robot,poses};
}
test('OLP Tool 지정은 해당 TCP의 위치·회전을 사용하고 생략하면 선택값을 유지한다',async()=>{
 const {c,robot,poses}=fixture();const project={pointRecords:[{kind:'point',index:0,name:'P0',sourceSymbol:'P',values:[1,2,3,0,0,0]}],programPath:'main.pro',programFiles:['main.pro'],programs:[{path:'main.pro',text:'Start\nMovj P[0], Tool[2];\nMovl P[0], Tool[1];\nMovj P[0];\nEnd'}]};
 await new OlpRuntime(project,{move:c.runOlpMove}).run();
 assert.deepEqual(poses.map(p=>[p.index,p.x]),[[1,20],[0,10],[0,10]]);assert.deepEqual(poses[0].rotation,robot.userData.tcpProfiles[1].quaternion.toArray());
});
test('Tool[0]은 플랜지 원점을 사용하고 저장한 TCP 오프셋은 보존한다',async()=>{
 const {c,robot,poses}=fixture();await c.runOlpMove('MOVJ','P[0]',100,null,null,{tool:0});assert.equal(poses[0].x,0);assert.deepEqual(poses[0].rotation,[0,0,0,1]);assert.equal(robot.userData.tcpProfiles[0].position.x,10);
 await c.runOlpMove('MOVJ','P[0]',100,null,null,{tool:3});assert.equal(poses[1].x,30);
 await assert.rejects(()=>c.runOlpMove('MOVJ','P[0]',100,null,null,{tool:4}),/Tool/);
});
