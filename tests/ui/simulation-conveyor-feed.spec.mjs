import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__feed = { state, equipmentApp, conveyorTrackingApp, conveyorFeedApp, visionApp, THREE, writeOlpAddress, readOlpSimulatorBit, isGripObjectTarget, createPrimitiveShapeRoot, ensureWorkspaceModelId, getArticulatedRobots, getRobotToolMountFrame, updateUIStatus, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, conveyorLocalBounds: (await import('./conveyor-scene.mjs')).conveyorLocalBounds, step(seconds, count) { conveyorLastTimestamp = 0; for (let i = 1; i <= count; i++) updateConveyorSimulation(i * seconds * 1000); } };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__feed?.state.workspaceRecovery.ready);
    await page.evaluate(() => {
        const api = window.__feed;
        const box = (name, dimensions, xyz) => {
            const model = api.createPrimitiveShapeRoot('box', dimensions, { name });
            model.position.fromArray(xyz); api.state.scene.add(model); api.state.models.push(model);
            return model;
        };
        const belt = box('Feed belt', { x: 800, y: 160, z: 30 }, [0, 0, 0]);
        const source = box('Registered workpiece', { x: 40, y: 40, z: 40 }, [0, 300, 30]);
        api.equipmentApp.save({ id: 'feed-source', type: 'OBJECT', movingRef: 'equipment-model:' + api.ensureWorkspaceModelId(source) + '/-1' });
        api.state.ioFunctionMappings = [{ id: 'feed-belt', action: 'CONVEYOR', gripObjectRef: 'conveyor:' + api.ensureWorkspaceModelId(belt), conveyorAxis: 'X', conveyorSpeed: 100, conveyorManualOnly: true, enabled: false }];
        api.updateUIStatus();
    });
    await page.locator('#btn-conveyor-tracking').click();
    return { panel: page.locator('#conveyor-tracking-dialog'), errors };
}

async function enableFeed(panel, gap = '100', variation = { positionRange: 0, rotationRange: 0 }) {
    await panel.locator('[name="feedGap"]').fill('');
    await panel.locator('[name="feedGap"]').fill(gap);
    await expect(panel.locator('[name="feedGap"]')).toHaveValue(gap);
    if (variation) {
        await panel.locator('[name="feedPositionRange"]').fill('');
        await panel.locator('[name="feedPositionRange"]').fill(String(variation.positionRange));
        await panel.locator('[name="feedRotationRange"]').fill('');
        await panel.locator('[name="feedRotationRange"]').fill(String(variation.rotationRange));
        await expect(panel.locator('[name="feedPositionRange"]')).toHaveValue(String(variation.positionRange));
        await expect(panel.locator('[name="feedRotationRange"]')).toHaveValue(String(variation.rotationRange));
    }
    await panel.locator('[name="feedEnabled"]').check();
    await panel.locator('[data-action="apply-feed"]').click();
    await expect(panel.locator('[data-feed-status]')).toContainText('자동 공급 설정됨');
    await panel.locator('[data-action="run"]').click();
}

function readFeed() {
    const api = window.__feed;
    const belt = api.state.models.find(model => model.userData.modelName === 'Feed belt');
    const generated = api.state.models.filter(model => model.userData.conveyorFeedSource);
    return {
        count: generated.length,
        total: api.state.models.length,
        groups: api.state.modelGroups.map(group => ({ name: group.name, count: group.modelIds.length, collapsed: group.collapsed })),
        boxes: generated.map(model => {
            const b = api.conveyorLocalBounds(model, belt), stable = v => v.toArray().map(n => Number(n.toFixed(8)));
            return { min: stable(b.min), max: stable(b.max) };
        }).sort((a, b) => a.min[0] - b.min[0]),
        registered: api.equipmentApp.objects().filter(item => item.model.userData.conveyorFeedSource).length
    };
}

