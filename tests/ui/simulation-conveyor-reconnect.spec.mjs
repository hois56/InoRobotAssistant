import { test, expect } from '@playwright/test';

for (const lostAck of [false,true]) test(`reconnect retains pending workpiece and encoder${lostAck ? ' after a lost acknowledgement' : ''}`, async ({page}) => {
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/2_3DSimulation/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#btn-conveyor-tracking',{state:'attached'});
    await page.evaluate(async lostAck => {
        const THREE=await import('three');
        const {createConveyorTrackingApp}=await import('/2_3DSimulation/conveyor-tracking-app.mjs?v=20261118-request-capture-1');
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
                for(const event of f.events){if(event.id<=native.eventId)continue;if(event.kind==='vision')native.objects+=event.objects.length;native.eventId=event.id;}
                if(lostAck&&native.objects>0&&!native.reconnected)return true;
                const flags = native.captureRequest || 0;
                native.captureRequest = 0;
                setTimeout(() => {
                    app.message({type:'conveyorFrameResult',success:true,session:f.session,sequence:f.sequence,eventId:native.eventId,encoder:native.encoder,objects:native.objects,flags},controller);
                    if (flags) native.deliveredRequest = flags;
                }, 0);
                return true;
            }});
        app.restore([{ belt: mapping.gripObjectRef, channel: 0, scale: 1000, address: 0, position: 0, width: 2, height: 20, objectType: 3, capture: true }]);
        app.start();app.open();const panel=document.querySelector('#conveyor-tracking-dialog');panel.classList.remove('panel-user-hidden');
        panel.querySelector('[data-action="connect"]').click();
        window.__reconnect={app,native,move(){app.beforeStep([work]);work.position.x+=30;work.updateMatrixWorld(true);app.afterStep(.02,[mapping],[work]);},stay(){app.beforeStep([work]);app.afterStep(.02,[mapping],[work]);},capture(){app.beforeStep([work]);app.afterStep(.02,[],[work]);}};
    },lostAck);
    const panel=page.locator('#conveyor-tracking-dialog');
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
    const before=await page.evaluate(()=>structuredClone(window.__reconnect.native));
    await panel.locator('[data-action="release"]').click();
    await page.evaluate(()=>{window.__reconnect.native.reconnected=true;});
    await panel.locator('[data-action="connect"]').click();
    await expect.poll(()=>page.evaluate(()=>window.__reconnect.native.frames.length)).toBeGreaterThan(before.frames.length);
    const resumed=await page.evaluate(()=>window.__reconnect.native.frames.at(-1));
    expect(resumed.session).toBe(before.frames.at(-1).session);
    expect(resumed.encoder).toBe(before.encoder);
    await page.evaluate(()=>window.__reconnect.stay());
    await expect.poll(()=>page.evaluate(()=>window.__reconnect.native.encoder)).toBe('4000');
    expect(await page.evaluate(()=>window.__reconnect.native.objects)).toBe(1);
    await expect(panel.locator('[data-links]')).toContainText('4000 counts');
    await panel.locator('[data-action="release"]').click();
    expect(errors).toEqual([]);
});
