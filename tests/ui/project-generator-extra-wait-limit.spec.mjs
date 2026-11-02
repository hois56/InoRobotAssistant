import {test,expect} from '@playwright/test';

async function openGenerator(page) {
    const messages=[];page.on('dialog',async dialog=>{messages.push(dialog.message());await dialog.accept();});
    await page.route('**/4_ProjectGenerator/app.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nwindow.__extraWait={state,Generator,exportProj};'});
    });
    await page.goto('/4_ProjectGenerator/index.html');
    await page.waitForFunction(()=>window.__extraWait?.state.steps.length>0);
    return messages;
}

test('the process wait button prevents a ninth extra position from colliding with Pre_work',async({page})=>{
    const messages=await openGenerator(page);
    await page.evaluate(()=>{window.__extraWait.state.steps[0].ExtraWaitCount=7;});
    await page.locator('#fileSelector').selectOption('P.pts');
    await page.locator('#btnToggleEdit').click();
    await page.locator('button[onclick="window.addExtraWait(0)"]').click();
    const atLimit=await page.evaluate(()=>window.__extraWait.state.steps[0].ExtraWaitCount);
    await expect(page.locator('button[onclick="window.addExtraWait(0)"]')).toHaveCount(0);
    const result=await page.evaluate(()=>{
        const a=window.__extraWait;
        const text=a.Generator.DataPoints(a.state.steps,a.state.options);
        const points=[...text.matchAll(/^P\[(\d+)\]/gm)].map(match=>Number(match[1]));
        return{after:a.state.steps[0].ExtraWaitCount,unique:new Set(points).size===points.length};
    });
    expect(atLimit).toBe(8);expect(result).toEqual({after:8,unique:true});expect(messages).toEqual([]);
});

test('export refuses an invalid legacy wait count instead of downloading a project with duplicate position numbers',async({page})=>{
    const messages=await openGenerator(page);let downloads=0;page.on('download',()=>downloads++);
    await page.evaluate(()=>{window.__extraWait.state.steps[0].ExtraWaitCount=9;});
    await page.locator('#btnGenerate').click();
    expect(await page.evaluate(()=>window.__extraWait.state.steps[0].ExtraWaitCount)).toBe(9);
    expect(messages.at(-1)).toMatch(/0.*8/);expect(downloads).toBe(0);
});
