import { test, expect } from '@playwright/test';

async function setTransformValue(page, selector, value) {
    const input=page.locator(selector);await input.click();await input.press('Control+a');
    await input.pressSequentially(value);await input.press('Enter');
}

test('그룹의 부모와 부착 모델을 함께 선택해도 부착 모델을 두 번 변환하지 않는다', async ({page}) => {
    const errors=await setup(page,false);
    await page.evaluate(()=>{
        const a=window.__treeMotion;
        const models=[-120,120,50].map((x,index)=>{
            const model=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'부착 검사 '+index});model.position.x=x;return model;
        });
        a.state.scene.add(models[0],models[1]);models[0].add(models[2]);
        models[2].userData.attachmentHost=models[0];models[2].userData.placement='tcp';a.state.models.push(...models);
        a.state.modelGroups=[{name:'부착 그룹',treeOrderId:'attachment-transform',collapsed:true,modelIds:models.slice(0,2).map(a.ensureWorkspaceModelId)}];a.updateUIStatus();
    });
    await page.locator('.model-tree-model-group .model-tree-group-name').click();
    await page.evaluate(()=>{const a=window.__treeMotion,child=a.state.models[2];a.state.modelSelection.set(child,child);a.state.selectionBatch=true;try{a.selectSceneModel(child);}finally{a.state.selectionBatch=false;}});
    await setTransformValue(page,'#model-position-x','-90');
    const worlds=()=>page.evaluate(()=>{const a=window.__treeMotion;return a.state.models.map(model=>model.getWorldPosition(new a.THREE.Vector3()).toArray().map(v=>Math.round(v)));});
    expect(await worlds()).toEqual([[-90,0,0],[150,0,0],[-40,0,0]]);
    await setTransformValue(page,'#model-rotation-z','90');
    expect(await worlds()).toEqual([[-90,0,0],[-90,240,0],[-90,50,0]]);
    expect(await page.evaluate(()=>window.__treeMotion.state.models[2].position.toArray())).toEqual([50,0,0]);expect(errors).toEqual([]);
});

test('모델 폴더 전체는 수치 이동·회전과 핸들 및 배치 미리보기에서 함께 변환된다', async ({page}) => {
    const errors=await setup(page,false);
    await page.evaluate(()=>{
        const a=window.__treeMotion;
        for(const [name,x] of [['그룹 A',-120],['그룹 B',120],['외부 모델',400]]){
            const model=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});
            model.position.x=x;a.state.scene.add(model);a.state.models.push(model);
        }
        a.state.modelGroups=[{name:'변환 그룹',treeOrderId:'transform-group',collapsed:true,modelIds:a.state.models.slice(0,2).map(a.ensureWorkspaceModelId)}];a.updateUIStatus();
    });
    const folder=page.locator('.model-tree-model-group .model-tree-group-name');await folder.click();
    const positions=()=>page.evaluate(()=>window.__treeMotion.state.models.map(model=>model.position.toArray().map(v=>Math.round(v*1000)/1000)));
    await setTransformValue(page,'#model-position-x','150');
    expect(await positions()).toEqual([[-90,0,0],[150,0,0],[400,0,0]]);
    await setTransformValue(page,'#model-rotation-z','90');
    expect(await positions()).toEqual([[150,-240,0],[150,0,0],[400,0,0]]);
    expect(await page.evaluate(()=>window.__treeMotion.state.models.map(model=>Math.round(model.rotation.z*180/Math.PI)))).toEqual([90,90,0]);
    await page.keyboard.press('Control+z');expect(await positions()).toEqual([[-90,0,0],[150,0,0],[400,0,0]]);
    await page.keyboard.press('Control+y');expect(await positions()).toEqual([[150,-240,0],[150,0,0],[400,0,0]]);
    await folder.click();await page.locator('[data-transform-mode="rotate"]').click();
    await page.evaluate(()=>{const c=window.__treeMotion.state.transformControls;c.dispatchEvent({type:'mouseDown'});c.object.position.y+=20;c.dispatchEvent({type:'objectChange'});c.dispatchEvent({type:'mouseUp'});});
    expect(await positions()).toEqual([[150,-220,0],[150,20,0],[400,0,0]]);
    await page.evaluate(()=>{
        const a=window.__treeMotion;a.activateModelPlacement(a.state.selectedModel);
        const mesh=a.state.selectedModel.children.find(child=>child.isMesh),localPoint=new a.THREE.Vector3();
        a.handleMeasurementSnapSelection({mesh,localPoint,worldPoint:mesh.localToWorld(localPoint.clone()),type:'vertex'});
        a.updatePlacementPreviewFromTranslation(new a.THREE.Vector3(0,30,0));
        a.updatePlacementPreviewFromTranslation(new a.THREE.Vector3(0,40,0));
    });
    expect(await positions()).toEqual([[150,-180,0],[150,60,0],[400,0,0]]);
    await page.evaluate(()=>window.__treeMotion.restorePlacementPreview());
    expect(await positions()).toEqual([[150,-220,0],[150,20,0],[400,0,0]]);
    await page.evaluate(async()=>{const a=window.__treeMotion;await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));});
    expect(await positions()).toEqual([[150,-220,0],[150,20,0],[400,0,0]]);expect(errors).toEqual([]);
});

test('하위 부품 폴더 변환은 회전된 부모에서도 그룹 부품만 이동하고 고정 행렬을 갱신한다', async ({page}) => {
    const errors=await setup(page);
    await page.evaluate(()=>{
        const a=window.__treeMotion,root=a.state.models[0];root.rotation.z=Math.PI/2;
        const extra=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20}).children[0];extra.position.y=300;
        extra.userData.modelPartId='outside-part';extra.userData.modelPartName='그룹 외부';root.add(extra);root.userData.importedParts.push(extra);
        root.userData.importedParts.forEach(part=>{part.updateMatrix();part.matrixAutoUpdate=false;});
        root.userData.modelPartGroups=[{name:'부품 변환',parts:[0,1],collapsed:true}];a.updateUIStatus();
    });
    await page.locator('.model-tree-part-group .model-tree-group-name').click();
    await setTransformValue(page,'#model-position-x','150');
    expect(await page.evaluate(()=>window.__treeMotion.state.models[0].userData.importedParts.map(part=>part.position.toArray()))).toEqual([[-90,0,0],[150,0,0],[0,300,0]]);
    await setTransformValue(page,'#model-rotation-z','90');
    const result=await page.evaluate(()=>{
        const a=window.__treeMotion;a.state.scene.updateMatrixWorld(true);
        return a.state.models[0].userData.importedParts.map(part=>({local:part.position.toArray().map(v=>Math.round(v)),world:part.getWorldPosition(new a.THREE.Vector3()).toArray().map(v=>Math.round(v)),matrixX:Math.round(part.matrix.elements[12]),rotation:Math.round(part.rotation.z*180/Math.PI)}));
    });
    expect(result).toEqual([{local:[150,-240,0],world:[240,150,0],matrixX:150,rotation:90},{local:[150,0,0],world:[0,150,0],matrixX:150,rotation:90},{local:[0,300,0],world:[-300,0,0],matrixX:0,rotation:0}]);expect(errors).toEqual([]);
});

