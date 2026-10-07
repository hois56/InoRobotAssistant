import { test, expect } from '@playwright/test';
import { createEquipmentFixture } from './helpers/equipment-fixtures.mjs';
async function setup(page) {
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__vacuum={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,writeOlpAddress,readOlpSimulatorBit,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,updateConveyorSimulation,getRobotToolMountFrame,applyRobotTravelAxis,renderModelTree};'});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__vacuum);return errors;
}
test('오브젝트는 등록만 표시하고 진공에는 패드와 Output만 표시한다',async({page})=>{
 const errors=await setup(page);
 await page.evaluate(()=>{const a=window.__vacuum;const m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'오브젝트'});a.state.scene.add(m);a.state.models.push(m);a.equipmentApp.ui.open('equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1');});
 const form=page.locator('#equipment-form');await form.locator('[name="type"]').selectOption('OBJECT');
 await expect(form.locator('[name="axis"]')).toBeHidden();await expect(form.locator('[name="speed"]')).toBeHidden();await expect(page.locator('#equipment-io')).toBeHidden();await expect(page.locator('#equipment-advanced')).toBeHidden();
 await form.locator('button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('등록했습니다');
 expect(await page.evaluate(()=>window.__vacuum.state.ioFunctionMappings.length)).toBe(0);
 await form.locator('[name="type"]').selectOption('VACUUM');await expect(page.locator('#equipment-parts legend')).toContainText('흡착 패드');await expect(form.locator('[name="forwardAddress"]')).toBeVisible();await expect(form.locator('[name="reverseAddress"]')).toBeVisible();await expect(form.locator('[name="feedbackHome"]')).toBeHidden();expect(errors).toEqual([]);
});
test('진공은 등록된 접촉 물체만 흡착하며 패드 자세·저장 복원·Output 해제를 따른다',async({page})=>{
 const errors=await setup(page);
 const result=await page.evaluate(async()=>{
  const a=window.__vacuum,app=a.equipmentApp;const box=(name,xyz)=>{const m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});m.position.fromArray(xyz);a.state.scene.add(m);a.state.models.push(m);return m;};
  const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
  const pad=box('패드',[0,0,20]),obj=box('등록 물체',[0,0,0]),ignored=box('미등록 물체',[0,0,0]),air=box('떨어진 등록 물체',[0,0,-0.11]);
  app.save({id:'objects',type:'OBJECT',movingRefs:[ref(obj),ref(air)]});const def=app.save({id:'vacuum',type:'VACUUM',movingRef:ref(pad)},{forward:512,reverse:null});
  const mappings=a.state.ioFunctionMappings;a.writeOlpAddress('Out[512]',1);app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,mappings,0);app.runtime.update(a.state.equipmentDefinitions,mappings,20);
  const held=def.runtime.heldRef;const count=def.runtime.heldObjects.length;
  pad.position.set(100,50,20);pad.rotation.y=Math.PI/2;app.runtime.update(a.state.equipmentDefinitions,mappings,40);
  const pose=obj.getWorldPosition(new a.THREE.Vector3()).toArray();const unchanged=ignored.position.toArray();const airPose=air.position.toArray();app.runtime.stop();
  const snapshot=JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));await a.restoreWorkspaceSnapshot(snapshot);
  const restored=a.state.equipmentDefinitions.find(d=>d.id==='vacuum');const restoredObj=app.resolve(held).object;const persisted=restoredObj.getWorldPosition(new a.THREE.Vector3()).toArray();
  a.writeOlpAddress('Out[512]',0);app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,0);const released=restored.runtime.heldRef;app.resolve(restored.movingRef).object.position.x+=50;app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,20);
  return {held,expected:ref(obj),count,pose,unchanged,airPose,persisted,released,after:restoredObj.getWorldPosition(new a.THREE.Vector3()).toArray(),registry:app.objects().length};
 });
 expect(result.held).toBe(result.expected);expect(result.count).toBe(1);result.pose.forEach((v,i)=>expect(v).toBeCloseTo([80,50,20][i],5));expect(result.unchanged).toEqual([0,0,0]);expect(result.airPose).toEqual([0,0,-0.11]);expect(result.persisted).toEqual(result.pose);expect(result.released).toBe('');expect(result.after).toEqual(result.pose);expect(result.registry).toBe(2);expect(errors).toEqual([]);
});

