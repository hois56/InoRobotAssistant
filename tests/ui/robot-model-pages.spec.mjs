import {test,expect} from '@playwright/test';

const catalog='/1_RobotModelSelect/';
const modelPath=id=>catalog+'models/'+id.toUpperCase()+'/';
const modelCard=(page,id)=>page.locator('[data-product-id="'+id+'"]');
const hardwareLabels = ['펜던트', '확장 카드', '기타 액세서리', '리모트 커플러'];

async function expectScaraColumns(card, types, strokes, cycles) {
    const table = card.getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText(['사양', ...types]);
    await expect(table.getByRole('row', {name:/Z축 길이/}).getByRole('cell')).toHaveText(strokes);
    await expect(table.getByRole('row', {name:/표준 사이클 시간/}).getByRole('cell')).toHaveText(cycles);
}

test('모델 카드는 고유 주소를 제공하고 뒤로·앞으로·닫기 후에도 같은 구성 창을 복원한다',async({page})=>{
    const id='IR-R15H-145S-K-INT';
    await page.goto(catalog);
    await page.evaluate(()=>{window.__sameModelDocument=true;});
    await expect(modelCard(page,id)).toHaveAttribute('href',modelPath(id)+'?lang=ko');
    await expect(modelCard(page,id).locator('.spec-row').filter({hasText:'반복 정밀도'})).toContainText('±0.04 mm');
    await modelCard(page,id).click();
    await expect(page).toHaveURL(new RegExp(modelPath(id)+'\\?lang=ko$'));
    await expect(page.locator('#options-modal')).toBeVisible();
    await expect(page.locator('#dynamic-purchase-code .code-badge')).toHaveText('01741446');
    for (const [axis, value] of [['J4','26.5'], ['J5','26.5'], ['J6','12']]) {
        const torque = page.locator('#modal-body tr').filter({hasText:'허용 토크 ('+axis+')'});
        await expect(torque.locator('td').last()).toHaveText(value+' N·m');
    }
    await expect(page).toHaveTitle(new RegExp(id));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://inovancerobot.com'+modelPath(id));
    expect(await page.evaluate(()=>window.__sameModelDocument)).toBe(true);
    await page.goBack();
    await expect(page.locator('#options-modal')).toBeHidden();
    await page.goForward();
    await expect(page.locator('#options-modal')).toBeVisible();
    await page.locator('#close-modal-btn').click();
    await expect(page).toHaveURL(new RegExp(catalog+'\\?lang=ko$'));
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
        await expect(page).toHaveURL(new RegExp(catalog+'\\?lang=ko$'));
        await expect(page.locator('#options-modal')).toBeHidden();
    }
});

