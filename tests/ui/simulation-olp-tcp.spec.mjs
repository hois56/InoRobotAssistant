import { test, expect } from '@playwright/test';
for(const model of ['IR-S7-60Z20','IR-R10H-120']) test(`OLP 이동은 Tool 번호와 선택한 TCP 오프셋을 실제 IK에 반영한다 (${model})`,async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__tcp={state,THREE,ensureRobotTcpProfiles,syncActiveTcpFrame,getCurrentTcpPoseBase,getTcpRotationDegrees,setJointAngle,runOlpMove,runOlpJump,applyOlpTcpProfile,selectTcpProfile};'});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__tcp);
 await page.locator('#model-select').selectOption('robot:'+model);await page.waitForFunction(()=>window.__tcp.state.models.some(m=>m.userData.tcpFrame));
 const result=await page.evaluate(async()=>{
  const a=window.__tcp,r=a.state.models.find(m=>m.userData.tcpFrame);
  [20,-50,-50,10].forEach((angle,i)=>a.setJointAngle(r.userData.joints[i],angle,false));
  const profiles=a.ensureRobotTcpProfiles(r);profiles[0].position.set(0,0,-10);profiles[1].position.set(15,5,-20);profiles[1].quaternion.setFromAxisAngle(new a.THREE.Vector3(0,0,1),Math.PI/12);
  const records=[],checks=[];
  for(const [tool,index,motion] of [[2,1,'MOVJ'],[1,0,'MOVL'],[null,1,'MOVJ'],[2,1,'JUMP']]){
   if(motion==='JUMP' && r.userData.manifest.robotType!=='scara')continue;
   r.userData.activeTcpProfileIndex=index;a.syncActiveTcpFrame(r);const expected=a.getCurrentTcpPoseBase(r),rotation=a.getTcpRotationDegrees(r,expected);
   const point={kind:'point',index:0,name:'Target',sourceSymbol:'P',values:[...expected.position.toArray(),rotation.rz,rotation.ry,rotation.rx]};
   if(tool!==null){r.userData.activeTcpProfileIndex=1-index;a.syncActiveTcpFrame(r);}
   const before=r.userData.joints.map(j=>j.angle);
   await (motion==='JUMP'?a.runOlpJump:a.runOlpMove)(motion,'P[0]',100,{pointRecords:[point]},null,{tool,zone:0,jumpLiftHeight:0,jumpMiddleHeight:expected.position.z,jumpReturnHeight:0});
   const actual=a.getCurrentTcpPoseBase(r);checks.push({index:r.userData.activeTcpProfileIndex,error:actual.position.distanceTo(expected.position),rotationError:actual.quaternion.angleTo(expected.quaternion),jointError:Math.max(...r.userData.joints.map((j,i)=>Math.abs(j.angle-before[i])))});
  }
  a.applyOlpTcpProfile(r,{tool:0});a.selectTcpProfile(1);checks.push({restored:r.userData.tcpFrame.position.distanceTo(r.userData.tcpProfiles[1].position)});
  return checks;
 });
 expect(result.pop().restored).toBeLessThan(0.001);expect(result.map(r=>r.index)).toEqual(model==='IR-S7-60Z20'?[1,0,1,1]:[1,0,1]);for(const r of result){expect(r.error).toBeLessThan(0.8);expect(r.rotationError).toBeLessThan(0.01);expect(r.jointError).toBeLessThan(0.1);}expect(errors).toEqual([]);
});