test('진공은 실제 표면 간격 0.1mm까지 흡착하고 초과·대각선 거리·빈 공간은 제외한다',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  const a=window.__vacuum,app=a.equipmentApp;
  const box=(name,position,dimensions={x:20,y:20,z:20})=>{const m=a.createPrimitiveShapeRoot('box',dimensions,{name});m.position.fromArray(position);a.state.scene.add(m);a.state.models.push(m);return m;};
  const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
  const trials=[{gap:0},{gap:0.05},{gap:0.1},{gap:0.1001},{gap:0.08,diagonal:true},{gap:0.1,rotated:true}];
  const held=trials.map((trial,i)=>{
   const x=i*100,pad=box('경계 패드 '+i,[x,0,20+trial.gap]),obj=box('경계 제품 '+i,[x,0,0]);
   if(trial.diagonal)pad.position.x+=20+trial.gap;
   if(trial.rotated){pad.rotation.z=Math.PI/4;obj.rotation.z=Math.PI/4;}
   app.save({id:'boundary-object-'+i,type:'OBJECT',movingRef:ref(obj)});
   const def=app.save({id:'boundary-vacuum-'+i,type:'VACUUM',movingRef:ref(pad)});
   app.runtime.applyVacuum(def,true);const acquired=!!def.runtime.heldRef;
   app.runtime.applyVacuum(def,false);if(def.runtime.heldRef)throw new Error('파기 후에도 흡착 상태가 남았습니다.');
   return acquired;
  });
  const frame=new a.THREE.Group();frame.userData.uploaded=true;frame.userData.placement='scene';frame.add(box('왼쪽 프레임',[980,0,0],{x:2,y:20,z:20}),box('오른쪽 프레임',[1020,0,0],{x:2,y:20,z:20}));a.state.scene.add(frame);a.state.models.push(frame);
  const pad=box('빈 공간 패드',[1000,0,0],{x:2,y:2,z:2});app.save({id:'frame-object',type:'OBJECT',movingRef:ref(frame)});const def=app.save({id:'frame-vacuum',type:'VACUUM',movingRef:ref(pad)});app.runtime.applyVacuum(def,true);
  return {held,hollow:!!def.runtime.heldRef};
 });
 expect(result.held).toEqual([true,true,true,false,false,true]);expect(result.hollow).toBe(false);
});

test('컨베이어는 등록된 항목만 이송하고 등록 해제하면 멈춘다',async({page})=>{
 const errors=await setup(page);const result=await page.evaluate(()=>{
 const a=window.__vacuum,app=a.equipmentApp;const box=(name,d,xyz)=>{const m=a.createPrimitiveShapeRoot('box',d,{name});m.position.fromArray(xyz);a.state.scene.add(m);a.state.models.push(m);return m;};const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
 const belt=box('벨트',{x:800,y:160,z:30},[0,0,0]),yes=box('등록품',{x:20,y:20,z:20},[-100,-30,30]),no=box('미등록품',{x:20,y:20,z:20},[-100,30,30]);
 app.save({id:'objects',type:'OBJECT',movingRef:ref(yes)});a.state.ioFunctionMappings=[{id:'belt',enabled:true,action:'CONVEYOR',direction:'OUT',address:512,triggerValue:1,gripObjectRef:'conveyor:'+a.ensureWorkspaceModelId(belt),conveyorAxis:'X',conveyorSpeed:100}];a.writeOlpAddress('Out[512]',1);
 a.updateConveyorSimulation(0);a.updateConveyorSimulation(100);const moved=yes.position.x;app.remove('objects');a.updateConveyorSimulation(200);return {moved,no:no.position.x,stopped:yes.position.x};
 });expect(result.moved).toBeCloseTo(-90);expect(result.no).toBe(-100);expect(result.stopped).toBe(result.moved);expect(errors).toEqual([]);
});
test('로봇 Tool의 진공 패드는 로봇 자세를 따라가고 등록을 해제하면 물체를 놓는다',async({page})=>{
 const errors=await setup(page);await page.locator('#model-select').selectOption('robot:IR-R10H-120');await page.waitForFunction(()=>window.__vacuum.state.models.some(m=>m.userData.tcpFrame));
 const result=await page.evaluate(()=>{
 const a=window.__vacuum,app=a.equipmentApp,robot=a.state.models.find(m=>m.userData.tcpFrame);const box=(name,z)=>{const m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});m.position.z=z;a.state.scene.add(m);a.state.models.push(m);return m;};const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
 const pad=box('Tool 패드',20),obj=box('제품',0);a.getRobotToolMountFrame(robot).attach(pad);pad.userData.attachmentHost=robot;pad.userData.placement='tcp';
 app.save({id:'objects',type:'OBJECT',movingRef:ref(obj)});const def=app.save({id:'vacuum',type:'VACUUM',movingRef:ref(pad)},{forward:512,reverse:null});a.writeOlpAddress('Out[512]',1);app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,0);const attached=obj.userData.attachmentHost===robot;
 a.applyRobotTravelAxis(robot,[50,0,0,0,0,0]);app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,20);const moved=obj.getWorldPosition(new a.THREE.Vector3()).toArray();app.remove('objects');const released=!def.runtime.heldRef;const world=obj.getWorldPosition(new a.THREE.Vector3()).toArray();return {attached,moved,released,world,placement:obj.userData.placement};
 });expect(result.attached).toBe(true);expect(result.moved[0]).toBeCloseTo(50);expect(result.released).toBe(true);expect(result.world).toEqual(result.moved);expect(result.placement).toBe('scene');expect(errors).toEqual([]);
});

