import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + '\nwindow.__surface={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,getArticulatedRobots,getRobotToolMountFrame,getWorkspaceObjectPath,writeOlpAddress,readOlpSimulatorBit,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot,updateUIStatus,openModelContextMenu,isPickingVacuumFace:()=>Boolean(equipmentVacuumPick)};' });
    });
    await page.goto('/2_3DSimulation/index.html'); await page.waitForFunction(() => window.__surface?.state.workspaceRecovery.ready);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__surface.getArticulatedRobots().length === 1);
    return errors;
}

test('선택 면의 2mm 경계·단발 검색·양솔 유지·실린더 추종·전체 부품·저장 복원을 확인한다', async ({ page }) => {
    const errors = await setup(page);
    const result = await page.evaluate(async () => {
        const a=window.__surface, app=a.equipmentApp, T=a.THREE, robot=a.getArticulatedRobots()[0];
        const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';
        const tool=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'흡착 툴'});
        a.getRobotToolMountFrame(robot).add(tool);tool.userData.placement='tcp';tool.userData.attachmentHost=robot;a.state.models.push(tool);tool.updateWorldMatrix(true,true);
        const product=(name,xyz,registered=true)=>{const m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});
            m.position.copy(tool.localToWorld(new T.Vector3(...xyz)));m.quaternion.copy(tool.getWorldQuaternion(new T.Quaternion()));a.state.scene.add(m);a.state.models.push(m);
            if(registered)app.save({id:name,type:'OBJECT',movingRef:ref(m)});return m;};
        const near=product('near',[0,0,21.5]),boundary=product('boundary',[0,0,22]),far=product('far',[0,0,22.01]),side=product('side',[20.5,0,-5]),unregistered=product('unregistered',[0,0,20.5],false);
        const def=app.save({id:'surface-vacuum',type:'VACUUM',movingRef:ref(tool),vacuumMode:'FACE',vacuumFace:{meshPath:a.getWorkspaceObjectPath(tool,tool.children[0]),triangleRanges:[{first:8,last:9}]},feedbackGrip:620},{forward:512,reverse:513});
        const cylinder=app.save({id:'tool-cylinder',type:'CYLINDER',movingRef:ref(tool),axis:'Z',travel:100,speed:1000},{forward:514,reverse:515});
        let searches=0;const find=app.runtime.contact.find.bind(app.runtime.contact);app.runtime.contact.find=(...args)=>{searches++;return find(...args);};
        let time=0;const advance=()=>{for(let i=0;i<15;i++)app.runtime.update(a.state.equipmentDefinitions,a.state.ioFunctionMappings,time+=20);};
        const position=m=>m.getWorldPosition(new T.Vector3()), before=position(near).clone();
        a.writeOlpAddress('Out[512]',1);app.runtime.start();advance();
        const acquired=[near,boundary,far,side,unregistered].map(m=>m.userData.equipmentOwner===def.id),jump=position(near).distanceTo(before);
        a.writeOlpAddress('Out[512]',0);a.writeOlpAddress('Out[514]',1);advance();a.writeOlpAddress('Out[514]',0);advance();
        const travel=position(near).distanceTo(before),cylinderPosition=cylinder.runtime.position;
        far.position.copy(tool.localToWorld(new T.Vector3(0,0,20.5)));a.writeOlpAddress('Out[512]',1);advance();a.writeOlpAddress('Out[512]',0);advance();
        const noRescan=searches===1&&!far.userData.equipmentOwner, sensor=a.readOlpSimulatorBit('IN',620);
        a.writeOlpAddress('Out[513]',1);advance();a.writeOlpAddress('Out[513]',0);const releasePosition=position(near).clone();
        a.writeOlpAddress('Out[515]',1);advance();a.writeOlpAddress('Out[515]',0);advance();
        const released=!near.userData.equipmentOwner&&position(near).distanceTo(releasePosition)<1e-7;
        side.position.copy(tool.localToWorld(new T.Vector3(20.5,0,-5)));
        const whole=app.save({...def,vacuumMode:'WHOLE',vacuumFace:null,name:'전체 진공',customName:true},{forward:512,reverse:513});
        a.writeOlpAddress('Out[512]',1);advance();a.writeOlpAddress('Out[512]',0);advance();const wholeHeld=side.userData.equipmentOwner===whole.id;
        await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
        const restored=a.state.equipmentDefinitions.find(d=>d.id===whole.id);app.runtime.start();advance();
        const restoredInfo={mode:restored.vacuumMode,name:restored.name,customName:restored.customName,held:!!restored.runtime.heldRef};
        app.resetObjects(ref(side));advance();const resetReleased=!restored.runtime.vacuumActive&&!restored.runtime.heldRef;
        return {acquired,jump,travel,cylinderPosition,noRescan,searches,sensor,released,wholeHeld,resetReleased,restored:restoredInfo,objectMappings:a.state.ioFunctionMappings.some(m=>m.action==='OBJECT')};
    });
    expect(result.acquired).toEqual([true,true,false,false,false]);expect(result.jump).toBeCloseTo(0,6);expect(result.travel).toBeCloseTo(100,5);
    expect(result.cylinderPosition).toBe(100);expect(result.noRescan).toBe(true);expect(result.searches).toBe(2);expect(result.sensor).toBe(1);expect(result.released).toBe(true);expect(result.wholeHeld).toBe(true);
    expect(result.restored).toEqual({mode:'WHOLE',name:'전체 진공',customName:true,held:true});expect(result.resetReleased).toBe(true);expect(result.objectMappings).toBe(false);expect(errors).toEqual([]);
});

