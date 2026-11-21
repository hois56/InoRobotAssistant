import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function sourceProject(page, { metadata = false, conflict = false } = {}) {
    return page.evaluate(async ({ metadata, conflict }) => {
        state.steps = [1, 2, 3].map(n => new ProcessStep(n));
        state.steps[1].WorkType = state.steps[2].WorkType = 'Stage';
        state.steps[1].WorkMethod = 'Put';
        state.options.EnableToolControl = true; state.options.EnableMultiRecipe = true; state.options.RecipeCount = 2;
        document.getElementById('prjName').value = 'EditDemo'; renderSteps();
        window.saveAs = blob => { window.exportedBlob = blob; }; await exportProj();
        const zip = await JSZip.loadAsync(await window.exportedBlob.arrayBuffer());
        if (!metadata) zip.remove('EditDemo/.inorobot-generator.json');
        const program = zip.file('EditDemo/sP01_Tray_Get.pro');
        let code = (await program.async('string')).replace('V[100]', 'V[42]') + '\r\n# Custom field recovery\r\n';
        if (conflict) code = code.replace('s04_Tool_Control.Tool_Vac_ON();', 's04_Tool_Control.Tool_Grip();');
        zip.file(program.name, code);
        const pointFile = zip.file('EditDemo/Data/P.pts');
        zip.file(pointFile.name, (await pointFile.async('string')).replace('P[111] = 0.000000', 'P[111] = 123.456789'));
        zip.file('EditDemo/extra.bin', new Uint8Array([0, 255, 30]));
        return Array.from(await zip.generateAsync({ type: 'uint8array' }));
    }, { metadata, conflict });
}
async function upload(page, bytes) {
    await expect(page.locator('header #btnImportProject')).toBeVisible();
    await page.locator('#btnImportProject').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#btnImportZip').click();
    await (await chooser).setFiles({ name: 'EditDemo.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
    await expect(page.locator('#projectEditMessage')).toContainText('EditDemo');
    await expect(page.locator('#stepsList > div')).toHaveCount(3);
    expect(await page.evaluate(() => Boolean(window.ProjectEditUI.session))).toBe(true);
}

test('live source preview keeps robot syntax colors after file changes and edits without a highlighting CDN', async ({ page }) => {
    await page.route(/https:\/\/[^/]+\/.*prism/i, route => route.abort());
    await page.goto('/4_ProjectGenerator/');
    const output = page.locator('#codeOutput');
    const preview = page.locator('#prismContainer');
    const editor = page.locator('#codeEditor');
    const edit = page.locator('#btnToggleEdit');
    const check = edit.locator('.edit-mode-check');
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await expect(check).toBeHidden();
    await page.locator('#fileSelector').selectOption('main.pro');
    await expect(output.locator('.token.comment').first()).toBeVisible();
    await expect(output.locator('.token.keyword').filter({ hasText: /^If$/ }).first()).toBeVisible();

    await page.locator('#fileSelector').selectOption('s01_initial.pro');
    await edit.click();
    await expect(edit).toHaveAttribute('aria-pressed', 'true');
    await expect(check).toBeVisible();
    await expect(page.locator('.generator-preview')).toHaveCSS('border-top-color', 'rgb(8, 104, 158)');
    await expect(preview).toHaveCSS('opacity', '1');
    await expect(editor).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const sample = 'If V[7] > 0\n    Print "#1 <ready>"; # 작업 시작\n    Init_signal();\nEndIf;';
    await editor.fill(sample);
    await expect(editor).toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)');
    await expect(output.locator('.token.comment')).toHaveText('# 작업 시작');
    await expect(output.locator('.token.string')).toHaveText('"#1 <ready>"');
    const tokenColors = () => output.evaluate(code => Object.fromEntries(
        ['comment', 'keyword', 'string', 'number', 'function'].map(kind =>
            [kind, getComputedStyle(code.querySelector('.token.' + kind)).color])
    ));
    const colors = await tokenColors();
    expect(new Set(Object.values(colors)).size).toBe(5);
    const [r, g, b] = colors.comment.match(/\d+/g).map(Number);
    expect(g).toBeGreaterThan(Math.max(r, b) * 1.5);

    await editor.fill((sample + '\n\t# ' + '길이가 긴 줄 '.repeat(40) + '\n').repeat(30));
    const scrollTop = await editor.evaluate(input => {
        input.scrollTop = input.scrollHeight;
        return input.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);
    await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBe(scrollTop);

    await editor.fill(sample);
    await edit.click();
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await expect(check).toBeHidden();
    expect(await output.textContent()).toBe(sample);
    expect(await tokenColors()).toEqual(colors);
});

test('ZIP import, add, review, full modified ZIP export and reimport preserve field edits and attachments', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await upload(page, await sourceProject(page));
    await page.locator('#fileSelector').selectOption('sP01_Tray_Get.pro');
    await expect(page.locator('#codeOutput')).toContainText('V[42]');
    await expect(page.locator('#codeOutput .token.comment').filter({ hasText: '# Custom field recovery' })).toHaveCount(1);
    await page.locator('#btnToggleEdit').click();
    const editor = page.locator('#codeEditor');
    await editor.fill((await editor.inputValue()) + '\n# Edit while highlighted');
    await expect(page.locator('#prismContainer')).toHaveCSS('opacity', '1');
    await expect(page.locator('#codeOutput .token.comment').filter({ hasText: '# Edit while highlighted' })).toHaveCount(1);
    await page.locator('#btnToggleEdit').click();
    await page.locator('#btnAdd').click();
    await expect(page.locator('#stepsList > div')).toHaveCount(4);
    await page.locator('#btnGenerate').click();
    await expect(page.locator('#projectReviewDialog')).toBeVisible();
    await expect(page.locator('.project-review-pane')).toHaveCount(2);
    await expect(page.locator('#projectReviewResult')).toHaveCount(0);
    await expect(page.locator('#projectReviewGenerated .project-diff-added')).not.toHaveCount(0);
    await expect(page.locator('#projectReviewGenerated')).toContainText('sP04_Tray_Get.pro');
    await page.locator('#projectReviewFiles button').filter({ hasText: 'Data/P.pts' }).click();
    await expect(page.locator('#projectReviewGenerated')).toContainText('123.456789');
    await expect(page.locator('#projectReviewGenerated .project-diff-added').filter({ hasText: 'P[411]' })).toHaveCount(1);
    await expect.poll(() => page.locator('#projectReviewGenerated').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('#projectDownload')).toBeEnabled();
    await page.locator('#projectReviewDialog').screenshot({ path: test.info().outputPath('modified-project-review.png') });
    await page.locator('#projectDownload').click();
    await expect(page.locator('#projectReviewDialog')).not.toBeVisible();
    const output = await page.evaluate(async () => {
        const zip = await JSZip.loadAsync(await window.exportedBlob.arrayBuffer());
        return {
            program: await zip.file('EditDemo/sP01_Tray_Get.pro').async('string'),
            points: await zip.file('EditDemo/Data/P.pts').async('string'),
            extra: Array.from(await zip.file('EditDemo/extra.bin').async('uint8array')),
            main: await zip.file('EditDemo/main.pro').async('string'),
            bytes: Array.from(await window.exportedBlob.arrayBuffer().then(b => new Uint8Array(b)))
        };
    });
    expect(output.program).toContain('V[42]'); expect(output.program).toContain('# Custom field recovery');
    expect(output.program).toContain('# Edit while highlighted');
    expect(output.points).toContain('P[111] = 123.456789'); expect(output.points).toContain('P[411]');
    expect(output.extra).toEqual([0, 255, 30]); expect(output.main).toContain('sP04_Tray_Get.P4_pos');
    await page.locator('#projectZipInput').setInputFiles({ name: 'modified.zip', mimeType: 'application/zip', buffer: Buffer.from(output.bytes) });
    await expect(page.locator('#stepsList > div')).toHaveCount(4);
    expect(errors).toEqual([]);
});

test('conflicting process change blocks download until a reviewed resolution is chosen', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    await upload(page, await sourceProject(page, { metadata: true, conflict: true }));
    await page.clock.install({ time: new Date('2026-11-14T12:00:00Z') });
    const row = page.locator('#stepsList > div').first();
    await row.locator('select').nth(0).selectOption('Stage');
    await row.locator('select').nth(1).selectOption('Put');
    await page.locator('#btnGenerate').click();
    await expect(page.locator('#projectDownload')).toBeDisabled();
    await page.locator('#projectReviewFiles button').filter({ hasText: '⚠' }).filter({ hasText: 'sP01_Stage_Put.pro' }).click();
    await expect(page.locator('#projectReviewBefore')).toContainText('Tool_Grip');
    await expect(page.locator('#projectUseNew')).toBeVisible();
    await page.locator('#projectUseNew').click();
    await expect(page.locator('#projectDownload')).toBeDisabled();
    await page.clock.fastForward(2000);
    await page.locator('#projectReviewFiles button').filter({ hasText: '.xlsx' }).click();
    await page.locator('#projectUseNew').click();
    await expect(page.locator('#projectDownload')).toBeEnabled();
    await page.locator('#projectDownload').click();
    await expect(page.locator('#projectReviewDialog')).not.toBeVisible();
    const result = await page.evaluate(async () => {
        const zip = await JSZip.loadAsync(await window.exportedBlob.arrayBuffer());
        return { old: Boolean(zip.file('EditDemo/sP01_Tray_Get.pro')), code: await zip.file('EditDemo/sP01_Stage_Put.pro').async('string') };
    });
    expect(result.old).toBe(false); expect(result.code).toContain('Stage3_Vac_ON');
});

