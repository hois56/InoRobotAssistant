import { test, expect } from '@playwright/test';

test('one web belt accepts one controller and migrates saved connections', async ({ page }) => {
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#btn-conveyor-tracking', { state: 'attached' });
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createConveyorTrackingApp } = await import('/2_3DSimulation/conveyor-tracking-app.mjs');
        document.querySelector('#conveyor-tracking-dialog').remove();
        document.querySelector('#btn-conveyor-tracking').remove();
        const scene = new THREE.Scene();
        const belt = new THREE.Mesh(new THREE.BoxGeometry(1200, 120, 20));
        scene.add(belt);
        const geom = new THREE.BoxGeometry(4, 4, 4);
        let exposures = 0, driving = false;
        const pieces = Array.from({ length: 40 }, (_, index) => {
            const piece = new THREE.Mesh(geom);
            piece.position.set(index ? 200 + 5 * index : -12, 0, 30);
            scene.add(piece);
            return piece;
        });
        const mapping = { action: 'CONVEYOR', gripObjectRef: 'shared-belt', conveyorAxis: 'X', conveyorSpeed: 100 };
        const endpoints = Array.from({ length: 5 }, (_, i) => {
            const base = new THREE.Group();
            base.position.x = 100 * i;
            scene.add(base);
            return { base, ipAddress: '127.0.1.' + (i + 1), status: 'streaming', source: 'bridge',
                socket: { bufferedAmount: 0 }, frames: [], delivered: [], eventId: 0, request: 0 };
        });
        let tick;
        const interval = window.setInterval;
        // Drive the production 50 ms sender deterministically, without waiting for wall-clock timers.
        window.setInterval = (handler, delay, ...args) => delay === 50 ? (tick = handler, 0) : interval(handler, delay, ...args);
        const app = createConveyorTrackingApp({
            mappings: () => [mapping], resolveBelt: () => belt, controllers: () => endpoints, controllerBase: c => c.base,
            scene: () => scene, drive: () => { driving = true; }, isDriving: () => driving,
            stop: () => { driving = false; }, feed: { settings: () => null, sources: () => [] },
            vision: () => ({ config: { enabled: true, camera: { processingMs: 0 } }, captureConveyorObjects: (visible, transform, shift, type, onDetection) => {
                exposures++;
                if (!visible.includes(pieces[0])) return [];
                onDetection?.(pieces[0]);
                return [{ id: 'part', type: 2, pose: [3, 0, 30, 0, 0, 0] }];
            } }),
            send(command, target) {
                if (command.type !== 'conveyorFrame') return true;
                const f = command.frame;
                target.frames.push(f);
                for (const e of f.events) if (e.id > target.eventId) {
                    if (e.id !== target.eventId + 1) throw Error('Skipped event');
                    if (e.requestId && e.requestId !== target.request) throw Error('Camera request sent to wrong VC');
                    if (e.requestId) target.request = 0;
                    target.eventId = e.id; target.delivered.push(e);
                }
                queueMicrotask(() => app.message({ type: 'conveyorFrameResult', success: true,
                    session: f.session, sequence: f.sequence, eventId: target.eventId, encoder: f.encoder, flags: target.request + (target === endpoints[0] ? 2 ** 31 : 0) }, target));
                return true;
            }
        });
        try { app.start(); } finally { window.setInterval = interval; }
        app.restore([{ belt: 'shared-belt', controllerIp: endpoints[0].ipAddress, channel: 0, scale: 1000,
            address: 0, position: 0, width: 2, height: 20, objectType: 2, autoCapture: true,
            targets: [{ ip: endpoints[1].ipAddress, channel: 1, address: 27 },
                { ip: endpoints[0].ipAddress, channel: 2, address: 35 }] }]);
        app.open();
        const panel = document.querySelector('#conveyor-tracking-dialog');
        panel.classList.remove('panel-user-hidden');
        const fields = panel.querySelector('form').elements;
        const click = action => panel.querySelector('[data-action="' + action + '"]').click();
        const select = i => { fields.controller.value = String(i); fields.controller.dispatchEvent(new Event('change')); };
        const add = async (i, channel = i % 4) => {
            select(i); fields.channel.value = channel; fields.address.value = String(i); click('connect'); await Promise.resolve();
        };
        const move = async (distance = 0) => {
            app.beforeStep(pieces);
            for (const piece of pieces) piece.position.x += distance;
            app.afterStep(.05, distance ? [{ ...mapping, conveyorSpeed: Math.abs(distance) / .05, conveyorAxis: distance > 0 ? 'X' : '-X' }] : [], pieces);
            tick(); await Promise.resolve();
        };
        const restored = app.serialize()[0];
        await add(0);
        await move(20);
        click('capture'); await move();
        click('capture'); await move();
        const pictures = endpoints[0].delivered.filter(event => event.kind === 'vision').map(event => event.objects.length);
        await add(1);
        await move(5);
        const active = endpoints.map(c => app.isTrackingController(c));
        const counts = endpoints.map(c => c.frames.length);
        select(0); click('release');
        await add(1); await move(1);
        const switched = endpoints.map(c => app.isTrackingController(c));
        const saved = app.serialize()[0];
        app.dispose();
        return { restored, active, counts, switched, saved, exposures, pictures };
    });
    expect(result.active).toEqual([true, false, false, false, false]);
    expect(result.counts[0]).toBeGreaterThan(1);
    expect(result.counts.slice(1)).toEqual([0, 0, 0, 0]);
    expect(result.pictures).toEqual([1, 0, 0]);
    expect(result.exposures).toBe(3);
    expect(result.switched).toEqual([false, true, false, false, false]);
    expect(result.restored).toMatchObject({controllerIp: '127.0.1.1', channel: 2, address: 35});
    expect(result.restored).not.toHaveProperty('targets');
    expect(result.saved).toMatchObject({controllerIp: '127.0.1.2', channel: 1, address: 1});
    expect(result.saved).not.toHaveProperty('targets');
});

