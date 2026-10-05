import { test, expect } from '@playwright/test';

test('테스트 모델과 툴은 참조 프로젝트의 부품 그룹으로 불러오고 저장한다',async({page})=>{
    test.setTimeout(180000);
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('init();\n','window.__ready = init();\n')+'\nwindow.__groupCheck = {state,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot};'});
    });
    await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__groupCheck);await page.evaluate(()=>window.__ready);
    await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');
    await expect(page.locator('#tcp-x')).toBeEnabled();
    await page.waitForFunction(()=>window.__groupCheck.state.models.some(m=>m.userData.tcpFrame));
    await page.locator('#btn-test-model').click();
    for(const id of ['conveyor','base','square-object','square-tray','stage-vac','teaching-kit','vision','dual-vac-lowered','dual-vac-raised','scara-adapter','single-vac','teaching-pointer']) await page.locator(`[data-test-quantity="${id}"]`).fill(id==='conveyor'?'2':'1');
    await page.locator('#btn-confirm-test-model').click();await expect(page.locator('#btn-test-model')).toBeEnabled({timeout:90000});
    await page.waitForFunction(()=>window.__groupCheck.state.models.filter(m=>m.userData.testModel).length===13,null,{timeout:120000});
    const groups=await page.evaluate(()=>window.__groupCheck.state.models.filter(m=>m.userData.testModel).map(m=>({name:m.userData.modelName,groups:(m.userData.modelPartGroups||[]).map(g=>g.name)})));
    expect(groups.find(m=>m.name==='Conveyor.step')?.groups).toEqual(['Base','Motor','Roller_1','Roller_2']);
    expect(groups.find(m=>m.name==='Base_1000x1000x500.step')?.groups).toHaveLength(9);
    expect(groups.find(m=>m.name==='Single_VAC_Tool.step')?.groups).toEqual(['Base','VAC pad']);
    for(const [name,expected] of [
        ['Square_Tray_3x3.step',['Base','Tray']],['Stage_VAC_module.step',['Base','Suction_pad','Vacuum_manifold']],
        ['Vision_module.step',['Base','Camera','Ring_light']],['Teaching_kit.step',['Base','Track','Label','Taget']],
        ['Dual_VAC_Tool_lowered.step',['Base','Road']],['Dual_VAC_Tool_raised.step',['Base','Road']],
        ['Teaching_pointer.step',['Base','TCP']],['Scara_adapter.step',['Tool Flange','Shaft Clamp']]
    ]) expect(groups.find(m=>m.name===name)?.groups).toEqual(expected);
    await expect(page.locator('.model-tree-model-group > details > summary')).toContainText('Object (1)');
    expect(await page.evaluate(()=>{const copies=window.__groupCheck.state.models.filter(m=>m.userData.modelName==='Conveyor.step');return copies[0].userData.modelPartGroups!==copies[1].userData.modelPartGroups;})).toBe(true);
    await page.evaluate(async()=>{const a=window.__groupCheck;
        const model=a.state.models.find(m=>m.userData.modelName==='Conveyor.step');model.userData.modelPartGroups[0].name='사용자 수정';model.userData.modelPartGroups[0].collapsed=false;
        window.__savedGroups=a.serializeWorkspaceSnapshot();await a.restoreWorkspaceSnapshot(window.__savedGroups);});
    expect(await page.evaluate(()=>window.__groupCheck.serializeWorkspaceSnapshot().modelPartGroups)).toEqual(await page.evaluate(()=>window.__savedGroups.modelPartGroups));
});

test('테스트 모델과 툴을 선택하면 수량 전체가 선택되어 바로 숫자를 바꾼다',async({page})=>{
    await page.goto('/2_3DSimulation/index.html');await page.locator('#btn-test-model').click();
    for(const id of ['square-object','single-vac']){
        const input=page.locator(`[data-test-quantity="${id}"]`),card=page.locator('.test-model-card').filter({has:input});
        await card.locator('strong').click();await page.keyboard.type('3');await expect(input).toHaveValue('3');
        await input.fill('18');await card.locator('strong').click();await page.keyboard.type('2');await expect(input).toHaveValue('2');
        await input.click();await page.keyboard.type('4');await expect(input).toHaveValue('4');
    }
    await expect(page.locator('#test-model-total')).toContainText('8');
});

