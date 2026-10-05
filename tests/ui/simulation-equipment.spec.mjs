import { createEquipmentFixture, setEquipmentParts } from './helpers/equipment-fixtures.mjs';
import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__equipment = { state, equipmentApp, THREE, writeOlpAddress, readOlpSimulatorBit, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot, applyRobotTravelAxis, getRobotExternalAxes, ensureWorkspaceModelId, createPrimitiveShapeRoot, markSceneCollisionDirty };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__equipment);
    await page.locator('#btn-io-simulator').click();
    await page.locator('#io-function-mapping-button').click();
    await page.locator('#io-equipment-settings').click();
    return errors;
}

test('필름 박리 손잡이 제목과 추가 버튼은 같은 줄에 있고 안내문과 검색은 전체 폭을 사용한다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'FILM_PEEL');
    const panel = page.locator('[data-equipment-role="filmGripRef"]');
    for (const width of [620, 420]) {
        await page.locator('#equipment-dialog').evaluate((node, width) => { node.style.width = width + 'px'; }, width);
        await panel.scrollIntoViewIfNeeded();
        const layout = await panel.evaluate(node => {
            const box = child => { const { x, y, width, height } = child.getBoundingClientRect(); return { x, y, width, height }; };
            const title = node.querySelector('strong');
            return { panel: box(node), title: box(title), button: box(node.querySelector(':scope > button')),
                help: box(node.querySelector(':scope > .equipment-help')), search: box(node.querySelector(':scope > input')),
                lineHeight: parseFloat(getComputedStyle(title).lineHeight) || parseFloat(getComputedStyle(title).fontSize) * 1.5 };
        });
        expect(layout.title.height).toBeLessThanOrEqual(layout.lineHeight * 2 + 1);
        expect(layout.button.height).toBeLessThan(50);
        expect(Math.abs(layout.title.y + layout.title.height / 2 - layout.button.y - layout.button.height / 2)).toBeLessThan(2);
        expect(layout.help.y).toBeGreaterThanOrEqual(Math.max(layout.title.y + layout.title.height, layout.button.y + layout.button.height));
        expect(layout.help.width).toBeCloseTo(layout.panel.width, 0);
        expect(layout.search.y).toBeGreaterThanOrEqual(layout.help.y + layout.help.height);
        expect(layout.search.width).toBeCloseTo(layout.panel.width, 0);
    }
    await page.locator('#equipment-dialog').evaluate(node => { node.style.width = '620px'; });
    await panel.scrollIntoViewIfNeeded();
    await page.locator('#equipment-dialog').screenshot({ path: test.info().outputPath('film-settings-layout.png') });
    expect(errors).toEqual([]);
});

test('설비 설정 중 다른 창을 사용할 수 있고 가동부를 여러 개 저장·이동·복구한다', async ({ page }) => {
    const errors = await setup(page);
    expect(await page.locator('#equipment-dialog').evaluate(node => node.matches(':modal'))).toBe(false);
    expect(await page.locator('#io-function-mapping-dialog').evaluate(node => node.matches(':modal'))).toBe(false);
    await createEquipmentFixture(page, 'CYLINDER');
    const refs = await page.evaluate(() => {
        const api = window.__equipment, app = api.equipmentApp;
        const extra = api.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '추가 가동 부품' });
        extra.position.set(60, 150, 15);
        api.state.scene.add(extra); api.state.models.push(extra);
        return [api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0].movingRef, `equipment-model:${api.ensureWorkspaceModelId(extra)}/-1`];
    });
    await page.locator('[data-equipment-command="EDIT"]').click();
    await setEquipmentParts(page, 'movingRef', refs);
    await page.locator('#equipment-form button[type="submit"]').click();
    await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
    // Close the mapping window while leaving equipment settings open.
    await page.locator('[data-equipment-command="EDIT"]').click();
    await page.screenshot({ path: test.info().outputPath('multiple-equipment-settings.png') });
    const dialogBefore = await page.locator('#equipment-dialog').boundingBox();
    const header = await page.locator('#equipment-dialog .equipment-header').boundingBox();
    expect(header.y).toBeGreaterThanOrEqual(dialogBefore.y);
    expect(header.y).toBeLessThan(dialogBefore.y + 45);
    await page.mouse.move(header.x + 80, header.y + 15);
    await page.mouse.down(); await page.mouse.move(240, 480, { steps: 8 }); await page.mouse.up();
    expect((await page.locator('#equipment-dialog').boundingBox()).x).toBeLessThan(dialogBefore.x - 50);
    await page.locator('#io-function-mapping-close').click();
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__equipment.state.models.some(model => model.userData.tcpFrame));
    await expect(page.locator('#equipment-dialog')).toBeVisible();
    expect(await page.locator('[data-equipment-role="movingRef"] input:checked').evaluateAll(nodes => nodes.map(node => node.value))).toEqual(refs);
    const result = await page.evaluate(async () => {
        const api = window.__equipment, app = api.equipmentApp;
        const def = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0];
        const before = def.movingRefs.map(ref => app.resolve(ref).object.getWorldPosition(new api.THREE.Vector3()).x);
        app.runtime.manual.set(def.id, 'FORWARD'); app.runtime.start(); app.runtime.lastTime = 0;
        for (let i = 1; i <= 60; i++) app.runtime.update([def], [], i * 1000 / 60);
        app.runtime.stop();
        const offsets = def.movingRefs.map((ref, i) => app.resolve(ref).object.getWorldPosition(new api.THREE.Vector3()).x - before[i]);
        const snapshot = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        await api.restoreWorkspaceSnapshot(snapshot);
        const restored = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0];
        const positions = restored.movingRefs.map(ref => api.equipmentApp.resolve(ref).object.getWorldPosition(new api.THREE.Vector3()).x);
        api.equipmentApp.runtime.reset([restored]);
        const reset = restored.movingRefs.map(ref => api.equipmentApp.resolve(ref).object.getWorldPosition(new api.THREE.Vector3()).x);
        return { refs: restored.movingRefs, offsets, positions, reset, before };
    });
    expect(result.refs).toEqual(refs);
    expect(result.offsets).toEqual([100, 100]);
    result.positions.forEach((x, i) => expect(x).toBeCloseTo(result.before[i] + 100));
    result.reset.forEach((x, i) => expect(x).toBeCloseTo(result.before[i]));
    expect(errors).toEqual([]);
});