test('드래그로 모델과 폴더 순서를 바꾸고 저장 및 실행 취소에서 유지한다',async({page})=>{
    await setup(page,false);
    await page.evaluate(()=>{
        const a=window.__treeMotion;
        for(const name of ['사각형 1','사각형 2','사각형 3']){
            const model=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});a.state.scene.add(model);a.state.models.push(model);
        }
        a.state.modelGroups=[{name:'그룹 A',modelIds:[a.ensureWorkspaceModelId(a.state.models[0])],collapsed:true}];a.updateUIStatus();
    });
    const root=page.locator('#model-tree > .model-tree-list'),rows=root.locator(':scope > li');
    await root.locator('.model-tree-node-row').filter({hasText:'사각형 3'}).dragTo(root.locator('summary').first(),{targetPosition:{x:40,y:2}});
    await expect(rows).toHaveText([/사각형 3/,/그룹 A/,/사각형 2/]);
    await expect(root.locator('details').first()).not.toHaveAttribute('open','');
    await page.keyboard.press('Control+z');await expect(rows).toHaveText([/그룹 A/,/사각형 2/,/사각형 3/]);
    await page.keyboard.press('Control+y');await expect(rows).toHaveText([/사각형 3/,/그룹 A/,/사각형 2/]);
    await root.locator('summary').first().dragTo(root.locator('.model-tree-node-row').filter({hasText:'사각형 2'}),{targetPosition:{x:40,y:29}});
    await expect(rows).toHaveText([/사각형 3/,/사각형 2/,/그룹 A/]);
    await page.evaluate(async()=>{const a=window.__treeMotion;await a.restoreWorkspaceSnapshot(a.serializeWorkspaceSnapshot());});
    await expect(rows).toHaveText([/사각형 3/,/사각형 2/,/그룹 A/]);
});

test('하위 부품 순서만 바꾸고 동작 참조용 부품 인덱스는 유지한다',async({page})=>{
    await setup(page);
    const parts=page.locator('#model-tree .model-tree-part-row');
    await parts.nth(1).dragTo(parts.nth(0),{targetPosition:{x:40,y:2}});
    await expect(parts.locator('.model-tree-part-name')).toHaveText(['부품 2','부품 1']);
    expect(await page.evaluate(()=>window.__treeMotion.state.models[0].userData.importedParts.map(p=>p.userData.modelPartId))).toEqual(['test-part-0','test-part-1']);
    await page.evaluate(()=>{
        const a=window.__treeMotion,model=a.state.models[0];
        const part=a.createPrimitiveShapeRoot('box',{x:10,y:10,z:10},{name:'추가'}).children[0];
        part.userData.modelPartId='test-part-2';part.userData.modelPartName='부품 3';model.add(part);model.userData.importedParts.push(part);a.updateUIStatus();
    });
    await parts.nth(0).locator('button').click();await parts.nth(1).locator('button').click({modifiers:['Shift']});
    await parts.nth(0).dragTo(parts.nth(2),{targetPosition:{x:40,y:25}});
    await expect(parts.locator('.model-tree-part-name')).toHaveText(['부품 3','부품 2','부품 1']);
    await page.keyboard.press('Control+z');await expect(parts.locator('.model-tree-part-name')).toHaveText(['부품 2','부품 1','부품 3']);
});

test('동일 모델의 순번은 삭제와 추가 및 프로젝트 복원에서도 유지된다',async({page})=>{
    await setup(page,false);
    await page.evaluate(()=>{
        const a=window.__treeMotion;
        for(const name of ['같은 모델','같은 모델','다른 모델']){
            const model=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});
            a.state.scene.add(model);a.state.models.push(model);
        }
        a.updateUIStatus();
    });
    const names=page.locator('#model-tree .model-tree-button > .model-tree-name');
    await expect(names).toHaveText(['같은 모델 #1','같은 모델 #2','다른 모델']);
    await page.evaluate(async()=>{
        const a=window.__treeMotion,first=a.state.models.shift();first.removeFromParent();a.updateUIStatus();
        const model=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'같은 모델'});
        a.state.scene.add(model);a.state.models.push(model);a.updateUIStatus();
        await a.restoreWorkspaceSnapshot(a.serializeWorkspaceSnapshot());
    });
    await expect(names).toHaveText(['같은 모델 #2','다른 모델','같은 모델 #3']);
});

test('3D 부품 선택은 접힌 상위 모델을 유지하고 내부 선택을 강조한다',async({page})=>{
    const errors=await setup(page);
    const point=await page.evaluate(()=>{
        const {state,THREE,selectSceneModel}=window.__treeMotion;selectSceneModel(null);
        state.controls.target.set(0,0,0);state.camera.position.set(0,-1200,850);state.camera.up.set(0,0,1);state.camera.lookAt(0,0,0);state.controls.update();state.camera.updateMatrixWorld(true);
        const rect=state.renderer.domElement.getBoundingClientRect(),p=new THREE.Box3().setFromObject(state.models[0].userData.importedParts[0]).getCenter(new THREE.Vector3()).project(state.camera);
        return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};
    });
    await page.locator('[data-model-tree-toggle]').first().click();
    await page.mouse.click(point.x,point.y);
    await expect(page.locator('[data-model-tree-toggle]').first()).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.model-tree-button').first()).toHaveClass(/contains-selection/);
    expect(await page.evaluate(()=>window.__treeMotion.state.selectedModelPart?.userData.modelPartId)).toBe('test-part-0');
    await expect(page.locator('.model-tree-node-row').first()).toBeInViewport();
    await page.locator('[data-model-tree-toggle]').first().click();
    await expect(page.locator('.model-tree-button').first()).not.toHaveClass(/contains-selection/);
    await expect(page.locator('button[data-model-part-id="test-part-0"]')).toHaveClass(/active/);
    await page.evaluate(()=>{
        const a=window.__treeMotion,child=a.state.models[0];
        const host=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'부착 상위 모델'});
        host.userData.primitiveShape=false;host.children[0].position.x=1500;child.userData.attachmentHost=host;host.add(child);
        a.state.scene.add(host);a.state.models.unshift(host);a.selectSceneModel(null);a.updateUIStatus();
    });
    await page.locator('[data-model-tree-toggle]').first().click();
    await page.mouse.click(point.x,point.y);
    await expect(page.locator('[data-model-tree-toggle]').first()).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.model-tree-button').first()).toHaveClass(/contains-selection/);
    expect(await page.evaluate(()=>window.__treeMotion.state.selectedModelPart?.userData.modelPartId)).toBe('test-part-0');
    await expect(page.locator('.model-tree-node-row').first()).toBeInViewport();
    expect(errors).toEqual([]);
});