for (const tracking of [false, true]) test('vacuum picks up an automatic supply workpiece ' +
    (tracking ? 'while the pad tracks the moving belt' : 'that reaches the pad after the signal'), async ({ page }) => {
    test.setTimeout(90_000);
    const { panel, errors } = await setup(page);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__feed.getArticulatedRobots().length === 1);
    await enableFeed(panel, '200');
    const result = await page.evaluate(tracking => {
        const a = window.__feed, { equipmentApp: app, THREE: T, state } = a;
        const robot = a.getArticulatedRobots()[0], mount = a.getRobotToolMountFrame(robot);
        a.step(0.02, 1);
        const piece = state.models.find(model => model.userData.conveyorFeedSource);
        const workpieceBounds = new T.Box3().setFromObject(piece, true);
        const tool = a.createPrimitiveShapeRoot('box', { x:20, y:20, z:20 }, { name:'Vacuum pad' });
        mount.add(tool);
        tool.userData.placement = 'tcp';
        tool.userData.attachmentHost = robot;
        state.models.push(tool);
        tool.quaternion.copy(mount.getWorldQuaternion(new T.Quaternion()).invert());
        const padBounds = new T.Box3().setFromObject(tool, true);
        const padCenter = padBounds.getCenter(new T.Vector3()), workpieceCenter = workpieceBounds.getCenter(new T.Vector3());
        const padPosition = tool.getWorldPosition(new T.Vector3()).add(new T.Vector3(
            workpieceCenter.x - padCenter.x + (tracking ? 0 : 80),
            workpieceCenter.y - padCenter.y,
            workpieceBounds.max.z - padBounds.min.z + (tracking ? 0.75 : 0)
        ));
        tool.position.copy(mount.worldToLocal(padPosition));
        tool.updateWorldMatrix(true, true);
        const vacuum = app.save({
            id:'feed-vacuum', type:'VACUUM', movingRef:'equipment-model:' + a.ensureWorkspaceModelId(tool) + '/-1',
            vacuumMode:'FACE', vacuumFace:{ meshPath:[0], triangleRanges:[{ first:10, last:11 }] }, feedbackGrip:620
        }, { forward:512, reverse:513 });
        const output = (address, value) => a.writeOlpAddress('Out[' + address + ']', value);
        output(512, 1);
        output(512, 0);
        const waiting = vacuum.runtime.vacuumActive && !vacuum.runtime.heldRef;
        let trackedDistance = 0;
        if (tracking) {
            const startPiece = piece.getWorldPosition(new T.Vector3()), startPad = tool.getWorldPosition(new T.Vector3());
            for (let step = 0; step < 5; step++) {
                a.step(0.02, 1);
                const delta = piece.getWorldPosition(new T.Vector3()).sub(startPiece);
                tool.position.copy(mount.worldToLocal(startPad.clone().add(delta)));
            }
            trackedDistance = tool.getWorldPosition(new T.Vector3()).distanceTo(startPad);
            const pad = tool.getWorldPosition(new T.Vector3());
            pad.x += trackedDistance / 5;
            pad.z -= 0.25;
            tool.position.copy(mount.worldToLocal(pad));
            a.step(0.02, 1);
        } else {
            for (let step = 0; step < 60 && !vacuum.runtime.heldRef; step++) a.step(0.02, 1);
        }
        const acquired = piece.userData.attachmentHost === robot && piece.userData.equipmentOwner === vacuum.id;
        const feedback = a.readOlpSimulatorBit('IN', 620);
        output(513, 1);
        output(513, 0);
        return { waiting, acquired, feedback, trackedDistance, released: !piece.userData.attachmentHost && !vacuum.runtime.vacuumActive };
    }, tracking);
    expect(result).toMatchObject({ waiting:true, acquired:true, feedback:1, released:true });
    if (tracking) expect(result.trackedDistance).toBeGreaterThan(1);
    expect(errors).toEqual([]);
});