test('실린더의 전진·후진·센서를 IO 매핑으로 제어하고 충돌 명령을 거부한다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'CYLINDER');
    for (const [name, value] of [['feedbackHome', '512'], ['feedbackEnd', '513']]) {
        await page.locator(`#equipment-form [name="${name}"]`).fill('');
        await page.locator(`#equipment-form [name="${name}"]`).fill(value);
    }
    await page.locator('#equipment-form button[type="submit"]').click();
    await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
    await page.locator('#equipment-close').click();
    await page.locator('#io-function-mapping-action').selectOption('CYLINDER');
    await expect(page.locator('#io-function-mapping-direction')).toHaveValue('OUT');
    await expect(page.locator('#io-function-mapping-direction')).toBeDisabled();
    await page.locator('#io-function-mapping-address').fill('');
    await page.locator('#io-function-mapping-address').fill('514');
    await page.locator('#io-function-mapping-add').click();
    await page.locator('#io-equipment-command').selectOption('REVERSE');
    await page.locator('#io-function-mapping-address').fill('');
    await page.locator('#io-function-mapping-address').fill('515');
    await page.locator('#io-function-mapping-add').click();
    await page.locator('#io-function-mapping-close').click();
    await page.evaluate(() => window.__equipment.writeOlpAddress('Out[514]', 1));
    await expect.poll(() => page.evaluate(() => window.__equipment.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0].runtime.position)).toBe(100);
    expect(await page.evaluate(() => [window.__equipment.readOlpSimulatorBit('IN', 512), window.__equipment.readOlpSimulatorBit('IN', 513)])).toEqual([0, 1]);
    await page.evaluate(() => window.__equipment.writeOlpAddress('Out[515]', 1));
    await expect.poll(() => page.evaluate(() => [...window.__equipment.equipmentApp.runtime.status.values()][0]?.error)).toContain('동시에');
    await page.evaluate(() => window.__equipment.writeOlpAddress('Out[514]', 0));
    await expect.poll(() => page.evaluate(() => window.__equipment.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0].runtime.position)).toBe(0);
    expect(await page.evaluate(() => window.__equipment.readOlpSimulatorBit('IN', 512))).toBe(1);
    expect(errors).toEqual([]);
});

test('상위 모델·하위 부품의 이중 이동을 막고 이동 중 부품 추가 시 기준 위치를 보존한다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'LINEAR_AXIS');
    const result = await page.evaluate(() => {
        const api = window.__equipment, app = api.equipmentApp;
        let def = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0];
        const root = app.resolve(def.movingRef).object;
        // Represent a CAD assembly with its selectable child part.
        root.userData.importedParts = [root.children[0]];
        const childRef = app.references().find(ref => ref.value.startsWith(def.movingRef.replace('/-1', '/')) && ref.value !== def.movingRef).value;
        const child = app.resolve(childRef).object;
        const world = object => object.getWorldPosition(new api.THREE.Vector3()).x;
        const before = [world(root), world(child)];
        app.save({ ...def, movingRefs: [def.movingRef, childRef] });
        def = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0];
        def.runtime.position = 100; app.runtime.apply(def, 0);
        const moved = [world(root), world(child)];
        const extra = api.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '추가 치구' });
        extra.position.set(350, 150, 20); api.state.scene.add(extra); api.state.models.push(extra);
        const ref = `equipment-model:${api.ensureWorkspaceModelId(extra)}/-1`;
        app.save({ ...def, movingRefs: [...def.movingRefs, ref] });
        def = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0];
        const afterAdd = [world(root), world(child), world(extra), def.runtime.position];
        def.runtime.position = 200; app.runtime.apply(def, 0);
        const continued = [world(root), world(child), world(extra)];
        app.runtime.reset([def]);
        const reset = [world(root), world(child), world(extra)];
        app.runtime.start();
        const collision = app.collision([{ objectA: extra, objectB: root }], true);
        const expected = app.expectedContact({ objectA: extra, objectB: root });
        const extraCollision = app.collision([{ objectA: extra, objectB: new api.THREE.Group() }], true);
        return { before, moved, afterAdd, continued, reset, collision, expected, extraCollision };
    });
    expect(result.moved).toEqual(result.before.map(x => x + 100));
    expect(result.afterAdd).toEqual([...result.moved, 350, 100]);
    expect(result.continued).toEqual([...result.before.map(x => x + 200), 450]);
    expect(result.reset).toEqual([...result.before, 250]);
    expect(result.expected).toBe(true); expect(result.collision).toBe(false);
    expect(result.extraCollision).toBe(true);
    expect(errors).toEqual([]);
});

