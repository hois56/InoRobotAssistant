import { test, expect } from '@playwright/test';

test('가동부는 이동·회전된 상위 모델과 Tool 프레임의 로컬 방향을 따른다', async ({ page }) => {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__frames = { state, equipmentApp, THREE, createPrimitiveShapeRoot, ensureWorkspaceModelId, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__frames);
    const result = await page.evaluate(async () => {
        const { state, equipmentApp: app, THREE, createPrimitiveShapeRoot, ensureWorkspaceModelId, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot } = window.__frames;
        const root = createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '실린더 본체' });
        const rod = new THREE.Group(); rod.name = '로드'; rod.position.set(10, 0, 0); rod.updateMatrix(); rod.matrixAutoUpdate=false; root.add(rod); root.userData.importedParts = [rod];
        state.scene.add(root); state.models.push(root);
        const ref = `equipment-model:${ensureWorkspaceModelId(root)}/0`;
        app.save({ id: 'rod-motion', type: 'CYLINDER', movingRef: ref, speed: 50 });
        let def = state.equipmentDefinitions[0];
        root.position.set(200, 300, 40); root.rotation.z = Math.PI / 4;
        def.runtime.position = 50; app.runtime.apply(def, 0);
        const local = rod.position.toArray();
        const world = rod.getWorldPosition(new THREE.Vector3()).toArray();
        const expected = new THREE.Vector3(60, 0, 0).applyMatrix4(root.matrixWorld).toArray();
        // Reapply a serialized definition against the same authored hierarchy.
        state.equipmentDefinitions = JSON.parse(JSON.stringify(state.equipmentDefinitions));
        state.equipmentDefinitions[0].name='이전 동작 이름';
        app.restore(); def = state.equipmentDefinitions[0];
        const restored = app.resolve(ref).object.position.toArray();
        app.runtime.reset([def]);
        const reset = app.resolve(ref).object.position.toArray();
        return { local, world, expected, restored, reset, name:def.name };
    });
    result.local.forEach((value, i) => expect(value).toBeCloseTo([60, 0, 0][i], 6));
    result.world.forEach((value, i) => expect(value).toBeCloseTo(result.expected[i], 6));
    result.restored.forEach((value, i) => expect(value).toBeCloseTo(result.local[i], 6));
    result.reset.forEach((value, i) => expect(value).toBeCloseTo([10, 0, 0][i], 6));
    expect(result.name).toBe('실린더 / 실린더 본체');
});

test('로봇 Tool에 장착된 실린더는 로봇 관절 자세의 X 방향을 따라 움직인다', async ({page})=>{
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();await route.fulfill({response,body:`${await response.text()}\nwindow.__mounts={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,getRobotToolMountFrame,setJointAngle};`});
    });
    await page.goto('/2_3DSimulation/index.html');await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(()=>window.__mounts?.state.models.some(model=>model.userData.tcpFrame));
    const result=await page.evaluate(()=>{
        const api=window.__mounts,app=api.equipmentApp,robot=api.state.models.find(model=>model.userData.tcpFrame);
        const tool=api.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'실린더 Tool'}),rod=new api.THREE.Group();rod.position.x=10;tool.add(rod);tool.userData.importedParts=[rod];tool.userData.placement='tcp';tool.userData.attachmentHost=robot;
        api.getRobotToolMountFrame(robot).add(tool);api.state.models.push(tool);
        app.save({id:'tool-cylinder',type:'CYLINDER',movingRef:`equipment-model:${api.ensureWorkspaceModelId(tool)}/0`});
        robot.userData.joints.forEach((joint,i)=>api.setJointAngle(joint,[30,20,15,40,25,10][i],false));
        const def=api.state.equipmentDefinitions[0];def.runtime.position=50;app.runtime.apply(def,0);
        const world=rod.getWorldPosition(new api.THREE.Vector3()).toArray(),expected=new api.THREE.Vector3(60,0,0).applyMatrix4(tool.matrixWorld).toArray();
        const local=rod.position.toArray();return {world,expected,local};
    });
    result.world.forEach((value,i)=>expect(value).toBeCloseTo(result.expected[i],5));result.local.forEach((value,i)=>expect(value).toBeCloseTo([60,0,0][i],5));
});

test('실린더가 외부 회전 축 위에 있어도 등록 순서와 무관하게 상위 축을 따른다',async({page})=>{
    await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:`${await response.text()}\nwindow.__carrier={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId};`});});
    await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__carrier);
    const result=await page.evaluate(()=>{
        const api=window.__carrier,app=api.equipmentApp,root=api.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'회전축 탑재 실린더'}),rod=new api.THREE.Group();rod.position.x=10;root.add(rod);root.userData.importedParts=[rod];api.state.scene.add(root);api.state.models.push(root);
        const id=api.ensureWorkspaceModelId(root);
        app.save({id:'child',type:'CYLINDER',movingRef:`equipment-model:${id}/0`,travel:60,speed:60});
        app.save({id:'parent',type:'ROTARY_AXIS',movingRef:`equipment-model:${id}/-1`,axis:'Z',travel:90,speed:90});
        app.runtime.manual.set('child','FORWARD');app.runtime.manual.set('parent','FORWARD');app.runtime.start();app.runtime.lastTime=0;
        for(let i=1;i<=60;i++)app.runtime.update(api.state.equipmentDefinitions,[],i*1000/60);
        app.runtime.stop();return {world:rod.getWorldPosition(new api.THREE.Vector3()).toArray(),local:rod.position.toArray(),errors:[...app.runtime.status.values()].map(status=>status.error)};
    });
    result.world.forEach((value,i)=>expect(value).toBeCloseTo([0,70,0][i],5));result.local.forEach((value,i)=>expect(value).toBeCloseTo([70,0,0][i],5));expect(result.errors).toEqual(['','']);
});
