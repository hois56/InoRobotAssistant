import { test, expect } from '@playwright/test';
import { createEquipmentFixture } from './helpers/equipment-fixtures.mjs';
async function setup(page) {
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__vacuum={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,writeOlpAddress,readOlpSimulatorBit,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,updateConveyorSimulation,getRobotToolMountFrame,applyRobotTravelAxis,renderModelTree};'});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__vacuum);return errors;
}

test('컨베이어는 등록된 항목만 이송하고 등록 해제하면 멈춘다',async({page})=>{
 const errors=await setup(page);const result=await page.evaluate(()=>{
 const a=window.__vacuum,app=a.equipmentApp;const box=(name,d,xyz)=>{const m=a.createPrimitiveShapeRoot('box',d,{name});m.position.fromArray(xyz);a.state.scene.add(m);a.state.models.push(m);return m;};const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
 const belt=box('벨트',{x:800,y:160,z:30},[0,0,0]),yes=box('등록품',{x:20,y:20,z:20},[-100,-30,30]),no=box('미등록품',{x:20,y:20,z:20},[-100,30,30]);
 app.save({id:'objects',type:'OBJECT',movingRef:ref(yes)});a.state.ioFunctionMappings=[{id:'belt',enabled:true,action:'CONVEYOR',direction:'OUT',address:512,triggerValue:1,gripObjectRef:'conveyor:'+a.ensureWorkspaceModelId(belt),conveyorAxis:'X',conveyorSpeed:100}];a.writeOlpAddress('Out[512]',1);
 a.updateConveyorSimulation(0);a.updateConveyorSimulation(100);const moved=yes.position.x;app.remove('objects');a.updateConveyorSimulation(200);return {moved,no:no.position.x,stopped:yes.position.x};
 });expect(result.moved).toBeCloseTo(-90);expect(result.no).toBe(-100);expect(result.stopped).toBe(result.moved);expect(errors).toEqual([]);
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

test('로봇에 연결된 그룹 오브젝트는 파기와 프로젝트 복원 후에도 원래 폴더로 돌아간다',async({page})=>{
 const errors=await setup(page);await page.locator('#model-select').selectOption('robot:IR-R10H-120');await page.waitForFunction(()=>window.__vacuum.state.models.some(m=>m.userData.tcpFrame));
 await page.evaluate(()=>{
  const a=window.__vacuum,app=a.equipmentApp,robot=a.state.models.find(m=>m.userData.tcpFrame);const box=(name,z)=>{const m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});m.position.z=z;a.state.scene.add(m);a.state.models.push(m);return m;};const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
  const pad=box('회귀 패드',20),obj=box('폴더 제품',0);a.getRobotToolMountFrame(robot).attach(pad);pad.userData.attachmentHost=robot;pad.userData.placement='tcp';
  a.state.modelGroups=[{name:'제품 폴더',modelIds:[a.ensureWorkspaceModelId(obj)],collapsed:true,treeOrderId:'products'}];a.renderModelTree();
  app.save({id:'folder-objects',type:'OBJECT',movingRef:ref(obj)});app.save({id:'folder-vacuum',type:'VACUUM',movingRef:ref(pad),vacuumMode:'WHOLE'},{forward:512,reverse:513});
  a.writeOlpAddress('Out[512]',1);app.runtime.start();app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,0);app.runtime.stop();
 });
 const folder=page.locator('.model-tree-model-group').filter({hasText:'제품 폴더'});await expect(folder).toHaveCount(1);await expect(folder.locator('.model-tree-button').filter({hasText:'폴더 제품'})).toHaveCount(0);
 expect(await page.evaluate(()=>window.__vacuum.state.models.find(m=>m.userData.modelName==='폴더 제품').userData.placement)).toBe('grip-object');
 await page.evaluate(async()=>{const a=window.__vacuum;const snapshot=JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));await a.restoreWorkspaceSnapshot(snapshot);a.writeOlpAddress('Out[513]',1);a.equipmentApp.runtime.start();a.equipmentApp.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,0);a.equipmentApp.runtime.stop();});
 await expect(folder).toHaveCount(1);await expect(folder.locator('.model-tree-button').filter({hasText:'폴더 제품'})).toHaveCount(1);await expect(folder.locator('details')).not.toHaveAttribute('open','');
 expect(await page.evaluate(()=>window.__vacuum.state.models.find(m=>m.userData.modelName==='폴더 제품').userData.placement)).toBe('scene');expect(errors).toEqual([]);
});