test('회전 축의 여러 탑재물과 그리퍼 양쪽의 여러 부품을 선택해 함께 움직인다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'ROTARY_AXIS');
    await createEquipmentFixture(page, 'GRIPPER');
    const refs = await page.evaluate(() => {
        const api = window.__equipment;
        const add = (name, xyz) => {
            const model = api.createPrimitiveShapeRoot('box', { x: 10, y: 10, z: 10 }, { name });
            model.position.fromArray(xyz); api.state.scene.add(model); api.state.models.push(model);
            return `equipment-model:${api.ensureWorkspaceModelId(model)}/-1`;
        };
        const [rotary, grip] = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT');
        return { rotary: rotary.id, grip: grip.id, carried: [rotary.carriedRef, add('추가 탑재물', [0, 45, 40])],
            right: [grip.movingRef, add('오른쪽 손가락 부품', [645, 0, 100])], left: [grip.secondRef, add('왼쪽 손가락 부품', [555, 0, 100])] };
    });
    await page.locator(`[data-equipment-id="${refs.rotary}"] [data-equipment-command="EDIT"]`).click();
    await setEquipmentParts(page, 'carriedRef', refs.carried);
    await page.locator('#equipment-form button[type="submit"]').click();
    await page.locator(`[data-equipment-id="${refs.grip}"] [data-equipment-command="EDIT"]`).click();
    await setEquipmentParts(page, 'movingRef', refs.right);
    await setEquipmentParts(page, 'secondRef', refs.left);
    await page.locator('#equipment-form button[type="submit"]').click();
    await expect(page.locator('#equipment-error')).toContainText('저장했습니다');
    const result = await page.evaluate(() => {
        const api = window.__equipment, app = api.equipmentApp;
        const [rotary, grip] = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT');
        app.runtime.start(); app.runtime.lastTime = 0;
        for (const def of [rotary, grip]) app.runtime.manual.set(def.id, 'FORWARD');
        for (let i = 1; i <= 150; i++) app.runtime.update([rotary, grip], [], i * 1000 / 60);
        app.runtime.stop();
        const positions = list => list.map(ref => app.resolve(ref).object.getWorldPosition(new api.THREE.Vector3()).toArray());
        const closed = { right: positions(grip.movingRefs), left: positions(grip.secondRefs), held: !!grip.runtime.heldRef };
        app.runtime.reset([grip]);
        return { carried: positions(rotary.carriedRefs), closed, open: { right: positions(grip.movingRefs), left: positions(grip.secondRefs) }, error: app.runtime.status.get(rotary.id)?.error };
    });
    expect(result.carried[0][0]).toBeCloseTo(0); expect(result.carried[0][1]).toBeCloseTo(45);
    expect(result.carried[1][0]).toBeCloseTo(-45); expect(result.carried[1][1]).toBeCloseTo(0);
    expect(result.closed.held).toBe(true);
    for (const part of result.closed.right) expect(part[0]).toBeCloseTo(625);
    for (const part of result.closed.left) expect(part[0]).toBeCloseTo(575);
    for (const part of result.open.right) expect(part[0]).toBeCloseTo(645);
    for (const part of result.open.left) expect(part[0]).toBeCloseTo(555);
    expect(result.error).toBe(''); expect(errors).toEqual([]);
});

