import { test, expect } from '@playwright/test';

test('모델 트리에서 동작과 IO를 함께 설정하고 프로그램 없이 IO 버튼으로 운전한다', async ({ page }) => {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__workflow = {state, equipmentApp, createPrimitiveShapeRoot, updateUIStatus, ensureWorkspaceModelId, readOlpSimulatorBit, writeOlpAddress, ensureMotionProgram, renderMotionProgramPanel, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, OlpRuntime, getOlpSharedIoAdapter};` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__workflow);
    await page.evaluate(() => {
        const api = window.__workflow;
        const model = api.createPrimitiveShapeRoot('box', {x:40,y:40,z:40}, {name:'이동할 치구'});
        api.state.scene.add(model); api.state.models.push(model); api.updateUIStatus();
    });
    await page.locator('#model-tree button[data-model-tree-id]').filter({hasText:'이동할 치구'}).click({button:'right'});
    await expect(page.locator('#model-motion-settings')).toBeVisible();
    await page.locator('#model-motion-settings').click();
    await expect(page.locator('[data-equipment-role="movingRef"] input:checked')).toHaveCount(1);
    await page.evaluate(() => {
        const api=window.__workflow, model=api.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'함께 움직일 부품'});
        model.position.set(250,0,0);api.state.scene.add(model);api.state.models.push(model);api.updateUIStatus();
    });
    await page.locator('[data-equipment-role="movingRef"] button').click();
    await page.locator('#model-tree button[data-model-tree-id]').filter({hasText:'함께 움직일 부품'}).click({button:'right'});
    await page.locator('#model-motion-add-part').click();
    await expect(page.locator('[data-equipment-role="movingRef"] input:checked')).toHaveCount(2);
    await page.locator('#equipment-form [name="travel"]').fill('');
    await page.locator('#equipment-form [name="travel"]').fill('60');
    await expect(page.locator('#equipment-form [name="travel"]')).toHaveValue('60');
    await page.locator('#equipment-form [name="forwardAddress"]').fill('512');
    await page.locator('#equipment-form [name="reverseAddress"]').fill('513');
    await page.locator('#equipment-form button[type="submit"]').click();
    await expect(page.locator('#equipment-error')).toContainText('저장');
    await page.screenshot({path:test.info().outputPath('model-motion-settings.png')});
    await expect(page.locator('[data-equipment-demo]')).toHaveCount(0);
    await expect(page.locator('#io-conveyor-test-create')).toHaveCount(0);
    await page.locator('#equipment-close').click();
    await page.locator('#btn-io-simulator').click();
    await page.locator('[data-io-simulator-range="fieldbus"]').click();
    await page.locator('[data-io-simulator-direction="OUT"]').first().click();
    await page.locator('[data-io-simulator-entry="OUT:bit:512"]').click();
    await expect.poll(() => page.evaluate(() => window.__workflow.state.equipmentDefinitions[0].runtime.position)).toBe(60);
    await page.locator('[data-io-simulator-entry="OUT:bit:512"]').click();
    await page.locator('[data-io-simulator-entry="OUT:bit:513"]').click();
    await expect.poll(() => page.evaluate(() => window.__workflow.state.equipmentDefinitions[0].runtime.position)).toBeCloseTo(0,6);
    const olpResult = await page.evaluate(async () => {
        const api=window.__workflow;api.writeOlpAddress('Out[513]',0);
        const def=api.state.equipmentDefinitions[0];api.equipmentApp.save({...def,feedbackHome:514,feedbackEnd:515});
        const runtime=new api.OlpRuntime({entryProgram:'main.pro',programs:[{path:'main.pro',text:'Start\nOut[512] = ON;\nWait In[515] == ON;\nOut[512] = OFF;\nOut[513] = ON;\nWait In[514] == ON;\nOut[513] = OFF;\nEnd'}],labels:{}},api.getOlpSharedIoAdapter());
        await runtime.run('main.pro');return {position:api.state.equipmentDefinitions[0].runtime.position,outputs:[512,513].map(bit=>api.readOlpSimulatorBit('OUT',bit))};
    });
    expect(olpResult.position).toBeCloseTo(0,6); expect(olpResult.outputs).toEqual([0,0]);
    await page.evaluate(() => {const api=window.__workflow;api.writeOlpAddress('Out[600]',1);api.equipmentApp.save({...api.state.equipmentDefinitions[0],travel:20},{direction:'OUT',triggerValue:1,forward:600,reverse:601});});
    await expect.poll(() => page.evaluate(() => window.__workflow.state.equipmentDefinitions[0].runtime.position)).toBe(20);
});

test('프로그램 패널의 IO 출력·입력 대기는 같은 설비와 센서를 사용하고 저장·복구된다', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__workflow = { state, equipmentApp, createPrimitiveShapeRoot, ensureWorkspaceModelId, ensureMotionProgram, readOlpSimulatorBit, writeOlpAddress, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, serializeMotionProgramFile };` });
    });
    await page.goto('/2_3DSimulation/index.html'); await page.waitForFunction(() => window.__workflow);
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__workflow.state.models.some(model => model.userData.tcpFrame));
    await page.evaluate(() => {
        const api = window.__workflow;
        const part = api.createPrimitiveShapeRoot('box', {x:30,y:30,z:30},{name:'실제 작업 치구'}); part.position.set(1500,0,0);
        api.state.scene.add(part); api.state.models.push(part);
        api.equipmentApp.save({id:'fixture-motion',type:'CYLINDER',movingRef:'equipment-model:'+api.ensureWorkspaceModelId(part)+'/-1',travel:60,speed:100,feedbackHome:514,feedbackEnd:515},{direction:'OUT',triggerValue:1,forward:600,reverse:601});
    });
    await page.locator('[data-panel-toggle="program-panel"]').click();
    for (const [type, address, value] of [['IO_WAIT',520,1],['IO_OUT',600,1],['IO_WAIT',515,1],['IO_OUT',600,0],['IO_OUT',601,1],['IO_WAIT',514,1],['IO_OUT',601,0]]) {
        await page.locator(type === 'IO_OUT' ? '#program-add-io-output' : '#program-add-io-wait').click();
        const row = page.locator('[data-program-step-id]').last();
        await row.locator('[data-program-step-io-address]').fill(''); await row.locator('[data-program-step-io-address]').fill(String(address));
        await row.locator('[data-program-step-io-address]').blur();
        await row.locator('[data-program-step-io-value]').selectOption(String(value));
    }
    await page.locator('#program-run-robot').click();
    await expect.poll(() => page.evaluate(() => window.__workflow.state.motionSessions.size)).toBe(1);
    expect(await page.evaluate(() => window.__workflow.readOlpSimulatorBit('OUT',600))).toBe(0);
    await page.locator('#btn-io-simulator').click(); await page.locator('[data-io-simulator-range="fieldbus"]').click();
    await page.locator('[data-io-simulator-entry="IN:bit:520"]').click();
    await expect.poll(() => page.evaluate(() => window.__workflow.state.equipmentDefinitions[0].runtime.position)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__workflow.state.motionSessions.size)).toBe(0);
    expect(await page.evaluate(() => window.__workflow.state.equipmentDefinitions[0].runtime.position)).toBeCloseTo(0,6);
    expect(await page.evaluate(() => [600,601].map(bit => window.__workflow.readOlpSimulatorBit('OUT',bit)))).toEqual([0,0]);
    const result = await page.evaluate(async () => {
        const api=window.__workflow; const snapshot=JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        const exported=api.serializeMotionProgramFile(); await api.restoreWorkspaceSnapshot(snapshot);
        const robot=api.state.models.find(model=>model.userData.tcpFrame);
        return {steps:api.ensureMotionProgram(robot).steps.map(step=>[step.motion,step.ioAddress,step.ioValue]), exported:exported.robots[0].steps.map(step=>[step.motion,step.ioAddress,step.ioValue])};
    });
    const expected=[['IO_WAIT',520,1],['IO_OUT',600,1],['IO_WAIT',515,1],['IO_OUT',600,0],['IO_OUT',601,1],['IO_WAIT',514,1],['IO_OUT',601,0]];
    expect(result.steps).toEqual(expected); expect(result.exported).toEqual(expected); expect(errors).toEqual([]);
});