test('imported project options update programs and registration through the existing option dialog', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    await upload(page, await sourceProject(page, { metadata: true }));
    await page.locator('#btnOption').click();
    await page.locator('#chkTcpSpeed').check();
    await page.locator('#chkTorque').check();
    await page.locator('#chkTeachingMode').uncheck();
    await page.locator('#chkWaitPos').uncheck();
    await page.locator('#chkProcessBusy').uncheck();
    await page.locator('#btnApplyOptions').click();
    await page.locator('#btnGenerate').click();
    await expect(page.locator('#projectDownload')).toBeEnabled();
    await page.locator('#projectDownload').click();
    await expect(page.locator('#projectReviewDialog')).not.toBeVisible();
    const result = await page.evaluate(async () => {
        const zip = await JSZip.loadAsync(await window.exportedBlob.arrayBuffer());
        return {
            tcp: Boolean(zip.file('EditDemo/PLC_TCP_Speed.pro')),
            teach: Boolean(zip.file('EditDemo/s03_teach_mode.pro')),
            main: await zip.file('EditDemo/main.pro').async('string'),
            prj: JSON.parse(await zip.file('EditDemo/EditDemo.prj').async('string')),
            internal: await zip.file('EditDemo/PLC_internal.pro').async('string')
        };
    });
    expect(result.tcp).toBe(true); expect(result.teach).toBe(false);
    expect(result.main).not.toContain('xwProcess_wait_pos'); expect(result.main).not.toContain('ywProcess_work_busy');
    expect(result.prj.ProgramFiles).toContain('PLC_TCP_Speed.pro'); expect(result.internal).toContain('D_J1_cur_torque');
});

