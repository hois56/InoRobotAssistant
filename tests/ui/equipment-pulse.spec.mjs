import { test, expect } from '@playwright/test';
import { createEquipmentFixture } from './helpers/equipment-fixtures.mjs';

async function setup(page, type = 'CYLINDER', triggerValue = 1) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + '\nwindow.__equipment={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,normalizeEquipmentDefinition,EQUIPMENT_LABELS,writeOlpAddress,readOlpSimulatorBit,serializeWorkspaceSnapshot,restoreWorkspaceSnapshot};' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__equipment);
    const id = await createEquipmentFixture(page, type);
    await page.evaluate(({ id, triggerValue }) => {
        const a = window.__equipment, def = a.state.equipmentDefinitions.find(item => item.id === id);
        a.equipmentApp.save({ ...def, speed: def.travel, reverseSpeed: def.travel, feedbackHome: 600, feedbackEnd: 601 },
            { forward: 512, reverse: def.type === 'FILM_PEEL' ? null : 513, triggerValue });
        a.writeOlpAddress('Out[512]', 1 - triggerValue);
        a.writeOlpAddress('Out[513]', 1 - triggerValue);
        a.equipmentApp.runtime.start();
    }, { id, triggerValue });
    return { id, errors };
}

for (const type of ['CYLINDER', 'LINEAR_AXIS', 'ROTARY_AXIS', 'GRIPPER', 'FILM_PEEL']) {
    test(`${type} 신호 펄스가 끝나도 목표까지 동작한다`, async ({ page }) => {
        const { id, errors } = await setup(page, type);
        const result = await page.evaluate(id => {
            const a = window.__equipment, app = a.equipmentApp, def = a.state.equipmentDefinitions.find(item => item.id === id);
            let time = 0;
            const step = (count = 1) => { for (let i = 0; i < count; i++) app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time += 1000 / 60); };
            a.writeOlpAddress('Out[512]', 1); app.runtime.lastTime = 0; step();
            const pulsePosition = def.runtime.position;
            a.writeOlpAddress('Out[512]', 0);
            const activeAfterOff = app.active(a.state.ioFunctionMappings);
            step(90);
            const end = { position: def.runtime.position, sensor: a.readOlpSimulatorBit('IN', 601), held: !!def.runtime.heldRef };
            let home = null;
            if (def.type !== 'FILM_PEEL') {
                a.writeOlpAddress('Out[513]', 1); step(); a.writeOlpAddress('Out[513]', 0); step(90);
                home = { position: def.runtime.position, sensor: a.readOlpSimulatorBit('IN', 600), held: !!def.runtime.heldRef };
            }
            return { pulsePosition, activeAfterOff, end, home, travel: def.travel, phase: app.runtime.status.get(id).phase };
        }, id);
        expect(result.pulsePosition).toBeGreaterThan(0);
        expect(result.activeAfterOff).toBe(true);
        expect(result.end.sensor).toBe(1);
        expect(result.end.position).toBeCloseTo(type === 'GRIPPER' ? 50 : result.travel);
        if (type === 'GRIPPER') expect(result.end.held).toBe(true);
        if (result.home) expect(result.home).toEqual({ position: 0, sensor: 1, held: false });
        expect(result.phase).toBe('완료');
        expect(errors).toEqual([]);
    });
}