test('외부 축·그리퍼·필름을 IO 매핑으로 운전하고 완전 박리 후 해제한다', async ({ page }) => {
    const errors = await setup(page);
    const types = ['LINEAR_AXIS', 'ROTARY_AXIS', 'GRIPPER', 'FILM_PEEL'];
    for (const type of types) await createEquipmentFixture(page, type);
    await page.locator('#equipment-form [name="speed"]').fill('');
    await page.locator('#equipment-form [name="speed"]').fill('300');
    await page.locator('#equipment-form button[type="submit"]').click();
    await page.locator('#equipment-close').click();
    for (const [index, type] of types.entries()) {
        await page.locator('#io-function-mapping-action').selectOption(type);
        await expect(page.locator('#io-function-mapping-direction')).toHaveValue('OUT');
        await expect(page.locator('#io-function-mapping-direction')).toBeDisabled();
        await page.locator('#io-function-mapping-address').fill('');
        await page.locator('#io-function-mapping-address').fill(String(600 + index));
        await page.locator('#io-function-mapping-add').click();
    }
    await page.locator('#io-equipment-command').selectOption('RELEASE');
    await page.locator('#io-function-mapping-address').fill('');
    await page.locator('#io-function-mapping-address').fill('620');
    await page.locator('#io-function-mapping-add').click();
    await page.locator('#io-function-mapping-close').click();
    await page.evaluate(() => { for (let bit = 600; bit <= 603; bit++) window.__equipment.writeOlpAddress(`Out[${bit}]`, 1); });
    await expect.poll(() => page.evaluate(() => window.__equipment.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT').map(def => def.runtime.position))).toEqual([200, 90, 50, 300]);
    await page.evaluate(() => { for (let bit = 600; bit <= 603; bit++) window.__equipment.writeOlpAddress(`Out[${bit}]`, 0); window.__equipment.writeOlpAddress('Out[620]', 1); });
    await expect.poll(() => page.evaluate(() => window.__equipment.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[3].runtime.released)).toBe(true);
    const high = await page.evaluate(() => Math.max(...window.__equipment.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[3].runtime.film.points.map(p => p[2])));
    await expect.poll(() => page.evaluate(() => Math.max(...window.__equipment.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[3].runtime.film.points.map(p => p[2])))).toBeLessThan(high - 5);
    expect(errors).toEqual([]);
});

test('로봇에 부착되지 않은 설비는 다른 고정 모델과 겹쳐도 충돌로 정지하지 않는다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'CYLINDER');
    await page.evaluate(() => {
        const api = window.__equipment;
        const obstacle = api.createPrimitiveShapeRoot('box', { x: 40, y: 40, z: 40 });
        obstacle.position.set(160, 0, 10);
        api.state.scene.add(obstacle); api.state.models.push(obstacle); api.markSceneCollisionDirty(obstacle);
    });
    await page.locator('#equipment-close').click();
    await page.locator('#io-function-mapping-close').click();
    await page.locator('#btn-toggle-collision').click();
    await page.locator('#io-function-mapping-button').click();
    await page.locator('#io-equipment-settings').click();
    await page.locator('[data-equipment-command="FORWARD"]').click();
    await expect.poll(() => page.evaluate(() => window.__equipment.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0].runtime.position)).toBe(100);
    expect(await page.evaluate(() => [...window.__equipment.equipmentApp.runtime.status.values()][0]?.phase)).not.toBe('충돌 정지');
    const position = await page.evaluate(() => window.__equipment.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0].runtime.position);
    expect(position).toBe(100);
    expect(errors).toEqual([]);
});

test('외부 축과 그리퍼의 실제 가동부·파지·해제 및 저장 복원을 검증한다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'LINEAR_AXIS');
    await createEquipmentFixture(page, 'ROTARY_AXIS');
    await createEquipmentFixture(page, 'GRIPPER');
    const result = await page.evaluate(() => {
        const { state, equipmentApp: app } = window.__equipment;
        const [linear, rotary, grip] = state.equipmentDefinitions.filter(def => def.type !== 'OBJECT');
        app.runtime.start(); app.runtime.manual.set(linear.id, 'FORWARD'); app.runtime.manual.set(rotary.id, 'FORWARD'); app.runtime.manual.set(grip.id, 'FORWARD');
        app.runtime.lastTime = 0;
        for (let frame = 1; frame <= 150; frame++) app.runtime.update(state.equipmentDefinitions.filter(def => def.type !== 'OBJECT'), [], frame * 1000 / 60);
        app.runtime.stop();
        return {
            linear: [app.resolve(linear.movingRef).object.position.x, app.resolve(linear.carriedRef).object.position.x],
            rotary: app.resolve(rotary.carriedRef).object.position.toArray(),
            held: grip.runtime.heldRef, contact: grip.runtime.position,
            errors: [...app.runtime.status.values()].map(status => status.error)
        };
    });
    expect(result.linear).toEqual([100, 100]);
    expect(result.rotary[0]).toBeCloseTo(600); expect(result.rotary[1]).toBeCloseTo(45);
    expect(result.held).not.toBe(''); expect(result.contact).toBeCloseTo(50);
    expect(result.errors.every(error => !error)).toBe(true);
    const restored = await page.evaluate(async () => {
        const api = window.__equipment;
        const snapshot = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        await api.restoreWorkspaceSnapshot(snapshot);
        const grip = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT').find(def => def.type === 'GRIPPER');
        const body = api.equipmentApp.resolve(grip.bodyRef).object;
        body.position.x += 100;
        api.equipmentApp.runtime.apply(grip, 0);
        const held = api.equipmentApp.resolve(grip.runtime.heldRef).object;
        const following = held.position.x;
        api.equipmentApp.runtime.manual.set(grip.id, 'REVERSE'); api.equipmentApp.runtime.start(); api.equipmentApp.runtime.lastTime = 0;
        for (let frame = 1; frame <= 90; frame++) api.equipmentApp.runtime.update(api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT'), [], frame * 1000 / 60);
        api.equipmentApp.runtime.stop();
        return { following, held: grip.runtime.heldRef, owner: held.userData.equipmentOwner || '', position: held.position.x };
    });
    expect(restored.following).toBeCloseTo(1300);
    expect(restored.held).toBe(''); expect(restored.owner).toBe(''); expect(restored.position).toBeCloseTo(1300);
    await page.screenshot({ path: test.info().outputPath('equipment-tests.png') });
    expect(errors).toEqual([]);
});

