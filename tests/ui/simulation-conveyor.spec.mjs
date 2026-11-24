import { createConveyorFixture } from './helpers/equipment-fixtures.mjs';
import { test, expect } from '@playwright/test';

test('컨베이어 이송에서 제품 수가 늘어도 등록 목록 조회 횟수는 일정하고 충돌은 원래 모델에서 갱신된다', async ({ page }) => {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() +
            '\nwindow.__transport = { THREE, state, ensureWorkspaceModelId, equipmentApp, advanceConveyorSimulation };' });
    });
    await page.goto('/2_3DSimulation/');
    await page.waitForFunction(() => window.__transport?.state.workspaceRecovery.ready);
    const result = await page.evaluate(() => {
        const { THREE, state, ensureWorkspaceModelId, equipmentApp, advanceConveyorSimulation } = window.__transport;
        const belt = new THREE.Mesh(new THREE.BoxGeometry(1000, 100, 20));
        const assembly = new THREE.Group();
        state.scene.add(belt, assembly);
        state.models.push(belt, assembly);
        const parts = assembly.userData.importedParts = [];
        const id = ensureWorkspaceModelId(assembly);
        const mapping = { gripObjectRef: 'conveyor:' + ensureWorkspaceModelId(belt), conveyorAxis: 'X', conveyorSpeed: 100 };
        const geometry = new THREE.BoxGeometry(10, 10, 10);
        const definition = { id: 'parts', type: 'OBJECT', enabled: true, movingRefs: [] };
        state.equipmentDefinitions.push(definition);
        const originalObjects = equipmentApp.objects;
        let lookups = 0;
        equipmentApp.objects = () => { lookups++; return originalObjects(); };
        function run(count) {
            while (parts.length < count) {
                const part = new THREE.Mesh(geometry);
                part.position.set(parts.length * 15, 0, 15);
                definition.movingRefs.push('equipment-model:' + id + '/' + parts.length);
                parts.push(part);
                assembly.add(part);
            }
            const starts = parts.map(part => part.position.x);
            state.collision.dirtyRoots.clear();
            lookups = 0;
            advanceConveyorSimulation([mapping], 0.1, performance.now(), true);
            return { lookups, allMoved: parts.every((part, i) => part.position.x === starts[i] + 10),
                onlyOwnerDirty: state.collision.dirtyRoots.size === 1 && state.collision.dirtyRoots.has(assembly) };
        }
        try { return [run(1), run(20)]; }
        finally { equipmentApp.objects = originalObjects; }
    });
    expect(result.map(({ allMoved, onlyOwnerDirty }) => [allMoved, onlyOwnerDirty])).toEqual([[true, true], [true, true]]);
    expect(result[1].lookups).toBe(result[0].lookups);
});