test('정지·충돌 명령·전체 정지·초기화는 기억한 이동을 취소한다', async ({ page }) => {
    const { id, errors } = await setup(page);
    const result = await page.evaluate(id => {
        const a = window.__equipment, app = a.equipmentApp, def = a.state.equipmentDefinitions.find(item => item.id === id);
        let time = 0;
        const step = (count = 1) => { for (let i = 0; i < count; i++) app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time += 1000 / 60); };
        const pulse = () => { a.writeOlpAddress('Out[512]', 1); step(5); a.writeOlpAddress('Out[512]', 0); step(); };
        pulse(); const beforeStop = def.runtime.position;
        app.runtime.manual.set(id, 'STOP'); step(); app.runtime.manual.delete(id); step(30);
        const stopped = def.runtime.position;
        pulse(); const beforeConflict = def.runtime.position;
        a.writeOlpAddress('Out[512]', 1); a.writeOlpAddress('Out[513]', 1); step();
        const conflictError = app.runtime.status.get(id).error;
        a.writeOlpAddress('Out[512]', 0); a.writeOlpAddress('Out[513]', 0); step(30);
        const afterConflict = def.runtime.position;
        pulse(); const beforeGlobalStop = def.runtime.position;
        app.runtime.stop(); app.runtime.start(); step(30); const afterGlobalStop = def.runtime.position;
        pulse(); app.runtime.reset(a.state.equipmentDefinitions); app.runtime.start(); step(30);
        return { beforeStop, stopped, beforeConflict, afterConflict, conflictError, beforeGlobalStop, afterGlobalStop, reset: def.runtime.position, active: app.active(a.state.ioFunctionMappings) };
    }, id);
    expect(result.beforeStop).toBeGreaterThan(0); expect(result.stopped).toBe(result.beforeStop);
    expect(result.conflictError).toContain('동시에'); expect(result.afterConflict).toBe(result.beforeConflict);
    expect(result.afterGlobalStop).toBe(result.beforeGlobalStop); expect(result.reset).toBe(0); expect(result.active).toBe(false);
    expect(errors).toEqual([]);
});

test('반대 신호는 이동 방향을 바꾸고 OFF 조건의 짧은 신호도 끝까지 동작한다', async ({ page }) => {
    const { id, errors } = await setup(page, 'CYLINDER', 0);
    const result = await page.evaluate(id => {
        const a = window.__equipment, app = a.equipmentApp, def = a.state.equipmentDefinitions.find(item => item.id === id);
        let time = 0;
        const step = count => { for (let i = 0; i < count; i++) app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time += 1000 / 60); };
        a.writeOlpAddress('Out[512]', 0); step(5); a.writeOlpAddress('Out[512]', 1); step(15);
        const advancing = def.runtime.position;
        a.writeOlpAddress('Out[513]', 0); step(2); a.writeOlpAddress('Out[513]', 1); step(90);
        return { advancing, home: def.runtime.position, sensor: a.readOlpSimulatorBit('IN', 600) };
    }, id);
    expect(result.advancing).toBeGreaterThan(20); expect(result.advancing).toBeLessThan(100);
    expect(result.home).toBe(0); expect(result.sensor).toBe(1); expect(errors).toEqual([]);
});

test('신호 OFF 후 이동 명령은 일시 정지와 프로젝트 저장·복원 뒤에도 유지된다', async ({ page }) => {
    const { id, errors } = await setup(page);
    const result = await page.evaluate(async id => {
        const a = window.__equipment, app = a.equipmentApp;
        const step = time => app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time);
        a.writeOlpAddress('Out[512]', 1); app.runtime.lastTime = 0; step(1000 / 60); a.writeOlpAddress('Out[512]', 0);
        const before = a.state.equipmentDefinitions.find(item => item.id === id).runtime.position;
        app.runtime.pause(); step(2000 / 60);
        const paused = a.state.equipmentDefinitions.find(item => item.id === id).runtime.position;
        app.runtime.pause(); step(3000 / 60); step(4000 / 60);
        const resumed = a.state.equipmentDefinitions.find(item => item.id === id).runtime.position;
        const snapshot = JSON.parse(JSON.stringify(a.serializeWorkspaceSnapshot()));
        await a.restoreWorkspaceSnapshot(snapshot); app.runtime.start(); step(0);
        for (let i = 1; i <= 90; i++) step(i * 1000 / 60);
        const def = a.state.equipmentDefinitions.find(item => item.id === id);
        return { before, paused, resumed, position: def.runtime.position, sensor: a.readOlpSimulatorBit('IN', 601) };
    }, id);
    expect(result.paused).toBe(result.before); expect(result.resumed).toBeGreaterThan(result.before);
    expect(result.position).toBe(100); expect(result.sensor).toBe(1); expect(errors).toEqual([]);
});