test('등록된 하위 부품만 이송하고 고정 행렬 부품의 이동도 화면과 일치한다',async({page})=>{
 await setup(page);const result=await page.evaluate(()=>{
 const a=window.__vacuum,app=a.equipmentApp;const box=(name,d,p)=>{const m=a.createPrimitiveShapeRoot('box',d,{name});m.position.fromArray(p);return m;};
 const belt=box('벨트',{x:800,y:160,z:30},[0,0,0]),root=box('제품 조립',{x:1,y:1,z:1},[0,0,0]),part=box('등록 부품',{x:20,y:20,z:20},[-100,0,30]),other=box('미등록 부품',{x:20,y:20,z:20},[-200,0,30]);root.add(part,other);root.userData.importedParts=[part,other];root.userData.uploaded=true;delete root.userData.primitiveShape;part.updateMatrix();part.matrixAutoUpdate=false;
 a.state.scene.add(belt,root);a.state.models.push(belt,root);app.save({id:'part-object',type:'OBJECT',movingRef:'equipment-model:'+a.ensureWorkspaceModelId(root)+'/0'});a.state.ioFunctionMappings=[{id:'belt',enabled:true,action:'CONVEYOR',direction:'OUT',address:512,triggerValue:1,gripObjectRef:'conveyor:'+a.ensureWorkspaceModelId(belt),conveyorAxis:'X',conveyorSpeed:100}];a.writeOlpAddress('Out[512]',1);a.updateConveyorSimulation(0);a.updateConveyorSimulation(100);return {local:part.position.x,world:part.getWorldPosition(new a.THREE.Vector3()).x,other:other.position.x,root:root.position.x};
 });expect(result.local).toBeCloseTo(-90);expect(result.world).toBeCloseTo(-90);expect(result.other).toBe(-200);expect(result.root).toBe(0);
});

test('그리퍼는 오브젝트 등록을 해제한 물체를 잡지 않고 재등록하면 잡는다',async({page})=>{
 const errors=await setup(page);await page.evaluate(()=>window.__equipment=window.__vacuum);const id=await createEquipmentFixture(page,'GRIPPER');
 const result=await page.evaluate(id=>{
 const a=window.__vacuum,app=a.equipmentApp,registration=a.state.equipmentDefinitions.find(d=>d.type==='OBJECT');const saved={...registration};app.remove(registration.id);const def=a.state.equipmentDefinitions.find(d=>d.id===id);
 const close=()=>{app.runtime.start();app.runtime.lastTime=0;app.runtime.manual.set(def.id,'FORWARD');for(let n=1;n<=90;n++)app.runtime.update(a.state.equipmentDefinitions,[],n*1000/60);app.runtime.stop();};close();const ignored=!def.runtime.heldRef;app.runtime.reset([def]);app.save(saved);close();return {ignored,held:!!def.runtime.heldRef,position:def.runtime.position};
 },id);expect(result.ignored).toBe(true);expect(result.held).toBe(true);expect(result.position).toBeCloseTo(50);expect(errors).toEqual([]);
});

