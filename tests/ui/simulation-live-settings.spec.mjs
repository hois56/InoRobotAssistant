import { test, expect } from '@playwright/test';
import { createConveyorFixture } from './helpers/equipment-fixtures.mjs';

test.beforeEach(async ({ page }) => {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace('init();\n', 'window.__settingsReady = init();\n');
        await route.fulfill({ response, body: source + `
            window.__conveyor = { state, equipmentApp, visionApp, conveyorTrackingApp, createPrimitiveShapeRoot,
                ensureWorkspaceModelId, updateUIStatus, openIoFunctionMappingDialog, updateIoFunctionMapping,
                deleteIoFunctionMapping, getConveyorMotionDefinition, restoreVirtualControllerConnections,
                deleteVirtualControllerSession, refreshVirtualControllerUi, writeOlpAddress, updateConveyorSimulation,
                renderModelTree, popOutPanel, togglePanelVisibility };` });
    });
    await page.goto('/2_3DSimulation/');
    await page.waitForFunction(() => window.__conveyor);
    await page.evaluate(() => window.__settingsReady);
});

test('IO-driven motion is visible without reopening or rebuilding the settings lists', async ({ page }) => {
    await prepare(page);
    await addBelt(page);
    const status = page.locator('#conveyor-tracking-dialog [data-test-status]');
    await page.evaluate(async () => {
        const api = window.__conveyor;
        const panel = document.getElementById('conveyor-tracking-dialog');
        window.__choiceChanges = 0;
        const watcher = new MutationObserver(changes => { window.__choiceChanges += changes.length; });
        for (const name of ['belt', 'controller', 'feedSource']) {
            watcher.observe(panel.querySelector(`[name="${name}"]`), { childList: true, subtree: true });
        }
        for (let frame = 0; frame < 20; frame++) {
            api.refreshVirtualControllerUi();
            await Promise.resolve(); // Let each scheduled panel refresh finish.
        }
        api.writeOlpAddress('Out[512]', 1);
    });
    await expect(status).toContainText('운전 중');
    await expect(status).toContainText('100 mm/s');
    await page.evaluate(() => window.__conveyor.writeOlpAddress('Out[512]', 0));
    await expect(status).toHaveText('정지');
    expect(await page.evaluate(() => window.__choiceChanges)).toBe(0);
});

async function prepare(page) {
    await page.evaluate(() => {
        const api = window.__conveyor;
        api.restoreVirtualControllerConnections({ controllers: ['127.21.0.1', '127.21.0.2'].map(ipAddress => ({ ipAddress })) });
        api.togglePanelVisibility('conveyor-tracking-dialog');
        api.openIoFunctionMappingDialog();
    });
}

async function addBelt(page) {
    await createConveyorFixture(page);
    await page.locator('#io-function-mapping-address').fill('');
    await page.locator('#io-function-mapping-address').fill('512');
    await page.locator('#io-function-mapping-conveyor-speed').fill('');
    await page.locator('#io-function-mapping-conveyor-speed').fill('100');
    await page.locator('#io-function-mapping-add').dispatchEvent('click');
    await expect(page.locator('.io-function-mapping-row .conveyor-mapping-settings')).toHaveCount(1);
}

