import {test,expect} from '@playwright/test';

async function openDocuments(page){
    await page.goto('/6_Document/');
    await expect(page.locator('#manualList .manual-item').first()).toBeVisible();
}
function cadRows(page,model){
    return page.locator('#manualList .manual-item').filter({has:page.getByRole('heading',{name:model,exact:true})});
}

test('S7-60은 기본형 DWG·STEP 다운로드 한 세트만 표시한다',async({page})=>{
    await openDocuments(page);
    const row=cadRows(page,'IR-S7-60');
    await expect(row).toHaveCount(1);
    await expect(row.locator('button')).toHaveCount(2);
    await expect(row.locator('button').nth(0)).toHaveAttribute('title','IR-S7-60Z20S-INT_2D.dwg');
    await expect(row.locator('button').nth(1)).toHaveAttribute('title','IR-S7-60Z20S-INT_3D.stp');
});

test('TP200은 보호 커버 유무로 행을 나누고 각 사양의 CAD를 연결한다',async({page})=>{
    await openDocuments(page);
    const rows=cadRows(page,'IR-TP-200');
    await expect(rows).toHaveCount(2);
    await page.evaluate(()=>{
        window.__cadDownloads=[];
        const original=HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click=function(){
            if(this.hasAttribute('download'))window.__cadDownloads.push({href:this.getAttribute('href'),name:this.download});
            else original.call(this);
        };
    });
    const variants=[
        {label:'비상 정지 보호 커버 없음',files:['IR-TP-200_2D-INT.dwg','IR-TP-200_3D-INT.stp']},
        {label:'비상 정지 보호 커버 있음',files:['IR-TP200-EMO-INT.dwg','IR-TP200-EMO-INT.stp']}
    ];
    for(const variant of variants){
        const row=rows.filter({has:page.locator('.manual-extra',{hasText:variant.label})});
        await expect(row).toHaveCount(1);
        await expect(row.locator('button')).toHaveCount(2);
        for(const [index,file] of variant.files.entries()){
            const button=row.locator('button').nth(index);
            await expect(button).toHaveAttribute('title',file);
            await button.click();
            expect(await page.evaluate(()=>window.__cadDownloads.at(-1))).toEqual({
                href:'../1_RobotModelSelect/Robot_CAD/IR-TP-200/'+file,name:file
            });
        }
    }
    await expect(page.locator('#manualCountValue')).toHaveText(String(await page.locator('#manualList .manual-item').count()));
    await page.locator('#manualSearch').fill('IR-TP');
    await expect(page.locator('#manualList .manual-item')).toHaveCount(2);
    await page.locator('#inorobot-language-select').selectOption('en');
    await expect(rows.locator('.manual-extra')).toHaveText(['Without Emergency-stop Protective Cover','With Emergency-stop Protective Cover']);
    for(const width of [360,768]){
        await page.setViewportSize({width,height:900});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        for(const button of await rows.locator('button').all()){
            const box=await button.boundingBox();
            expect(box.x+box.width).toBeLessThanOrEqual(width);
        }
    }
});

test('하드웨어 매뉴얼의 각 분류에는 CAD가 나타나지 않고 CAD 필터에서는 다시 표시된다',async({page})=>{
    await openDocuments(page);
    await page.locator('#filterToggleHardware').click();
    for(const type of ['scara','6axis','controller','expansion','safetyFunction','selection']){
        const filter=page.locator('#typeFilters [data-type="'+type+'"]');
        const expected=await filter.locator('.filter-count').textContent();
        await filter.click();
        await expect(page.locator('#manualList .manual-code').filter({hasText:/^CAD$/})).toHaveCount(0);
        expect(await page.locator('#manualList .manual-item').count()).toBeGreaterThan(0);
        await expect(page.locator('#manualCountValue')).toHaveText(expected);
        await expect(page.locator('#manualList .manual-item')).toHaveCount(Number(expected));
    }
    await page.locator('#filterToggleCad').click();
    await page.locator('#cadFilters [data-cad="scara"]').click();
    expect(await page.locator('#manualList .manual-code').count()).toBeGreaterThan(0);
    for(const code of await page.locator('#manualList .manual-code').all())await expect(code).toHaveText('CAD');
});

test('하드웨어 전체 모델은 해당 분류의 매뉴얼만 모으고 CAD·언어 전환 후에도 범위를 유지한다',async({page})=>{
    await openDocuments(page);
    await page.locator('#filterToggleHardware').click();
    const all=page.locator('#typeFilters [data-type="all"]');
    const cadCodes=page.locator('#manualList .manual-code').filter({hasText:/^CAD$/});
    await all.click();
    await expect(cadCodes).toHaveCount(0);
    await expect(all).toHaveAttribute('aria-pressed','true');
    const allManualIds=await page.locator('#manualList [data-action="download"]').evaluateAll(buttons=>buttons.map(button=>button.dataset.id).sort());
    const categoryManualIds=new Set();
    for(const type of ['scara','6axis','controller','expansion','safetyFunction','selection']){
        await page.locator('#typeFilters [data-type="'+type+'"]').click();
        for(const id of await page.locator('#manualList [data-action="download"]').evaluateAll(buttons=>buttons.map(button=>button.dataset.id)))categoryManualIds.add(id);
    }
    expect(allManualIds).toEqual([...categoryManualIds].sort());
    await all.click();
    await expect(page.locator('#manualCountValue')).toHaveText(String(allManualIds.length));
    await page.locator('#inorobot-language-select').selectOption('en');
    await expect(cadCodes).toHaveCount(0);
    await expect(all).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#manualCountValue')).toHaveText(String(allManualIds.length));
    await page.locator('#filterToggleCad').click();
    await page.locator('#cadFilters [data-cad="cad"]').click();
    expect(await cadCodes.count()).toBeGreaterThan(0);
    await all.click();
    await expect(cadCodes).toHaveCount(0);
    await expect(page.locator('#manualCountValue')).toHaveText(String(allManualIds.length));
    await expect(page.locator('.filter-btn[aria-pressed="true"]')).toHaveCount(1);
});