test('automatic supply varies workpiece position and yaw by default', async ({ page }) => {
    await page.addInitScript(() => {
        let seed = 12345;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    });
    const { panel, errors } = await setup(page);
    await expect(panel.locator('[name="feedPositionRange"]')).toHaveValue('20');
    await expect(panel.locator('[name="feedRotationRange"]')).toHaveValue('15');
    await enableFeed(panel, '100', null);
    const result = await page.evaluate(() => {
        const a = window.__feed; a.step(0.1, 100);
        const objects = a.state.models.filter(m => m.userData.conveyorFeedSource), belt = a.state.models[0];
        a.visionApp.config.enabled = true;
        Object.assign(a.visionApp.config.camera, { x:0, y:0, z:2000, rx:0, ry:0, rz:0, direction:'down', mountId:'' });
        const inverse = belt.matrixWorld.clone().invert();
        const detections = a.visionApp.captureConveyorObjects(objects, p => new a.THREE.Vector3(...p).applyMatrix4(inverse).toArray());
        return {
            poses: objects.map(m => {
                const b = a.conveyorLocalBounds(m, belt);
                return { id:m.userData.workspaceModelId, y:b.getCenter(m.position.clone()).y, yaw:m.rotation.z * 180 / Math.PI, min:b.min.toArray(), max:b.max.toArray() };
            }).sort((a,b) => a.min[0]-b.min[0]),
            detections,
            sourceRotation:a.state.models[1].rotation.z
        };
    });
    const { poses, detections } = result;
    expect(poses.length).toBeGreaterThan(3);
    expect(Math.min(...poses.map(p => p.yaw))).toBeLessThan(-1);
    expect(Math.max(...poses.map(p => p.yaw))).toBeGreaterThan(1);
    expect(Math.max(...poses.map(p => p.y)) - Math.min(...poses.map(p => p.y))).toBeGreaterThan(1);
    for (const pose of poses) {
        expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(15);
        expect(pose.min[1]).toBeGreaterThanOrEqual(-80 - 1e-6);
        expect(pose.max[1]).toBeLessThanOrEqual(80 + 1e-6);
        expect(pose.min[2]).toBeCloseTo(30, 5);
        const detected = detections.find(item => item.id === pose.id);
        expect(detected).toBeTruthy();
        expect(detected.pose[1]).toBeCloseTo(pose.y, 5);
        expect(detected.pose[3]).toBeCloseTo(pose.yaw, 5);
        expect(detected.pose.slice(4)).toEqual([0, 0]);
    }
    for (let i = 1; i < poses.length; i++) expect(poses[i].min[0] - poses[i-1].max[0]).toBeGreaterThanOrEqual(100 - 1e-6);
    expect(result.sourceRotation).toBe(0);
    await panel.locator('[data-action="stop"]').click();
    await page.screenshot({ path: test.info().outputPath('automatic-feed-variation.png') });
    expect(errors).toEqual([]);
});

test('registered workpieces feed indefinitely at the configured gap in one collapsed group', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await expect(panel.locator('[name="feedSource"]')).toContainText('Registered workpiece');
    await enableFeed(panel);
    await page.evaluate(() => window.__feed.step(0.1, 100));
    const first = await page.evaluate(readFeed);
    expect(first.count).toBeGreaterThan(3);
    expect(first.groups).toHaveLength(1);
    expect(first.groups[0].collapsed).toBe(true);
    expect(first.registered).toBe(first.count);
    await page.screenshot({ path: test.info().outputPath('automatic-feed.png') });
    const group = page.locator('.model-tree-model-group').filter({ hasText: '자동 공급' });
    await expect(group.locator(':scope > details')).not.toHaveAttribute('open');
    await expect(page.locator('#model-tree > .model-tree-list > li')).toHaveCount(3);
    await group.locator('.model-tree-group-toggle').first().click();
    await expect(group.locator(':scope > details')).toHaveAttribute('open', '');
    await page.evaluate(() => window.__feed.step(0.1, 1000));
    const later = await page.evaluate(readFeed);
    expect(later.total).toBeLessThanOrEqual(9);
    expect(later.count).toBeGreaterThan(3);
    expect(later.groups).toHaveLength(1);
    expect(later.groups[0].collapsed).toBe(false);
    expect(later.groups[0].count).toBe(later.count);
    for (let i = 1; i < later.boxes.length; i++) expect(later.boxes[i].min[0] - later.boxes[i - 1].max[0]).toBeCloseTo(100, 5);
    await panel.locator('[data-action="stop"]').click();
    const stopped = await page.evaluate(readFeed);
    await page.waitForTimeout(150);
    expect(await page.evaluate(readFeed)).toEqual(stopped);
    expect(errors).toEqual([]);
});


