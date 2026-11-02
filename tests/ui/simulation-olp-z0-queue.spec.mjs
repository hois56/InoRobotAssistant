import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-s7-timing-path.json',import.meta.url),'utf8'));

async function startQueuedProgram(page) {
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nwindow.__z0={state,OlpRuntime,runOlpMove,setJointAngle,ensureRobotTcpProfiles};'});
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(()=>window.__z0);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(()=>window.__z0.state.models.some(m=>m.userData.tcpFrame));
    await page.evaluate(data=>{
        const a=window.__z0,robot=a.state.models.find(m=>m.userData.tcpFrame);
        data.moves[0].start.forEach((v,i)=>a.setJointAngle(robot.userData.joints[i],v,false));
        const profiles=a.ensureRobotTcpProfiles(robot);profiles[1].load=data.payload;robot.userData.activeTcpProfileIndex=1;
        const pointRecords=data.moves.map((move,i)=>({kind:'jointPoint',sourceSymbol:'JP',index:i+1,values:move.end}));
        const text='Start\nRapidMove(ALL,ON);\nTimeStart(0);\n'+data.moves.map((_,i)=>`MovJ JP[${i+1}],V[100],Z[0],Tool[1],Wobj[0];`).join('\n')+'\nTimeOut(0,D[0]);\nEnd';
        const project={programPath:'main.pro',programFiles:['main.pro'],programs:[{path:'main.pro',text}],pointRecords};
        const calls=[];let active=0,maxActive=0;
        const runtime=new a.OlpRuntime(project,{queueStopMoves:true,move:async(...args)=>{
            active++;maxActive=Math.max(maxActive,active);
            calls.push({expression:args[1],timing:args[5].motionQueueTiming,before:args[5].motionQueueTiming?.nextStartAt});
            try{return await a.runOlpMove(...args);}finally{active--;}
        }});runtime.robot=robot;
        Object.assign(a,{robot,runtime,calls,getActive:()=>active,getMaxActive:()=>maxActive});
        a.done=runtime.run().then(()=>{a.completed=true;},error=>{a.error=String(error);});
    },fixture);
    await page.waitForFunction(()=>window.__z0.runtime.pendingMotions.size===3&&window.__z0.calls.length===1);
    return errors;
}

test('S7 scans Z0 commands ahead while executing them serially and drains before TimeOut',async({page})=>{
    const errors=await startQueuedProgram(page);
    expect(await page.evaluate(()=>window.__z0.runtime.currentLineText)).toContain('JP[3]');
    await page.evaluate(()=>window.__z0.done);
    const result=await page.evaluate(()=>{
        const a=window.__z0;
        return {error:a.error,completed:a.completed,count:a.calls.length,maxActive:a.getMaxActive(),
            shared:a.calls.every(c=>c.timing===a.calls[0].timing),later:a.calls.slice(1).every(c=>Number.isFinite(c.before)),
            pending:a.runtime.pendingMotions.size,queue:a.runtime.stopMoveQueue,time:a.runtime.readSymbol('D[0]'),
            joints:a.robot.userData.joints.map(j=>j.angle)};
    });
    expect(result.error).toBeUndefined();expect(result.completed).toBe(true);
    expect(result.count).toBe(3);expect(result.maxActive).toBe(1);
    expect(result.shared&&result.later).toBe(true);expect(result.pending).toBe(0);expect(result.queue).toBeNull();
    expect(result.time).toBeGreaterThan(.84);
    result.joints.forEach((v,i)=>expect(v).toBeCloseTo(fixture.moves.at(-1).end[i],7));
    expect(errors).toEqual([]);
});

test('a paused prepared Z0 queue can step one move and resume the remainder',async({page})=>{
    const errors=await startQueuedProgram(page);
    const held=await page.evaluate(()=>{
        const a=window.__z0;a.runtime.togglePause();
        return a.robot.userData.joints.map(joint=>joint.angle);
    });
    await page.waitForTimeout(100);
    const paused=await page.evaluate(()=>({active:window.__z0.getActive(),calls:window.__z0.calls.length,
        joints:window.__z0.robot.userData.joints.map(joint=>joint.angle)}));
    expect(paused.active).toBe(1);expect(paused.calls).toBe(1);
    paused.joints.forEach((value,i)=>expect(value).toBeCloseTo(held[i],9));
    // The first STEP finishes the interrupted first movement. It must not
    // also release a new permit to the second prepared movement.
    await page.evaluate(()=>window.__z0.runtime.stepOnce());
    await page.waitForFunction(()=>window.__z0.calls.length===1&&window.__z0.getActive()===0&&window.__z0.runtime.paused);
    await page.evaluate(()=>window.__z0.runtime.stepOnce());
    await page.waitForFunction(()=>window.__z0.calls.length===2&&window.__z0.getActive()===0&&window.__z0.runtime.paused);
    expect(await page.evaluate(()=>window.__z0.calls.length)).toBe(2);
    await page.evaluate(()=>window.__z0.runtime.togglePause());
    await page.evaluate(()=>window.__z0.done);
    expect(await page.evaluate(()=>({error:window.__z0.error,completed:window.__z0.completed,count:window.__z0.calls.length,active:window.__z0.getMaxActive()})))
        .toEqual({error:undefined,completed:true,count:3,active:1});
    expect(errors).toEqual([]);
});
