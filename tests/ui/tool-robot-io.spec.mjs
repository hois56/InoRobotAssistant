import { test, expect } from '@playwright/test';

test('두 로봇 Tool의 같은 512·513 신호는 컨트롤러·프로그램에서 서로 독립적으로 동작한다', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + '\nwindow.__toolIo={state,equipmentApp,THREE,createPrimitiveShapeRoot,ensureWorkspaceModelId,getArticulatedRobots,getRobotToolMountFrame,applyVirtualControllerIo,clearVirtualControllerIo,createVirtualControllerSession,registerVirtualControllerSession,writeOlpAddress,readOlpAddress,serializeWorkspaceSnapshot};' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__toolIo?.state.workspaceRecovery.ready);
    for (let i = 0; i < 2; i++) {
        await page.locator('#model-select').selectOption('robot:IR-R7H-90');
        if (i) await page.locator('#btn-add-robot-model-choice').click();
        await page.waitForFunction(n => window.__toolIo.getArticulatedRobots().length === n, i + 1);
    }
    const result = await page.evaluate(() => {
        const a = window.__toolIo, app = a.equipmentApp, robots = a.getArticulatedRobots();
        const ref = m => 'equipment-model:' + a.ensureWorkspaceModelId(m) + '/-1';
        const defs = robots.map((robot, index) => {
            const tool = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: 'Tool ' + (index + 1) });
            a.getRobotToolMountFrame(robot).add(tool); tool.userData.attachmentHost = robot; tool.userData.placement = 'tcp'; a.state.models.push(tool);
            return app.save({ id: 'tool-cylinder-' + index, type: 'CYLINDER', movingRef: ref(tool), travel: 100, speed: 1000 }, { forward: 512, reverse: 513 });
        });
        const controllers = [a.state.virtualController, a.createVirtualControllerSession()];
        controllers.forEach((controller, index) => {
            a.registerVirtualControllerSession(controller);
            Object.assign(controller, { wanted: true, status: 'streaming', targetRobotId: robots[index].userData.motionInstanceId });
        });
        let time = 0;
        const advance = () => { for (let i = 0; i < 10; i++) app.runtime.update(a.state.equipmentDefinitions, a.state.ioFunctionMappings, time += 20); };
        const send = (index, values) => a.applyVirtualControllerIo(values, 'OUT', controllers[index]);
        send(0, { 512: 1, 513: 0 }); send(1, { 512: 0, 513: 0 }); app.runtime.start(); advance();
        const firstOnly = defs.map(def => def.runtime.position);
        app.runtime.stop(); send(1, { 512: 1 }); advance();
        const secondWithUnchangedGlobal = defs.map(def => def.runtime.position);
        send(0, { 512: 0, 513: 1 }); advance();
        const oppositeDirections = defs.map(def => def.runtime.position);
        defs.forEach(def => { def.feedbackHome = 514; def.feedbackEnd = 515; }); advance();
        const feedback = robots.map(robot => a.readOlpAddress('In[515]', { robot, project: { labels: {} } }));
        controllers.forEach(controller => { controller.wanted = false; a.clearVirtualControllerIo(controller); });
        app.runtime.reset(a.state.equipmentDefinitions);
        const runtime = robot => ({ robot, project: { labels: {} } });
        a.writeOlpAddress('OutW[32]', 1, runtime(robots[0])); advance();
        const programFirstOnly = defs.map(def => def.runtime.position);
        a.writeOlpAddress('Out[512]', 0, runtime(robots[0])); advance();
        a.writeOlpAddress('Out[513]', 1, runtime(robots[1])); advance();
        const programOpposite = defs.map(def => def.runtime.position);
        const snapshot = a.serializeWorkspaceSnapshot();
        return { firstOnly, secondWithUnchangedGlobal, oppositeDirections, feedback, programFirstOnly, programOpposite,
            scopes: defs.map(def => def.ioRobotRef), expectedScopes: robots.map(ref),
            savedScopes: snapshot.equipmentDefinitions.filter(def => def.id.startsWith('tool-cylinder-')).map(def => def.ioRobotRef),
            savedBanks: snapshot.robotRuntime.map(robot => robot.equipmentIo?.OUT?.[512] ?? null) };
    });
    expect(result.firstOnly).toEqual([100, 0]);
    expect(result.secondWithUnchangedGlobal).toEqual([100, 100]);
    expect(result.oppositeDirections).toEqual([0, 100]);
    expect(result.feedback).toEqual([0, 1]);
    expect(result.programFirstOnly).toEqual([100, 0]); expect(result.programOpposite).toEqual([100, 0]);
    expect(result.scopes).toEqual(result.expectedScopes); expect(result.savedScopes).toEqual(result.expectedScopes);
    expect(result.savedBanks).toEqual([0, 0]); expect(errors).toEqual([]);
});