test('테스트 창에서 모델과 툴을 미리보고 수량대로 일괄 추가한다', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__testAssets = { state, getArticulatedRobotForAttachment, ensureRobotTcpProfiles, getRobotToolMountFrame, selectSceneModel, THREE };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__testAssets);
    await page.locator('#btn-test-model').click();
    await expect(page.locator('[data-test-category="model"] .test-model-card')).toHaveCount(9);
    await expect(page.locator('[data-test-category="tool"] .test-model-card')).toHaveCount(6);
    await expect(page.locator('#btn-confirm-test-model')).toBeDisabled();
    await page.waitForFunction(() => [...document.querySelectorAll('.test-model-card img')].every(image => image.complete && image.naturalWidth > 0));
    await page.locator('[data-test-quantity="square-object"]').fill('2');
    await expect(page.locator('#test-model-total')).toContainText('2');
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 120_000 });
    const imported = await page.evaluate(() => window.__testAssets.state.models.filter(model => model.userData.testModel).map(model => ({ name: model.userData.modelName, placement: model.userData.placement, position: model.position.toArray() })));
    expect(imported).toHaveLength(2);
    expect(imported.filter(model => model.name === 'Square_object_40x40x40.step')).toHaveLength(2);
    expect(imported.every(model => model.placement === 'scene')).toBe(true);
    expect(imported.every(model => model.position.every(value => value === 0))).toBe(true);
    await expect(page.locator('#model-tree .model-tree-part-node')).toHaveCount(0);
    await expect(page.locator('#model-tree [data-model-tree-toggle]')).toHaveCount(0);
    await expect(page.locator('#model-tree .model-tree-button > .model-tree-name')).toHaveText([
        'Square_object_40x40x40 #1', 'Square_object_40x40x40 #2'
    ]);
    const firstModelButton = page.locator('#model-tree .model-tree-button').first();
    await expect(page.locator('.model-tree-model-group > details > summary')).toContainText('Object (2)');
    await page.locator('.model-tree-model-group .model-tree-group-toggle').click();
    await firstModelButton.click();
    expect(await page.evaluate(() => window.__testAssets.state.selectedModel === window.__testAssets.state.models[0])).toBe(true);
    await page.locator('#btn-test-model').click();
    await page.locator('[data-test-quantity="square-object"]').fill('1');
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 60_000 });
    expect(await page.evaluate(() => window.__testAssets.state.models.filter(model => model.userData.testModel).length)).toBe(3);
    await expect(page.locator('#model-tree .model-tree-button > .model-tree-name')).toHaveText([
        'Square_object_40x40x40 #1', 'Square_object_40x40x40 #2', 'Square_object_40x40x40 #3'
    ]);
    await page.locator('#btn-test-model').click();
    await page.locator('[data-test-quantity="single-vac"]').fill('1');
    let message = '';
    page.once('dialog', async dialog => { message = dialog.message(); await dialog.dismiss(); });
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#test-model-dialog')).toBeVisible();
    expect(message).toContain('로봇');
    await page.locator('#btn-cancel-test-model').click();
    expect(errors).toEqual([]);
});

test('교육용 모델링 버튼은 스테이지 버큠 없이 베이스와 모듈 4개, 트레이 오브젝트 9개를 생성한다', async ({ page }) => {
    test.setTimeout(180_000);
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__education = { state, THREE };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__education);
    await page.locator('#btn-test-model').click();
    const educationButton = await page.locator('#btn-educational-test-model').boundingBox();
    const cancelButton = await page.locator('#btn-cancel-test-model').boundingBox();
    expect(educationButton.x).toBeLessThan(cancelButton.x);
    await page.locator('#btn-educational-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 150_000 });
    const result = await page.evaluate(() => {
        const { state, THREE } = window.__education;
        const models = state.models.filter(model => model.userData.testModel);
        const trays = models.filter(model => model.userData.modelName === 'Square_Tray_3x3.step');
        const objects = models.filter(model => model.userData.modelName === 'Square_object_40x40x40.step');
        state.scene.updateMatrixWorld(true);
        return {
            models: models.map(model => {
                let color;
                model.traverse(child => { if (!color && child.isMesh) color = (Array.isArray(child.material) ? child.material[0] : child.material).color.getHexString(); });
                return { name: model.userData.modelName, position: model.position.toArray(), color };
            }),
            seated: objects.map(model => {
                const bounds = new THREE.Box3().setFromObject(model);
                const ray = new THREE.Raycaster(new THREE.Vector3(model.position.x, model.position.y, 210), new THREE.Vector3(0, 0, -1));
                const floor = ray.intersectObject(trays[0], true)[0];
                return { minZ: bounds.min.z, floorZ: floor?.point.z };
            })
        };
    });
    expect(result.models).toHaveLength(14);
    expect(result.models.some(model => model.name === 'Stage_VAC_module.step')).toBe(false);
    expect(result.models.slice(0, 5).map(model => model.position)).toEqual([
        [100, 350, 0], [650, -350, 0], [650, 0, 0], [-50, -350, 0], [0, 0, 0]
    ]);
    expect(result.models[4].name).toBe('Base_1000x1000x500.step');
    const colors = new Map(result.models.map(model => [model.name, model.color]));
    expect(new Set(colors.values()).size).toBe(colors.size);
    expect(result.models.filter(model => model.name === 'Square_object_40x40x40.step').every(model => model.color === colors.get('Square_object_40x40x40.step'))).toBe(true);
    expect(result.seated).toHaveLength(9);
    for (const seat of result.seated) {
        expect(seat.floorZ).toBeCloseTo(176, 3);
        expect(seat.minZ).toBeCloseTo(seat.floorZ, 3);
    }
});