test('SCARA 카드는 두 형식의 Z축 길이와 사이클 시간을 열로 비교하고 선택한 형번의 사양을 사용한다', async ({page}) => {
    const standard = 'IR-S4-40Z15S-INT';
    const clean = 'IR-S4-40Z12C-INT';
    await page.goto(catalog);
    await page.locator('button[data-option-id="SCARA"]').click();
    await expect(page.locator('#product-container .product-card')).toHaveCount(17);
    const card = modelCard(page, standard);
    await expectScaraColumns(card, ['일반형','클린형'], ['150 mm','120 mm'], ['0.342 s','0.352 s']);
    await card.click();

    const body = page.locator('#modal-body');
    const spec = label => body.getByRole('row').filter({has:page.getByText(label, {exact:true})});
    const selectBody = label => body.getByRole('radio', {name:new RegExp(label)});
    await expect(selectBody('일반형')).toBeChecked();
    await expect(spec('Z축 길이')).toContainText('150 mm');
    await expect(spec('표준 사이클 시간')).toContainText('0.342 s');
    await expect(page.locator('#download-cad-btn')).toBeEnabled();
    await body.locator('[name="robotQuantity"]').fill('2');
    await body.locator('[name="cableLenSelection"][value="15m"]').check();
    await expect(page.locator('#dynamic-purchase-code .code-badge')).toHaveText('01741084*M00017');
    await selectBody('클린형').check();
    await expect(selectBody('클린형')).toBeChecked();
    await expect(page).toHaveURL(new RegExp(modelPath(clean)+'\\?lang=ko$'));
    await expect(page.locator('#modal-title')).toContainText(clean);
    await expect(page.locator('#modal-model-name')).toHaveText(clean);
    await expect(spec('클린 타입')).toContainText('ISO Class 4');
    await expect(spec('허용 토크 (J4)')).toContainText('사양표 미기재');
    await expect(spec('Z축 길이')).toContainText('120 mm');
    await expect(spec('표준 사이클 시간')).toContainText('0.352 s');
    await expect(spec('J3 사양')).toContainText('120 mm');
    await expect(spec('인증 정보')).not.toContainText('KCs');
    await expect(body.locator('img')).toHaveAttribute('src', /IR-S4_Clean\.png$/);
    await expect(page.locator('#download-cad-btn')).toBeDisabled();
    await expect(body.locator('[name="cableLenSelection"]:checked')).toHaveValue('15m');
    await expect(body.locator('[name="robotQuantity"]')).toHaveValue('2');
    await expect(page.locator('#dynamic-purchase-code .code-badge')).toHaveText('-');
    await expect(page.locator('#add-to-cart-btn')).toHaveText('구성 담기');
    await page.locator('#add-to-cart-btn').click();
    const cartItem = page.locator('#cart-list .cart-item');
    await expect(cartItem).toContainText(clean);
    await cartItem.locator('[data-cart-action="edit"]').click();
    await expect(selectBody('클린형')).toBeChecked();
    await selectBody('일반형').check();
    await expect(spec('Z축 길이')).toContainText('150 mm');
    await expect(page.locator('#add-to-cart-btn')).toHaveText('구성 수정');
    await page.locator('#add-to-cart-btn').click();
    await expect(cartItem).toHaveCount(1);
    await expect(cartItem).toContainText(standard);
    await expect(cartItem).toContainText('01741084*M00017');
    const cableCode = cartItem.locator('.cart-item-detail-code').first();
    await expect(cableCode).toHaveText('01741084*M00017');
    const summaryFont = await cartItem.locator('.cart-item-meta').evaluate(element => getComputedStyle(element).fontFamily);
    await expect(cableCode).toHaveCSS('font-family', summaryFont);
});

test('SCARA 필터는 같은 사양의 조건을 조합하고 해당 형번을 열며 단독 모델을 구분한다', async ({page}) => {
    await page.goto(catalog);
    const option = (category, value) => page.locator('button[data-filter-id="'+category+'"][data-option-id="'+value+'"]');
    await option('Type','SCARA').click();
    for (const id of ['IR-TS4-35Z15S-INT','IR-TS5-55Z15S-INT','IR-S60-120Z40S-INT','IR-GS60-120Z40S-INT']) {
        await expect(modelCard(page,id)).toBeVisible();
    }
    await expectScaraColumns(modelCard(page,'IR-TS4-35Z15S-INT'), ['천장형'], ['150 mm'], ['0.306 s']);
    await modelCard(page,'IR-TS4-35Z15S-INT').click();
    await expect(page.locator('#robot-body-option-container')).toHaveCount(0);
    await page.locator('#close-modal-btn').click();
    await option('Clean Type','Yes').click();
    await expect(page.locator('#product-container .product-card')).toHaveCount(13);
    await expect(option('Z axis Length(mm)','420')).toHaveCount(0);
    await option('Z axis Length(mm)','350').click();
    await expect(page.locator('#product-container .product-card')).toHaveCount(3);
    await option('Clean Type','Yes').click();
    const clean = 'IR-S35-100Z35C-INT';
    await modelCard(page,clean).click();
    await expect(page.locator('#modal-model-name')).toHaveText(clean);
    await expect(page.locator('#modal-body [name="cableLenSelection"]')).toHaveCount(1);
    await page.getByRole('radio', {name:/일반형/}).check();
    await page.locator('[name="cableLenSelection"][value="15m"]').check();
    await page.getByRole('radio', {name:/클린형/}).check();
    await expect(page.locator('[name="cableLenSelection"]:checked')).toHaveValue('3m');
    await page.locator('#close-modal-btn').click();
    await expect(page).toHaveURL(new RegExp(catalog+'\\?lang=ko$'));
    await expect(option('Z axis Length(mm)','350')).toHaveClass(/active/);
});

