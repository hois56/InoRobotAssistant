import {test, expect} from '@playwright/test';

test('S7 offline RapidMove uses the selected Tool load and the same profile during OLP playback', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({response, body: await response.text() + '\nwindow.__rapid={state,createRapidMoveState,getRobotRapidMoveOptions,ensureRobotTcpProfiles,setJointAngle,animateOlpJointMove};'});
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__rapid);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__rapid.state.models.some(m => m.userData.tcpFrame));
    const result = await page.evaluate(async () => {
        const a = window.__rapid, robot = a.state.models.find(m => m.userData.tcpFrame);
        const start = [0,-40,-20,0], target = [20,0,-60,25];
        start.forEach((v,i)=>a.setJointAngle(robot.userData.joints[i],v,false));
        const profiles = a.ensureRobotTcpProfiles(robot);
        robot.userData.activeTcpProfileIndex = 1;
        profiles[1].load = {mass:1,cog:[0,0,0],inertia:[0,0,0]};
        const plan = (settings={}) => a.createRapidMoveState(start,target,robot.userData.joints,100,a.getRobotRapidMoveOptions(robot,settings));
        const light = plan();
        robot.userData.tcpProfiles[1].load = {mass:7,cog:[100,0,0],inertia:[.02,.02,.04]};
        const heavy = plan();
        robot.userData.tcpProfiles[1].load = {mass:1,cog:[0,0,0],inertia:[0,0,0]};
        robot.userData.tcpProfiles[1].position.set(200,0,0);
        const movedTcp = plan();
        const off = plan({rapidMove:{ptp:false}});
        const cpOnly = plan({rapidMove:{cp:false,ptp:true}});
        const metrics = [];
        await a.animateOlpJointMove(robot,target,100,{motion:'MOVJ',motionOptions:{rapidMove:{ptp:true}},onProgress:m=>metrics.push(m)});
        return {planner:light.planner,light:light.durationSeconds,heavy:heavy.durationSeconds,
            movedTcp:movedTcp.durationSeconds,off:off.enabled,cpOnly:cpOnly.planner,
            last:metrics.at(-1),target,actual:robot.userData.joints.map(j=>j.angle)};
    });
    expect(result.planner).toBe('s7-rapid-dynamics');
    expect(result.heavy).toBeGreaterThan(result.light);
    expect(result.movedTcp).toBeCloseTo(result.light,10);
    expect(result.off).toBe(false);
    expect(result.cpOnly).toBe('s7-rapid-dynamics');
    expect(result.last.progress).toBe(1);
    expect(result.last.durationSeconds).toBeCloseTo(result.light,10);
    result.actual.forEach((v,i)=>expect(v).toBeCloseTo(result.target[i],7));
    expect(errors).toEqual([]);
});