for (const detached of [false, true]) {
    test('updates conveyor choices and preserves edits while ' + (detached ? 'detached' : 'docked'), async ({ page }) => {
        await prepare(page);
        let panelPage = page;
        if (detached) {
            const opened = page.waitForEvent('popup');
            await page.evaluate(() => window.__conveyor.popOutPanel('conveyor-tracking-dialog'));
            panelPage = await opened;
        }
        const panel = panelPage.locator('#conveyor-tracking-dialog');
        const field = name => panel.locator(`[name="${name}"]`);
        await addBelt(page);
        await expect(field('belt').locator('option')).toHaveCount(1);
        await expect(field('feedSource').locator('option')).not.toHaveCount(0);
        await field('controller').selectOption('1');
        await field('feedGap').fill('');
        await field('feedGap').fill('731');
        await field('feedGap').focus();
        await page.evaluate(() => {
            const api = window.__conveyor;
            const mapping = api.state.ioFunctionMappings.find(item => item.action === 'CONVEYOR');
            api.updateIoFunctionMapping(mapping.id, 'conveyorSpeed', 245);
            api.deleteVirtualControllerSession(api.state.virtualControllers[0]);
        });
        await expect(field('testSpeed')).toHaveValue('245');
        await expect(field('controller').locator('option:checked')).toHaveText('127.21.0.2');
        await expect(field('controller').locator('option')).toHaveCount(1);
        await expect(field('feedGap')).toHaveValue('731');
        expect(await field('feedGap').evaluate(input => input.ownerDocument.activeElement === input)).toBe(true);
        await page.evaluate(() => {
            const api = window.__conveyor;
            api.state.virtualControllers[0].ipAddress = '127.21.0.72';
            api.refreshVirtualControllerUi();
        });
        await expect(field('controller').locator('option:checked')).toHaveText('127.21.0.72');
        await page.evaluate(() => {
            const api = window.__conveyor;
            api.deleteIoFunctionMapping(api.state.ioFunctionMappings.find(item => item.action === 'CONVEYOR').id);
        });
        await expect(field('belt').locator('option')).toHaveCount(0);
    });
}

test('an open motion editor follows IO edits and retains an unfinished name', async ({ page }) => {
    await prepare(page);
    await addBelt(page);
    await page.evaluate(() => {
        const api = window.__conveyor;
        const belt = `equipment-model:${api.ensureWorkspaceModelId(api.state.models[0])}/-1`;
        api.equipmentApp.ui.open(belt, api.getConveyorMotionDefinition(belt));
    });
    const editor = page.locator('#equipment-dialog');
    const name = editor.locator('[name=name]');
    await name.fill('작성 중');
    await page.evaluate(() => {
        const api = window.__conveyor;
        const mapping = api.state.ioFunctionMappings.find(item => item.action === 'CONVEYOR');
        api.updateIoFunctionMapping(mapping.id, 'conveyorSpeed', 321);
        api.updateIoFunctionMapping(mapping.id, 'address', 516);
    });
    await expect(editor.locator('[name=speed]')).toHaveValue('321');
    await expect(editor.locator('[name=forwardAddress]')).toHaveValue('516');
    await expect(name).toHaveValue('작성 중');
});

test('vision and IO target lists reflect scene edits without losing the active IO row', async ({ page }) => {
    await prepare(page);
    await addBelt(page);
    await page.evaluate(() => {
        const api = window.__conveyor;
        api.togglePanelVisibility('vision-panel');
        const config = api.visionApp.serialize();
        config.enabled = true;
        api.visionApp.restore(config);
    });
    const editor = page.locator('#io-function-mapping-list [data-io-function-mapping-field=address]').first();
    await editor.fill('');
    await editor.fill('519');
    await editor.evaluate(node => { window.__editedIo = node; node.focus(); });
    const id = await page.evaluate(() => {
        const api = window.__conveyor;
        const model = api.createPrimitiveShapeRoot('box', { x: 15, y: 15, z: 15 }, { name: '추가 부품' });
        api.state.scene.add(model);
        api.state.models.push(model);
        api.updateUIStatus();
        return api.ensureWorkspaceModelId(model);
    });
    await expect(page.locator(`[data-vision-targets] option[value="${id}"]`)).toHaveCount(1);
    await expect(page.locator(`#io-function-mapping-grip-target option[value="conveyor:${id}"]`)).toHaveCount(1);
    await expect(editor).toHaveValue('519');
    expect(await editor.evaluate(node => node === window.__editedIo && node.ownerDocument.activeElement === node)).toBe(true);
});
