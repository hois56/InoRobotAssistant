import { test, expect } from '@playwright/test';

async function exportFiles(page) {
    return page.evaluate(async () => {
        window.saveAs = blob => { window.exportedBlob = blob; };
        await exportProj();
        const zip = await JSZip.loadAsync(await window.exportedBlob.arrayBuffer());
        const read = async suffix => {
            const name = Object.keys(zip.files).find(name => name.endsWith(suffix));
            return zip.file(name).async('string');
        };
        return {
            process: await read(`${state.steps[0].ProcessName}.pro`),
            offset: await read('s02_offset.pro'),
            labels: await read('Labels.jsn')
        };
    });
}

for (const [type, method] of [['Tray', 'Get'], ['Stage', 'Put']]) {
    test(`${type} ${method} opens Socket settings and exports the saved endpoint and offsets`, async ({ page }) => {
        await page.goto('/4_ProjectGenerator/index.html');
        const selects = page.locator('#stepsList > div').first().locator('select');
        await selects.nth(0).selectOption(type);
        await selects.nth(1).selectOption(method);
        await selects.nth(3).selectOption('Use - Socket');
        await expect(page.locator('#visionModal')).toBeVisible();
        await page.locator('#visionIp').fill('192.168.10.26');
        await page.locator('#visionPort').fill('5014');
        await page.locator('#btnApplyVision').click();
        await expect(page.locator('#visionModal')).toBeHidden();
        const files = await exportFiles(page);
        expect(files.process).toContain('String server_IP = "192.168.10.26";');
        expect(files.process).toContain('Int server_port = 5014;');
        expect(files.process).toContain('Send_data("Shot");');
        expect(files.offset).toContain('LPR[B_PR] = PR[0];');
        expect(files.offset).toContain('PR[B_PR] = (xwOffset_1_X.Int/10000,xwOffset_1_Y.Int/10000,xwOffset_1_Z.Int/10000,xwOffset_1_A.Int/10000,0,0);\r\n            PR[B_PR] = PR[B_PR] + LPR[B_PR];');
        if (type === 'Tray') expect(files.offset).toContain('PR[B_PR] = PR[B_PR] + LPR[B_PR];\r\n            Set_tray_offset();\r\n            Break;');
        expect(files.offset).not.toContain('xwVision_offset');
        await selects.nth(3).selectOption('Use - IO');
        await selects.nth(3).selectOption('Use - Socket');
        await expect(page.locator('#visionIp')).toHaveValue('192.168.10.26');
        await expect(page.locator('#visionPort')).toHaveValue('5014');
    });
}

test('Vision Calibration exports Socket helpers instead of IO vision offsets and switches back to PLC', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/index.html');
    const selects = page.locator('#stepsList > div').first().locator('select');
    await selects.nth(0).selectOption('Vision');
    await selects.nth(1).selectOption('Calibration');
    await selects.nth(2).selectOption('Vision (Socket)');
    await expect(page.locator('#visionModal')).toBeVisible();
    await expect(selects.nth(3)).toBeDisabled();
    await page.locator('#visionIp').fill('192.168.10.27');
    await page.locator('#visionPort').fill('5015');
    await page.locator('#btnApplyVision').click();
    const files = await exportFiles(page);
    expect(files.process).toContain('Func Connect_socket()');
    expect(files.process).toContain('String server_IP = "192.168.10.27";');
    expect(files.process).toContain('Int server_port = 5015;');
    expect(files.process).toContain('Func Send_data(String send_data)');
    expect(files.process).toContain('Func String Receive_data()');
    expect(files.process).toContain('    Connect_socket();\r\n    Send_data("Shot");\r\n    Str[0] = Receive_data();\r\n    LB[0] = StrGetData(Str[0],",",LD[0]);\r\n    PR[0] = (LD[0],LD[1],0,LD[2],0,0);\r\n    s02_offset.Set_PR();');
    expect(files.offset).toContain('LPR[B_PR] = PR[0];');
    expect(files.offset).toContain('xwOffset_1_X.Int/10000');
    expect(files.offset).toContain('PR[B_PR] = PR[B_PR] + LPR[B_PR];');
    expect(files.offset).not.toContain('xwVision_offset');
    expect(files.labels).not.toContain('xwVision_offset');
    await selects.nth(2).selectOption('PLC (IO)');
    const io = await exportFiles(page);
    expect(io.process).not.toContain('Func Connect_socket()');
    expect(io.offset).toContain('xwVision_offset_X');
    expect(io.labels).toContain('xwVision_offset_X');
});

test('Vision Check still opens Socket settings and keeps the configured server mode', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/index.html');
    const selects = page.locator('#stepsList > div').first().locator('select');
    await selects.nth(0).selectOption('Vision');
    await selects.nth(1).selectOption('Check');
    await selects.nth(3).selectOption('Use - Socket');
    await expect(page.locator('#visionModal')).toBeVisible();
    await page.locator('#visionIsClient').selectOption('false');
    await expect(page.locator('#visionIpContainer')).toBeHidden();
    await page.locator('#btnApplyVision').click();
    const files = await exportFiles(page);
    expect(files.process).toContain('GetPortState(2)');
    expect(files.process).toContain('Send_data("Shot");');
    expect(files.process).not.toContain('Open Socket(');
});