test('툴을 선택한 수량대로 로봇 TCP에 장착하고 기존 TCP 설정을 유지한다', async ({ page }) => {
    test.setTimeout(180_000);
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__testAssets = { state, getArticulatedRobotForAttachment, ensureRobotTcpProfiles, getRobotToolMountFrame, selectSceneModel, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, THREE };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await expect(page.locator('#model-select option[value="robot:IR-S10-80Z20"]')).toHaveCount(1);
    await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');
    await page.waitForFunction(() => window.__testAssets?.state.models.some(model => model.userData.tcpFrame));
    const tcpBefore = await page.evaluate(() => {
        const api = window.__testAssets;
        return api.ensureRobotTcpProfiles(api.getArticulatedRobotForAttachment())[0].position.toArray();
    });
    await page.locator('#btn-test-model').click();
    await page.locator('[data-test-quantity="single-vac"]').fill('2');
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 90_000 });
    const result = await page.evaluate(() => {
        const api = window.__testAssets;
        const robot = api.getArticulatedRobotForAttachment();
        return {
            tcp: api.ensureRobotTcpProfiles(robot)[0].position.toArray(),
            tools: api.state.models.filter(model => model.userData.testModel).map(model => ({
                name: model.userData.modelName,
                ry: api.THREE.MathUtils.radToDeg(model.rotation.y),
                quaternion: model.quaternion.toArray(),
                placement: model.userData.placement, attached: model.parent === api.getRobotToolMountFrame(robot) && model.userData.attachmentHost === robot,
                tcpDistance: model.getWorldPosition(new api.THREE.Vector3()).distanceTo(robot.userData.tcpFrame.getWorldPosition(new api.THREE.Vector3()))
            }))
        };
    });
    expect(result.tcp).toEqual(tcpBefore);
    expect(result.tools).toHaveLength(3);
    expect(result.tools.filter(tool => tool.name === 'Scara_adapter.step')).toHaveLength(1);
    expect(result.tools.filter(tool => tool.name === 'Single_VAC_Tool.step')).toHaveLength(2);
    expect(result.tools.every(tool => tool.placement === 'tcp' && tool.attached)).toBe(true);
    expect(result.tools.every(tool => tool.tcpDistance < 0.001)).toBe(true);
    expect(result.tools.map(tool => tool.ry)).toEqual([180, 180, 180]);
    await expect(page.locator('#model-rotation-y')).toHaveValue('180');
    const restored = await page.evaluate(async () => {
        const api = window.__testAssets;
        await api.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot())));
        return api.state.models.filter(model => model.userData.testModel).map(model => ({
            name: model.userData.modelName, quaternion: model.quaternion.toArray(),
            attached: model.parent === api.getRobotToolMountFrame(model.userData.attachmentHost)
        }));
    });
    expect(restored.map(tool => tool.name)).toEqual(result.tools.map(tool => tool.name));
    restored.forEach((tool, index) => {
        expect(tool.attached).toBe(true);
        tool.quaternion.forEach((value, axis) => expect(value).toBeCloseTo(result.tools[index].quaternion[axis], 8));
    });
    await page.locator('#model-select').selectOption('robot:IR-S4-40Z15');
    await page.locator('#btn-add-robot-model-choice').click();
    await page.waitForFunction(() => window.__testAssets.state.models.filter(model => model.userData.tcpFrame).length === 2);
    await page.evaluate(() => {
        const api = window.__testAssets;
        api.selectSceneModel(api.state.models.find(model => model.userData.tcpFrame));
        api.selectSceneModel(null);
    });
    await page.locator('#btn-test-model').click();
    await page.locator('[data-test-quantity="teaching-pointer"]').fill('1');
    await page.locator('#btn-confirm-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 90_000 });
    expect(await page.evaluate(() => {
        const models = window.__testAssets.state.models;
        return models.find(model => model.userData.modelName === 'Teaching_pointer.step').userData.attachmentHost
            === models.find(model => model.userData.tcpFrame);
    })).toBe(true);
    expect(await page.evaluate(() => window.__testAssets.state.models.filter(model => model.userData.modelName === 'Scara_adapter.step').length)).toBe(1);

});

