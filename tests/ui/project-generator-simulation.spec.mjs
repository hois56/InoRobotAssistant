import { test, expect } from '@playwright/test';

test('Simulation downloads a separate PLC-free project and leaves the controller export unchanged', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/4_ProjectGenerator/index.html');
    const project = 'ProjectName12345';
    await page.locator('#prjName').fill(project);
    await page.locator('#btnAdd').click();
    await page.locator('#stepsList > div').nth(1).locator('select').first().selectOption('Stage');
    await page.locator('#stepsList > div').nth(1).locator('select').nth(1).selectOption('Put');
    const controllerBefore = await page.evaluate(() => getFinalFileContent('main.pro'));

    await page.locator('#btnSimulation').click();
    const modal = page.locator('#simulationModal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#simCycles')).toHaveValue('3');
    await expect(page.locator('#simToolTime')).toHaveValue('0.2');
    await expect(page.locator('#simVisionTime')).toHaveValue('0.3');
    await expect(page.locator('#simTrayCell')).toBeEnabled();
    await expect(page.locator('#simPeelSpeed')).toBeDisabled();
    await modal.screenshot({ path: test.info().outputPath('simulation-modal.png') });

    // An unknown process number is reported and nothing is downloaded.
    await page.evaluate(() => {
        window.saveAs = (blob, name) => { window.exportedBlob = blob; window.exportedName = name; };
    });
    await page.locator('#simSequence').fill('1, 7');
    let alertText = '';
    page.once('dialog', async dialog => { alertText = dialog.message(); await dialog.dismiss(); });
    await page.locator('#btnExportSimulation').click();
    // The message is shown in the page language (Korean by default).
    await expect.poll(() => alertText).toContain('목록에 있는 공정 번호');
    await expect(modal).toBeVisible();
    expect(await page.evaluate(() => Boolean(window.exportedBlob))).toBe(false);

    await page.locator('#simSequence').fill('2W 1 2');
    await page.locator('#simCycles').fill('2');
    await page.locator('#simSpeedRate').fill('80');
    await page.locator('#simTrayCell').fill('9');
    await page.locator('#btnExportSimulation').click();
    await expect(modal).toBeHidden();
    const result = await page.evaluate(async () => {
        const zip = await JSZip.loadAsync(await window.exportedBlob.arrayBuffer());
        const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
        const read = suffix => zip.file(names.find(name => name.endsWith(suffix))).async('string');
        return {
            downloadName: window.exportedName,
            names,
            main: await read('/main.pro'),
            offset: await read('/s02_offset.pro'),
            prj: JSON.parse(await read('.prj')),
            points: await read('/Data/P.pts'),
            controllerAfter: getFinalFileContent('main.pro')
        };
    });
    expect(result.downloadName).toBe(`${project}.zip`);
    expect(result.names.sort()).toEqual([
        `${project}.prj`, 'Data/BreakPoints.jsn', 'Data/JP.pts', 'Data/Labels.jsn', 'Data/MonitorGlobalVars.jsn', 'Data/MonitorVars.jsn',
        'Data/P.pts', 'Data/UserDefineWarning.jsn', 'main.pro', 's01_initial.pro', 's02_offset.pro',
        'sP01_Tray_Get.pro', 'sP02_Stage_Put.pro'
    ].map(name => `${project}/${name}`).sort());
    expect(result.prj.MultiTaskCount).toBe(0);
    expect(result.main).toContain('Velset Rate[80];');
    expect(result.main).toContain('For cycle=1,cycle<=2,Step[1]');
    expect([...result.main.matchAll(/\.P(\d)_pos\((\d)\)/g)].map(match => match.slice(1).join(':'))).toEqual(['2:1', '1:0', '2:0']);
    expect(result.main).not.toMatch(/xwProcess|Goto L\[0\]/);
    expect(result.main).toMatch(/\r\n/);
    expect(result.offset).toContain('Int num = 8; # Simulation tray cell 9');
    expect(result.points).toContain('Name = P2_Pre_work');
    const withoutTime = text => text.replace(/Time = "[^"]*"/, 'Time = ""');
    expect(withoutTime(result.controllerAfter)).toBe(withoutTime(controllerBefore));

    // The dialog keeps the last values for the next export.
    await page.locator('#btnSimulation').click();
    await expect(page.locator('#simSequence')).toHaveValue('2W 1 2');
    await page.locator('#btnCancelSimulation').click();
    await expect(modal).toBeHidden();
    expect(errors).toEqual([]);
});
