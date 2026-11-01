import { test, expect } from '@playwright/test';

test('이전 오브젝트의 연결·흡착 IO를 제거하고 등록과 원위치 기준은 프로젝트에서 유지한다', async ({page}) => {
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__objectRegistration={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,getArticulatedRobots,getRobotToolMountFrame,writeOlpAddress,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot};'});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__objectRegistration?.state.workspaceRecovery.ready);
 await page.locator('#model-select').selectOption('robot:IR-R7H-90');await page.waitForFunction(()=>window.__objectRegistration.getArticulatedRobots().length===1);
 const result=await page.evaluate(async()=>{
  const a=window.__objectRegistration,app=a.equipmentApp,robot=a.getArticulatedRobots()[0],ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
  const tool=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20}),object=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20});
  a.getRobotToolMountFrame(robot).add(tool);tool.userData.placement='tcp';tool.userData.attachmentHost=robot;a.state.scene.add(object);a.state.models.push(tool,object);
  object.position.copy(tool.localToWorld(new a.THREE.Vector3(0,0,20.5)));object.quaternion.copy(tool.getWorldQuaternion(new a.THREE.Quaternion()));
  const initial=object.getWorldPosition(new a.THREE.Vector3()).toArray();app.save({id:'registration',type:'OBJECT',movingRef:ref(object)});
  const vacuum=app.save({id:'vacuum',type:'VACUUM',movingRef:ref(tool),vacuumMode:'WHOLE'},{forward:512,reverse:513});
  a.writeOlpAddress('Out[512]',1);app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,0);
  const snapshot=JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())),old=snapshot.equipmentDefinitions.find(d=>d.id==='registration');
  old.robotRef=ref(robot);old.toolRef=ref(tool);old.feedbackGrip=514;old.runtime=JSON.parse(JSON.stringify(vacuum.runtime));
  snapshot.equipmentDefinitions=snapshot.equipmentDefinitions.filter(d=>d.id!=='vacuum');snapshot.ioFunctionMappings.forEach(m=>{m.action='OBJECT';m.gripObjectRef='equipment:registration';});
  await a.restoreWorkspaceSnapshot(snapshot);const registration=a.state.equipmentDefinitions.find(d=>d.id==='registration'),restored=app.resolve(registration.movingRef).object;
  app.resetObjects('equipment:registration');return {tool:registration.toolRef,robot:registration.robotRef,held:!!registration.runtime.heldRef,mappings:a.state.ioFunctionMappings.length,placement:restored.userData.placement,initial,position:restored.getWorldPosition(new a.THREE.Vector3()).toArray()};
 });
 expect(result).toMatchObject({tool:'',robot:'',held:false,mappings:0,placement:'scene'});result.position.forEach((v,i)=>expect(v).toBeCloseTo(result.initial[i],5));expect(errors).toEqual([]);
});
