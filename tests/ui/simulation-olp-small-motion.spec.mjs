import {test,expect} from '@playwright/test';
import {setTimeout as delay} from 'node:timers/promises';

async function openRobot(page,folder) {
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nwindow.__motionPause={THREE,state,OlpRuntime,setJointAngle,getCurrentTcpPoseBase,getOlpCurrentPosition,runOlpMove,animateOlpJointMove,getOlpJointMotionSample};'});
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__motionPause?.state.workspaceRecovery.ready);
    await page.locator('#model-select').selectOption(`robot:${folder}`);
    await page.waitForFunction(folder=>window.__motionPause.state.models.some(model=>model.userData.motionModelFolder===folder&&model.userData.tcpFrame),folder);
    return errors;
}

test('R7H submillimetre and small-angle MovL commands reach their requested pose through the actual solver',async({page})=>{
    const errors=await openRobot(page,'IR-R7H-90');
    const result=await page.evaluate(async()=>{
        const a=window.__motionPause,r=a.state.models.find(model=>model.userData.motionModelFolder==='IR-R7H-90');
        [0,-30,40,0,20,0].forEach((value,i)=>a.setJointAngle(r.userData.joints[i],value,false));
        const first=a.getOlpCurrentPosition('point',{robot:r}),values=[first[0]+.4,...first.slice(1)];
        const project={programs:[],programFiles:[],pointRecords:[{kind:'point',sourceSymbol:'P',index:100,name:'Short',values}]};
        const runtime=new a.OlpRuntime(project);runtime.robot=r;
        await a.runOlpMove('MOVL','P[100]',10,project,runtime,{tool:0,wobj:0,zone:0,speedMode:'absolute'});
        const actual=a.getOlpCurrentPosition('point',runtime),translationError=new a.THREE.Vector3().fromArray(actual).distanceTo(new a.THREE.Vector3().fromArray(values));
        const rotated=[...actual];rotated[3]+=.2;project.pointRecords[0].values=rotated;
        await a.runOlpMove('MOVL','P[100]',10,project,runtime,{tool:0,wobj:0,zone:0,speedMode:'absolute'});
        const afterRotation=a.getOlpCurrentPosition('point',runtime);
        return{translationError,translated:actual[0]-first[0],rotationError:Math.abs(afterRotation[3]-rotated[3]),rotated:afterRotation[3]-actual[3]};
    });
    expect(result.translationError).toBeLessThan(.01);expect(result.translated).toBeGreaterThan(.39);
    expect(result.rotationError).toBeLessThan(.01);expect(result.rotated).toBeGreaterThan(.19);expect(errors).toEqual([]);
});

async function startLinearMotion(page) {
    await page.evaluate(() => {
        const api = window.__motionPause;
        const robot = api.state.models.find(model => model.userData.motionModelFolder === 'IR-S7-60Z20');
        const start = [-20, 70, -80, 10];
        const target = [10, 60, -110, 15];
        const setAngles = angles => angles.forEach((angle, i) => api.setJointAngle(robot.userData.joints[i], angle, false));
        setAngles(target);
        const targetPose = api.getCurrentTcpPoseBase(robot);
        setAngles(start);
        const startPose = api.getCurrentTcpPoseBase(robot);
        const runtime = new api.OlpRuntime({ programs: [], programFiles: [] });
        runtime.robot = robot;
        const playback = { robot, runtime, progress: 0, hiddenProgress: 0, status: 'moving' };
        api.linearPlayback = playback;
        api.animateOlpJointMove(robot, target, 60, {
            motion: 'MOVL', startPose, targetPose, runtime,
            motionOptions: { speedMode: 'absolute', rapidMove: { ptp: false } },
            onProgress: sample => {
                playback.progress = sample.progress;
                playback.elapsed = sample.elapsedSeconds;
                if (document.hidden) playback.hiddenProgress = sample.progress;
                if (playback.awaitingResume) {
                    playback.firstResumedElapsed = sample.elapsedSeconds;
                    playback.awaitingResume = false;
                }
            }
        }).then(result => {
            playback.status = result.interrupted ? 'interrupted' : 'finished';
            playback.endpointError = api.getCurrentTcpPoseBase(robot).position.distanceTo(targetPose.position);
        }).catch(error => { playback.status = error.message; });
    });
}

function readLinearMotion(page) {
    return page.evaluate(() => {
        const { robot, runtime, ...playback } = window.__motionPause.linearPlayback;
        return { ...playback, paused: runtime.paused, hidden: document.hidden,
            angles: robot.userData.joints.map(joint => joint.angle) };
    });
}