test('폴더 선택은 스크롤을 유지하고 접힌 폴더 안의 3D 선택은 폴더를 강조한다',async({page})=>{
    const errors=await setup(page);
    await page.evaluate(()=>{
        const a=window.__treeMotion,model=a.state.models[0];
        for(let i=2;i<32;i++){
            const part=a.createPrimitiveShapeRoot('box',{x:5,y:5,z:5},{name:'추가 '+i}).children[0];
            part.position.set(500+i*20,0,0);part.userData.modelPartId='scroll-part-'+i;part.userData.modelPartName='추가 '+i;model.add(part);model.userData.importedParts.push(part);
        }
        model.userData.modelPartGroups=Array.from({length:15},(_,i)=>({name:'앞 그룹 '+i,parts:[2+i*2,3+i*2],collapsed:true}));
        model.userData.modelPartGroups.push({name:'선택 대상',parts:[0,1],collapsed:false});
        a.selectSceneModel(model);a.updateUIStatus();
    });
    const tree=page.locator('#model-tree'),folder=page.locator('.model-tree-part-group').filter({has:page.locator('.model-tree-group-name').filter({hasText:'선택 대상'})});
    await folder.locator('summary').scrollIntoViewIfNeeded();const before=await tree.evaluate(node=>node.scrollTop);
    await folder.locator('.model-tree-group-name').click();
    expect(await tree.evaluate(node=>node.scrollTop)).toBeCloseTo(before,0);
    await folder.locator('.model-tree-group-toggle').click();
    const point=await page.evaluate(()=>{
        const {state,THREE,selectSceneModel}=window.__treeMotion;selectSceneModel(null);
        state.controls.target.set(0,0,0);state.camera.position.set(0,-1200,850);state.camera.up.set(0,0,1);state.camera.lookAt(0,0,0);state.controls.update();state.camera.updateMatrixWorld(true);
        const rect=state.renderer.domElement.getBoundingClientRect(),p=new THREE.Box3().setFromObject(state.models[0].userData.importedParts[0]).getCenter(new THREE.Vector3()).project(state.camera);
        return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};
    });
    await tree.evaluate(node=>{node.scrollTop=0;});await page.mouse.click(point.x,point.y);
    await expect(folder.locator('details')).not.toHaveAttribute('open','');
    await expect(folder.locator('.model-tree-group-name')).toHaveClass(/contains-selection/);
    await expect(folder.locator('summary')).toBeInViewport();
    expect(await tree.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
    await folder.locator('.model-tree-group-toggle').click();await expect(folder.locator('.model-tree-group-name')).not.toHaveClass(/contains-selection/);
    await tree.evaluate(node=>{node.scrollTop=0;});await page.mouse.click(point.x,point.y);
    await expect(folder.locator('details')).toHaveAttribute('open','');
    await expect(folder.locator('button[data-model-part-id="test-part-0"]')).toBeInViewport();
    await page.screenshot({path:test.info().outputPath('expanded-folder-selection.png')});
    await page.evaluate(()=>{
        const a=window.__treeMotion,owner=a.state.models[0];
        owner.userData.modelPartGroups.at(-1).collapsed=true;
        a.state.modelGroups=[];
        for(let i=0;i<16;i++){
            const model=a.createPrimitiveShapeRoot('box',{x:5,y:5,z:5},{name:'상위 '+i});model.position.x=1500+i*20;
            a.state.scene.add(model);a.state.models.push(model);
            a.state.modelGroups.push({name:'상위 그룹 '+i,modelIds:[a.ensureWorkspaceModelId(model)],collapsed:true});
        }
        a.state.modelGroups.push({name:'접힌 상위 폴더',modelIds:[a.ensureWorkspaceModelId(owner)],collapsed:true});a.updateUIStatus();
    });
    const outer=page.locator('.model-tree-model-group').filter({has:page.locator('.model-tree-group-name').filter({hasText:'접힌 상위 폴더'})});
    await outer.locator(':scope > details > summary').scrollIntoViewIfNeeded();const rootScroll=await tree.evaluate(node=>node.scrollTop);
    await outer.locator(':scope > details > summary > .model-tree-group-name').click();expect(await tree.evaluate(node=>node.scrollTop)).toBeCloseTo(rootScroll,0);
    await tree.evaluate(node=>{node.scrollTop=0;});await page.mouse.click(point.x,point.y);
    await expect(outer.locator(':scope > details')).not.toHaveAttribute('open','');
    await expect(outer.locator(':scope > details > summary > .model-tree-group-name')).toHaveClass(/contains-selection/);
    await expect(outer.locator(':scope > details > summary')).toBeInViewport();
    await page.screenshot({path:test.info().outputPath('collapsed-folder-contained-selection.png')});
    expect(errors).toEqual([]);
});

test('최상위 모델을 폴더로 묶고 선택·이동·해제·저장 및 실행 취소를 지원한다',async({page})=>{
    const errors=await setup(page,false);
    await page.evaluate(()=>{
        const api=window.__treeMotion;
        for(const name of ['모델 A','모델 B','모델 C']) {
            const model=api.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name});
            api.state.scene.add(model);api.state.models.push(model);
        }
        api.updateUIStatus();
    });
    const models=page.locator('.model-tree-button');
    await models.filter({hasText:'모델 A'}).click();await models.filter({hasText:'모델 B'}).click({modifiers:['Shift']});
    await models.filter({hasText:'모델 B'}).click({button:'right'});
    await expect(page.locator('#model-group-parts')).toBeVisible();
    page.once('dialog',dialog=>dialog.accept('설비 그룹'));await page.locator('#model-group-parts').click();
    const folder=page.locator('.model-tree-model-group');
    await expect(folder.locator('.model-tree-group-name')).toHaveText('📁 설비 그룹 (2)');
    await expect(folder.locator('.model-tree-button')).toHaveCount(2);
    await folder.locator('.model-tree-group-toggle').click();
    await folder.locator('.model-tree-group-name').click();
    expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(2);
    await expect(folder.locator('details')).not.toHaveAttribute('open','');
    await page.locator('.model-tree-node-row').filter({has:models.filter({hasText:'모델 C'})}).dragTo(folder.locator('summary'));
    await expect(folder.locator('.model-tree-group-name')).toHaveText('📁 설비 그룹 (3)');
    await expect(folder.locator('details')).not.toHaveAttribute('open','');
    await folder.locator('summary').click({button:'right'});
    page.once('dialog',dialog=>dialog.accept('통합 설비'));await page.locator('#model-group-rename').click();
    await expect(folder.locator('.model-tree-group-name')).toHaveText('📁 통합 설비 (3)');
    await page.evaluate(async()=>{const api=window.__treeMotion;window.__savedRootGroups=api.serializeWorkspaceSnapshot();await api.restoreWorkspaceSnapshot(window.__savedRootGroups);});
    await expect(folder.locator('.model-tree-group-name')).toHaveText('📁 통합 설비 (3)');
    await expect(folder.locator('details')).not.toHaveAttribute('open','');
    await folder.locator('.model-tree-group-toggle').click();
    await models.filter({hasText:'모델 A'}).click();await models.filter({hasText:'모델 B'}).click({modifiers:['Shift']});
    await models.filter({hasText:'모델 A'}).click({button:'right'});await page.locator('#model-ungroup-part').click();
    await expect(folder.locator('.model-tree-button')).toHaveCount(1);
    expect(await page.evaluate(()=>window.__treeMotion.serializeWorkspaceSnapshot().modelGroups[0].modelIds.length)).toBe(1);
    await folder.locator('summary').click({button:'right'});await page.locator('#model-group-dissolve').click();await expect(folder).toHaveCount(0);
    await page.keyboard.press('Control+z');await expect(folder).toHaveCount(1);
    await page.keyboard.press('Control+y');await expect(folder).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('그룹 이름은 부품 전체를 선택하고 화살표만 폴더를 펼친다',async({page})=>{
    const errors=await setup(page);
    await page.evaluate(()=>{const api=window.__treeMotion;api.state.models[0].userData.modelPartGroups=[{name:'선택 그룹',parts:[0,1],collapsed:true}];api.updateUIStatus();});
    const folder=page.locator('.model-tree-part-group');
    await folder.locator('summary').click();
    expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(2);
    await expect(folder.locator('details')).not.toHaveAttribute('open','');
    await expect(folder.locator('.model-tree-group-name')).toHaveClass(/active/);
    const outlines=await page.evaluate(()=>window.__treeMotion.state.models[0].userData.importedParts.map(part=>{let active=false;part.traverse(mesh=>{if(mesh.userData.outlineLine?.material.color.getHex()===0xfacc15)active=true;});return active;}));expect(outlines).toEqual([true,true]);
    await folder.locator('.model-tree-group-toggle').click();await expect(folder.locator('details')).toHaveAttribute('open','');
    await folder.locator('.model-tree-group-name').click();await expect(folder.locator('details')).toHaveAttribute('open','');
    await folder.locator('.model-tree-group-toggle').click();await expect(folder.locator('details')).not.toHaveAttribute('open','');
    expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(2);
    await page.screenshot({path:test.info().outputPath('group-name-selection.png')});
    expect(errors).toEqual([]);
});

