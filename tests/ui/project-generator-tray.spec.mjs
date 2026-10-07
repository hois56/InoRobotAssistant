import { test, expect } from '@playwright/test';

test('zero and single-cell Tray settings remove generated offsets, labels, alarms and Excel additions', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/index.html');
    const settings = page.locator('[data-tray-settings="0"]');
    for (const count of ['0', '1']) {
        for (const label of ['X Count', 'Y Count']) {
            await settings.getByLabel(label, { exact: true }).fill(count);
            await settings.getByLabel(label, { exact: true }).blur();
            await expect(settings.getByLabel(label, { exact: true })).toHaveValue(count);
        }
        const result = await page.evaluate(async () => {
            const generated = await JSZip.loadAsync(await buildIOMapExcel());
            const original = await JSZip.loadAsync(Assets.IO_Map_Excel, { base64: true });
            let excelUnchanged = true;
            for (const name of Object.keys(original.files)) {
                if (original.files[name].dir) continue;
                if (await generated.file(name).async('base64') !== await original.file(name).async('base64')) excelUnchanged = false;
            }
            return {
                offset: Generator.OffsetProgram(state.steps, state.options),
                labels: Generator.LabelsJson(state.steps, state.options),
                alarm: JSON.parse(Generator.DataWarning(state.steps, state.options)).Warings[12],
                excelUnchanged
            };
        });
        expect(result.offset).not.toContain('Set_tray_offset');
        expect(result.labels).not.toContain('xwTray_index');
        expect(result.alarm).toBe('');
        expect(result.excelUnchanged).toBe(true);
    }
    for (const label of ['X Count', 'Y Count']) {
        await settings.getByLabel(label, { exact: true }).fill('3');
        await settings.getByLabel(label, { exact: true }).blur();
    }
    expect(await page.evaluate(() => Generator.OffsetProgram(state.steps, state.options))).toContain('Set_tray_offset();');
});

test('Tray settings survive switching processes and export matching robot, label, Excel and alarm files', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/index.html');
    const first = page.locator('[data-tray-settings="0"]');
    await expect(first.getByLabel('X Count', { exact: true })).toHaveValue('3');
    await expect(first.getByLabel('Y Count', { exact: true })).toHaveValue('3');
    await expect(first.getByLabel('X Pitch', { exact: true })).toHaveValue('-58');
    await first.getByLabel('X Count', { exact: true }).fill('4');
    await first.getByLabel('X Count', { exact: true }).blur();
    await first.getByLabel('Y Pitch', { exact: true }).fill('-12.5');
    await first.getByLabel('Y Pitch', { exact: true }).blur();
    await page.locator('#btnAdd').click();
    await page.locator('#stepsList > div').nth(1).locator('select').nth(1).selectOption('Put');
    await page.locator('#stepsList > div').first().locator('select').first().selectOption('Stage');
    await expect(first).toHaveCount(0);
    await page.locator('#stepsList > div').first().locator('select').first().selectOption('Tray');
    await expect(first.getByLabel('X Count', { exact: true })).toHaveValue('4');
    await page.locator('#stepsList').screenshot({ path: test.info().outputPath('tray-settings.png') });
    const result = await page.evaluate(async () => {
        window.saveAs = blob => { window.exportedBlob = blob; };
        await exportProj();
        const zip = await JSZip.loadAsync(await window.exportedBlob.arrayBuffer());
        const file = suffix => zip.file(Object.keys(zip.files).find(name => name.endsWith(suffix)));
        const workbook = await JSZip.loadAsync(await file('.xlsx').async('uint8array'));
        const xml = await workbook.file('xl/worksheets/sheet2.xml').async('string');
        const sheet = new DOMParser().parseFromString(xml, 'application/xml');
        const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        const cell = ref => [...sheet.getElementsByTagNameNS(ns, 'c')].find(c => c.getAttribute('r') === ref).textContent;
        return {
            offset: await file('s02_offset.pro').async('string'),
            labels: await file('Labels.jsn').async('string'),
            alarm: await file('UserDefineWarning.jsn').async('string'),
            excelLabel: cell('F83'), excelDescription: cell('G83'),
            excelFilename: Object.keys(zip.files).find(name => name.endsWith('.xlsx')).split('/').pop(),
            expectedExcelFilename: `InoRobot_IO_Map_${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}.xlsx`,
            mergedRanges: [...sheet.getElementsByTagNameNS(ns, 'mergeCell')].map(c => c.getAttribute('ref')),
            xmlValid: sheet.getElementsByTagName('parsererror').length === 0
        };
    });
    expect(result.offset).toContain('X_count = 4;');
    expect(result.offset).toContain('pitch_Y = -12.5;');
    expect(result.offset.match(/Set_tray_offset\(\);/g)).toHaveLength(2);
    expect(result.labels).toContain('xwTray_index');
    expect(result.alarm).toContain('ERR : Tray Count Error!');
    expect(result.excelLabel).toBe('xwTray_index');
    expect(result.excelDescription).toBe('Tray cell index (1-based)');
    expect(result.mergedRanges).toContain('F83:F98');
    expect(result.mergedRanges).toContain('G83:G98');
    expect(result.excelFilename).toBe(result.expectedExcelFilename);
    expect(result.xmlValid).toBe(true);
    await page.evaluate(() => { state.steps.forEach(step => step.WorkType = 'Stage'); renderSteps(); });
    const unchanged = await page.evaluate(async () => {
        const bytes = await buildIOMapExcel();
        const zip = await JSZip.loadAsync(bytes);
        const original = await JSZip.loadAsync(Assets.IO_Map_Excel, { base64: true });
        for (const name of Object.keys(original.files)) {
            if (original.files[name].dir) continue;
            if (await original.file(name).async('base64') !== await zip.file(name).async('base64')) return false;
        }
        return true;
    });
    expect(unchanged).toBe(true);
});
