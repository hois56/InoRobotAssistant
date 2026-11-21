import { test, expect } from '@playwright/test';

for (const mode of ['normal release', 'lost acknowledgement', 'controller restart', 'sensor-triggered capture', 'incompatible reconnect']) test(`reconnects the web conveyor after ${mode}`, async ({page}) => {
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/2_3DSimulation/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#btn-conveyor-tracking',{state:'attached'});
    const lostAck = mode === 'lost acknowledgement';
    const restartWithPendingCapture = mode === 'controller restart';
    const automatic = mode === 'sensor-triggered capture';
    await page.evaluate(async ({lostAck, automatic}) => {
        const THREE=await import('three');
        const {createConveyorTrackingApp}=await import('/2_3DSimulation/conveyor-tracking-app.mjs?v=20261119-conveyor-reconnect-1');
        document.querySelector('#conveyor-tracking-dialog').remove();document.querySelector('#btn-conveyor-tracking').remove();
        const scene=new THREE.Scene(),base=new THREE.Group();
        const belt=new THREE.Mesh(new THREE.BoxGeometry(800,160,30));belt.position.z=15;
        const work=new THREE.Mesh(new THREE.BoxGeometry(20,20,20));work.position.set(-30,0,40);
        scene.add(belt,work,base);
        const mapping={action:'CONVEYOR',gripObjectRef:'conveyor:reconnect',conveyorAxis:'X',conveyorSpeed:100};
        const controller={ipAddress:'127.0.0.77',source:'bridge',status:'streaming',socket:{bufferedAmount:0}};
        const native={encoder:'0',eventId:0,objects:0,frames:[]};let app;
        app=createConveyorTrackingApp({mappings:()=>[mapping],resolveBelt:()=>belt,controllers:()=>[controller],controllerBase:()=>base,
            scene:()=>scene,stop:()=>{},isDriving:()=>false,vision:()=>({config:{enabled:true,camera:{processingMs:0}},captureConveyorObjects:()=>[{id:'piece',type:3,pose:[0,0,40,0,0,15]}]}),
            feed:{settings:()=>null,sources:()=>[],label:()=>''},
            send(message){
                if(message.type==='conveyorRelease')return true;
                const f=message.frame;native.frames.push(structuredClone(f));native.encoder=f.encoder;
                if (native.invalidReason) {
                    setTimeout(() => app.message({type:'conveyorFrameResult', success:false, status:87,
                        flags:native.invalidReason, session:f.session, message:'K14 conveyor rejected the frame (87).'}, controller), 0);
                    return true;
                }
                if (native.dropCapture && f.events.some(event => event.requestId === native.dropCapture)) return true;
                for (const event of f.events) {
                    if (event.id <= native.eventId) continue;
                    if (event.id !== native.eventId + 1 || (event.requestId && event.requestId !== native.captureRequest)) {
                        native.rejected = true;
                        setTimeout(() => app.message({type:'conveyorFrameResult', success:false, status:13, session:f.session,
                            message:'K14 conveyor rejected the frame (13).'}, controller), 0);
                        return true;
                    }
                    if (event.kind === 'vision') {
                        native.objects += event.objects.length;
                        if (event.requestId) native.captureRequest = 0;
                    }
                    native.eventId = event.id;
                }
                if(lostAck&&native.objects>0&&!native.reconnected)return true;
                const flags = native.captureRequest || 0;
                setTimeout(() => {
                    app.message({type:'conveyorFrameResult',success:true,session:f.session,sequence:f.sequence,eventId:native.eventId,encoder:native.encoder,objects:native.objects,flags},controller);
                    if (flags) native.deliveredRequest = flags;
                }, 0);
                return true;
            }});
        app.restore([{ belt: mapping.gripObjectRef, channel: 0, scale: 1000, address: 0, position: 0, width: 2, height: 20, objectType: 3, capture: true }]);
        app.start();app.open();const panel=document.querySelector('#conveyor-tracking-dialog');panel.classList.remove('panel-user-hidden');
        if (!automatic) panel.querySelector('[data-action="connect"]').click();
        window.__reconnect={app,native,move(){app.beforeStep([work]);work.position.x+=30;work.updateMatrixWorld(true);app.afterStep(.02,[mapping],[work]);},stay(){app.beforeStep([work]);app.afterStep(.02,[mapping],[work]);},capture(){app.beforeStep([work]);app.afterStep(.02,[],[work]);}};
    }, {lostAck, automatic});
    const panel=page.locator('#conveyor-tracking-dialog');
    if (mode === 'incompatible reconnect') {
        await expect(panel.locator('[data-links]')).toContainText('연동 중');
        await panel.locator('[data-action="release"]').click();
        await page.evaluate(() => { window.__reconnect.native.invalidReason = 6; });
        await panel.locator('[data-action="connect"]').click();
        await expect(panel.locator('[data-status]')).toContainText('기존 컨베이어와 로봇 베이스 위치로 다시 연동해야 합니다. (87)');
        await expect(panel.locator('[data-links]')).toBeEmpty();
        expect(errors).toEqual([]);
        return;
    }
    if (automatic) {
        const enable = panel.getByRole('checkbox', {name:'센서 감지 시 자동 촬영'});
        const distance = panel.getByRole('spinbutton', {name:'촬영 지연거리 (mm)'});
        await expect(enable).not.toBeChecked();
        await expect(distance).toBeDisabled();
        await enable.check();
        await distance.click();
        const editor = panel.locator('[name="captureDistance"]');
        await editor.fill('2');
        await expect(editor).toHaveValue('2');
        await panel.locator('[data-action="connect"]').click();
        await expect(panel.locator('[data-links]')).toContainText('연동 중');
        await expect(enable).toBeDisabled();
        await page.evaluate(() => window.__reconnect.move());
        await expect.poll(() => page.evaluate(() => window.__reconnect.native.frames.some(frame =>
            frame.events.some(event => event.kind === 'sensor' && event.value === 1)))).toBe(true);
        expect(await page.evaluate(() => window.__reconnect.native.objects)).toBe(0);
        await page.evaluate(() => window.__reconnect.move());
        await expect.poll(() => page.evaluate(() => window.__reconnect.native.objects)).toBe(1);
        const {frames} = await page.evaluate(() => window.__reconnect.native);
        const events = frames.flatMap(frame => frame.events);
        const sensor = events.find(event => event.kind === 'sensor' && event.value === 1);
        const exposure = events.find(event => event.kind === 'vision');
        expect(exposure.requestId).toBe(0);
        expect(Number(exposure.encoder) - Number(sensor.encoder)).toBe(2000);
        expect(await page.evaluate(() => window.__reconnect.app.serialize()[0])).toMatchObject({autoCapture:true, captureDistance:2});
        await panel.locator('[data-action="release"]').click();
        await expect(enable).toBeEnabled();
        await page.evaluate(() => {
            const {app} = window.__reconnect;
            app.restore(app.serialize());
            app.open();
        });
        await expect(enable).toBeChecked();
        await expect(editor).toHaveValue('2');
        expect(errors).toEqual([]);
        return;
    }
    await expect.poll(()=>page.evaluate(()=>window.__reconnect.native.frames.length)).toBeGreaterThan(0);
    await page.evaluate(()=>window.__reconnect.move());
    await expect.poll(() => page.evaluate(() => window.__reconnect.native.frames.some(frame =>
        frame.events.some(event => event.kind === 'sensor' && event.address === 0 && event.value === 1)))).toBe(true);
    expect(await page.evaluate(() => window.__reconnect.native.objects)).toBe(0);
    if (lostAck) {
        await panel.locator('[data-action="capture"]').click();
    } else {
        await page.evaluate(() => { window.__reconnect.native.captureRequest = 7; window.__reconnect.capture(); });
        await expect.poll(() => page.evaluate(() => window.__reconnect.native.deliveredRequest)).toBe(7);
    }
    await page.evaluate(() => window.__reconnect.capture());
    await expect.poll(()=>page.evaluate(()=>window.__reconnect.native.objects)).toBe(1);
    expect(await page.evaluate(() => window.__reconnect.native.frames.flatMap(frame => frame.events)
        .find(event => event.kind === 'vision')?.requestId)).toBe(lostAck ? 0 : 7);
    if (restartWithPendingCapture) {
        await page.evaluate(() => { window.__reconnect.native.captureRequest = 8; window.__reconnect.capture(); });
        await expect.poll(() => page.evaluate(() => window.__reconnect.native.deliveredRequest)).toBe(8);
        await page.evaluate(() => { window.__reconnect.native.dropCapture = 8; window.__reconnect.capture(); });
        await expect.poll(() => page.evaluate(() => window.__reconnect.native.frames.at(-1).events.some(event => event.requestId === 8))).toBe(true);
    }
    const before=await page.evaluate(()=>structuredClone(window.__reconnect.native));
    await panel.locator('[data-action="release"]').click();
    await page.evaluate(restarted => {
        const {native} = window.__reconnect;
        native.reconnected = true;
        if (restarted) Object.assign(native, {eventId:0, objects:0, captureRequest:0, dropCapture:0});
    }, restartWithPendingCapture);
    await panel.locator('[data-action="connect"]').click();
    await expect.poll(()=>page.evaluate(()=>window.__reconnect.native.frames.length)).toBeGreaterThan(before.frames.length);
    const resumed=await page.evaluate(()=>window.__reconnect.native.frames.at(-1));
    expect(resumed.session).toBe(before.frames.at(-1).session);
    expect(resumed.encoder).toBe(before.encoder);
    await page.evaluate(()=>window.__reconnect.stay());
    await expect.poll(()=>page.evaluate(()=>window.__reconnect.native.encoder)).toBe('4000');
    expect(await page.evaluate(()=>window.__reconnect.native.objects)).toBe(restartWithPendingCapture ? 0 : 1);
    await expect(panel.locator('[data-links]')).toContainText('4000 counts');
    if (restartWithPendingCapture) {
        // Request IDs restart, so the same ID may legitimately be used again.
        await page.evaluate(() => { window.__reconnect.native.deliveredRequest = 0; window.__reconnect.native.captureRequest = 7; window.__reconnect.capture(); });
        await expect.poll(() => page.evaluate(() => window.__reconnect.native.deliveredRequest)).toBe(7);
        await page.evaluate(() => window.__reconnect.capture());
        await expect.poll(() => page.evaluate(() => window.__reconnect.native.objects)).toBe(1);
        const {frames, rejected} = await page.evaluate(() => window.__reconnect.native);
        const fresh = frames.slice(before.frames.length).flatMap(frame => frame.events);
        expect(fresh.some(event => event.requestId === 8)).toBe(false);
        expect(fresh.find(event => event.requestId === 7)?.id).toBe(1);
        expect(rejected).toBeFalsy();
    }
    await panel.locator('[data-action="release"]').click();
    expect(errors).toEqual([]);
});