test('MOVL holds its pose on pause and resumes without consuming paused time', async ({page}) => {
    const errors = await openRobot(page, 'IR-S7-60Z20');
    await startLinearMotion(page);
    await expect.poll(async () => (await readLinearMotion(page)).progress).toBeGreaterThan(0.15);
    const paused = await page.evaluate(() => {
        const playback = window.__motionPause.linearPlayback;
        playback.runtime.togglePause();
        return { progress: playback.progress, elapsed: playback.elapsed,
            angles: playback.robot.userData.joints.map(joint => joint.angle) };
    });
    await delay(400);
    expect(await readLinearMotion(page)).toMatchObject({ ...paused, paused: true });
    await page.evaluate(() => {
        const playback = window.__motionPause.linearPlayback;
        playback.awaitingResume = true;
        playback.runtime.togglePause();
    });
    await expect.poll(async () => (await readLinearMotion(page)).status, { timeout: 12_000 }).toBe('finished');
    const finished = await readLinearMotion(page);
    expect(finished.firstResumedElapsed - paused.elapsed).toBeLessThan(0.25);
    expect(finished.endpointError).toBeLessThan(0.02);
    expect(errors).toEqual([]);
});

test('MOVL completes when the rendering document is hidden and animation frames stop', async ({page}) => {
    const errors = await openRobot(page, 'IR-S7-60Z20');
    await startLinearMotion(page);
    await expect.poll(async () => (await readLinearMotion(page)).progress).toBeGreaterThan(0.15);
    // Playwright keeps its pages visible. Emulate the Chromium conditions when
    // a pending animation frame is suspended during a switch to another tab.
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        const frameId = window.__motionPause.state.renderFrameRequest?.id;
        if (frameId != null) window.cancelAnimationFrame(frameId);
        window.requestAnimationFrame = () => 2147483647;
    });
    await expect.poll(async () => (await readLinearMotion(page)).status, { timeout: 15_000 }).toBe('finished');
    const finished = await readLinearMotion(page);
    expect(finished.hidden).toBe(true);
    expect(finished.hiddenProgress).toBe(1);
    expect(finished.endpointError).toBeLessThan(0.02);
    expect(errors).toEqual([]);
});

test('Pause freezes a running S7 native-profile move and resumes without consuming paused motion time',async({page})=>{
    const errors=await openRobot(page,'IR-S7-60Z20');
    const result=await page.evaluate(async()=>{
        const a=window.__motionPause,r=a.state.models.find(model=>model.userData.motionModelFolder==='IR-S7-60Z20');
        const start=[0,-30,-50,0],target=[20,10,-70,30];start.forEach((value,i)=>a.setJointAngle(r.userData.joints[i],value,false));
        const runtime=new a.OlpRuntime({programs:[],programFiles:[]});runtime.robot=r;
        const frames=[],duringPause=[];let paused=false,resumed=false,heldAngles;
        await a.animateOlpJointMove(r,target,100,{runtime,motionOptions:{rapidMove:{ptp:true},motionQueueTiming:{nextStartAt:NaN}},onProgress:metrics=>{
            frames.push({...metrics,wall:performance.now(),resumed});
            if(paused||metrics.elapsedSeconds<.08)return;
            paused=true;runtime.togglePause();heldAngles=r.userData.joints.map(joint=>joint.angle);
            const monitor=setInterval(()=>duringPause.push({angles:r.userData.joints.map(joint=>joint.angle),sample:a.getOlpJointMotionSample(r)}),10);
            setTimeout(()=>{clearInterval(monitor);resumed=true;runtime.togglePause();},150);
        }});
        const lastBefore=frames.findLast(frame=>!frame.resumed),firstAfter=frames.find(frame=>frame.resumed);
        return{paused,count:duringPause.length,heldAngles,
            samples:duringPause,activeGap:firstAfter?.elapsedSeconds-lastBefore?.elapsedSeconds,
            wallGap:(firstAfter?.wall-lastBefore?.wall)/1000,
            endpoint:r.userData.joints.map((joint,i)=>Math.abs(joint.angle-target[i])),finished:a.getOlpJointMotionSample(r)};
    });
    expect(result.paused).toBe(true);expect(result.count).toBeGreaterThan(5);
    for(const sample of result.samples) {
        sample.angles.forEach((value,i)=>expect(value).toBeCloseTo(result.heldAngles[i],10));
    }
    // A Pause click may arrive between display frames. Once the next frame
    // observes it, telemetry stays stationary for the remaining paused frames.
    const firstStationary=result.samples.findIndex(sample=>sample.sample.velocities.every(value=>value===0));
    expect(firstStationary).toBeGreaterThanOrEqual(0);expect(firstStationary).toBeLessThan(3);
    for(const sample of result.samples.slice(firstStationary)) {
        expect(sample.sample.velocities).toEqual([0,0,0,0]);expect(sample.sample.accelerations).toEqual([0,0,0,0]);
    }
    expect(result.wallGap).toBeGreaterThan(.14);expect(result.activeGap).toBeLessThan(.08);
    result.endpoint.forEach(error=>expect(error).toBeLessThan(1e-8));
    expect(result.finished.velocities).toEqual([0,0,0,0]);expect(errors).toEqual([]);
});