test('선택한 SCARA의 교육용 구성은 높이 베이스를 추가하고 Z200 배치와 프로젝트 복원을 유지한다', async ({ page }) => {
    test.setTimeout(180000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__scaraEducation = { state, THREE, selectSceneModel, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, getRobotControllerBaseFrame };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await expect(page.locator('#model-select option[value="robot:IR-S10-80Z20"]')).toHaveCount(1);
    await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');
    await page.waitForFunction(() => window.__scaraEducation?.state.models.some(model => model.userData.tcpFrame));
    await page.locator('#model-select').selectOption('robot:IR-S4-40Z15');
    await page.locator('#btn-add-robot-model-choice').click();
    await page.waitForFunction(() => window.__scaraEducation.state.models.filter(model => model.userData.tcpFrame).length === 2);
    await page.evaluate(() => {
        const a = window.__scaraEducation, robot = a.state.models.find(model => model.userData.tcpFrame);
        window.__otherRobotPosition = a.state.models.filter(model => model.userData.tcpFrame)[1].position.toArray();
        robot.position.set(120, -30, 0); a.selectSceneModel(robot);
    });
    await page.locator('#btn-test-model').click(); await page.locator('#btn-educational-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 150000 });
    const result = await page.evaluate(async () => {
        const a = window.__scaraEducation;
        function inspect() {
            const robots = a.state.models.filter(model => model.userData.tcpFrame);
            const base = a.state.models.find(model => model.userData.modelName === 'SCARA_height_base.step');
            a.state.scene.updateMatrixWorld(true);
            const bounds = new a.THREE.Box3().setFromObject(base);
            const frame = a.getRobotControllerBaseFrame(robots[0]);
            const mountingMesh = frame.children.find(child => child.userData.collisionRole === 'robot-mounted-base');
            return { robots: robots.map(robot => robot.position.toArray()), basePosition: base.position.toArray(),
                baseTop: bounds.max.z, robotBottom: new a.THREE.Box3().setFromObject(mountingMesh).min.z,
                groups: base.userData.modelPartGroups.map(group => group.name),
                testCount: a.state.models.filter(model => model.userData.testModel).length };
        }
        const before = inspect(); await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
        return { before, after: inspect(), otherRobotPosition: window.__otherRobotPosition };
    });
    expect(result.before.robots).toEqual([[120, -30, 200], result.otherRobotPosition]);
    expect(result.before.basePosition).toEqual([120, -30, 0]);
    expect(result.before.baseTop).toBeCloseTo(200, 3); expect(result.before.robotBottom).toBeCloseTo(200, 3);
    expect(result.before.groups).toEqual(['Mount Plates', 'Column', 'Gussets']); expect(result.before.testCount).toBe(15);
    expect(result.after).toEqual(result.before); expect(errors).toEqual([]);
});

test('6축 로봇에 테스트 툴을 불러오면 SCARA 어댑터를 자동 추가하지 않는다', async ({ page }) => {
    test.setTimeout(90000);
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__normalTool = { state };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await expect(page.locator('#model-select option[value="robot:IR-R10H-120"]')).toHaveCount(1);
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__normalTool?.state.models.some(model => model.userData.tcpFrame));
    await page.locator('#btn-test-model').click(); await page.locator('[data-test-quantity="single-vac"]').fill('1');
    await page.locator('#btn-confirm-test-model').click(); await expect(page.locator('#btn-test-model')).toBeEnabled({ timeout: 60000 });
    expect(await page.evaluate(() => window.__normalTool.state.models.filter(model => model.userData.testModel).map(model => model.userData.modelName))).toEqual(['Single_VAC_Tool.step']);
    expect(await page.evaluate(() => window.__normalTool.state.models.find(model => model.userData.testModel).rotation.y)).toBe(0);
});

for (const robotModel of ['IR-S4-40Z15','IR-S7-50Z20','IR-S7-60Z20','IR-S7-70Z20','IR-S10-60Z20','IR-S10-70Z20']) {
    test(`${robotModel} 교육용 모듈과 양쪽 트레이 슬롯의 XY를 실제 관절로 도달한다`, async ({page}) => {
        await page.route('**/2_3DSimulation/main.js*',async route=>{
            const response=await route.fetch();
            await route.fulfill({response,body:`${await response.text()}\nwindow.__compact={state,THREE,getRobotControllerBaseFrame,getEducationalModelSelection,getCurrentTcpPoseBase,solveRobotIK};`});
        });
        await page.goto('/2_3DSimulation/index.html');
        await expect(page.locator(`#model-select option[value="robot:${robotModel}"]`)).toHaveCount(1);
        await page.locator('#model-select').selectOption(`robot:${robotModel}`);
        await page.waitForFunction(()=>window.__compact?.state.models.some(model=>model.userData.tcpFrame));
        const results=await page.evaluate(()=>{
            const a=window.__compact,robot=a.state.models.find(model=>model.userData.tcpFrame);
            const selection=a.getEducationalModelSelection({robotModel:robot.userData.motionModelFolder});
            const pose=a.getCurrentTcpPoseBase(robot);
            const targets=selection.filter(item=>['conveyor','square-tray','vision'].includes(item.asset.id)).flatMap(item=>item.asset.id==='square-tray'
                ? [-58,0,58].flatMap(x=>[-58,0,58].map(y=>[item.position[0]+x,item.position[1]+y]))
                : item.asset.id==='conveyor' ? [-250,0,250].flatMap(x=>[-50,0,50].map(y=>[item.position[0]+x,item.position[1]+y]))
                : [item.position.slice(0,2)]);
            return targets.map(([x,y])=>{
                const position=a.getRobotControllerBaseFrame(robot).worldToLocal(new a.THREE.Vector3(x,y,0));
                position.z=pose.position.z;
                const target={position,quaternion:pose.quaternion.clone()};
                const solved=a.solveRobotIK(robot,target);
                return {x,y,success:solved.success,reason:solved.reason};
            });
        });
        expect(results.filter(result=>!result.success)).toEqual([]);
    });
}

test('짧은 리치 교육용 배치는 실제 형상 간 20 mm 간격과 S4 저장 복원을 유지한다', async ({page}) => {
    test.setTimeout(180000);
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:`${await response.text()}\nwindow.__compactImport={state,THREE,getEducationalModelSelection,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot};`});
    });
    await page.goto('/2_3DSimulation/index.html');
    await expect(page.locator('#model-select option[value="robot:IR-S4-40Z15"]')).toHaveCount(1);
    await page.locator('#model-select').selectOption('robot:IR-S4-40Z15');
    await page.waitForFunction(()=>window.__compactImport?.state.models.some(model=>model.userData.tcpFrame));
    await page.locator('#btn-test-model').click();await page.locator('#btn-educational-test-model').click();
    await expect(page.locator('#btn-test-model')).toBeEnabled({timeout:150000});
    await page.screenshot({path:test.info().outputPath('short-reach-layout.png')});
    const result=await page.evaluate(async()=>{
        const a=window.__compactImport;
        const inspect=()=>a.state.models.filter(model=>model.userData.testModel).map(model=>({name:model.userData.modelName,position:model.position.toArray()}));
        const before=inspect();
        a.state.scene.updateMatrixWorld(true);
        const moduleNames=['Conveyor.step','Square_Tray_3x3.step','Vision_module.step','SCARA_height_base.step'];
        const bounds=new Map(a.state.models.filter(model=>moduleNames.includes(model.userData.modelName)).map(model=>[model.userData.modelName,new a.THREE.Box3().setFromObject(model).translate(model.position.clone().negate())]));
        const layoutChecks=['IR-S4-40Z15','IR-S7-50Z20','IR-S7-60Z20','IR-S7-70Z20','IR-S10-60Z20','IR-S10-70Z20','IR-R4-56','IR-R4H-54','IR-R7H-70'].map(robotModel=>{
            const selection=a.getEducationalModelSelection({robotModel,robotType:robotModel.startsWith('IR-S')?'scara':'articulated'});
            const modules=selection.filter(item=>bounds.has(item.asset.file.split('/').pop())).map(item=>({id:item.asset.id,box:bounds.get(item.asset.file.split('/').pop()).clone().translate(new a.THREE.Vector3(...item.position))}));
            const overlaps=[],tooClose=[];
            for(let i=0;i<modules.length;i++)for(let j=i+1;j<modules.length;j++){
                const size=modules[i].box.clone().intersect(modules[j].box).getSize(new a.THREE.Vector3());
                if(size.x>0.01&&size.y>0.01&&size.z>0.01)overlaps.push([modules[i].id,modules[j].id]);
                const first=modules[i].box,second=modules[j].box;
                const gap=Math.max(first.min.x-second.max.x,second.min.x-first.max.x,first.min.y-second.max.y,second.min.y-first.max.y);
                if(gap<19.99)tooClose.push({pair:[modules[i].id,modules[j].id],gap});
            }
            return {robotModel,overlaps,tooClose};
        });
        await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));
        return {before,after:inspect(),layoutChecks};
    });
    expect(result.layoutChecks.filter(check=>check.overlaps.length)).toEqual([]);
    expect(result.layoutChecks.filter(check=>check.tooClose.length)).toEqual([]);
    expect(result.before.slice(0,5).map(model=>model.position)).toEqual([[40,250,0],[240,-190,0],[280,30,0],[-50,-250,0],[0,0,0]]);
    expect(result.before.some(model=>model.name==='Stage_VAC_module.step')).toBe(false);
    expect(result.before.filter(model=>model.name==='Square_object_40x40x40.step').map(model=>model.position)).toEqual([-58,0,58].flatMap(x=>[-58,0,58].map(y=>[240+x,-190+y,176])));
    expect(result.before.at(-1).position).toEqual([0,0,0]);expect(result.after).toEqual(result.before);
});