test('IO 테스트 매핑으로 컨베이어를 운전·정지하고 끝단과 저장 설정을 확인한다', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${(await response.text()).replace('init();\n', 'window.__simulationReady = init();\n')}\nwindow.__conveyor = { state, equipmentApp, createPrimitiveShapeRoot, ensureWorkspaceModelId, updateUIStatus, openIoFunctionMappingDialog, readOlpSimulatorBit, writeOlpAddress, captureSceneSnapshot, updateConveyorSimulation, resolveConveyorBelt, THREE, moveConveyorObjects, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__conveyor);
    // Startup restores the workspace asynchronously; build the fixture only after it finishes.
    await page.evaluate(() => window.__simulationReady);
    await page.evaluate(() => window.__conveyor.openIoFunctionMappingDialog());
    await createConveyorFixture(page);
    await expect(page.locator('#io-function-mapping-action')).toHaveValue('CONVEYOR');
    await expect(page.locator('#io-function-mapping-conveyor-field')).toBeVisible();
    await expect(page.locator('#io-function-mapping-direction')).toHaveValue('OUT');
    await expect(page.locator('#io-function-mapping-direction')).toBeDisabled();
    await page.locator('#io-function-mapping-address').fill('');
    await page.locator('#io-function-mapping-address').fill('512');
    await page.locator('#io-function-mapping-conveyor-speed').fill('');
    await page.locator('#io-function-mapping-conveyor-speed').fill('100');
    await page.locator('#io-function-mapping-add').click();
    await expect(page.locator('.conveyor-mapping-settings')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('conveyor-mapping.png') });
    await page.locator('#io-function-mapping-close').click();
    const positions = () => page.evaluate(() => window.__conveyor.state.models.map(model => model.position.x));
    const before = await positions();
    expect(before).toEqual([0, -270, -150, -30]);
    await page.evaluate(() => window.__conveyor.writeOlpAddress('Out[512]', 1));
    await expect.poll(async () => (await positions())[1]).toBeGreaterThan(before[1] + 20);
    await page.evaluate(() => window.__conveyor.writeOlpAddress('Out[512]', 0));
    const stopped = await positions();
    await page.waitForTimeout(200);
    expect(await positions()).toEqual(stopped);
    expect(stopped[0]).toBe(0);
    await page.evaluate(() => window.__conveyor.openIoFunctionMappingDialog());
    await page.locator('.conveyor-mapping-settings select').selectOption('-X');
    await page.locator('.conveyor-mapping-settings input').fill('');
    await page.locator('.conveyor-mapping-settings input').fill('200');
    await page.locator('.conveyor-mapping-settings input').blur();
    const snapshot = await page.evaluate(() => window.__conveyor.captureSceneSnapshot().ioFunctionMappings);
    expect(snapshot[0]).toMatchObject({ action: 'CONVEYOR', conveyorSpeed: 200, conveyorAxis: '-X', direction: 'OUT', address: 512 });
    await page.locator('#io-function-mapping-close').click();
    await page.evaluate(() => window.__conveyor.writeOlpAddress('Out[512]', 1));
    await expect.poll(async () => (await positions())[1]).toBeLessThan(stopped[1] - 10);
    await page.evaluate(() => window.__conveyor.writeOlpAddress('Out[512]', 0));

    const restored = await page.evaluate(async () => {
        const api = window.__conveyor;
        const snapshot = JSON.parse(JSON.stringify(api.serializeWorkspaceSnapshot()));
        await api.restoreWorkspaceSnapshot(snapshot);
        return { mappings: api.state.ioFunctionMappings, positions: api.state.models.map(model => model.position.toArray()) };
    });
    expect(restored.mappings[0]).toMatchObject({ action: 'CONVEYOR', conveyorSpeed: 200, conveyorAxis: '-X' });
    expect(restored.positions).toHaveLength(4);
    await page.screenshot({ path: test.info().outputPath('conveyor-scene.png') });
    const result = await page.evaluate(() => {
        const { state, THREE, moveConveyorObjects } = window.__conveyor;
        const [belt, object, held, off] = state.models;
        belt.rotation.z = Math.PI / 2;
        object.position.set(0, 0, 30);
        held.position.set(0, 0, 30); held.userData.attachmentHost = belt;
        off.position.set(300, 0, 30);
        const mapping = { conveyorAxis: 'X', conveyorSpeed: 100 };
        moveConveyorObjects([mapping, mapping], state.models, () => belt, 1);
        const rotated = object.position.toArray();
        moveConveyorObjects([mapping], state.models, () => belt, 100);
        return { rotated, end: object.position.toArray(), held: held.position.toArray(), off: off.position.toArray() };
    });
    expect(result.rotated[0]).toBeCloseTo(0);
    expect(result.rotated[1]).toBeCloseTo(100);
    expect(result.end[1]).toBeCloseTo(380);
    expect(result.held).toEqual([0, 0, 30]);
    expect(result.off).toEqual([300, 0, 30]);
    expect(errors).toEqual([]);
});

test('IO 테스트의 Output 버튼과 매핑 사용 체크로 컨베이어를 제어한다', async ({ page }) => {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__conveyorInput = { state, equipmentApp, createPrimitiveShapeRoot, ensureWorkspaceModelId, updateUIStatus };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__conveyorInput);
    await page.locator('#btn-io-simulator').click();
    await page.locator('#io-function-mapping-button').click();
    await createConveyorFixture(page);
    await page.locator('#io-function-mapping-add').click();
    await page.locator('#io-function-mapping-close').click();
    await page.locator('[data-io-simulator-range="fieldbus"]').click();
    await page.locator('[data-io-simulator-direction="OUT"]').first().click();
    const signal = page.locator('[data-io-simulator-entry="OUT:bit:512"]');
    await signal.click();
    const x = () => page.evaluate(() => window.__conveyorInput.state.models[1].position.x);
    await expect.poll(x).toBeGreaterThan(-250);
    await signal.click();
    const stopped = await x();
    await page.waitForTimeout(150);
    expect(await x()).toBe(stopped);
    await signal.click();
    await expect.poll(x).toBeGreaterThan(stopped + 10);
    await page.locator('#io-function-mapping-button').click();
    await page.locator('[data-io-function-mapping-field="enabled"]').uncheck();
    await page.locator('#io-function-mapping-close').click();
    const disabled = await x();
    await page.waitForTimeout(150);
    expect(await x()).toBe(disabled);
});