test('필름이 곡면으로 박리되고 정지·초기화·저장·복구된다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'FILM_PEEL');
    const shape = await page.evaluate(() => {
        const { state, equipmentApp: app } = window.__equipment;
        const def = state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0];
        app.runtime.manual.set(def.id, 'FORWARD'); app.runtime.start(); app.runtime.lastTime = 0;
        for (let frame = 1; frame <= 120; frame++) app.runtime.update(state.equipmentDefinitions.filter(def => def.type !== 'OBJECT'), [], frame * 1000 / 60);
        app.runtime.stop();
        return { position: def.runtime.position, maxZ: Math.max(...def.runtime.film.points.map(p => p[2])), error: app.runtime.status.get(def.id)?.error };
    });
    expect(shape.position).toBeCloseTo(60); expect(shape.maxZ).toBeGreaterThan(10); expect(shape.error).toBe('');
    await page.locator('#equipment-close').click();
    await page.locator('#io-function-mapping-close').click();
    await page.screenshot({ path: test.info().outputPath('film-peeling.png') });
    const restored = await page.evaluate(async () => {
        const api = window.__equipment;
        const snapshot = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        const before = snapshot.equipmentDefinitions[0].runtime.film.points;
        await api.restoreWorkspaceSnapshot(snapshot);
        const def = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0];
        const after = def.runtime.film.points;
        const equal = JSON.stringify(before) === JSON.stringify(after);
        const paused = api.equipmentApp.runtime.suspended;
        api.equipmentApp.runtime.reset(api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT'));
        return { equal, paused, position: def.runtime.position, meshes: api.equipmentApp.resolve(def.movingRef).object.children.filter(child => child.name === 'equipment-film-mesh').length };
    });
    expect(restored).toEqual({ equal: true, paused: true, position: 0, meshes: 1 });
    expect(errors).toEqual([]);
});

test('박리는 끝까지 부착 구간을 유지하고 완료 후 필름 놓기로만 떨어진다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'FILM_PEEL');
    const result = await page.evaluate(() => {
        const { state, equipmentApp: app, readOlpSimulatorBit } = window.__equipment;
        const def = state.equipmentDefinitions[0];
        def.feedbackEnd = 512;
        app.runtime.stop(); app.runtime.reset([def]);
        const flat = def.runtime.film.points.every(p => p[2] === 0);
        def.runtime.position = 150; app.runtime.apply(def, 1 / 60);
        const halfway = structuredClone(def.runtime.film.points);
        def.runtime.position = 150.5; app.runtime.apply(def, 1 / 60);
        const smooth = def.runtime.film.points[0][2] > halfway[0][2];
        def.runtime.position = def.filmLength - 0.005; app.runtime.apply(def, 1 / 60);
        const tail = def.runtime.film.points.slice(-7);
        app.runtime.writeFeedback(def, true);
        const prematureCompletion = readOlpSimulatorBit('IN', 512);
        app.runtime.manual.set(def.id, 'RELEASE'); app.runtime.start(); app.runtime.lastTime = 0;
        app.runtime.update([def], [], 1000 / 60);
        const blocked = { released: !!def.runtime.released, error: app.runtime.status.get(def.id)?.error };
        app.runtime.manual.set(def.id, 'FORWARD');
        app.runtime.update([def], [], 2000 / 60);
        const edge = [...def.runtime.film.points[0]];
        app.runtime.manual.set(def.id, 'STOP');
        for (let i = 3; i <= 62; i++) app.runtime.update([def], [], i * 1000 / 60);
        const held = JSON.stringify(edge) === JSON.stringify(def.runtime.film.points[0]);
        app.runtime.manual.set(def.id, 'RELEASE');
        app.runtime.update([def], [], 63000 / 60); app.runtime.stop();
        return { flat, smooth, tail, blocked, prematureCompletion, completed: readOlpSimulatorBit('IN', 512), position: def.runtime.position, held, released: def.runtime.released, fell: def.runtime.film.points[0][2] < edge[2] };
    });
    expect(result.flat).toBe(true); expect(result.smooth).toBe(true);
    expect(result.tail.every(p => p[0] === 300 && p[2] === 0)).toBe(true);
    expect(result.blocked.released).toBe(false); expect(result.blocked.error).toContain('완전히');
    expect(result.prematureCompletion).toBe(0); expect(result.completed).toBe(1);
    expect(result.position).toBe(300); expect(result.held).toBe(true);
    expect(result.released).toBe(true); expect(result.fell).toBe(true);
    await page.locator('#equipment-close').click(); await page.locator('#io-function-mapping-close').click();
    await page.evaluate(() => {
        const { state, equipmentApp: app } = window.__equipment;
        app.runtime.reset([state.equipmentDefinitions[0]]);
        state.equipmentDefinitions[0].runtime.position = 150;
        app.runtime.apply(state.equipmentDefinitions[0], 1 / 60);
        document.querySelector('#empty-state').style.display = 'none';
        document.querySelector('#io-simulator-panel').style.display = 'none';
        state.camera.position.set(-150, -600, 380); state.controls.target.set(0, 0, 65); state.controls.update();
    });
    await page.screenshot({ path: test.info().outputPath('film-peeling-halfway.png') });
    expect(errors).toEqual([]);
});