test('흡착 면 선택 중 화면 이동·회전·확대와 ESC 취소 후 면 선택을 지원한다', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await setup(page);
    const ref = await page.evaluate(() => {
        const a = window.__surface, T = a.THREE, robot = a.getArticulatedRobots()[0];
        const tool = a.createPrimitiveShapeRoot('box', { x: 40, y: 40, z: 40 }, { name: '탐색할 흡착 Tool' });
        a.getRobotToolMountFrame(robot).add(tool); tool.position.z = 100;
        tool.userData.placement = 'tcp'; tool.userData.attachmentHost = robot;
        a.state.models.push(tool); a.updateUIStatus();
        const ref = 'equipment-model:' + a.ensureWorkspaceModelId(tool) + '/-1';
        a.equipmentApp.ui.open(ref);
        const center = tool.localToWorld(new T.Vector3(0, 0, 20));
        const normal = new T.Vector3(0, 0, 1).transformDirection(tool.matrixWorld);
        a.state.selectedViewPivot.enabled = false;
        a.state.camera.position.copy(center).addScaledVector(normal, 240);
        a.state.camera.up.set(0, 1, 0); a.state.controls.target.copy(center);
        a.state.controls.update(); a.state.camera.lookAt(center); a.state.camera.updateMatrixWorld(true);
        return ref;
    });
    await page.locator('#equipment-form [name="type"]').selectOption('VACUUM');
    await page.locator('#equipment-pick-face').click();
    async function point() {
        return page.evaluate(ref => {
            const a = window.__surface, tool = a.equipmentApp.resolve(ref).object;
            a.state.camera.updateMatrixWorld(true);
            const p = tool.localToWorld(new a.THREE.Vector3(0, 0, 20)).project(a.state.camera);
            const r = a.state.renderer.domElement.getBoundingClientRect();
            return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
        }, ref);
    }
    async function drag(button, dx, dy) {
        const p = await point();
        await page.mouse.move(p.x, p.y); await page.mouse.down({ button });
        await page.mouse.move(p.x + dx, p.y + dy, { steps: 8 }); await page.mouse.up({ button });
    }
    const before = await page.evaluate(() => window.__surface.state.camera.position.toArray());
    await drag('right', 12, 8);
    await expect.poll(() => page.evaluate(before => window.__surface.state.camera.position
        .distanceTo(new window.__surface.THREE.Vector3().fromArray(before)), before)).toBeGreaterThan(1);
    expect(await page.evaluate(() => window.__surface.isPickingVacuumFace())).toBe(true);
    const orientation = await page.evaluate(() => window.__surface.state.camera.quaternion.toArray());
    await drag('left', 20, -10);
    expect(await page.evaluate(before => window.__surface.state.camera.quaternion
        .angleTo(new window.__surface.THREE.Quaternion().fromArray(before)), orientation)).toBeGreaterThan(0.001);
    // A navigation drag must not commit the face under its release position.
    expect(await page.evaluate(() => window.__surface.isPickingVacuumFace())).toBe(true);
    const distance = await page.evaluate(() => window.__surface.state.controls.getDistance());
    const zoomPoint = await point(); await page.mouse.move(zoomPoint.x, zoomPoint.y); await page.mouse.wheel(0, -180);
    await expect.poll(() => page.evaluate(() => window.__surface.state.controls.getDistance())).toBeLessThan(distance - 1);
    expect(await page.evaluate(() => window.__surface.isPickingVacuumFace())).toBe(true);
    await expect(page.locator('#equipment-dialog')).not.toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#equipment-dialog')).toBeVisible();
    expect(await page.evaluate(() => ({ picking: window.__surface.isPickingVacuumFace(), enabled: window.__surface.state.controls.enabled })))
        .toEqual({ picking: false, enabled: true });
    await page.locator('#equipment-pick-face').click();
    const clickPoint = await point();
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await expect(page.locator('#equipment-face-status')).toContainText('선택되었습니다');
    expect(await page.evaluate(() => ({ picking: window.__surface.isPickingVacuumFace(), enabled: window.__surface.state.controls.enabled })))
        .toEqual({ picking: false, enabled: true });
    expect(errors).toEqual([]);
});