test('완료 Input 번호를 화면에서 등록하고 편집·운전·프로젝트 복원에서 유지한다',async({page})=>{
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__inputTest={state,equipmentApp,createPrimitiveShapeRoot,ensureWorkspaceModelId,readOlpSimulatorBit,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot};'});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__inputTest);
 await page.evaluate(()=>{const a=window.__inputTest,m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'Input 테스트'});a.state.scene.add(m);a.state.models.push(m);a.equipmentApp.ui.open('equipment-model:'+a.ensureWorkspaceModelId(m)+'/-1');});
 const form=page.locator('#equipment-form');await form.locator('[name="feedbackHome"]').fill('514');await form.locator('[name="feedbackEnd"]').fill('515');await form.locator('[name="travel"]').fill('');await form.locator('[name="travel"]').fill('10');await form.locator('button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
 await expect(form.locator('[name="feedbackHome"]')).toHaveValue('514');await expect(form.locator('[name="feedbackEnd"]')).toHaveValue('515');
 await page.locator('#equipment-current-controls [data-equipment-command="FORWARD"]').click();await expect.poll(()=>page.evaluate(()=>window.__inputTest.readOlpSimulatorBit('IN',515))).toBe(1);
 await page.locator('#equipment-current-controls [data-equipment-command="REVERSE"]').click();await expect.poll(()=>page.evaluate(()=>window.__inputTest.readOlpSimulatorBit('IN',514))).toBe(1);
 const inputs=await page.evaluate(async()=>{const a=window.__inputTest,s=JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));await a.restoreWorkspaceSnapshot(s);return a.state.equipmentDefinitions.map(d=>[d.feedbackHome,d.feedbackEnd]);});expect(inputs).toEqual([[514,515]]);
});


test('프로그램 명령 선택에는 기존 잡기·놓기를 표시하지 않고 IO 출력만 사용한다',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/2_3DSimulation/index.html');await page.locator('#model-select').selectOption('robot:IR-R10H-120');await page.locator('[data-panel-toggle="program-panel"]').click();await page.locator('#program-add-io-output').click();const row=page.locator('[data-program-step-id]').last();await expect(row.locator('[data-program-step-motion]')).toHaveValue('IO_OUT');await expect(row.locator('option[value="GRIP_USE"],option[value="GRIP_RELEASE"]')).toHaveCount(0);await expect(row.locator('[data-program-step-io-address]')).toBeVisible();expect(errors).toEqual([]);
});