test('reverse motion on a rotated belt supplies registered objects through sensor IN0', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await page.evaluate(() => {
        const api = window.__feed, belt = api.state.models[0];
        belt.rotation.z = Math.PI / 2; belt.position.set(500, 200, 10); belt.updateMatrixWorld(true);
        api.conveyorTrackingApp.configure({ belt: api.state.ioFunctionMappings[0].gripObjectRef, address: 0, position: 0, width: 2, height: 20 });
    });
    await panel.locator('[name="testDirection"]').selectOption('reverse');
    await enableFeed(panel, '80', { positionRange: 20, rotationRange: 15 });
    const result = await page.evaluate(() => {
        const api = window.__feed; let on = false, off = false;
        for (let i = 0; i < 200; i++) {
            api.step(0.1, 1);
            const sensor = api.conveyorTrackingApp.sensorPreview(api.state.ioFunctionMappings[0].gripObjectRef);
            on ||= sensor?.level === 1; off ||= sensor?.level === 0;
        }
        const belt = api.state.models[0];
        return { on, off, boxes: api.state.models.filter(m => m.userData.conveyorFeedSource).map(m => api.conveyorLocalBounds(m, belt).getCenter(m.position.clone()).toArray()), count: api.state.models.length };
    });
    expect(result.on).toBe(true); expect(result.off).toBe(true);
    expect(result.count).toBeLessThanOrEqual(11);
    expect(result.boxes.length).toBeGreaterThan(3);
    for (const center of result.boxes) { expect(Math.abs(center[1])).toBeLessThanOrEqual(60 + 1e-6); expect(center[2]).toBeCloseTo(50); }
    expect(errors).toEqual([]);
});

test('feed settings, generated models and expanded group survive workspace reload without starting the belt', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await enableFeed(panel, '60', { positionRange: 12, rotationRange: 25 });
    await page.evaluate(() => window.__feed.step(0.1, 40));
    await panel.locator('[data-action="stop"]').click();
    const group = page.locator('.model-tree-model-group').filter({ hasText: '자동 공급' });
    await group.locator('.model-tree-group-toggle').first().click();
    const before = await page.evaluate(readFeed);
    const restored = await page.evaluate(async () => {
        const api = window.__feed, snapshot = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        const warnings = await api.restoreWorkspaceSnapshot(snapshot);
        return { warnings, settings: api.conveyorFeedApp.serialize() };
    });
    expect(restored.warnings).toEqual([]);
    expect(restored.settings[0]).toMatchObject({ gap: 60, positionRange: 12, rotationRange: 25, enabled: true });
    expect(await page.evaluate(readFeed)).toEqual(before);
    await page.waitForTimeout(150);
    expect(await page.evaluate(readFeed)).toEqual(before);
    await page.evaluate(() => window.__feed.conveyorTrackingApp.open());
    await expect(panel.locator('[name="feedGap"]')).toHaveValue('60');
    await expect(panel.locator('[name="feedPositionRange"]')).toHaveValue('12');
    await expect(panel.locator('[name="feedRotationRange"]')).toHaveValue('25');
    await panel.locator('[data-action="run"]').click();
    await page.evaluate(() => window.__feed.step(0.1, 100));
    const later = await page.evaluate(readFeed);
    expect(later.count).toBeGreaterThan(3);
    expect(later.groups).toHaveLength(1);
    expect(later.groups[0].collapsed).toBe(false);
    expect(errors).toEqual([]);
});