test('오브젝트 등록만·실제 면 클릭·이름 편집·IO 세 행·우클릭 시험 메뉴를 지원한다', async ({ page }) => {
    const errors=await setup(page);
    const refs=await page.evaluate(()=>{
        const a=window.__surface,robot=a.getArticulatedRobots()[0],tool=a.createPrimitiveShapeRoot('box',{x:40,y:40,z:40},{name:'UI Tool'}),object=a.createPrimitiveShapeRoot('box',{x:10,y:10,z:10},{name:'제품'});
        a.getRobotToolMountFrame(robot).add(tool);tool.position.z=100;tool.userData.placement='tcp';tool.userData.attachmentHost=robot;a.state.scene.add(object);a.state.models.push(tool,object);a.updateUIStatus();
        const ref=m=>'equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1';a.equipmentApp.ui.open(ref(object));return {tool:ref(tool),object:ref(object)};
    });
    const form=page.locator('#equipment-form');await form.locator('[name="type"]').selectOption('OBJECT');
    await expect(form.locator('[name="forwardAddress"]')).toHaveCount(0);await expect(form.locator('[name="toolRef"]')).toHaveCount(0);await expect(page.locator('#equipment-parts')).toHaveCount(0);
    await expect(form.locator('[name="type"] option[value="GRIPPER"]')).toHaveCount(0);await expect(form.locator('[name="name"]')).toBeEditable();
    await form.locator('[name="name"]').fill('등록 제품');await form.locator('button[type="submit"]').click();
    await page.evaluate(ref=>window.__surface.equipmentApp.ui.open(ref),refs.tool);await form.locator('[name="type"]').selectOption('VACUUM');
    await page.evaluate(ref=>{
        const a=window.__surface,tool=a.equipmentApp.resolve(ref).object,center=tool.localToWorld(new a.THREE.Vector3(0,0,20));
        const normal=new a.THREE.Vector3(0,0,1).transformDirection(tool.matrixWorld);a.state.camera.position.copy(center).addScaledVector(normal,240);a.state.camera.up.set(0,1,0);a.state.controls.target.copy(center);a.state.controls.update();a.state.camera.lookAt(center);a.state.camera.updateMatrixWorld(true);
    },refs.tool);
    await page.locator('#equipment-pick-face').click();
    const point=await page.evaluate(ref=>{const a=window.__surface,tool=a.equipmentApp.resolve(ref).object,p=tool.localToWorld(new a.THREE.Vector3(0,0,20)).project(a.state.camera),r=a.state.renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},refs.tool);
    await page.mouse.click(point.x,point.y);
    await expect(page.locator('#equipment-face-status')).toContainText('선택되었습니다');
    await form.locator('[name="name"]').fill('상부 진공');await form.locator('[name="forwardAddress"]').fill('520');await form.locator('[name="reverseAddress"]').fill('521');await form.locator('[name="feedbackGrip"]').fill('622');
    const rows=await form.evaluate(form=>['ioTrigger','forwardAddress','reverseAddress','feedbackGrip'].map(name=>form.elements[name].getBoundingClientRect().top));
    expect(rows[0]).toBeLessThan(rows[1]);expect(rows[1]).toBe(rows[2]);expect(rows[3]).toBeGreaterThan(rows[1]);
    await form.locator('button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
    const saved=await page.evaluate(()=>window.__surface.state.equipmentDefinitions.find(d=>d.type==='VACUUM'));
    expect(saved.name).toBe('상부 진공');expect(saved.customName).toBe(true);expect(saved.vacuumFace.triangleRanges.length).toBeGreaterThan(0);
    await page.evaluate(ref=>{const a=window.__surface;a.equipmentApp.ui.dialog.close();a.openModelContextMenu({clientX:300,clientY:200},a.equipmentApp.resolve(ref).model);},refs.tool);
    await expect(page.locator('#model-motion-test-options')).toContainText('진공');await expect(page.locator('#model-motion-test-options')).toContainText('파기');
    await expect(page.locator('#model-motion-test-options [data-equipment-test-command="RESET"]')).toHaveCount(0);
    await page.locator('#model-motion-test-options [data-equipment-test-command="FORWARD"]').click();
    await expect.poll(()=>page.evaluate(()=>window.__surface.state.equipmentDefinitions.find(d=>d.type==='VACUUM').runtime.vacuumActive)).toBe(true);
    await page.evaluate(ref=>window.__surface.openModelContextMenu({clientX:300,clientY:200},window.__surface.equipmentApp.resolve(ref).model),refs.tool);
    await page.locator('#model-motion-test-options [data-equipment-test-command="REVERSE"]').click();
    await expect.poll(()=>page.evaluate(()=>window.__surface.state.equipmentDefinitions.find(d=>d.type==='VACUUM').runtime.vacuumActive)).toBe(false);
    await page.evaluate(ref=>{
        const a=window.__surface;
        a.equipmentApp.save({id:'menu-cylinder',type:'CYLINDER',movingRef:ref,axis:'Z',travel:10,speed:100},{forward:524,reverse:525});
        a.openModelContextMenu({clientX:300,clientY:200},a.equipmentApp.resolve(ref).model);
    },refs.tool);
    await expect(page.locator('#model-motion-test-options [data-equipment-test-command="FORWARD"]')).toHaveCount(2);
    await expect(page.locator('#model-motion-test-options [data-equipment-test-command="REVERSE"]')).toHaveCount(2);
    await expect(page.locator('#model-motion-test-options [data-equipment-test-command="STOP"], #model-motion-test-options [data-equipment-test-command="RESET"]')).toHaveCount(0);
    await expect(page.locator('#model-object-reset')).not.toBeVisible();
    expect(errors).toEqual([]);
});