test('항목 그룹에서 해제는 여러 모델의 선택한 부품만 한꺼번에 제외한다',async({page})=>{
    const errors=await setup(page);
    await page.evaluate(()=>{
        const api=window.__treeMotion,root=api.state.models[0];
        const extra=api.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'남길 부품'}).children[0];extra.userData.modelPartId='test-part-2';extra.userData.modelPartName='부품 3';root.add(extra);root.userData.importedParts.push(extra);root.userData.modelPartGroups=[{name:'첫 그룹',parts:[0,1,2],collapsed:false}];
        const other=api.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'다른 모델'}),part=api.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'다른 부품'}).children[0];other.add(part);
        const parts=[other.children[0],part];parts.forEach((part,index)=>{part.userData.modelPartId='other-part-'+index;part.userData.modelPartName='다른 부품 '+index;});other.userData.importedParts=parts;other.userData.primitiveShape=false;other.userData.modelPartGroups=[{name:'둘째 그룹',parts:[0,1],collapsed:false}];
        api.state.scene.add(other);api.state.models.push(other);api.updateUIStatus();
    });
    await page.locator('button[data-model-part-id="test-part-0"]').click();await page.locator('button[data-model-part-id="test-part-1"]').click({modifiers:['Shift']});await page.locator('button[data-model-part-id="other-part-0"]').click({modifiers:['Shift']});
    await page.locator('button[data-model-part-id="test-part-0"]').click({button:'right'});await page.locator('#model-ungroup-part').click();
    expect(await page.evaluate(()=>window.__treeMotion.state.models.map(model=>model.userData.modelPartGroups.map(group=>group.parts)))).toEqual([[[2]],[[1]]]);
    await expect(page.locator('.model-tree-part-button.active')).toHaveCount(3);
    expect(errors).toEqual([]);
});