test('기존 model 매개변수도 지원하고 잘못된 모델·숨겨진 모델은 구성이나 장바구니를 열지 않는다',async({page})=>{
    const id='IR-R4H-54S-INT';
    await page.goto(catalog+'?model='+id+'&source=shared');
    await expect(page).toHaveURL(new RegExp(modelPath(id)+'\\?source=shared&lang=ko$'));
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

test('로컬 모델 경로 변경은 한 번만 일어나고 운영 통계 비콘은 전송하지 않는다',async({page})=>{
    const productionAnalyticsRequests=[];
    await page.route('https://static.cloudflareinsights.com/**',route=>{
        productionAnalyticsRequests.push(route.request().url());
        return route.abort();
    });
    await page.addInitScript(()=>{
        window.__modelPageViews=[];
        const originalPush=history.pushState;
        history.pushState=function(...args){
            const out=originalPush.apply(this,args);
            window.__modelPageViews.push(location.pathname);
            return out;
        };
    });
    await page.goto(catalog);
    const id='IR-R15H-145S-K-INT';
    await modelCard(page,id).click();
    await expect(page.locator('#options-modal')).toBeVisible();
    await page.locator('#robot-quantity').fill('2');
    await page.locator('#inorobot-language-select').selectOption('en');
    await expect(page).toHaveURL(new RegExp(modelPath(id)+'\\?lang=en$'));
    await expect(page.locator('#modal-model-name')).toHaveText(id);
    expect(await page.evaluate(()=>window.__modelPageViews)).toEqual([modelPath(id)]);
    await expect(page.locator('[data-inorobot-cloudflare-analytics]')).toHaveCount(0);
    expect(productionAnalyticsRequests).toEqual([]);
});

test('자바스크립트 없이도 모델 링크·사양·개별 제목과 canonical을 제공한다',async({browser})=>{
    const context=await browser.newContext({javaScriptEnabled:false,baseURL:test.info().project.use.baseURL});
    const page=await context.newPage();
    await page.goto(catalog);
    await expect(page.locator('#product-container .product-card')).toHaveCount(29);
    const pair = modelCard(page,'IR-S25-100Z42S-INT');
    await page.setViewportSize({width:360,height:900});
    await expectScaraColumns(pair, ['일반형','클린형'], ['420 mm','360 mm'], ['0.35 s','0.37 s']);
    const columns = await pair.getByRole('columnheader').evaluateAll(headers => headers.map(header => header.getBoundingClientRect().x));
    expect(columns[0]).toBeLessThan(columns[1]);
    expect(columns[1]).toBeLessThan(columns[2]);
    expect(await pair.evaluate(card => card.scrollWidth <= card.clientWidth)).toBe(true);
    await pair.getByRole('link', {name:'0.37 s',exact:true}).click();
    await expect(page.locator('h1')).toContainText('IR-S25-100Z36C-INT');
    await expect(page.locator('.model-static-specs')).toContainText('ISO Class 4');
    await expect(page.locator('.model-static-specs')).toContainText('사양표 미기재');
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
test('타입을 선택하지 않으면 모델 아래에 정렬된 하드웨어 카드에서 바로 구성에 담을 수 있다', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(catalog);
    const models = page.locator('#product-container [data-product-id]');
    const cards = page.locator('#product-container [data-hardware-category]');
    await expect(models).toHaveCount(29);
    await expect(cards.locator('strong')).toHaveText(hardwareLabels);
    const lastModel = await models.last().boundingBox();
    const firstOption = await cards.first().boundingBox();
    expect(firstOption.y).toBeGreaterThanOrEqual(lastModel.y + lastModel.height);

    await cards.first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('펜던트');
    await dialog.locator('[name="hardwarePart"][value="01640055"]').check();
    await dialog.getByRole('button', {name: '구성 목록에 담기'}).click();
    await expect(page.locator('#cart-list .cart-item')).toContainText('01640055');
    await page.locator('#cart-close-btn').click();

    await page.locator('button[data-filter-id="Payload(kg)"][data-option-id="4"]').click();
    await expect(modelCard(page, 'IR-R4H-54S-INT')).toBeVisible();
    await expect(modelCard(page, 'IR-R25-178S-INT')).toHaveCount(0);
    await expect(cards.locator('strong')).toHaveText(hardwareLabels);
    const sixAxis = page.locator('button[data-option-id="6-Axis"]');
    await sixAxis.click();
    await expect(cards).toHaveCount(0);
    await sixAxis.click();
    await expect(cards.locator('strong')).toHaveText(hardwareLabels);
});

test('하드웨어 행을 눌러 선택하고 SCARA J3 커버를 대응하는 일반형과 클린형에 담을 수 있다', async ({page}) => {
    await page.goto(catalog);
    await page.locator('[data-hardware-category="accessories"]').click();
    const row = page.getByRole('row').filter({hasText: '98070385'});
    const check = row.getByRole('checkbox');
    await row.locator('code').click();
    await expect(check).toBeChecked();
    const quantity = row.getByRole('spinbutton');
    await quantity.click();
    await quantity.fill('3');
    await expect(check).toBeChecked();
    await row.getByRole('cell', {name: 'S4C, S4S', exact: true}).click();
    await expect(check).not.toBeChecked();
    await row.locator('label').click();
    await expect(check).toBeChecked();
    for (const [model, codes] of [
        ['IR-S4-40Z15S-INT', ['98070385', '98070386']], ['IR-S4-40Z12C-INT', ['98070385', '98070386']],
        ['IR-S7-60Z20S-INT', ['98070355', '98070354']], ['IR-S10-60Z17C-INT', ['98070355', '98070354']],
        ['IR-TS4-35Z15S-INT', []]
    ]) {
        await page.goto(modelPath(model));
        await expect(page.locator('#modal-model-name')).toHaveText(model);
        const covers = page.locator('[name="accSelection"][value^="980703"]');
        expect(await covers.evaluateAll(inputs => inputs.map(input => input.value))).toEqual(codes);
    }
});

test('유료 하드웨어 타입에서 네 분류의 품목, 구매 코드, 호환 모델을 조회하고 로봇 필터로 돌아간다', async ({page}) => {
    await page.setViewportSize({width: 390, height: 840});
    await page.goto('/1_RobotModelSelect/');
    const type = page.locator('.filter-row[data-filter-id="Type"]');
    await expect(type.locator('.filter-label')).toHaveText('타입');
    await type.getByRole('button', {name:'6-Axis'}).click();
    await page.locator('.filter-option[data-filter-id="Payload(kg)"]').first().click();
    const paid = page.locator('.filter-option[data-option-id="paid-hardware"]');
    await paid.click();
    await expect(paid).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.filter-row')).toHaveCount(1);
    await expect(page.locator('#product-container [data-product-id]')).toHaveCount(0);
    const cards = page.locator('.hardware-category-card');
    await expect(cards.locator('strong')).toHaveText(hardwareLabels);
    const dialog = page.getByRole('dialog');
    const sections = {
        pendant: [['비상 정지 보호 커버 없음', 4], ['비상 정지 보호 커버 있음', 3], ['티칭 펜던트 연장 케이블', 3]],
        expansion: [['통신', 2], ['입출력', 3], ['안전 확장', 1]],
        accessories: [['영점 보정 툴', 6], ['펜던트 케이블·플러그', 4], ['SCARA J3 보호 커버', 4], ['엔코더 배터리', 1], ['로봇용 지게차 운반 툴', 1]],
        coupler: [['EtherCAT 커플러', 1], ['디지털 입출력', 3], ['아날로그 입출력', 2]]
    };
    for (const [group, code] of [['expansion','01650028'], ['coupler','01441093'], ['accessories','32020626'], ['pendant','01640055']]) {
        const card = page.locator('[data-hardware-category="' + group + '"]');
        await card.click();
        await expect(dialog.locator('table')).toContainText('구매 코드');
        await expect(dialog.locator('th[scope="rowgroup"]')).toHaveText(sections[group].map(([label]) => label));
        for (const [index, [, count]] of sections[group].entries()) {
            await expect(dialog.locator('tbody').nth(index).getByRole('checkbox')).toHaveCount(count);
        }
        await expect(dialog.locator('code').filter({hasText:code})).toHaveCount(1);
        const row = dialog.getByRole('row').filter({hasText:code});
        await expect(row).toContainText(group === 'accessories' ? 'S4, S7' : '전체 모델');
        await expect(dialog).not.toContainText('72100539');
        await page.keyboard.press('Escape');
        await expect(card).toBeFocused();
    }
    await page.locator('#inorobot-language-select').selectOption('en');
    await expect(paid).toHaveText('Paid hardware options');
    await cards.first().click();
    await expect(dialog.getByRole('heading')).toHaveText('Pendant');
    await expect(dialog).toContainText('Compatible models');
    await dialog.getByRole('button', {name:'Close', exact:true}).click();
    await type.getByRole('button',{name:'SCARA'}).click();
    await expect(cards).toHaveCount(0);
    await expect(page.locator('[data-product-id="IR-S7-60Z20S-INT"]')).toBeVisible();
    await paid.click();
    await page.locator('#reset-btn').click();
    await expect(cards.locator('strong')).toHaveText(['Pendant', 'Expansion Cards', 'Other Accessories', 'Remote Coupler']);
    await expect(page.locator('[data-product-id="IR-R4H-54S-INT"]')).toBeVisible();
});
