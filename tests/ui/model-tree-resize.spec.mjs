import {test,expect} from '@playwright/test';

test('모델 트리 기본 높이는 헤더 사이를 채우고 화면 크기를 따라간다',async({page})=>{
 await page.setViewportSize({width:1400,height:900});
 await page.goto('/2_3DSimulation/index.html');
 const panel=page.locator('#model-browser-panel');
 for(const size of [{width:1400,height:900},{width:1100,height:600},{width:1400,height:900}]){
  await page.setViewportSize(size);
  await expect.poll(async()=>{const p=await panel.boundingBox(),top=await page.locator('#topbar').boundingBox(),bottom=await page.locator('#stats-bar').boundingBox();return Math.max(Math.abs(p.y-top.y-top.height),Math.abs(p.y+p.height-bottom.y));}).toBeLessThanOrEqual(2);
 }
 await page.screenshot({path:test.info().outputPath('model-tree-full-height.png')});
});

test('작은 모니터나 숨김 상태를 거쳐도 사용자가 지정한 모델 트리 높이를 복원한다',async({page})=>{
 await page.setViewportSize({width:1400,height:900});await page.goto('/2_3DSimulation/index.html');
 const panel=page.locator('#model-browser-panel');const r=await panel.boundingBox();
 await page.mouse.move(r.x+r.width/2,r.y+r.height-2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+600,{steps:8});await page.mouse.up();
 const original=await panel.boundingBox();
 await page.setViewportSize({width:1100,height:400});
 await expect.poll(async()=>{const p=await panel.boundingBox(),b=await page.locator('#stats-bar').boundingBox();return p.y+p.height-b.y;}).toBeLessThanOrEqual(2);
 await page.setViewportSize({width:1400,height:900});
 await expect.poll(async()=>Math.abs((await panel.boundingBox()).height-original.height)).toBeLessThanOrEqual(2);
 await page.locator('[data-panel-toggle="model-browser-panel"]').click();
 await page.setViewportSize({width:1100,height:400});
 await page.locator('[data-panel-toggle="model-browser-panel"]').click();
 await expect.poll(async()=>{const p=await panel.boundingBox(),b=await page.locator('#stats-bar').boundingBox();return p.y+p.height-b.y;}).toBeLessThanOrEqual(2);
 await page.locator('[data-panel-toggle="model-browser-panel"]').click();await page.setViewportSize({width:1400,height:900});
 await page.locator('[data-panel-toggle="model-browser-panel"]').click();
 await expect.poll(async()=>Math.abs((await panel.boundingBox()).height-original.height)).toBeLessThanOrEqual(2);
});

test('모델 트리 외곽 높이를 줄여도 선택 모델 편집 영역과 내부 분할을 유지한다',async({page})=>{
 await page.route('**/2_3DSimulation/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:`${await response.text()}\nwindow.__panelResize={state,createPrimitiveShapeRoot,updateUIStatus,selectSceneModel};`});});
 await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__panelResize);
 await page.evaluate(()=>{const a=window.__panelResize;for(let i=0;i<15;i++){const m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'부품 '+i});a.state.scene.add(m);a.state.models.push(m);}a.updateUIStatus();a.selectSceneModel(a.state.models[0]);});
 const panel=page.locator('#model-browser-panel'),editor=page.locator('#model-transform-panel');
 await expect.poll(async()=>{const p=await panel.boundingBox(),b=await page.locator('#stats-bar').boundingBox();return Math.abs(p.y+p.height-b.y);}).toBeLessThanOrEqual(2);
 async function resizeHeight(height){const r=await panel.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height-2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+height,{steps:10});await page.mouse.up();}
 await resizeHeight(240);
 await expect.poll(async()=> (await editor.boundingBox()).height).toBeGreaterThanOrEqual(179);
 await expect(page.locator('[data-transform-mode="translate"]')).toBeInViewport();
 await resizeHeight(530);await page.locator('[data-transform-mode="rotate"]').click();
 const split=await page.locator('#model-transform-resize-handle').boundingBox();await page.mouse.move(split.x+split.width/2,split.y+split.height/2);await page.mouse.down();await page.mouse.move(split.x+split.width/2,split.y+150,{steps:8});await page.mouse.up();
 await resizeHeight(330);
 await expect.poll(async()=> (await editor.boundingBox()).height).toBeGreaterThanOrEqual(179);
 await expect(page.locator('[data-transform-mode="scale"]')).toBeInViewport();
 await resizeHeight(510);await expect.poll(async()=> (await editor.boundingBox()).height).toBeGreaterThan(250);
 await page.screenshot({path:test.info().outputPath('model-tree-resize.png')});
});
