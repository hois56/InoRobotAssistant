import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__run = { state, equipmentApp, conveyorTrackingApp, conveyorFeedApp, activeConveyorMappings, createPrimitiveShapeRoot, ensureWorkspaceModelId, updateUIStatus, step(seconds) { conveyorLastTimestamp = performance.now(); updateConveyorSimulation(conveyorLastTimestamp + seconds * 1000); conveyorLastTimestamp = performance.now(); } };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__run?.state.workspaceRecovery.ready);
    await page.evaluate(() => {
        const a = window.__run;
        for (const [name, size, xyz] of [['Run belt', { x:8000, y:160, z:30 }, [0,0,0]], ['Workpiece', { x:40, y:40, z:40 }, [-300,0,30]]]) {
            const model = a.createPrimitiveShapeRoot('box', size, { name });
            model.position.fromArray(xyz); a.state.scene.add(model); a.state.models.push(model);
        }
        a.equipmentApp.save({ id:'run-object', type:'OBJECT', movingRef:'equipment-model:'+a.ensureWorkspaceModelId(a.state.models[1])+'/-1' });
        const belt = 'conveyor:'+a.ensureWorkspaceModelId(a.state.models[0]);
        a.state.ioFunctionMappings = [{ id:'run-belt', action:'CONVEYOR', gripObjectRef:belt, conveyorAxis:'X', conveyorSpeed:100, conveyorManualOnly:true, enabled:false }];
        a.conveyorFeedApp.configure({ belt, sourceRef:a.equipmentApp.objects()[0].ref, gap:100 });
        a.updateUIStatus();
        // Exercise the simulation timer independently of foreground painting.
        window.requestAnimationFrame = () => 0;
        a.state.renderFramePending = false;
    });
    await page.locator('#btn-conveyor-tracking').click();
    return { panel:page.locator('#conveyor-tracking-dialog'), errors };
}

const position = page => page.evaluate(() => window.__run.state.models[1].position.x);

async function expectMoving(page) {
    const before = await position(page);
    await expect.poll(() => position(page), { timeout:1800 }).toBeGreaterThan(before+10);
    expect(await page.evaluate(() => window.__run.conveyorTrackingApp.testing)).toBe(true);
}

async function expectStopped(page) {
    await expect.poll(() => page.evaluate(() => window.__run.conveyorTrackingApp.testing)).toBe(false);
    const before = await position(page);
    await page.waitForTimeout(180);
    expect(await position(page)).toBeCloseTo(before, 6);
}

test('continuous run survives focus and visibility changes until Stop', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await panel.locator('[data-action="run"]').click();
    await expectMoving(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expectMoving(page);
    const feedBefore = await page.evaluate(() => window.__run.conveyorFeedApp.serialize()[0].progress);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable:true, get:() => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await expectMoving(page);
    const throttledDistance = await page.evaluate(() => {
        const a = window.__run, before = a.state.models[1].position.x;
        a.step(1);
        return a.state.models[1].position.x-before;
    });
    expect(throttledDistance).toBeCloseTo(100, 5);
    const progress = await page.evaluate(() => window.__run.conveyorFeedApp.serialize()[0].progress);
    expect(progress).not.toBe(feedBefore);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await panel.locator('[data-action="stop"]').click();
    await expectStopped(page);
    expect(errors).toEqual([]);
});

for (const action of ['toolbar', 'header']) test(`continuous run survives ${action} hide and reopening`, async ({ page }) => {
    const { panel, errors } = await setup(page);
    await panel.locator('[data-action="run"]').click();
    await expectMoving(page);
    if (action === 'toolbar') await page.locator('#btn-conveyor-tracking').click();
    else await panel.locator('[data-panel-action="hide"]').click();
    await expect(panel).toBeHidden();
    await expectMoving(page);
    await page.locator('#btn-conveyor-tracking').click();
    await expect(panel).toBeVisible();
    await expectMoving(page);
    await expect(panel.locator('[data-test-status]')).toContainText('운전 중');
    await panel.locator('[data-action="stop"]').click();
    await expectStopped(page);
    expect(errors).toEqual([]);
});

for (const detached of [false, true]) test(`continuous run started ${detached ? 'in a detached window' : 'inline'} survives closing the conveyor window`, async ({ page }) => {
    const { panel, errors } = await setup(page);
    if (!detached) await panel.locator('[data-action="run"]').click();
    const popupReady = page.waitForEvent('popup');
    await panel.locator('[data-panel-action="popout"]').click();
    const popup = await popupReady;
    await expect(popup.locator('#conveyor-tracking-dialog')).toBeVisible();
    if (detached) await popup.locator('[data-action="run"]').click();
    await expectMoving(page);
    await popup.close({ runBeforeUnload:true });
    await expect(panel).toBeAttached();
    await expect(panel).toBeHidden();
    await expectMoving(page);
    await page.locator('#btn-conveyor-tracking').click();
    await expect(panel).toBeVisible();
    await expectMoving(page);
    await panel.locator('[data-action="stop"]').click();
    await expectStopped(page);
    expect(errors).toEqual([]);
});

test('JOG still stops on release, focus loss, hiding and tab visibility loss', async ({ page }) => {
    const { panel, errors } = await setup(page);
    const jog = panel.locator('[data-action="jog"]');
    for (const action of ['release', 'blur', 'hide', 'visibility']) {
        await jog.hover(); await page.mouse.down();
        await expectMoving(page);
        if (action === 'release') await page.mouse.up();
        if (action === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        if (action === 'hide') await page.evaluate(() => document.querySelector('#conveyor-tracking-dialog [data-panel-action="hide"]').click());
        if (action === 'visibility') await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable:true, get:() => true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await expectStopped(page);
        await page.mouse.up();
        if (action === 'hide') await page.locator('#btn-conveyor-tracking').click();
        if (action === 'visibility') await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    }
    expect(errors).toEqual([]);
});

test('reset still stops continuous run', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await panel.locator('[data-action="run"]').click();
    await expectMoving(page);
    await page.evaluate(() => window.__run.conveyorTrackingApp.reset());
    await expectStopped(page);
    expect(errors).toEqual([]);
});