test('같은 필름의 여러 손잡이 중 가까운 곳을 그리퍼로 잡아 벗기고 모든 손잡이를 함께 복원한다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'FILM_PEEL');
    await createEquipmentFixture(page, 'GRIPPER');
    const refs = await page.evaluate(() => {
        const api = window.__equipment, app = api.equipmentApp;
        const [film, grip] = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT');
        const positions = [[-160,-25,10.5],[-160,25,10.5],[160,-25,10.5],[160,25,10.5],[-100,-60,10.5],[100,-60,10.5],[-100,60,10.5],[100,60,10.5]];
        const tabs = positions.map((position, index) => {
            const tab = api.createPrimitiveShapeRoot('box', {x:12,y:12,z:0.5}, {name:'필름 손잡이 '+(index+1),materialColor:'#ef4444'});
            tab.position.fromArray(position); api.state.scene.add(tab); api.state.models.push(tab);
            return 'equipment-model:'+api.ensureWorkspaceModelId(tab)+'/-1';
        });
        const saved = app.save({...film, filmGripRefs:tabs, filmGripRef:tabs[0], pullerRef:grip.bodyRef, filmGripWidth:12, speed:300});
        const body = app.resolve(grip.bodyRef).object;
        grip.feedbackGrip=514;
        body.position.set(160-grip.gripCenter[0],25-grip.gripCenter[1],10.5-grip.gripCenter[2]); body.updateMatrixWorld(true);
        return {film:saved.id,grip:grip.id,tabs};
    });
    await page.evaluate(({film}) => window.__equipment.equipmentApp.ui.edit(window.__equipment.state.equipmentDefinitions.find(def=>def.id===film)), refs);
    await expect(page.locator('[data-equipment-role="filmGripRef"] input[type="checkbox"]:checked')).toHaveCount(8);
    const result = await page.evaluate(({film:filmId,grip:gripId,tabs}) => {
        const api = window.__equipment, app = api.equipmentApp;
        const film = api.state.equipmentDefinitions.find(def=>def.id===filmId), grip = api.state.equipmentDefinitions.find(def=>def.id===gripId);
        const body = app.resolve(grip.bodyRef).object;
        const initialTabs = tabs.map(ref=>app.resolve(ref).object.getWorldPosition(new api.THREE.Vector3()).toArray());
        app.runtime.manual.set(film.id,'FORWARD'); app.runtime.start(); app.runtime.lastTime=0;
        app.runtime.update([film,grip],[],1000/60);
        const waiting = {position:film.runtime.position,phase:app.runtime.status.get(film.id).phase};
        grip.runtime.position=100; app.runtime.apply(grip,0);
        app.runtime.apply(film,0);
        const active=film.runtime.filmActiveTab;
        app.runtime.update([film,grip],[],2000/60);
        const stationary=film.runtime.position;
        const initialBody=body.position.clone();
        for(let i=1;i<=60;i++){
            const peel=i*5;
            body.position.copy(initialBody).add(new api.THREE.Vector3(-peel*0.5,0,peel*Math.sqrt(0.75))); body.updateMatrixWorld(true);
            app.runtime.update([film,grip],[],(i+2)*1000/60);
            if(app.runtime.status.get(film.id)?.error)throw Error(app.runtime.status.get(film.id).error);
            if(i===30)api.filmHalfSnapshot=JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        }
        app.runtime.stop();
        const held=film.runtime.filmGripped;
        const selectedTab=app.resolve(active).object.getWorldPosition(new api.THREE.Vector3());
        const contact=new api.THREE.Vector3(...grip.gripCenter).applyMatrix4(body.matrixWorld);
        const sameFilm=api.state.equipmentDefinitions.filter(def=>def.type==='FILM_PEEL').length;
        const moved=tabs.map((ref,i)=>app.resolve(ref).object.getWorldPosition(new api.THREE.Vector3()).distanceTo(new api.THREE.Vector3(...initialTabs[i]))>0.1);
        const position=film.runtime.position;
        const meshCount=app.resolve(film.movingRef).object.children.filter(child=>child.name==='equipment-film-mesh').length;
        return {waiting,stationary,active,held,position,contactError:selectedTab.distanceTo(contact),sameFilm,moved,meshCount,gap:grip.openWidth-(grip.openWidth-grip.closedWidth)*grip.runtime.position/grip.travel,gripInput:api.readOlpSimulatorBit('IN',514),finite:film.runtime.film.points.flat().every(Number.isFinite)};
    },refs);
    expect(result.waiting).toEqual({position:0,phase:'손잡이 파지 대기'});
    expect(result.active).toBe(refs.tabs[3]); expect(result.held).toBe(true);
    expect(result.stationary).toBe(0);expect(result.gap).toBeCloseTo(12);expect(result.gripInput).toBe(1);
    expect(result.position).toBe(300); expect(result.contactError,JSON.stringify(result)).toBeLessThan(1);
    expect(result.sameFilm).toBe(1); expect(result.meshCount).toBe(1); expect(result.finite).toBe(true);
    expect(result.moved.every(Boolean)).toBe(true);
    await page.evaluate(async () => {
        const api=window.__equipment;api.filmFullSnapshot=JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        await api.restoreWorkspaceSnapshot(api.filmHalfSnapshot);
        for(const id of ['equipment-dialog','io-function-mapping-dialog','io-simulator-panel','empty-state'])document.getElementById(id).style.display='none';
        api.state.camera.position.set(-300,-600,400);api.state.controls.target.set(0,0,100);api.state.controls.update();
    });
    await page.screenshot({path:test.info().outputPath('film-gripper-tabs.png')});
    await page.evaluate(async()=>{const api=window.__equipment;await api.restoreWorkspaceSnapshot(api.filmFullSnapshot);});
    const restored = await page.evaluate(async () => {
        const api = window.__equipment;
        const snapshot=JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        const before=snapshot.equipmentDefinitions.find(def=>def.type==='FILM_PEEL');
        await api.restoreWorkspaceSnapshot(snapshot);
        const film=api.state.equipmentDefinitions.find(def=>def.type==='FILM_PEEL');
        const equal=JSON.stringify(before.runtime.film.points)===JSON.stringify(film.runtime.film.points);
        const grip=api.state.equipmentDefinitions.find(def=>def.type==='GRIPPER');
        grip.runtime.position=0; api.equipmentApp.runtime.apply(grip,0);
        api.equipmentApp.runtime.manual.set(film.id,'STOP');api.equipmentApp.runtime.start();api.equipmentApp.runtime.lastTime=0;
        api.equipmentApp.runtime.update([grip,film],[],1000/60);api.equipmentApp.runtime.update([grip,film],[],2000/60);api.equipmentApp.runtime.stop();
        return {equal,count:film.filmGripRefs.length,released:film.runtime.released};
    });
    expect(restored).toEqual({equal:true,count:8,released:true});
    const allGrips = await page.evaluate(({tabs}) => {
        const api=window.__equipment,app=api.equipmentApp;
        const film=api.state.equipmentDefinitions.find(def=>def.type==='FILM_PEEL'),grip=api.state.equipmentDefinitions.find(def=>def.type==='GRIPPER');
        const body=app.resolve(grip.bodyRef).object;
        return tabs.map(ref=>{
            app.runtime.reset([film,grip]);
            const contact=new api.THREE.Box3().setFromObject(app.resolve(ref).object).getCenter(new api.THREE.Vector3());
            body.position.copy(contact).sub(new api.THREE.Vector3(...grip.gripCenter));body.updateMatrixWorld(true);
            grip.runtime.position=100;app.runtime.apply(grip,0);app.runtime.apply(film,0);
            const layout=film.origins.filmLayout;
            const flatBounds=app.resolve(film.movingRef).object.getObjectByName('equipment-film-mesh').geometry.boundingBox.clone();
            const basis=new api.THREE.Matrix4().makeRotationZ(layout.angle);
            body.position.add(new api.THREE.Vector3(2.5,0,5*Math.sqrt(0.75)).applyMatrix4(basis));body.updateMatrixWorld(true);
            app.runtime.manual.set(film.id,'FORWARD');app.runtime.start();app.runtime.lastTime=0;app.runtime.update([film,grip],[],1000/60);app.runtime.stop();
            const geometry=app.resolve(film.movingRef).object.getObjectByName('equipment-film-mesh').geometry;
            return {active:film.runtime.filmActiveTab,side:layout.side,travel:film.travel,position:film.runtime.position,error:app.runtime.status.get(film.id)?.error,flatMin:flatBounds.min.toArray(),flatMax:flatBounds.max.toArray(),bounds:geometry.boundingBox.max.toArray()};
        });
    },refs);
    for(let i=0;i<8;i++){
        expect(allGrips[i].active).toBe(refs.tabs[i]);
        expect(allGrips[i].side).toBe(['X-','X-','X+','X+','Y-','Y-','Y+','Y+'][i]);
        expect(allGrips[i].travel).toBe(i<4?300:100);expect(allGrips[i].position).toBeCloseTo(5);
        expect(allGrips[i].error).toBe('');
        for(let k=0;k<3;k++){expect(allGrips[i].flatMin[k]).toBeCloseTo([-150,-50,0.25][k]);expect(allGrips[i].flatMax[k]).toBeCloseTo([150,50,0.25][k]);}
    }
    const removed=await page.evaluate(()=>{
        const api=window.__equipment,app=api.equipmentApp;
        const film=api.state.equipmentDefinitions.find(def=>def.type==='FILM_PEEL'),grip=api.state.equipmentDefinitions.find(def=>def.type==='GRIPPER');
        app.remove(film.id);
        return {owner:grip.runtime.filmGripOwner||'',mesh:!!app.resolve(film.movingRef).object.getObjectByName('equipment-film-mesh'),tabs:film.origins.filmTabs.map(source=>app.resolve(source.ref).object.position.toArray())};
    });
    expect(removed.owner).toBe('');expect(removed.mesh).toBe(false);
    expect(removed.tabs).toEqual([[-160,-25,10.5],[-160,25,10.5],[160,-25,10.5],[160,25,10.5],[-100,-60,10.5],[100,-60,10.5],[-100,60,10.5],[100,60,10.5]]);
    expect(errors).toEqual([]);
});

