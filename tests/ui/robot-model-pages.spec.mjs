import {test,expect} from '@playwright/test';

const catalog='/1_RobotModelSelect/';
const modelPath=id=>catalog+'models/'+id.toUpperCase()+'/';
const modelCard=(page,id)=>page.locator('[data-product-id="'+id+'"]');

test('모델 카드는 고유 주소를 제공하고 뒤로·앞으로·닫기 후에도 같은 구성 창을 복원한다',async({page})=>{
    const id='IR-R15H-145S-K-INT';
    await page.goto(catalog);
    await page.evaluate(()=>{window.__sameModelDocument=true;});
    await expect(modelCard(page,id)).toHaveAttribute('href',modelPath(id));
    await modelCard(page,id).click();
    await expect(page).toHaveURL(new RegExp(modelPath(id)+'$'));
    await expect(page.locator('#options-modal')).toBeVisible();
    await expect(page.locator('#dynamic-purchase-code .code-badge')).toHaveText('01741446');
    await expect(page).toHaveTitle(new RegExp(id));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://inovancerobot.com'+modelPath(id));
    expect(await page.evaluate(()=>window.__sameModelDocument)).toBe(true);
    await page.goBack();
    await expect(page.locator('#options-modal')).toBeHidden();
    await page.goForward();
    await expect(page.locator('#options-modal')).toBeVisible();
    await page.locator('#close-modal-btn').click();
    await expect(page).toHaveURL(new RegExp(catalog+'$'));
    await expect(page.locator('#options-modal')).toBeHidden();
    expect(await page.evaluate(()=>window.__sameModelDocument)).toBe(true);
});

test('6축·SCARA·클린형 주소를 직접 열거나 새로고침해도 해당 모델만 열고 장바구니를 자동 변경하지 않는다',async({page})=>{
    for(const id of ['IR-R4H-54S-INT','IR-S7-60Z20S-INT','IR-S25-100Z36C-INT']){
        await page.goto(modelPath(id));
        await expect(page.locator('#options-modal')).toBeVisible();
        await expect(page.locator('#modal-model-name')).toHaveText(id);
        await expect(page.locator('#cart-badge')).toHaveText('0');
        const image=page.locator('#modal-body img').first();
        await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
        expect(await image.evaluate(img=>img.src)).toContain('/1_RobotModelSelect/Model_image/');
        await page.reload();
        await expect(page.locator('#modal-model-name')).toHaveText(id);
        await expect(page.locator('#options-modal')).toBeVisible();
        await page.locator('#close-modal-btn').click();
        await expect(page).toHaveURL(new RegExp(catalog+'$'));
        await expect(page.locator('#options-modal')).toBeHidden();
    }
});

test('기존 model 매개변수도 지원하고 잘못된 모델·숨겨진 모델은 구성이나 장바구니를 열지 않는다',async({page})=>{
    const id='IR-R4H-54S-INT';
    await page.goto(catalog+'?model='+id+'&source=shared');
    await expect(page).toHaveURL(new RegExp(modelPath(id)+'\\?source=shared$'));
    await expect(page.locator('#modal-model-name')).toHaveText(id);
    for(const invalid of ['does-not-exist','IR-CS7-60Z20S-INT','<script>alert(1)</script>']){
        await page.goto(catalog+'?model='+encodeURIComponent(invalid));
        await expect(page.locator('#options-modal')).toBeHidden();
        await expect(page.locator('#product-container .product-card').first()).toBeVisible();
        await expect(page.locator('#cart-badge')).toHaveText('0');
    }
    await page.goto(catalog+'?embed=manual&model='+id);
    expect(new URL(page.url()).pathname).toBe(catalog);
});

test('통계 비콘이 감지하는 경로 변경은 모델을 열 때 한 번이며 언어·옵션 변경에는 중복되지 않는다',async({page})=>{
    await page.route('https://static.cloudflareinsights.com/beacon.min.js',route=>route.fulfill({
        contentType:'application/javascript',
        body:'window.__modelPageViews=[];const originalPush=history.pushState;history.pushState=function(...args){const out=originalPush.apply(this,args);window.__modelPageViews.push(location.pathname);return out;};'
    }));
    await page.goto(catalog);
    await expect.poll(()=>page.evaluate(()=>Array.isArray(window.__modelPageViews))).toBe(true);
    const id='IR-R15H-145S-K-INT';
    await modelCard(page,id).click();
    await expect(page.locator('#options-modal')).toBeVisible();
    await page.locator('#robot-quantity').fill('2');
    await page.locator('#inorobot-language-select').selectOption('en');
    await expect(page).toHaveURL(new RegExp(modelPath(id)+'$'));
    await expect(page.locator('#modal-model-name')).toHaveText(id);
    expect(await page.evaluate(()=>window.__modelPageViews)).toEqual([modelPath(id)]);
    await expect(page.locator('[data-inorobot-cloudflare-analytics]')).toHaveCount(1);
});

test('자바스크립트 없이도 모델 링크·사양·개별 제목과 canonical을 제공한다',async({browser})=>{
    const context=await browser.newContext({javaScriptEnabled:false,baseURL:test.info().project.use.baseURL});
    const page=await context.newPage();
    await page.goto(catalog);
    await expect(page.locator('#product-container a.product-card')).toHaveCount(42);
    const id='IR-R4H-54S-INT';
    await page.goto(modelPath(id));
    await expect(page.locator('h1')).toContainText(id);
    await expect(page.locator('#options-modal')).toBeVisible();
    await expect(page.locator('.model-static-detail')).toContainText('545.7');
    await expect(page.locator('.model-static-detail')).toContainText('4 kg');
    await expect(page.locator('.model-static-resources a')).toHaveCount(3);
    await expect(page.locator('.modal-footer')).toBeHidden();
    await page.setViewportSize({width:360,height:900});
    await expect(page.locator('.modal-footer')).toBeHidden();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://inovancerobot.com'+modelPath(id));
    await context.close();
});