test('여러 진공 패드가 등록된 부품과 접촉하는 동안 정상 접촉을 허용한다',async({page})=>{
 await setup(page);const result=await page.evaluate(()=>{
 const a=window.__vacuum,app=a.equipmentApp;const box=name=>a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});const root=box('조립 제품'),part=box('등록 부분'),other=box('미등록 부분'),pad=box('패드1'),pad2=box('패드2');root.add(part,other);root.userData.uploaded=true;root.userData.importedParts=[part,other];delete root.userData.primitiveShape;pad.position.z=20;pad2.position.z=20;a.state.scene.add(root,pad,pad2);a.state.models.push(root,pad,pad2);const ref=(m,index=-1)=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/'+index;
 app.save({id:'object',type:'OBJECT',movingRef:ref(root,0)});const vacuum=app.save({id:'vacuum',type:'VACUUM',movingRefs:[ref(pad),ref(pad2)]});app.runtime.manual.set(vacuum.id,'FORWARD');app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,[],0);const expected=app.expectedContact({objectA:pad2,objectB:part});app.runtime.release(vacuum);
 return {expected};
 });expect(result.expected).toBe(true);

});


test('오브젝트 폼에는 방향·거리·속도·IO 항목이 없고 다른 종류를 선택하면 복원된다',async({page})=>{
 const errors=await setup(page);await page.evaluate(()=>{const a=window.__vacuum,m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'등록 대상'});a.state.scene.add(m);a.state.models.push(m);a.equipmentApp.ui.open('equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1');});
 const form=page.locator('#equipment-form');await form.locator('[name="type"]').selectOption('OBJECT');
 for(const key of ['axis','travel','speed','reverseSpeed','ioTrigger','forwardAddress','reverseAddress','feedbackHome','feedbackEnd'])await expect(form.locator('[name="'+key+'"]')).toHaveCount(0);
 await expect(form.locator('fieldset')).toHaveCount(2);await expect(form.locator('button[type="submit"]')).toHaveText('오브젝트 등록');await expect(page.locator('#equipment-parts legend')).toHaveText('2. 오브젝트 선택');await form.locator('button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('등록했습니다');
 await form.locator('[name="type"]').selectOption('CYLINDER');for(const key of ['axis','travel','speed','forwardAddress','reverseAddress'])await expect(form.locator('[name="'+key+'"]')).toBeVisible();
 await form.locator('[name="type"]').selectOption('OBJECT');await form.locator('[name="type"]').selectOption('VACUUM');await expect(form.locator('[name="forwardAddress"]')).toBeVisible();await expect(form.locator('[name="axis"]')).toBeHidden();expect(errors).toEqual([]);
});


test('진공 폼은 패드와 흡착 Output만 표시하고 저장·편집·종류 전환을 지원한다',async({page})=>{
 const errors=await setup(page);await page.evaluate(()=>{const a=window.__vacuum,m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'흡착 패드'});a.state.scene.add(m);a.state.models.push(m);a.equipmentApp.ui.open('equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1');});
 const form=page.locator('#equipment-form');await form.locator('[name="type"]').selectOption('VACUUM');
 for(const key of ['axis','travel','speed','reverseSpeed','feedbackHome','feedbackEnd','bodyRef','robotRef'])await expect(form.locator('[name="'+key+'"]')).toHaveCount(0);
 await expect(page.locator('#equipment-advanced')).toHaveCount(0);await expect(page.locator('.equipment-header h2')).toHaveText('진공 설정');await expect(page.locator('#equipment-parts legend')).toHaveText('2. 흡착 패드 선택');
 await form.locator('[name="forwardAddress"]').fill('512');await form.locator('button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('저장했습니다');await expect(page.locator('.equipment-header h2')).toHaveText('진공 편집');await expect(form.locator('[name="forwardAddress"]')).toHaveValue('512');
 const mappings=await page.evaluate(()=>window.__vacuum.state.ioFunctionMappings);expect(mappings).toHaveLength(1);expect(mappings[0].direction).toBe('OUT');expect(mappings[0].address).toBe(512);
 await page.locator('#equipment-current-controls [data-equipment-command="EDIT"]').click();await expect(form.locator('[name="forwardAddress"]')).toHaveValue('512');
 await form.locator('[name="type"]').selectOption('OBJECT');await expect(page.locator('#equipment-io')).toHaveCount(0);
 await form.locator('[name="type"]').selectOption('CYLINDER');for(const key of ['axis','speed','travel','reverseAddress','feedbackHome','feedbackEnd'])await expect(form.locator('[name="'+key+'"]')).toBeVisible();
 await form.locator('[name="type"]').selectOption('VACUUM');await expect(form.locator('[name="forwardAddress"]')).toHaveValue('512');expect(errors).toEqual([]);
});