test('실제 로봇 E축으로 테이블과 로봇을 함께 이동하고 이중 이동을 막는다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'LINEAR_AXIS');
    await page.locator('#equipment-close').click();
    await page.locator('#io-function-mapping-close').click();
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__equipment.state.models.some(model => model.userData.tcpFrame));
    const result = await page.evaluate(() => {
        const api = window.__equipment, app = api.equipmentApp;
        const robot = api.state.models.find(model => model.userData.tcpFrame);
        const ref = `equipment-model:${api.ensureWorkspaceModelId(robot)}/-1`;
        const def = { ...api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0], robotRef: ref, carriedRef: ref, externalAxis: 1 };
        app.save(def);
        const before = robot.position.x;
        const tcpBefore = robot.userData.tcpFrame.getWorldPosition(new api.THREE.Vector3()).x;
        api.applyRobotTravelAxis(robot, [50, 0, 0, 0, 0, 0]);
        app.runtime.lastTime = 0; app.runtime.update(api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT'), [], 1000 / 60);
        app.runtime.stop();
        return { travel: robot.position.x - before, tcpTravel: robot.userData.tcpFrame.getWorldPosition(new api.THREE.Vector3()).x - tcpBefore,
            platform: app.resolve(def.movingRef).object.position.x, axes: api.getRobotExternalAxes(robot), error: app.runtime.status.get(def.id)?.error };
    });
    expect(result.travel).toBeCloseTo(50); expect(result.tcpTravel).toBeCloseTo(50);
    expect(result.platform).toBeCloseTo(-50); expect(result.axes[0]).toBe(50); expect(result.error).toBe('');
    expect(errors).toEqual([]);
});

