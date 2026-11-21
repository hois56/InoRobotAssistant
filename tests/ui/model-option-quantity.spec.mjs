import {test,expect} from '@playwright/test';
import {buffer, text} from 'node:stream/consumers';
import {yauzl} from 'playwright-core/lib/utilsBundle';

async function exportSheet(page, button) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
    const archive = await yauzl.fromBufferPromise(await buffer(await download.createReadStream()));
    try {
        for await (const entry of archive.eachEntry()) {
            if (entry.fileName !== 'xl/worksheets/sheet1.xml') continue;
            const contents = await text(await archive.openReadStreamPromise(entry));
            return await page.evaluate(xml => {
                const sheet = new DOMParser().parseFromString(xml, 'application/xml');
                const value = cell => cell.querySelector('v, t')?.textContent;
                const rows = Array.from(sheet.querySelectorAll('sheetData row'), row =>
                    Array.from(row.children, value));
                return {summary:rows[1], headers:rows[3], items:rows.slice(4),
                    range:sheet.querySelector('autoFilter').getAttribute('ref')};
            }, contents);
        }
        throw new Error('Missing worksheet in exported workbook');
    } finally {
        archive.close();
    }
}

test('필수 로봇 구성 옆에 수량을 표시하고 모델별 선택 항목을 순서대로 나눈다', async ({page}) => {
    const headings = ['로봇 구성 (필수)', '펜던트 구성 (선택)', 'I/O 케이블 구성 (선택)', '통신 구성 (선택)',
        '컨트롤러 확장 카드 (선택)', '리모트 커플러 (선택)', '기타 액세서리 (선택)'];
    await page.setViewportSize({width:360, height:800});
    for (const [id, hasIo] of [['IR-R4H-54S-INT', true], ['IR-S4-40Z15S-INT', false]]) {
        await page.goto('/1_RobotModelSelect/models/' + id + '/');
        const sections = page.locator('#modal-body ol.configuration-sections');
        await expect(sections.getByRole('heading', {level:3})).toHaveText(hasIo ? headings : headings.filter(h => !h.startsWith('I/O')));
        const robot = sections.getByRole('listitem').first();
        const title = robot.getByRole('heading', {name:headings[0]});
        const quantity = robot.getByRole('spinbutton', {name:'로봇 수량'});
        await expect(quantity).toHaveValue('1');
        const titleBox = await title.boundingBox();
        const inputBox = await quantity.boundingBox();
        expect(inputBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
        expect(Math.abs(inputBox.y + inputBox.height / 2 - titleBox.y - titleBox.height / 2)).toBeLessThan(3);
        for (const selector of ['#cable-len-container', '#cable-type-container', '#robot-body-option-container']) {
            await expect(robot.locator(selector)).toBeVisible();
        }
        await expect(sections.locator('#arm-container')).toHaveCount(hasIo ? 1 : 0);
        await expect(sections.locator('#body-container')).toHaveCount(hasIo ? 1 : 0);
    }
});

test('다관절 I/O 세트는 선택한 경우에만 별도 수량으로 담고 다시 해제할 수 있다', async ({page}) => {
    for (const id of ['IR-R20H-120S-K-INT', 'IR-R15H-145S-K-INT']) {
        await page.goto('/1_RobotModelSelect/models/' + id + '/');
        await expect(page.locator('[name="ioCableSetSelection"]:checked')).toHaveValue('none');
    }
    const robotQuantity = page.getByRole('spinbutton', {name:'로봇 수량'});
    const options = page.locator('#io-cable-set-radios');
    const set = options.locator('input[data-code]').first();
    const setQuantity = set.locator('..').getByRole('spinbutton');
    await robotQuantity.fill('3');
    await set.check();
    await setQuantity.fill('2');
    const code = await set.getAttribute('data-code');
    const ioSection = page.getByRole('listitem').filter({has:page.getByRole('heading', {name:'I/O 케이블 구성 (선택)'})});
    await expect(ioSection.locator('.configuration-codes .code-badge')).toHaveText([code]);
    const cart = page.locator('#cart-list .cart-item');
    await page.locator('#add-to-cart-btn').click();
    await expect(cart.locator('.cart-item-detail-qty')).toHaveText(['3개', '2개', '2개']);
    const sheet = await exportSheet(page, '#cart-download-btn');
    const setRows = sheet.items.filter(row => row[2] === code);
    expect(setRows).toHaveLength(1);
    expect(setRows[0][5]).toBe('2');
    expect(setRows[0][1]).toContain('Body I/O');
    await cart.locator('[data-cart-action="edit"]').click();
    await expect(set).toBeChecked();
    await expect(setQuantity).toHaveValue('2');
    await options.getByRole('radio', {name:'사용 안 함'}).check();
    await expect(ioSection.locator('.configuration-codes .code-badge')).toHaveCount(0);
    await page.locator('#add-to-cart-btn').click();
    await expect(cart.locator('.cart-item-detail-qty')).toHaveText(['3개']);
    await expect(cart).not.toContainText(code);
});

test('옵션 수량 입력을 표시해도 항목의 기본 높이와 패딩을 유지한다',async({page})=>{
    await page.setViewportSize({width:1440,height:1000});
    await page.goto('/1_RobotModelSelect/models/IR-R15H-145S-K-INT/');
    await expect(page.locator('#options-modal')).toBeVisible();
    for(const name of ['commSelection','accSelection','expSelection','remoteCouplerSelection']){
        const selection = name === 'expSelection' ? '[value="01650026"]' : ':not([value="none"])';
        const input=page.locator('#modal-body input[name="'+name+'"]'+selection).first();
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

test('통신 선택은 같은 구매 코드의 확장 카드와 수량을 연결하고 직접 선택한 카드는 유지한다', async ({page}) => {
    await page.goto('/1_RobotModelSelect/models/IR-R4H-54S-INT/');
    const protocol = code => page.locator('#comm-radios input[type="radio"][data-code="' + code + '"]');
    const expansion = code => page.locator('[name="expSelection"][value="' + code + '"]');
    const quantity = choice => choice.locator('..').getByRole('spinbutton');
    const profinet = '01650028';
    const ccLink = '01650040';
    const extraCard = expansion('01650026');
    await extraCard.check();
    await protocol(profinet).check();
    await expect(expansion(profinet)).toBeChecked();
    await quantity(protocol(profinet)).fill('3');
    await expect(quantity(expansion(profinet))).toHaveValue('3');
    await quantity(expansion(profinet)).fill('2');
    await expect(quantity(protocol(profinet))).toHaveValue('2');

    await page.locator('#add-to-cart-btn').click();
    const cart = page.locator('#cart-list .cart-item');
    const code = cart.locator('.cart-item-detail-code').filter({hasText:profinet});
    await expect(code).toHaveCount(1);
    await expect(code.locator('xpath=../following-sibling::*[1]')).toHaveText('2개');
    await cart.locator('[data-cart-action="edit"]').click();
    await expect(expansion(profinet)).toBeChecked();
    await expect(quantity(expansion(profinet))).toHaveValue('2');
    await protocol(ccLink).check();
    await expect(expansion(profinet)).not.toBeChecked();
    await expect(expansion(ccLink)).toBeChecked();
    await expansion(ccLink).uncheck();
    await expect(protocol('')).toBeChecked();
    await expect(extraCard).toBeChecked();

    await expansion(ccLink).check();
    await quantity(expansion(ccLink)).fill('4');
    await protocol(ccLink).check();
    await expect(quantity(protocol(ccLink))).toHaveValue('4');
    await protocol(profinet).check();
    await expect(expansion(ccLink)).toBeChecked();
    await protocol('').check();
    await expect(expansion(profinet)).not.toBeChecked();
    await expect(expansion(ccLink)).toBeChecked();
});

test('로봇 수량에 바깥 여백이 없고 핀 수와 펜던트 선택 안내를 읽을 수 있다', async ({page}) => {
    await page.setViewportSize({width:360, height:800});
    await page.goto('/1_RobotModelSelect/models/IR-R4H-54S-INT/');
    const robotQuantity = page.locator('label[for="robot-quantity"]');
    await expect(robotQuantity).toHaveCSS('padding', '0px');
    await expect(robotQuantity).toHaveCSS('border-top-width', '0px');
    for (const [group, pins] of [['arm',8], ['arm',12], ['body',19]]) {
        const hint = page.locator('#' + group + '-container').getByText(new RegExp('^' + pins + '\\s*핀.*케이블 선택$'));
        await expect(hint).toBeVisible();
        expect(await hint.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    }
    const pendantHint = page.locator('#pendant-container').getByText('펜던트 길이 선택', {exact:true});
    expect(await pendantHint.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
});

test('단일 구성과 구성 목록을 실제 엑셀로 내보내면 필수·선택 품목과 로봇 수량을 구분한다', async ({page}) => {
    await page.goto('/1_RobotModelSelect/models/IR-R4H-54S-INT/');
    await page.locator('#robot-quantity').fill('2');
    const cardCode = '01650028';
    const card = page.locator('[name="commSelection"][data-code="' + cardCode + '"]');
    await card.check();
    await card.locator('..').getByRole('spinbutton').fill('4');
    const single = await exportSheet(page, '#download-components-btn');
    expect(single.headers).toEqual(['순번', '형번', '코드', '타입', '상세 정보', '수량', '품목 구분']);
    expect(single.summary.slice(-4)).toEqual(['총 구성 수', '1', '총 로봇 수량', '2']);
    expect(single.items.map(row => row.slice(5))).toEqual([['2', '본체 (필수)'], ['4', '선택 옵션']]);
    expect(single.items[1][2]).toBe(cardCode);
    expect(single.items[1][3]).toBe('통신');
    await page.locator('[name="robotBodyOption"][value="clean"]').check();
    const clean = await exportSheet(page, '#download-components-btn');
    expect(clean.summary.slice(-4)).toEqual(single.summary.slice(-4));
    expect(clean.items.map(row => row.slice(5))).toEqual([['2', '본체 (필수)'], ['2', '케이블 (필수)'], ['4', '선택 옵션']]);
    expect(clean.items[1][2]).toBe(single.items[0][2]);
    await page.locator('[name="robotBodyOption"][value="standard"]').check();
    await page.locator('#add-to-cart-btn').click();
    await page.goto('/1_RobotModelSelect/models/IR-S7-60Z20S-INT/');
    const expansion = page.locator('[name="expSelection"][value="' + cardCode + '"]');
    await expansion.check();
    await expansion.locator('..').getByRole('spinbutton').fill('3');
    await page.locator('#add-to-cart-btn').click();
    await page.goto('/1_RobotModelSelect/models/IR-R4H-54S-INT/');
    await page.locator('#add-to-cart-btn').click();
    const cart = await exportSheet(page, '#cart-download-btn');
    expect(cart.summary.slice(-4)).toEqual(['총 구성 수', '3', '총 로봇 수량', '4']);
    expect(cart.items.map(row => row.slice(5))).toEqual([['3', '본체 (필수)'], ['1', '본체 (필수)'], ['7', '선택 옵션']]);
    expect(cart.items[2][2]).toBe(cardCode);
    expect(cart.items[2][3].split('\n')).toEqual(['통신', '확장 카드']);
    expect(cart.range).toBe('A4:G7');
});

test('유료 하드웨어를 단독으로 담아 수량을 수정·복원하고 로봇 옵션과 같은 코드로 합산한다', async ({page}) => {
    await page.setViewportSize({width:390,height:840});
    await page.goto('/1_RobotModelSelect/');
    await page.locator('[data-option-id="paid-hardware"]').click();
    const dialog = page.locator('#hardware-dialog');
    const expansion = page.locator('[data-hardware-category="expansion"]');
    const check = code => dialog.locator('[name="hardwarePart"][value="' + code + '"]');
    const quantity = code => check(code).locator('xpath=ancestor::tr').getByRole('spinbutton');
    const submit = dialog.getByRole('button',{name:'구성 목록에 담기'});
    const cart = page.locator('#cart-overlay');
    const entry = code => cart.locator('[data-cart-id="hardware-' + code + '"].cart-item');
    const pn = '01650028';
    await expansion.click();
    await expect(dialog.locator('.hardware-section-heading')).toHaveText(['통신','입출력','안전 확장']);
    await expect(dialog.locator('tbody').first().locator('code')).toHaveText([pn,'01650040']);
    await expect(dialog.locator('tbody').nth(1).locator('code')).toHaveText(['01650026','01650027','01650025']);
    await expect(dialog.locator('tbody').last().locator('code')).toHaveText(['01650030']);
    await expect(submit).toBeDisabled();
    await check(pn).check();
    await check('01650026').check();
    await quantity(pn).fill('0');
    await submit.click();
    await expect(dialog).toBeVisible();
    await quantity(pn).fill('2');
    await submit.click();
    await expect(cart).toBeVisible();
    await expect(page.locator('#cart-total-robots')).toHaveText('0');
    await expect(page.locator('#cart-total-items')).toHaveText('2');
    await expect(entry(pn).getByRole('spinbutton')).toHaveValue('2');
    await expect(cart.locator('#cart-list')).not.toContainText('기본 케이블');

    await page.locator('#cart-close-btn').click();
    await expansion.click();
    await check(pn).check();
    await quantity(pn).fill('3');
    await submit.click();
    const count = entry(pn).getByRole('spinbutton');
    await expect(count).toHaveValue('5');
    await count.fill('6');
    await count.press('Tab');
    await page.reload();
    await page.locator('#cart-toggle-btn').click();
    await expect(count).toHaveValue('6');
    const onlyHardware = await exportSheet(page,'#cart-download-btn');
    expect(onlyHardware.summary.slice(-4)).toEqual(['총 구성 수','2','총 로봇 수량','0']);
    expect(onlyHardware.items.map(row => [row[2],row[5],row[6]])).toEqual([[pn,'6','선택 옵션'],['01650026','1','선택 옵션']]);
    await entry('01650026').getByRole('button',{name:'구성 삭제'}).click();

    await page.goto('/1_RobotModelSelect/models/IR-R4H-54S-INT/');
    await expect(page.locator('#expansion-cards-container .expansion-group-title')).toHaveText(['통신','입출력','안전 확장']);
    await page.locator('#robot-quantity').fill('2');
    await page.locator('[name="commSelection"][data-code="'+pn+'"]').check();
    await page.locator('#add-to-cart-btn').click();
    const mixed = await exportSheet(page,'#cart-download-btn');
    expect(mixed.summary.slice(-4)).toEqual(['총 구성 수','2','총 로봇 수량','2']);
    expect(mixed.items.filter(row=>row[2] === pn).map(row=>row[5])).toEqual(['7']);
    expect(mixed.items).toHaveLength(2);
});

test('펜던트와 기타 액세서리 카드에서 담은 연장 케이블을 같은 구매 코드로 합산한다', async ({page}) => {
    await page.goto('/1_RobotModelSelect/');
    await page.locator('[data-option-id="paid-hardware"]').click();
    const dialog = page.locator('#hardware-dialog');
    const code = '1504R445';
    for (const [category, quantity] of [['accessories', '2'], ['pendant', '3']]) {
        await page.locator('[data-hardware-category="' + category + '"]').click();
        const cables = dialog.getByRole('row').filter({hasText: '티칭 펜던트 연장 케이블'});
        await expect(cables.locator('code')).toHaveText(['1504R444', '1504R445', '1504R446']);
        const row = cables.filter({hasText: code});
        await row.getByRole('checkbox').check();
        await row.getByRole('spinbutton').fill(quantity);
        await dialog.getByRole('button', {name: '구성 목록에 담기'}).click();
        if (category === 'accessories') await page.locator('#cart-close-btn').click();
    }
    const entry = page.locator('#cart-list .cart-item');
    await expect(entry).toHaveCount(1);
    await expect(entry.getByRole('spinbutton')).toHaveValue('5');
    const {items} = await exportSheet(page, '#cart-download-btn');
    expect(items.map(row => [row[2], row[3], row[5]])).toEqual([[code, '티칭 펜던트 연장 케이블', '5']]);
});

test('R7H 전용 영점 툴을 두 리치와 이전 구성에 적용하고 단종 브레이크 박스를 제외한다', async ({page}) => {
    await page.goto('/1_RobotModelSelect/');
    await page.locator('[data-option-id="paid-hardware"]').click();
    await page.locator('[data-hardware-category="accessories"]').click();
    const dialog = page.locator('#hardware-dialog');
    await expect(dialog.getByRole('row').filter({hasText:'32022076'})).toContainText('R7H 전용 영점 보정 툴');
    await expect(dialog.getByRole('row').filter({hasText:'01660018'})).not.toContainText('R7H');
    await expect(dialog).not.toContainText('01660004');
    await expect(dialog).not.toContainText('브레이크');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
        const option = (code, quantity) => ({code, quantity, category:'Accessory', name:'Homing tool',
            detail:'Zero position calibration', inputName:'accSelection', inputValue:code});
        localStorage.setItem('inorobot.robotModelSelect.cart.v1',JSON.stringify([{
            id:'prior', modelId:'IR-R7H-70S-INT', robotQuantity:2, accessories:[option('01660018',3), option('01660004',1)],
            selections:{accessories:['01660018','01660004']}
        }]));
    });
    await page.reload();
    await page.locator('#cart-toggle-btn').click();
    const saved = page.locator('#cart-list');
    await expect(saved).toContainText('32022076');
    await expect(saved).not.toContainText('01660018');
    await expect(saved).not.toContainText('01660004');
    await saved.getByRole('button',{name:'구성 수정'}).click();
    const selector = code => page.locator('[name="accSelection"][value="'+code+'"]');
    await expect(selector('32022076')).toBeChecked();
    await expect(selector('32022076').locator('..').getByRole('spinbutton')).toHaveValue('3');
    await page.goto('/1_RobotModelSelect/models/IR-R7H-90S-INT/');
    await expect(selector('32022076')).toHaveCount(1);
    await expect(selector('01660018')).toHaveCount(0);
    await page.goto('/1_RobotModelSelect/models/IR-R4H-54S-INT/');
    await expect(selector('01660018')).toHaveCount(1);
    await expect(selector('32022076')).toHaveCount(0);
    await page.goto('/1_RobotModelSelect/models/IR-R10-140S-INT/');
    await expect(selector('01660004')).toHaveCount(0);
});