test('진공 흡착 감지 Input은 등록·복원되고 실제 흡착과 해제를 따른다',async({page})=>{
 const errors=await setup(page);await page.evaluate(()=>{const a=window.__vacuum,box=name=>a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name}),pad=box('감지 패드'),object=box('감지 오브젝트');pad.position.z=20;a.state.scene.add(pad,object);a.state.models.push(pad,object);a.equipmentApp.save({id:'registered',type:'OBJECT',movingRef:'equipment-model:'+a.ensureWorkspaceModelId(object)+'/-1'});a.equipmentApp.ui.open('equipment-model:'+a.ensureWorkspaceModelId(pad)+'/-1');});
 const form=page.locator('#equipment-form');await form.locator('[name="type"]').selectOption('VACUUM');await expect(form.locator('[name="feedbackGrip"]')).toBeVisible();await form.locator('[name="feedbackGrip"]').fill('514');await form.locator('button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('저장했습니다');await expect(form.locator('[name="feedbackGrip"]')).toHaveValue('514');
 const result=await page.evaluate(async()=>{const a=window.__vacuum,app=a.equipmentApp,def=a.state.equipmentDefinitions.find(d=>d.type==='VACUUM');app.runtime.manual.set(def.id,'FORWARD');app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,[],0);const on=a.readOlpSimulatorBit('IN',514);app.runtime.manual.set(def.id,'REVERSE');app.runtime.update(a.state.equipmentDefinitions,[],16);const off=a.readOlpSimulatorBit('IN',514);const snapshot=JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));await a.restoreWorkspaceSnapshot(snapshot);return {on,off,input:a.state.equipmentDefinitions.find(d=>d.type==='VACUUM').feedbackGrip};});expect(result).toEqual({on:1,off:0,input:514});expect(errors).toEqual([]);
});


test('기존 잡기 UI를 제거하고 진공 흡착·파기 Output을 각각 매핑한다',async({page})=>{
 const errors=await setup(page);
 for(const id of ['program-add-grip-use','model-use-grip-object','model-release-grip-object','virtual-controller-grip-toggle'])await expect(page.locator('#'+id)).toHaveCount(0);
 await page.evaluate(()=>{const a=window.__vacuum,box=name=>a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name}),pad=box('분리 패드'),object=box('분리 오브젝트');pad.position.z=20;a.state.scene.add(pad,object);a.state.models.push(pad,object);a.equipmentApp.save({id:'object',type:'OBJECT',movingRef:'equipment-model:'+a.ensureWorkspaceModelId(object)+'/-1'});a.equipmentApp.ui.open('equipment-model:'+a.ensureWorkspaceModelId(pad)+'/-1');});
 const form=page.locator('#equipment-form');await form.locator('[name="type"]').selectOption('VACUUM');await expect(form.locator('[name="reverseAddress"]')).toBeVisible();await expect(page.locator('#equipment-reverse-label')).toHaveText('파기 Output 번호');await form.locator('[name="forwardAddress"]').fill('512');await form.locator('[name="reverseAddress"]').fill('513');await form.locator('button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
 await page.evaluate(()=>{const a=window.__vacuum;a.writeOlpAddress('Out[512]',1);});await expect.poll(()=>page.evaluate(()=>!!window.__vacuum.state.equipmentDefinitions.find(d=>d.type==='VACUUM').runtime.heldRef)).toBe(true);
 await page.evaluate(()=>window.__vacuum.writeOlpAddress('Out[513]',1));await expect.poll(()=>page.evaluate(()=>!!window.__vacuum.state.equipmentDefinitions.find(d=>d.type==='VACUUM').runtime.heldRef)).toBe(false);
 await page.locator('#equipment-close').click();await page.locator('#btn-io-simulator').click();await page.locator('#io-function-mapping-button').click();
 const action=page.locator('#io-function-mapping-action');await expect(action.locator('option[value="GRIP_USE"],option[value="GRIP_RELEASE"]')).toHaveCount(0);await action.selectOption('VACUUM');await expect(page.locator('#io-equipment-command option')).toHaveText(['흡착','파기']);await expect(page.locator('#io-function-mapping-direction')).toHaveValue('OUT');
 const rows=page.locator('[data-io-function-mapping-id]');await expect(page.locator('[data-io-function-mapping-field="equipmentCommand"] option')).toHaveText(['흡착','파기','흡착','파기']);
 await expect(action.locator('option[value="VACUUM_RELEASE"]')).toHaveText('파기');await action.selectOption('VACUUM_RELEASE');await expect(page.locator('#io-function-mapping-grip-target option:checked')).not.toHaveValue('');await expect(page.locator('#io-function-mapping-direction')).toHaveValue('OUT');await page.locator('#io-function-mapping-address').fill('');await page.locator('#io-function-mapping-address').fill('514');await page.locator('#io-function-mapping-add').click();await expect(rows).toHaveCount(3);const addedAction=page.locator('[data-io-function-mapping-field="action"]').last();await expect(addedAction).toHaveValue('VACUUM_RELEASE');await addedAction.selectOption('VACUUM');await expect(page.locator('[data-io-function-mapping-field="equipmentCommand"]').last()).toHaveValue('FORWARD');await page.locator('[data-io-function-mapping-field="action"]').last().selectOption('VACUUM_RELEASE');await expect(page.locator('[data-io-function-mapping-field="equipmentCommand"]').last()).toHaveValue('REVERSE');await page.evaluate(()=>{const a=window.__vacuum;a.writeOlpAddress('Out[513]',0);});await expect.poll(()=>page.evaluate(()=>!!window.__vacuum.state.equipmentDefinitions.find(d=>d.type==='VACUUM').runtime.heldRef)).toBe(true);await page.evaluate(()=>window.__vacuum.writeOlpAddress('Out[514]',1));await expect.poll(()=>page.evaluate(()=>!!window.__vacuum.state.equipmentDefinitions.find(d=>d.type==='VACUUM').runtime.heldRef)).toBe(false);
 const saved=await page.evaluate(async()=>{const a=window.__vacuum,s=JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));await a.restoreWorkspaceSnapshot(s);return a.state.ioFunctionMappings.filter(m=>m.action==='VACUUM').map(m=>[m.equipmentCommand,m.address]);});expect(saved).toEqual([['FORWARD',512],['REVERSE',513],['REVERSE',514]]);expect(errors).toEqual([]);
});


