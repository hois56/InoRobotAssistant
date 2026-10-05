export async function createEquipmentFixture(page, type) {
 return page.evaluate(type => {
 const api=window.__equipment; const app=api.equipmentApp;
 const adapter={ definitions:()=>api.state.equipmentDefinitions, modelId:api.ensureWorkspaceModelId, createBox(name,dimensions,position,color){const model=api.createPrimitiveShapeRoot('box',{x:dimensions[0],y:dimensions[1],z:dimensions[2]},{name,materialColor:color});model.position.fromArray(position);api.state.scene.add(model);api.state.models.push(model);return model;} };
 const equipmentObjectRef=id=>'equipment-model:'+id+'/-1';
 const EQUIPMENT_LABELS={CYLINDER:'실린더',LINEAR_AXIS:'직선 외부 축',ROTARY_AXIS:'회전 외부 축',GRIPPER:'그리퍼',FILM_PEEL:'필름 박리'};
 const normalizeEquipmentDefinition=raw=>raw;

        const originX = adapter.definitions().filter(def=>def.type!=='OBJECT').length * 600;
        const ref = model => equipmentObjectRef(adapter.modelId(model));
        const box = (name, dimensions, position, color) => adapter.createBox(name, dimensions, [position[0] + originX, position[1], position[2]], color);
        let body, moving, second, carried, workpiece;
        if (type === 'CYLINDER') {
            body = box('실린더 본체', [80, 50, 50], [0, 0, 0], '#475569');
            moving = box('실린더 로드', [100, 20, 20], [60, 0, 15], '#cbd5e1');
        } else if (type === 'LINEAR_AXIS') {
            body = box('외부 축 레일', [400, 100, 20], [0, 0, 0], '#475569');
            moving = box('외부 축 테이블', [60, 90, 20], [-100, 0, 20], '#38bdf8');
            carried = box('외부 축 탑재물', [40, 40, 40], [-100, 0, 40], '#f59e0b');
        } else if (type === 'ROTARY_AXIS') {
            body = box('회전 축 고정부', [160, 160, 20], [0, 0, 0], '#475569');
            moving = box('회전 테이블', [140, 100, 20], [0, 0, 20], '#38bdf8');
            carried = box('회전 축 탑재물', [30, 30, 40], [45, 0, 40], '#f59e0b');
        } else if (type === 'GRIPPER') {
            body = box('그리퍼 본체', [120, 60, 20], [0, 0, 0], '#475569');
            moving = box('그리퍼 오른쪽 손가락', [10, 60, 80], [45, 0, 20], '#38bdf8');
            second = box('그리퍼 왼쪽 손가락', [10, 60, 80], [-45, 0, 20], '#38bdf8');
            workpiece = box('그리퍼 시험 공작물', [40, 40, 40], [0, 0, 25], '#f59e0b');
        } else {
            body = box('필름 제품', [300, 100, 10], [0, 0, 0], '#475569');
            moving = box('박리 필름', [300, 100, 0.5], [0, 0, 10.5], '#67e8f9');
        }
        const def = normalizeEquipmentDefinition({ id: `equipment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: `${EQUIPMENT_LABELS[type]} ${adapter.definitions().length + 1}`, type,
            bodyRef: ref(body), movingRef: ref(moving), secondRef: second ? ref(second) : '', carriedRef: carried ? ref(carried) : '',
            travel: type === 'FILM_PEEL' ? 300 : type === 'ROTARY_AXIS' ? 90 : type === 'LINEAR_AXIS' ? 200 : 100,
            speed: type === 'FILM_PEEL' ? 30 : type === 'ROTARY_AXIS' ? 45 : 100,
            axis: type === 'ROTARY_AXIS' ? 'Z' : 'X', gripHeight: 110
        });
        const saved=app.save(def); if(workpiece)app.save({id:saved.id+'-object',type:'OBJECT',movingRef:ref(workpiece)}); app.ui.edit(saved,saved.movingRef); if(!app.ui.dialog.open)app.ui.dialog.show(); app.ui.dialog.querySelector('#equipment-registered').open=true; app.ui.dialog.querySelector('#equipment-advanced').open=true; return saved.id;
 }, type);
}

export async function setEquipmentParts(page, role, refs) {
 const panel=page.locator('[data-equipment-role="'+role+'"]');
 while(await panel.locator('input[type="checkbox"]:checked').count())await panel.locator('input[type="checkbox"]:checked').first().click();
 for(const ref of refs){
  if(await page.evaluate(role=>window.__equipment.equipmentApp.ui.pendingRole!==role,role))await panel.locator('> button').click();
  const selector=await page.evaluate(ref=>{const target=window.__equipment.equipmentApp.resolve(ref);if(!target)throw Error(ref);return target.object===target.model?'button[data-model-tree-id="'+target.model.userData.modelTreeId+'"]':'button[data-model-part-id="'+target.object.userData.modelPartId+'"]';},ref);
  // These motion fixtures keep the mapping dialog open over the model browser.
  // Exercise its tree handler without moving unrelated panels in every fixture.
  await page.locator(selector).dispatchEvent('click');
 }
 if(await page.evaluate(role=>window.__equipment.equipmentApp.ui.pendingRole===role,role))await panel.locator('> button').click();
}
export async function createConveyorFixture(page) {
 await page.evaluate(()=>{const api=window.__conveyor||window.__conveyorInput;const box=(dimensions,xyz,name)=>{const model=api.createPrimitiveShapeRoot('box',dimensions,{name});model.position.fromArray(xyz);api.state.scene.add(model);api.state.models.push(model);return model;};const belt=box({x:800,y:160,z:30},[0,0,0],'벨트');[-270,-150,-30].forEach((x,i)=>box({x:40,y:40,z:40},[x,0,30],'공작물 '+i));api.equipmentApp.save({id:'conveyor-objects',type:'OBJECT',movingRefs:api.state.models.slice(1).map(model=>'equipment-model:'+api.ensureWorkspaceModelId(model)+'/-1')});api.updateUIStatus();const select=document.querySelector('#io-function-mapping-action');select.value='CONVEYOR';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#io-function-mapping-grip-target').value='conveyor:'+api.ensureWorkspaceModelId(belt);});
}