test('그리퍼 반복 동작, 충돌 정지, 필름 프레임률 독립성을 확인한다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'GRIPPER');
    await createEquipmentFixture(page, 'FILM_PEEL');
    const result = await page.evaluate(() => {
        const { state, equipmentApp: app } = window.__equipment;
        const [grip, film] = state.equipmentDefinitions.filter(def => def.type !== 'OBJECT');
        const count = state.models.length;
        let timestamp = 0;
        app.runtime.start(); app.runtime.lastTime = timestamp;
        for (let cycle = 0; cycle < 100; cycle++) {
            app.runtime.manual.set(grip.id, 'FORWARD');
            for (let i = 0; i < 60; i++) app.runtime.update([grip], [], timestamp += 1000 / 60);
            if (!grip.runtime.heldRef) throw new Error('반복 파지 실패');
            app.runtime.manual.set(grip.id, 'REVERSE');
            for (let i = 0; i < 60; i++) app.runtime.update([grip], [], timestamp += 1000 / 60);
            if (grip.runtime.heldRef) throw new Error('반복 해제 실패');
        }
        const moving = app.resolve(grip.movingRef).object, obstacle = app.resolve(film.bodyRef).object;
        const stopped = app.collision([{ objectA: moving, objectB: obstacle }], true);
        const suspended = app.runtime.suspended;
        const initial = JSON.parse(JSON.stringify(film));
        const shapes = [];
        for (const fps of [30, 60, 120]) {
            const def = JSON.parse(JSON.stringify(initial));
            app.runtime.restore([def]); app.runtime.manual.set(def.id, 'FORWARD'); app.runtime.start(); app.runtime.lastTime = 0;
            for (let i = 1; i <= fps; i++) app.runtime.update([def], [], i * 1000 / fps);
            shapes.push(JSON.stringify(def.runtime.film.points));
        }
        app.runtime.stop();
        return { countBefore: count, countAfter: state.models.length, stopped, suspended, shapesEqual: shapes.every(shape => shape === shapes[0]), gripPosition: grip.runtime.position };
    });
    expect(result.countAfter).toBe(result.countBefore); expect(result.gripPosition).toBeCloseTo(0);
    expect(result.stopped).toBe(true); expect(result.suspended).toBe(true); expect(result.shapesEqual).toBe(true);
    expect(errors).toEqual([]);
});

test('로봇에 연결한 그리퍼와 공작물은 툴을 따라가고 해제 위치를 유지한다', async ({ page }) => {
    const errors = await setup(page);
    await createEquipmentFixture(page, 'GRIPPER');
    await page.locator('#equipment-close').click();
    await page.locator('#io-function-mapping-close').click();
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__equipment.state.models.some(model => model.userData.tcpFrame));
    const result = await page.evaluate(() => {
        const api = window.__equipment, app = api.equipmentApp;
        const robot = api.state.models.find(model => model.userData.tcpFrame);
        app.save({ ...api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0], robotRef: `equipment-model:${api.ensureWorkspaceModelId(robot)}/-1` });
        const def = api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT')[0];
        app.runtime.manual.set(def.id, 'FORWARD'); app.runtime.start(); app.runtime.lastTime = 0;
        for (let i = 1; i <= 60; i++) app.runtime.update(api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT'), [], i * 1000 / 60);
        const held = app.resolve(def.runtime.heldRef).object;
        const parented = held.userData.attachmentHost === robot;
        app.runtime.stop();
        api.applyRobotTravelAxis(robot, [50, 0, 0, 0, 0, 0]);
        app.runtime.manual.set(def.id, 'STOP'); app.runtime.start(); app.runtime.lastTime = 0;
        app.runtime.update(api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT'), [], 1000 / 60);
        const moved = held.getWorldPosition(new api.THREE.Vector3()).x;
        const body = app.resolve(def.bodyRef).object.position.x;
        app.runtime.manual.set(def.id, 'REVERSE');
        for (let i = 2; i <= 90; i++) app.runtime.update(api.state.equipmentDefinitions.filter(def => def.type !== 'OBJECT'), [], i * 1000 / 60);
        app.runtime.stop();
        return { parented, moved, body, released: !def.runtime.heldRef, placement: held.userData.placement, after: held.getWorldPosition(new api.THREE.Vector3()).x };
    });
    expect(result.parented).toBe(true); expect(result.moved).toBeCloseTo(50); expect(result.body).toBeCloseTo(50);
    expect(result.released).toBe(true); expect(result.placement).toBe('scene'); expect(result.after).toBeCloseTo(50);
    expect(errors).toEqual([]);
});