test('로봇 진공에 흡착된 그룹 오브젝트는 파기와 프로젝트 복원 후에도 원래 폴더로 돌아간다',async({page})=>{
 const errors=await setup(page);await page.locator('#model-select').selectOption('robot:IR-R10H-120');await page.waitForFunction(()=>window.__vacuum.state.models.some(m=>m.userData.tcpFrame));
 await page.evaluate(()=>{
  const a=window.__vacuum,app=a.equipmentApp,robot=a.state.models.find(m=>m.userData.tcpFrame);const box=(name,z)=>{const m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});m.position.z=z;a.state.scene.add(m);a.state.models.push(m);return m;};const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
  const pad=box('회귀 패드',20),obj=box('폴더 제품',0);a.getRobotToolMountFrame(robot).attach(pad);pad.userData.attachmentHost=robot;pad.userData.placement='tcp';
  a.state.modelGroups=[{name:'제품 폴더',modelIds:[a.ensureWorkspaceModelId(obj)],collapsed:true,treeOrderId:'products'}];a.renderModelTree();
  app.save({id:'folder-objects',type:'OBJECT',movingRef:ref(obj)});app.save({id:'folder-vacuum',type:'VACUUM',movingRef:ref(pad)},{forward:512,reverse:513});
  a.writeOlpAddress('Out[512]',1);app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,0);app.runtime.stop();
 });
 const folder=page.locator('.model-tree-model-group').filter({hasText:'제품 폴더'});await expect(folder).toHaveCount(1);await expect(folder.locator('.model-tree-button').filter({hasText:'폴더 제품'})).toHaveCount(0);
 expect(await page.evaluate(()=>window.__vacuum.state.models.find(m=>m.userData.modelName==='폴더 제품').userData.placement)).toBe('grip-object');
 await page.evaluate(async()=>{const a=window.__vacuum;const snapshot=JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));await a.restoreWorkspaceSnapshot(snapshot);a.writeOlpAddress('Out[513]',1);a.equipmentApp.runtime.start();a.equipmentApp.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,0);a.equipmentApp.runtime.stop();});
 await expect(folder).toHaveCount(1);await expect(folder.locator('.model-tree-button').filter({hasText:'폴더 제품'})).toHaveCount(1);await expect(folder.locator('details')).not.toHaveAttribute('open','');
 expect(await page.evaluate(()=>window.__vacuum.state.models.find(m=>m.userData.modelName==='폴더 제품').userData.placement)).toBe('scene');expect(errors).toEqual([]);
});
