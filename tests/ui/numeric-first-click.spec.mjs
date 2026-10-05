import {test,expect} from '@playwright/test';

test('시뮬레이션 숫자 입력칸은 첫 클릭으로 맨 앞에 커서를 표시하고 전체 선택하지 않는다',async({page})=>{
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('init();\n','window.__ready=init();\n')+'\nwindow.__numeric={state,createPrimitiveShapeRoot,selectSceneModel};'});
    });
    await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__numeric);await page.evaluate(()=>window.__ready);
    await page.locator('#model-select').selectOption('robot:IR-S10-80Z20');await expect(page.locator('#tcp-x')).toBeEnabled();
    await page.evaluate(()=>{const a=window.__numeric,m=a.createPrimitiveShapeRoot('box',{x:20,y:20,z:20},{name:'입력 검사'});m.position.x=123;a.state.scene.add(m);a.state.models.push(m);a.selectSceneModel(m);});
    for(const selector of ['#model-position-x','#model-rotation-x','#tcp-x','#tcp-rz']){
        await page.locator('#model-browser-panel h2').click();
        const input=page.locator(selector);await input.click();await expect(input).toBeFocused();
        const caret=await input.evaluate(node=>({start:node.selectionStart,end:node.selectionEnd,length:node.value.length,type:node.type}));
        expect(caret.type).toBe('text');expect(caret.start).toBe(caret.end);expect(caret.start).toBe(0);
        const value=await input.inputValue();await page.keyboard.type('1');await expect(input).toHaveValue('1'+value);
    }
});