test('disabling supply stops births and a picked object is preserved while the other objects leave', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await enableFeed(panel);
    await page.evaluate(() => {
        const api = window.__feed; api.step(0.1, 30);
        const held = api.state.models.find(m => m.userData.conveyorFeedSource);
        held.userData.attachmentHost = api.state.models[1]; held.userData.equipmentOwner = 'test-gripper';
        window.__heldFeed = held;
    });
    await panel.locator('[name="feedEnabled"]').uncheck();
    await panel.locator('[data-action="apply-feed"]').click();
    await expect(panel.locator('[data-feed-status]')).toContainText('자동 공급 중지');
    const before = await page.evaluate(() => window.__feed.conveyorFeedApp.serialize()[0].sequence);
    await page.evaluate(() => window.__feed.step(0.1, 150));
    const result = await page.evaluate(() => ({ sequence: window.__feed.conveyorFeedApp.serialize()[0].sequence, remains: window.__feed.state.models.includes(window.__heldFeed), count: window.__feed.state.models.filter(m => m.userData.conveyorFeedSource).length }));
    expect(result).toEqual({ sequence: before, remains: true, count: 1 });
    expect(errors).toEqual([]);
});


for (const axis of ['Y', '-Y']) test(`supply follows local ${axis} and rejects a negative gap`, async ({ page }) => {
    const { panel, errors } = await setup(page);
    await page.evaluate(axis => { window.__feed.state.ioFunctionMappings[0].conveyorAxis = axis; }, axis);
    await panel.locator('[name="feedGap"]').fill(''); await panel.locator('[name="feedGap"]').fill('-1');
    await panel.locator('[data-action="apply-feed"]').click();
    await expect(panel.locator('[data-feed-status]')).toContainText('0~1000000');
    await enableFeed(panel, '20');
    const output = await page.evaluate(() => {
        const a = window.__feed; a.step(0.05, 120);
        return a.state.models.filter(m => m.userData.conveyorFeedSource).map(m => a.conveyorLocalBounds(m, a.state.models[0]).getCenter(m.position.clone()).toArray()).sort((a,b) => a[1]-b[1]);
    });
    expect(output.length).toBeGreaterThanOrEqual(2);
    expect(output.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < output.length; i++) expect(output[i][1] - output[i - 1][1]).toBeCloseTo(60, 5);
    expect(errors).toEqual([]);
});


test('registered assembly parts can be supplied without modifying the original geometry', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await page.evaluate(() => {
        const a = window.__feed, source = a.state.models[1], part = source.children.find(m => m.isMesh);
        part.name = 'Registered assembly part'; part.userData.modelPartId = 'feed-source-part';
        source.userData.importedParts = [part];
        a.equipmentApp.save({ id: 'feed-source', type: 'OBJECT', movingRef: 'equipment-model:' + a.ensureWorkspaceModelId(source) + '/0' });
        a.conveyorTrackingApp.open();
    });
    await expect(panel.locator('[name="feedSource"]')).toContainText('Registered assembly part');
    await enableFeed(panel, '40');
    const result = await page.evaluate(() => {
        const a = window.__feed; a.step(0.1, 200);
        const source = a.state.models[1], part = source.userData.importedParts[0];
        return { count: a.state.models.filter(m => m.userData.conveyorFeedSource).length, sourcePosition: source.position.toArray(), partVisible: part.visible, sourceRef: a.conveyorFeedApp.serialize()[0].sourceRef, pickable: a.state.models.filter(m=>m.userData.conveyorFeedSource).every(m=>a.isGripObjectTarget(m) && a.equipmentApp.isRegistered(m)) };
    });
    expect(result.count).toBeGreaterThan(3);
    expect(result.sourcePosition).toEqual([0,300,30]);
    expect(result.partVisible).toBe(true);
    expect(result.pickable).toBe(true);
    expect(result.sourceRef).toMatch(/\/0$/);
    expect(errors).toEqual([]);
});