for (const robotModel of ['IR-R4-56','IR-R4H-54','IR-R7H-70']) {
    test(`${robotModel} 교육용 모듈과 트레이 슬롯의 작업 높이에 도달한다`, async ({page}) => {
        test.setTimeout(90000);
        await page.route('**/2_3DSimulation/main.js*',async route=>{
            const response=await route.fetch();
            await route.fulfill({response,body:`${await response.text()}\nwindow.__compact6={state,THREE,getEducationalModelSelection,solveRobotIK};`});
        });
        await page.goto('/2_3DSimulation/index.html');
        await expect(page.locator(`#model-select option[value="robot:${robotModel}"]`)).toHaveCount(1);
        await page.locator('#model-select').selectOption(`robot:${robotModel}`);
        await page.waitForFunction(()=>window.__compact6?.state.models.some(model=>model.userData.tcpFrame));
        const results=await page.evaluate(()=>{
            const a=window.__compact6,robot=a.state.models.find(model=>model.userData.tcpFrame);
            const selection=a.getEducationalModelSelection({robotModel:robot.userData.motionModelFolder});
            const targets=selection.filter(item=>['conveyor','square-tray','vision'].includes(item.asset.id)).flatMap(item=>item.asset.id==='square-tray'
                ? [-58,0,58].flatMap(x=>[-58,0,58].map(y=>[item.position[0]+x,item.position[1]+y]))
                : item.asset.id==='conveyor' ? [-250,0,250].flatMap(x=>[-50,0,50].map(y=>[item.position[0]+x,item.position[1]+y]))
                : [item.position.slice(0,2)]);
            const quaternion=new a.THREE.Quaternion().setFromEuler(new a.THREE.Euler(Math.PI,0,0));
            return targets.map(([x,y])=>{
                const solved=a.solveRobotIK(robot,{position:new a.THREE.Vector3(x,y,216),quaternion});
                return {x,y,success:solved.success,error:solved.positionError};
            });
        });
        expect(results.filter(result=>!result.success)).toEqual([]);
    });
}