test('그룹 폴더에서 그룹 부품 전체의 동작을 설정하고 다시 편집한다',async({page})=>{
    const errors=await setup(page);
    await page.evaluate(()=>{const api=window.__treeMotion;api.state.models[0].userData.modelPartGroups=[{name:'실린더 그룹',parts:[0,1],collapsed:true}];api.updateUIStatus();});
    const folder=page.locator('.model-tree-part-group summary');
    await folder.click({button:'right'});await expect(page.locator('#model-group-motion-settings')).toBeVisible();await page.locator('#model-group-motion-settings').click();
    const targets=page.locator('[data-equipment-role="movingRef"] .equipment-part-options');
    await expect(targets.locator('input:checked')).toHaveCount(2);
    expect(await targets.locator('input:checked').evaluateAll(nodes=>nodes.map(node=>node.value.split('/').at(-1)))).toEqual(['0','1']);
    expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(2);
    await page.locator('#equipment-form button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
    const id=await page.locator('#equipment-form [name="id"]').inputValue();
    await page.locator('#equipment-close').click();
    await expect(page.locator('.model-tree-part-group details')).not.toHaveAttribute('open','');
    await folder.click({button:'right'});await page.locator('#model-group-motion-settings').click();
    await expect(page.locator('.equipment-header h2')).toHaveText('동작 편집');await expect(page.locator('#equipment-form [name="id"]')).toHaveValue(id);
    await page.locator('#equipment-form [name="travel"]').click();await page.locator('#equipment-form [name="travel"]').fill('125');await page.locator('#equipment-form button[type="submit"]').click();
    expect(await page.evaluate(()=>window.__treeMotion.state.equipmentDefinitions.map(def=>({travel:def.travel,parts:def.movingRefs.length})))).toEqual([{travel:125,parts:2}]);
    expect(errors).toEqual([]);
});

test('그룹 폴더 우클릭 이름 변경과 드래그 이동 및 개별 그룹 해제를 지원한다',async({page})=>{
    const errors=await setup(page);
    await page.evaluate(()=>{const api=window.__treeMotion;api.state.models[0].userData.modelPartGroups=[{name:'로드 그룹',parts:[0],collapsed:false}];api.updateUIStatus();});
    const folder=page.locator('.model-tree-part-group summary');
    await folder.click({button:'right'});await expect(page.locator('#model-motion-settings')).not.toBeVisible();
    page.once('dialog',dialog=>dialog.accept('이름을 바꾼 그룹'));await page.locator('#model-group-rename').click();
    await expect(folder).toHaveText('📁 이름을 바꾼 그룹 (1)');
    await folder.locator('.model-tree-group-toggle').click();
    await page.locator('.model-tree-part-row[data-model-part-id="test-part-1"]').dragTo(folder);
    await expect(folder).toHaveText('📁 이름을 바꾼 그룹 (2)');
    await expect(page.locator('.model-tree-part-group details')).not.toHaveAttribute('open','');
    expect(await folder.evaluate(node=>getComputedStyle(node).color)).toBe(await page.locator('.model-tree-name').first().evaluate(node=>getComputedStyle(node).color));
    await folder.locator('.model-tree-group-toggle').click();
    expect(await page.evaluate(()=>window.__treeMotion.serializeWorkspaceSnapshot().modelPartGroups[0].groups[0].parts)).toEqual([0,1]);
    await page.locator('button[data-model-part-id="test-part-1"]').click({button:'right'});
    await expect(page.locator('#model-ungroup-part')).toHaveText('항목 그룹에서 해제');await expect(page.locator('#model-ungroup-part i')).toHaveCount(1);
    await page.locator('#model-ungroup-part').click();
    await expect(folder).toHaveText('📁 이름을 바꾼 그룹 (1)');
    await expect(page.locator('.model-tree-part-group button[data-model-part-id="test-part-1"]')).toHaveCount(0);
    await folder.click({button:'right'});await page.locator('#model-group-dissolve').click();await expect(folder).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('IO 입력을 연결 영역에 표시하고 선택한 이동 대상만 보여준다',async({page})=>{
    const errors=await setup(page);
    await page.locator('button[data-model-part-id="test-part-0"]').click({button:'right'});await page.locator('#model-motion-settings').click();
    await expect(page.locator('#equipment-form [name="ioDirection"]')).toHaveCount(0);
    await expect(page.locator('#equipment-io [name="feedbackHome"]')).toBeVisible();
    await expect(page.locator('#equipment-io [name="feedbackEnd"]')).toBeVisible();
    await expect(page.locator('#equipment-extra [name^="feedback"]')).toHaveCount(0);
    const list=page.locator('[data-equipment-role="movingRef"] .equipment-part-options');
    await expect(list.locator('label')).toHaveCount(1);
    await expect(list.getByRole('button',{name:'부품 2',exact:true})).toHaveCount(0);
    await page.locator('[data-equipment-role="movingRef"] > button').click();await page.locator('button[data-model-part-id="test-part-1"]').click();
    await expect(list.locator('label')).toHaveCount(2);
    await page.locator('[data-equipment-role="movingRef"] > button').click();
    await page.locator('#equipment-form button[type="submit"]').click();
    await expect(page.locator('[data-equipment-command="FORWARD"]')).toHaveText('전진');
    await expect(page.locator('[data-equipment-command="REVERSE"]')).toHaveText('후진');
    const buttons=await page.locator('#equipment-current-controls .equipment-test-actions button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));
    expect(buttons.length).toBeGreaterThan(2);expect(new Set(buttons).size).toBe(1);
    await page.locator('#equipment-current-controls').scrollIntoViewIfNeeded();
    await page.screenshot({path:test.info().outputPath('motion-selected-targets-io.png')});
    expect(errors).toEqual([]);
});

test('그룹 이동 대상 들여쓰기와 동작 편집 상태 및 창 경계를 유지한다',async({page})=>{
    await setup(page);
    await page.evaluate(()=>{const api=window.__treeMotion;api.state.models[0].userData.modelPartGroups=[{name:'로드 그룹',parts:[0,1],collapsed:false}];api.updateUIStatus();});
    await page.locator('button[data-model-part-id="test-part-0"]').click({button:'right'});await page.locator('#model-motion-settings').click();
    const folder=page.locator('[data-equipment-role="movingRef"] summary').filter({hasText:'로드 그룹'});
    const child=page.locator('[data-equipment-role="movingRef"] label').filter({hasText:'부품 1'});
    expect((await child.boundingBox()).x).toBeGreaterThan((await folder.boundingBox()).x+8);
    await page.locator('#equipment-form button[type="submit"]').click();
    await page.locator('[data-equipment-command="EDIT"]').click();
    await expect(page.locator('.equipment-header h2')).toHaveText('동작 편집');
    await expect(page.locator('#equipment-form button[type="submit"]')).toHaveText('변경 저장');
    await page.locator('#equipment-form [name="travel"]').click();await page.locator('#equipment-form [name="travel"]').fill('234');await page.locator('#equipment-form button[type="submit"]').click();
    expect(await page.evaluate(()=>window.__treeMotion.state.equipmentDefinitions.map(def=>def.travel))).toEqual([234]);
    await page.locator('#equipment-close').click();
    await page.locator('.model-tree-button').filter({hasText:'실린더 모델'}).click({button:'right'});await expect(page.locator('#model-motion-edit-options i')).toHaveCount(1);await page.locator('#model-motion-edit-options button').click();
    await expect(page.locator('#equipment-form [name="travel"]')).toHaveValue('234');await expect(page.locator('.equipment-header h2')).toHaveText('동작 편집');
    expect(await page.locator('#equipment-dialog').evaluate(node=>getComputedStyle(node).scrollbarWidth)).toBe('thin');
    const header=await page.locator('.equipment-header').boundingBox();
    await page.mouse.move(header.x+30,header.y+15);await page.mouse.down();await page.mouse.move(10,0);await page.mouse.up();
    const top=await page.locator('#topbar').boundingBox();expect((await page.locator('#equipment-dialog').boundingBox()).y).toBeGreaterThanOrEqual(top.y+top.height);
    const h=await page.locator('.equipment-header').boundingBox();await page.mouse.move(h.x+30,h.y+15);await page.mouse.down();await page.mouse.move(1100,2000);await page.mouse.up();
    const rect=await page.locator('#equipment-dialog').boundingBox(),bottom=await page.locator('#stats-bar').boundingBox();expect(rect.y+rect.height).toBeLessThanOrEqual(bottom.y+1);
    await page.setViewportSize({width:900,height:600});
    await expect.poll(async()=>{const r=await page.locator('#equipment-dialog').boundingBox(),b=await page.locator('#stats-bar').boundingBox();return Math.round(r.y+r.height-b.y);}).toBeLessThanOrEqual(1);
    await page.screenshot({path:test.info().outputPath('motion-edit-group-indent.png')});
    await page.locator('#equipment-new').click();await expect(page.locator('.equipment-header h2')).toHaveText('동작 설정');await expect(page.locator('#equipment-form [name="id"]')).toHaveValue('');
});

async function setup(page, fixture=true) {
    const errors=[];page.on('pageerror', error=>errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${(await response.text()).replace('init();\n', 'window.__simulationReady = init();\n')}\nwindow.__treeMotion = { state, equipmentApp, THREE, createPrimitiveShapeRoot, ensureWorkspaceModelId, updateUIStatus, selectSceneModel, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, activateModelPlacement, updatePlacementPreviewFromTranslation, restorePlacementPreview, handleMeasurementSnapSelection };` });
    });
    await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__treeMotion);
    await page.evaluate(()=>window.__simulationReady);
    if(!fixture)return errors;
    await page.evaluate(()=>{
        const api=window.__treeMotion;
        const root=api.createPrimitiveShapeRoot('box',{x:80,y:80,z:80},{name:'실린더 모델'});
        const other=api.createPrimitiveShapeRoot('box',{x:60,y:60,z:60},{name:'두번째 모델'});
        const parts=[root.children[0],other.children[0]];
        parts[0].position.x=-120;parts[1].position.x=120;root.add(parts[1]);
        parts.forEach((part,i)=>{part.userData.modelPartId='test-part-'+i;part.userData.modelPartName='부품 '+(i+1);});
        root.userData.importedParts=parts;root.userData.primitiveShape=false;
        api.state.scene.add(root);api.state.models.push(root);api.updateUIStatus();
    });
    return errors;
}

test('Shift로 하위 부품을 다중 선택하고 그룹을 만들고 해제한다',async({page})=>{
    const errors=await setup(page);
    const first=page.locator('button[data-model-part-id="test-part-0"]'), second=page.locator('button[data-model-part-id="test-part-1"]');
    await first.click();await second.click({modifiers:['Shift']});
    await expect(first).toHaveClass(/active/);await expect(second).toHaveClass(/active/);
    expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(2);
    await second.click({modifiers:['Shift']});expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(1);
    await second.click({modifiers:['Shift']});
    // Context menu must preserve the multiple selected parts when grouping.
    await second.click({button:'right'});
    page.once('dialog',dialog=>dialog.accept('로드 그룹'));
    await page.locator('#model-group-parts').click();
    await expect(page.locator('.model-tree-part-group summary')).toContainText('로드 그룹 (2)');
    expect(await page.evaluate(()=>window.__treeMotion.serializeWorkspaceSnapshot().modelPartGroups[0].groups[0].parts)).toEqual([0,1]);
    await page.locator('.model-tree-group-toggle').click();await expect(first).not.toBeVisible();
    await page.locator('.model-tree-group-toggle').click();await expect(first).toBeVisible();
    await page.locator('.model-tree-part-group summary').click({button:'right'});await page.locator('#model-group-dissolve').click();await expect(page.locator('.model-tree-part-group')).toHaveCount(0);
    await page.evaluate(()=>{const api=window.__treeMotion;const model=api.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'보조 모델'});api.state.scene.add(model);api.state.models.push(model);api.updateUIStatus();});
    await page.locator('.model-tree-button').filter({hasText:'실린더 모델'}).click();await page.locator('.model-tree-button').filter({hasText:'보조 모델'}).click({modifiers:['Shift']});
    await expect(page.locator('.model-tree-button.active')).toHaveCount(2);
    await page.locator('.model-tree-button').filter({hasText:'실린더 모델'}).click({button:'right'});await page.locator('#model-motion-settings').click();
    const targets=page.locator('[data-equipment-role="movingRef"] .equipment-part-options');
    await expect(targets.locator('label')).toHaveCount(2);
    while(await targets.locator('input:checked').count())await targets.locator('input:checked').first().click();
    await page.locator('[data-equipment-role="movingRef"] > button').click();await page.locator('.model-tree-button').filter({hasText:'보조 모델'}).click();await page.locator('[data-equipment-role="movingRef"] > button').click();
    await expect(page.locator('#equipment-form [name="name"]')).toHaveValue('실린더 / 보조 모델');
    await page.locator('#equipment-form button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
    await expect(page.locator('#equipment-form [name="name"]')).toHaveValue('실린더 / 보조 모델');
    expect(errors).toEqual([]);
});

test('이동 대상 트리 선택은 외곽선 다중 선택과 연결되고 우클릭으로 체크한다',async({page})=>{
    const errors=await setup(page);
    await page.locator('button[data-model-part-id="test-part-0"]').click({button:'right'});await page.locator('#model-motion-add-part').click();
    await expect(page.locator('#equipment-parts legend')).toHaveText('2. 이동 대상');
    await expect(page.locator('#equipment-form [name="name"]')).toHaveValue('실린더 / 실린더 모델');
    await expect(page.locator('#equipment-form [name="reverseSpeed"]')).not.toBeVisible();
    await expect(page.locator('#equipment-form [name="ioDirection"]')).toHaveCount(0);
    const list=page.locator('[data-equipment-role="movingRef"] .equipment-part-options');
    await expect(list.locator('details')).toHaveCount(1);
    await expect(list.getByRole('button',{name:'부품 2',exact:true})).toHaveCount(0);
    await page.locator('[data-equipment-role="movingRef"] > button').click();await page.locator('button[data-model-part-id="test-part-1"]').click();await page.locator('[data-equipment-role="movingRef"] > button').click();
    await list.getByRole('button',{name:'부품 1',exact:true}).click();await list.getByRole('button',{name:'부품 2',exact:true}).click({modifiers:['Shift']});
    expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(2);
    const outlines=await page.evaluate(()=>{const api=window.__treeMotion;return api.state.models[0].userData.importedParts.map(part=>{let selected=false;part.traverse(mesh=>{if(mesh.userData.outlineLine?.material.color.getHex()===0xfacc15)selected=true;});return selected;});});
    expect(outlines).toEqual([true,true]);
    await page.locator('button[data-model-part-id="test-part-1"]').click({button:'right'});await page.locator('#model-motion-add-part').click();
    await expect(list.locator('input:checked')).toHaveCount(2);
    await page.locator('#equipment-form button[type="submit"]').click();await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
    await expect(page.locator('.model-tree-button .model-tree-kind')).toHaveText('실린더');
    await page.screenshot({path:test.info().outputPath('motion-selection-tree.png')});
    await page.locator('#equipment-form [name="type"]').selectOption('CONVEYOR');await expect(page.locator('#equipment-parts legend')).toHaveText('2. 벨트 모델링 선택');
    const popupPromise=page.waitForEvent('popup');await page.locator('#equipment-popout').click();const popup=await popupPromise;
    await expect(popup.locator('#equipment-dialog')).toBeVisible();await expect(popup).toHaveTitle('3D Simulation - 동작 설정');
    const closed=popup.waitForEvent('close');await popup.locator('#equipment-close').click();await closed;
    await expect(page.locator('#equipment-dialog')).toBeAttached();await expect(page.locator('#equipment-dialog')).not.toBeVisible();
    await page.locator('button[data-model-part-id="test-part-0"]').click({button:'right'});await page.locator('#model-motion-settings').click();
    await expect(page.locator('#equipment-dialog')).toBeVisible();
    const secondPopupPromise=page.waitForEvent('popup');await page.locator('#equipment-popout').click();const secondPopup=await secondPopupPromise;
    await secondPopup.close({runBeforeUnload:true});await expect(page.locator('#equipment-dialog')).toBeAttached();
    await page.locator('button[data-model-part-id="test-part-0"]').click({button:'right'});await page.locator('#model-motion-settings').click();
    await page.locator('#equipment-close').click();await expect(page.locator('#equipment-dialog')).not.toBeVisible();
    expect(errors).toEqual([]);
});

test('일반 3D 화면의 Shift 클릭으로 여러 부품을 선택한다',async({page})=>{
    const errors=await setup(page);
    const points=await page.evaluate(()=>{
        const {state,THREE,selectSceneModel}=window.__treeMotion;
        selectSceneModel(null);state.controls.target.set(0,0,0);state.camera.position.set(0,-1200,850);state.camera.up.set(0,0,1);state.camera.lookAt(0,0,0);state.controls.update();state.camera.updateMatrixWorld(true);
        const rect=state.renderer.domElement.getBoundingClientRect();
        return state.models[0].userData.importedParts.map(part=>{const center=new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3()).project(state.camera);return {x:rect.left+(center.x+1)*rect.width/2,y:rect.top+(1-center.y)*rect.height/2};});
    });
    await page.mouse.click(points[0].x,points[0].y);
    await page.keyboard.down('Shift');await page.mouse.click(points[1].x,points[1].y);await page.keyboard.up('Shift');
    expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(2);
    await expect(page.locator('.model-tree-part-button.active')).toHaveCount(2);
    await page.mouse.click(points[0].x,points[0].y);expect(await page.evaluate(()=>window.__treeMotion.state.modelSelection.size)).toBe(1);
    expect(errors).toEqual([]);
});

test('실제 CAD 부품 그룹과 이동 기준을 프로젝트 저장·복구에서 보존한다',async({page})=>{
    test.setTimeout(90000);
    const errors=await setup(page,false);
    await page.locator('#input-import-3d').setInputFiles('2_3DSimulation/test-assets/Test_Equipment_CAD.step');
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(()=>window.__treeMotion.state.models.some(model=>model.userData.importedParts?.length>1),null,{timeout:60000});
    await expect(page.locator('[data-model-tree-toggle]').first()).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.model-tree-part-button').first()).not.toBeVisible();
    await page.evaluate(async()=>{const a=window.__treeMotion;await a.restoreWorkspaceSnapshot(a.serializeWorkspaceSnapshot());});
    await expect(page.locator('[data-model-tree-toggle]').first()).toHaveAttribute('aria-expanded','false');
    await page.locator('[data-model-tree-toggle]').first().click();
    const ids=await page.evaluate(()=>window.__treeMotion.state.models[0].userData.importedParts.slice(0,2).map(part=>part.userData.modelPartId));
    await page.locator(`button[data-model-part-id="${ids[0]}"]`).click();await page.locator(`button[data-model-part-id="${ids[1]}"]`).click({modifiers:['Shift']});
    await page.locator(`button[data-model-part-id="${ids[1]}"]`).click({button:'right'});page.once('dialog',dialog=>dialog.accept('저장할 그룹'));await page.locator('#model-group-parts').click();
    const result=await page.evaluate(async()=>{
        const api=window.__treeMotion,app=api.equipmentApp,root=api.state.models[0];
        const refs=[0,1].map(index=>`equipment-model:${api.ensureWorkspaceModelId(root)}/${index}`);
        const before=refs.map(ref=>app.resolve(ref).object.position.toArray());
        app.save({id:'group-motion',type:'CYLINDER',movingRefs:refs,speed:40});
        root.position.set(350,200,50);root.rotation.z=Math.PI/4;api.state.equipmentDefinitions[0].runtime.position=60;app.runtime.apply(api.state.equipmentDefinitions[0],0);
        const snapshot=JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));await api.restoreWorkspaceSnapshot(snapshot);
        const after=refs.map(ref=>app.resolve(ref).object.position.toArray());
        const groups=api.state.models[0].userData.modelPartGroups;
        app.runtime.reset(api.state.equipmentDefinitions);const reset=refs.map(ref=>app.resolve(ref).object.position.toArray());
        return {before,after,reset,groups,savedGroupId:snapshot.modelPartGroups[0].groups[0].treeOrderId};
    });
    expect(result.savedGroupId).toEqual(expect.any(String));
    expect(result.groups).toEqual([{name:'저장할 그룹',parts:[0,1],collapsed:false,treeOrderId:result.savedGroupId}]);
    result.after.forEach((position,i)=>position.forEach((value,j)=>expect(value).toBeCloseTo(result.before[i][j]+(j===0?60:0),5)));
    result.reset.forEach((position,i)=>position.forEach((value,j)=>expect(value).toBeCloseTo(result.before[i][j],5)));
    await expect(page.locator('.model-tree-part-group summary')).toContainText('저장할 그룹 (2)');expect(errors).toEqual([]);
    await expect(page.locator('[data-model-tree-toggle]').first()).toHaveAttribute('aria-expanded','true');
});


test('펼친 모델 트리는 3D에서 선택한 부품과 단일 부품 모델에 같은 선택 배경을 표시한다',async({page})=>{
 const errors=await setup(page);
 const points=await page.evaluate(()=>{
  const a=window.__treeMotion,{state,THREE}=a,root=state.models[0];const child=a.createPrimitiveShapeRoot('box',{x:60,y:60,z:60},{name:'단일 부품 모델'});child.position.set(300,0,0);child.userData.importedParts=[child.children[0]];child.userData.primitiveShape=false;child.userData.uploaded=true;child.children[0].userData.modelPartId='single-part';child.userData.attachmentHost=root;root.add(child);state.models.push(child);a.selectSceneModel(null);a.updateUIStatus();
  state.controls.target.set(0,0,0);state.camera.position.set(0,-1200,850);state.camera.up.set(0,0,1);state.camera.lookAt(0,0,0);state.controls.update();state.camera.updateMatrixWorld(true);
  const rect=state.renderer.domElement.getBoundingClientRect();return [...root.userData.importedParts,child].map(object=>{const p=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(state.camera);return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};});
 });
 const first=page.locator('button[data-model-part-id="test-part-0"]'),second=page.locator('button[data-model-part-id="test-part-1"]'),single=page.locator('.model-tree-button').filter({hasText:'단일 부품 모델'});
 await first.click();const selectedBackground=await first.evaluate(node=>getComputedStyle(node).backgroundColor);
 await page.mouse.click(points[1].x,points[1].y);await expect(second).toHaveClass(/active/);await expect(first).not.toHaveClass(/active/);expect(await second.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe(selectedBackground);
 await page.mouse.click(points[0].x,points[0].y);await expect(first).toHaveClass(/active/);await page.mouse.click(points[0].x,points[0].y);await expect(first).toHaveClass(/active/);
 await single.click();const modelBackground=await single.evaluate(node=>getComputedStyle(node).backgroundColor);await page.mouse.click(points[1].x,points[1].y);await page.mouse.click(points[2].x,points[2].y);
 await expect(single).toHaveClass(/active/);await expect(single.locator('xpath=ancestor::li[1]')).toHaveAttribute('aria-selected','true');expect(await single.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe(modelBackground);await expect(page.locator('[data-model-tree-toggle]').first()).toHaveAttribute('aria-expanded','true');expect(errors).toEqual([]);
});


test('그룹 밖 로봇은 저장된 순서와 드래그보다 우선하고 폴더 안에서는 그룹 순서를 따른다', async ({ page }) => {
 const errors = await setup(page, false);
 await expect(page.locator('#model-select option[value="robot:IR-S10-80Z20"]')).toHaveCount(1);
 await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');
 await page.waitForFunction(() => window.__treeMotion.state.models.some(model => model.userData.tcpFrame));
 await page.evaluate(() => {
  const a = window.__treeMotion, robot = a.state.models.find(model => model.userData.tcpFrame);
  for (const name of ['일반 모델', '폴더 모델']) {
   const model = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name });
   a.state.scene.add(model); a.state.models.push(model);
  }
  const first = a.state.models.find(model => model.userData.modelName === '일반 모델');
  const grouped = a.state.models.find(model => model.userData.modelName === '폴더 모델');
  a.state.modelGroups = [{ name: '로봇 폴더', treeOrderId: 'pin-folder', modelIds: [a.ensureWorkspaceModelId(grouped)], collapsed: false }];
  a.state.modelTreeOrder.root = [`model:${a.ensureWorkspaceModelId(first)}`, 'folder:pin-folder', `model:${a.ensureWorkspaceModelId(robot)}`];
  a.updateUIStatus();
 });
 const root = page.locator('#model-tree > .model-tree-list'), rows = root.locator(':scope > li');
 await expect(rows).toHaveText([/IR-S10-80Z20/, /일반 모델/, /로봇 폴더/]);
 const robotRow = root.locator('.model-tree-node-row').filter({ hasText: 'IR-S10-80Z20' }).first();
 const normalRow = root.locator('.model-tree-node-row').filter({ hasText: '일반 모델' });
 const normalBounds = await normalRow.boundingBox();
 await robotRow.dragTo(normalRow, { targetPosition: { x: 40, y: normalBounds.height - 2 } });
 await expect(rows).toHaveText([/IR-S10-80Z20/, /일반 모델/, /로봇 폴더/]);
 await robotRow.dragTo(root.locator('.model-tree-model-group > details > summary'), { targetPosition: { x: 70, y: 15 } });
 await expect(rows).toHaveCount(2); await expect(rows).toHaveText([/일반 모델/, /로봇 폴더/]);
 const folder = root.locator('.model-tree-model-group > details > .model-tree-children');
 await expect(folder.locator(':scope > li > .model-tree-node-row .model-tree-name')).toHaveText([/^폴더 모델$/, /^#1 IR-S10-80Z20/]);
 await page.evaluate(async () => { const a = window.__treeMotion; await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()))); });
 await expect(rows).toHaveCount(2); await expect(rows.last()).toContainText('IR-S10-80Z20');
 await page.evaluate(() => { const a = window.__treeMotion; a.state.modelGroups[0].modelIds = a.state.modelGroups[0].modelIds.filter(id => id !== a.ensureWorkspaceModelId(a.state.models.find(model => model.userData.tcpFrame))); a.updateUIStatus(); });
 await expect(rows).toHaveCount(3); await expect(rows.first()).toContainText('IR-S10-80Z20');
 expect(errors).toEqual([]);
});

test('모델 트리는 확장자를 숨기고 원본 파일 이름과 복사 순번을 저장·복원한다',async({page})=>{
 const errors=await setup(page);await page.evaluate(()=>{
  const a=window.__treeMotion,root=a.state.models[0];root.name=root.userData.modelName='Assembly.step';root.userData.importedParts[0].userData.modelPartName='Pad.STP';root.userData.importedParts[1].userData.modelPartName='Bracket.obj #2';
  for(let i=0;i<2;i++){const model=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'Fixture.stl'});a.state.scene.add(model);a.state.models.push(model);}a.updateUIStatus();
 });
 const names=page.locator('#model-tree .model-tree-button > .model-tree-name');await expect(names).toHaveText(['Assembly','Fixture #1','Fixture #2']);await expect(page.locator('.model-tree-part-name')).toHaveText(['Pad','Bracket #2']);
 expect(await page.evaluate(()=>window.__treeMotion.state.models.map(model=>model.userData.modelName))).toEqual(['Assembly.step','Fixture.stl','Fixture.stl']);
 // The assembly above is a synthetic part fixture with no import asset. Restore the serializable models.
 await page.evaluate(async()=>{const a=window.__treeMotion;const fixture=a.state.models.shift();fixture.removeFromParent();await a.restoreWorkspaceSnapshot(a.serializeWorkspaceSnapshot());});await expect(names).toHaveText(['Fixture #1','Fixture #2']);expect(await page.evaluate(()=>window.__treeMotion.state.models.map(model=>model.userData.modelName))).toEqual(['Fixture.stl','Fixture.stl']);expect(errors).toEqual([]);
});


test('우클릭으로 모델 이름을 변경하고 취소·실행 취소·저장 복원에서 유지한다', async ({page}) => {
 const errors = await setup(page, false);
 await page.evaluate(() => {
  const a=window.__treeMotion,model=a.createPrimitiveShapeRoot('box',{x:30,y:30,z:30});
  a.state.scene.add(model);a.state.models.push(model);a.updateUIStatus();
 });
 const button=page.locator('#model-tree .model-tree-button').first();
 await button.click({button:'right'});await expect(page.locator('#model-rename i')).toHaveClass(/fa-pen-to-square/);await expect(page.locator('#model-rename')).toHaveText('이름 변경');
 page.once('dialog',dialog=>dialog.accept('  변경 모델  '));await page.locator('#model-rename').click();
 await expect(button.locator('.model-tree-name')).toHaveText('변경 모델');
 expect(await page.evaluate(()=>window.__treeMotion.state.models[0].userData.modelName)).toBe('사각형 1');
 await page.keyboard.press('Control+z');await expect(button.locator('.model-tree-name')).toHaveText('사각형 1');
 await page.keyboard.press('Control+y');await expect(button.locator('.model-tree-name')).toHaveText('변경 모델');
 for(const answer of [null,'   ']){
  await button.click({button:'right'});page.once('dialog',dialog=>answer===null?dialog.dismiss():dialog.accept(answer));await page.locator('#model-rename').click();
  await expect(button.locator('.model-tree-name')).toHaveText('변경 모델');
 }
 await page.evaluate(async()=>{const a=window.__treeMotion;await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));});
 await expect(button.locator('.model-tree-name')).toHaveText('변경 모델');expect(errors).toEqual([]);
});

test('하위 부품 이름 변경은 부품 참조와 원본 이름을 보존하고 프로젝트에서 복원된다', async ({page}) => {
 test.setTimeout(90000);const errors=await setup(page,false);
 await page.locator('#input-import-3d').setInputFiles('2_3DSimulation/test-assets/Test_Equipment_CAD.step');await page.locator('#btn-confirm-import').click();
 await page.waitForFunction(()=>window.__treeMotion.state.models.some(model=>model.userData.importedParts?.length>1),null,{timeout:60000});
 await page.locator('[data-model-tree-toggle]').first().click();
 const before=await page.evaluate(()=>{const p=window.__treeMotion.state.models[0].userData.importedParts[0];return {id:p.userData.modelPartId,name:p.userData.modelPartName};});
 const button=page.locator('.model-tree-part-button').first();await button.click({button:'right'});
 page.once('dialog',dialog=>dialog.accept('흡착 패드'));await page.locator('#model-rename').click();await expect(button.locator('.model-tree-part-name')).toHaveText('흡착 패드');
 await page.keyboard.press('Control+z');await expect(button.locator('.model-tree-part-name')).not.toHaveText('흡착 패드');
 await page.keyboard.press('Control+y');await expect(button.locator('.model-tree-part-name')).toHaveText('흡착 패드');
 expect(await page.evaluate(()=>{const p=window.__treeMotion.state.models[0].userData.importedParts[0];return {id:p.userData.modelPartId,name:p.userData.modelPartName};})).toEqual(before);
 await page.evaluate(async()=>{const a=window.__treeMotion;await a.restoreWorkspaceSnapshot(JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot())));});
 await expect(button.locator('.model-tree-part-name')).toHaveText('흡착 패드');expect(errors).toEqual([]);
});