test('two independently driven conveyors keep their own supply groups and gaps', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await enableFeed(panel, '100');
    const result = await page.evaluate(() => {
        const a = window.__feed;
        const belt = a.createPrimitiveShapeRoot('box', {x:800,y:160,z:30}, {name:'Second belt'});
        belt.position.set(0,600,0); a.state.scene.add(belt); a.state.models.push(belt);
        const mapping = { id:'second-feed-belt', action:'CONVEYOR', gripObjectRef:'conveyor:'+a.ensureWorkspaceModelId(belt), conveyorName:'Second belt', conveyorAxis:'-X', conveyorSpeed:200, enabled:true, direction:'OUT', address:601, triggerValue:1 };
        a.state.ioFunctionMappings.push(mapping);
        a.conveyorFeedApp.configure({ belt:mapping.gripObjectRef, sourceRef:a.conveyorFeedApp.serialize()[0].sourceRef, gap:60, enabled:true });
        a.writeOlpAddress('Out[601]',1); a.step(.1,200);
        return { groups:a.state.modelGroups.map(g=>({count:g.modelIds.length,collapsed:g.collapsed})), settings:a.conveyorFeedApp.serialize(), count:a.state.models.length };
    });
    expect(result.groups).toHaveLength(2);
    expect(result.groups.every(g=>g.collapsed&&g.count>3)).toBe(true);
    expect(result.settings.map(s=>s.gap)).toEqual([100,60]);
    expect(result.count).toBeLessThanOrEqual(20);
    expect(errors).toEqual([]);
});

for (const axis of ['X', '-X', 'Y', '-Y']) test(`randomized supply respects a tilted belt and minimum gaps along ${axis}`, async ({ page }) => {
    const { panel, errors } = await setup(page);
    await page.evaluate(axis => {
        const a = window.__feed, belt = a.state.models[0];
        belt.rotation.set(0.2, -0.1, Math.PI / 3); belt.scale.setScalar(1.3);
        belt.position.set(500, 200, 100); belt.updateMatrixWorld(true);
        a.state.ioFunctionMappings[0].conveyorAxis = axis;
    }, axis);
    await enableFeed(panel, '20', { positionRange: 1000, rotationRange: 180 });
    const result = await page.evaluate(axis => {
        const a = window.__feed; a.step(0.1, 200);
        const area = a.conveyorLocalBounds(a.state.models[0], a.state.models[0]);
        const boxes = a.state.models.filter(m => m.userData.conveyorFeedSource).map(m => a.conveyorLocalBounds(m, a.state.models[0]));
        const along = axis.endsWith('Y') ? 'y' : 'x', across = along === 'x' ? 'y' : 'x';
        boxes.sort((a,b) => a.min[along]-b.min[along]);
        return {
            count:boxes.length,
            inLane:boxes.every(b => b.min[across] >= area.min[across]-1e-6 && b.max[across] <= area.max[across]+1e-6 && Math.abs(b.min.z-area.max.z)<1e-6),
            gaps:boxes.slice(1).map((b,i) => b.min[along]-boxes[i].max[along])
        };
    }, axis);
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.inLane).toBe(true);
    for (const gap of result.gaps) expect(gap).toBeGreaterThanOrEqual(20-1e-6);
    expect(errors).toEqual([]);
});

test('legacy feed settings acquire defaults and invalid variation never replaces saved settings', async ({ page }) => {
    const { panel, errors } = await setup(page);
    await enableFeed(panel);
    await panel.locator('[data-action="stop"]').click();
    const settings = await page.evaluate(() => {
        const a = window.__feed, saved = a.conveyorFeedApp.serialize();
        delete saved[0].positionRange; delete saved[0].rotationRange;
        a.conveyorFeedApp.restore(saved); a.conveyorTrackingApp.open();
        return a.conveyorFeedApp.serialize();
    });
    expect(settings[0]).toMatchObject({ positionRange:20, rotationRange:15 });
    await expect(panel.locator('[name="feedPositionRange"]')).toHaveValue('20');
    await expect(panel.locator('[name="feedRotationRange"]')).toHaveValue('15');
    for (const [name, value, message] of [['feedPositionRange','-1','좌우 위치 편차는'], ['feedPositionRange','','좌우 위치 편차는'], ['feedRotationRange','181','회전 편차는']]) {
        await panel.locator(`[name="${name}"]`).fill('');
        await panel.locator(`[name="${name}"]`).fill(value);
        await panel.locator('[data-action="apply-feed"]').click();
        await expect(panel.locator('[data-feed-status]')).toContainText(message);
        expect(await page.evaluate(() => window.__feed.conveyorFeedApp.serialize())).toEqual(settings);
        await page.evaluate(() => window.__feed.conveyorTrackingApp.open());
    }
    expect(errors).toEqual([]);
});