test('folder import supports rename, sparse process numbering and failed import keeps the open project', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    const bytes = await sourceProject(page, { metadata: true });
    const entries = await page.evaluate(async bytes => {
        const zip = await JSZip.loadAsync(new Uint8Array(bytes));
        return Promise.all(Object.values(zip.files).filter(f => !f.dir).map(async f => [f.name, Array.from(await f.async('uint8array'))]));
    }, bytes);
    const folder = test.info().outputPath('folder-project');
    for (const [name, bytes] of entries) {
        const target = path.join(folder, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(bytes));
    }
    await page.locator('#btnImportProject').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#btnImportFolder').click();
    await (await chooser).setFiles(folder);
    await expect(page.locator('#projectEditMessage')).toContainText('EditDemo');
    await expect(page.locator('#stepsList > div')).toHaveCount(3);
    await page.locator('#stepsList > div').nth(1).getByRole('button', { name: 'X', exact: true }).click();
    await expect(page.locator('#stepsList > div').last()).toContainText('sP03_Stage_Get');
    await page.locator('#stepsList > div').first().locator('button').first().click();
    await page.locator('#editNameInput').fill('Pickup'); await page.locator('#btnApplyName').click();
    await page.locator('#fileSelector').selectOption('Pickup.pro');
    await expect(page.locator('#codeOutput')).toContainText('# Custom field recovery');
    await page.locator('#projectZipInput').setInputFiles({ name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
    await expect(page.locator('#projectEditMessage')).toHaveClass(/edit-error/);
    await expect(page.locator('#prjName')).toHaveValue('EditDemo');
    await expect(page.locator('#stepsList > div')).toHaveCount(2);
});

test('the new pane supports manual conflict edits and the downloaded result matches the diff', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    await upload(page, await sourceProject(page, { metadata: true, conflict: true }));
    await page.locator('#stepsList > div').first().locator('select').nth(1).selectOption('Put');
    await page.locator('#btnGenerate').click();
    await page.locator('#projectReviewFiles button').filter({ hasText: '⚠' }).filter({ hasText: 'sP01_Tray_Put.pro' }).click();
    await expect(page.locator('#projectReviewBefore .project-diff-removed')).not.toHaveCount(0);
    await page.locator('#projectEditGenerated').click();
    await expect(page.locator('#projectReviewGenerated')).not.toBeVisible();
    const editor = page.locator('#projectReviewEdit');
    await editor.fill((await editor.inputValue()).replace('V[100]', 'V[37]') + '\n# Reviewed custom edit\n');
    await page.locator('#projectUseEdited').click();
    await expect(page.locator('#projectReviewGenerated')).toContainText('V[37]');
    await expect(page.locator('#projectReviewGenerated')).toContainText('# Reviewed custom edit');
    await expect(page.locator('.project-review-pane')).toHaveCount(2);
    await expect(page.locator('#projectDownload')).toBeEnabled();
    await page.locator('#projectDownload').click();
    await expect(page.locator('#projectReviewDialog')).not.toBeVisible();
    const code = await page.evaluate(async () => {
        const zip = await JSZip.loadAsync(await window.exportedBlob.arrayBuffer());
        return zip.file('EditDemo/sP01_Tray_Put.pro').async('string');
    });
    expect(code).toContain('V[37]'); expect(code).toContain('# Reviewed custom edit');
});

test('header import menu is keyboard accessible and initial screen has no mode toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/4_ProjectGenerator/');
    await expect(page.locator('#btnImportProject')).toBeVisible();
    await expect(page.locator('#projectEditStatus')).not.toBeVisible();
    await expect(page.locator('.project-edit-toolbar')).toHaveCount(0);
    await page.locator('#btnImportProject').focus(); await page.keyboard.press('ArrowDown');
    await expect(page.locator('#btnImportZip')).toBeFocused();
    await page.keyboard.press('ArrowDown'); await expect(page.locator('#btnImportFolder')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.locator('#projectImportMenu')).not.toBeVisible();
    await expect(page.locator('#btnImportProject')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