test('retains exact bounds for rotated and scaled meshes in conveyor coordinates', async ({page}) => {
    await page.goto('/2_3DSimulation/');
    const errors = await page.evaluate(async () => {
        const THREE = await import('three');
        const {conveyorLocalBounds} = await import('/2_3DSimulation/conveyor-scene.mjs?v=20261123-shared-bounds');
        const belt = new THREE.Group(), model = new THREE.Group();
        belt.position.set(4, -23, 11); belt.rotation.set(.4, .7, -.2);
        model.position.set(40, 36, -19); model.rotation.set(-.2, .9, .6);
        model.scale.set(1.5, .75, 2);
        const geometry = new THREE.BoxGeometry(14, 7, 2);
        geometry.computeBoundingBox();
        for (let i=0; i<3; i++) {
            const mesh = new THREE.Mesh(geometry);
            mesh.position.set(7*i, i-2, 3*i); mesh.rotation.x = i*.3;
            mesh.scale.y = i === 1 ? -3 : 2; mesh.visible = i !== 2;
            model.add(mesh);
        }
        belt.updateMatrixWorld(); model.updateMatrixWorld();
        const inverse = belt.matrixWorld.clone().invert(), expected = new THREE.Box3();
        model.traverseVisible(mesh => {
            if (!mesh.isMesh) return;
            const box = geometry.boundingBox;
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
                expected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        });
        const dynamic = conveyorLocalBounds(model, belt), cached = conveyorLocalBounds(model, belt, inverse);
        model.position.x += 200;
        conveyorLocalBounds(model, belt, inverse);
        return [dynamic.min.distanceTo(expected.min), dynamic.max.distanceTo(expected.max),
            cached.min.distanceTo(expected.min), cached.max.distanceTo(expected.max)];
    });
    expect(Math.max(...errors)).toBeLessThan(1e-9);
});
