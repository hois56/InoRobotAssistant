import {test,expect} from '@playwright/test';

test('옵션 수량 입력을 표시해도 항목의 기본 높이와 패딩을 유지한다',async({page})=>{
    await page.setViewportSize({width:1440,height:1000});
    await page.goto('/1_RobotModelSelect/models/IR-R15H-145S-K-INT/');
    await expect(page.locator('#options-modal')).toBeVisible();
    for(const name of ['commSelection','accSelection','expSelection','remoteCouplerSelection']){
        const input=page.locator('#modal-body input[name="'+name+'"]:not([value="none"])').first();
        const row=input.locator('..');
        const before=await row.evaluate(element=>({height:element.getBoundingClientRect().height,padding:getComputedStyle(element).padding}));
        await input.check();
        const quantity=row.locator('.accessory-quantity-wrap .accessory-quantity');
        await expect(quantity).toBeVisible();
        await expect.poll(()=>row.evaluate(element=>element.getBoundingClientRect().height),{message:name+' selected height'}).toBeLessThanOrEqual(before.height+1);
        expect(await row.evaluate(element=>getComputedStyle(element).padding)).toBe(before.padding);
        await quantity.fill('3');
        await expect(quantity).toHaveValue('3');
    }
});
