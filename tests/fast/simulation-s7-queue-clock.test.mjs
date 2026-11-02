import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as core from '../../2_3DSimulation/motion-program-core.mjs';
import * as tool from '../../2_3DSimulation/tool-data-core.mjs';
const THREE=await import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js',import.meta.url),'utf8')).toString('base64')}`);
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-s7-timing-path.json',import.meta.url),'utf8'));

async function run({queued=true,override=100,frameMilliseconds=20}={}) {
    let clock=0;const plans=[],queueTiming={nextStartAt:NaN},boundaries=[];
    const state={models:[],programSpeedOverride:override},robot=new THREE.Group();
    robot.userData={manifest:{robotType:'scara',structure:[325,275,0,20],rapidMove:{enabled:true}},motionModelName:'IR-S7-60Z20S-INT',motionModelFolder:'IR-S7-60Z20',activeTcpProfileIndex:1,
        tcpProfiles:Array.from({length:16},(_,i)=>({position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),load:tool.normalizeToolLoad(i===1?fixture.payload:null)})),
        joints:fixture.moves[0].start.map((angle,i)=>({angle,definition:{type:i===2?'prismatic':'revolute',maxSpeed:[414.8,735.3,1605.833333,2000][i],maxAcceleration:[1200,2150,4444.444444,8000][i],maxDeceleration:[1200,2150,4444.444444,8000][i]}}))};
    const context=vm.createContext({...core,...tool,THREE,state,TCP_PROFILE_COUNT:16,
        performance:{now:()=>clock},window:{setTimeout:(cb,delay)=>{clock+=Math.max(delay,frameMilliseconds);queueMicrotask(cb);}},
        normalizeArmLoadProperties:v=>v,getArmLoadJointIndex:m=>m.userData.attachmentJointIndex,
        setJointAngle:(joint,value)=>{joint.angle=value;},captureCurrentTcpTarget(){},appendTcpPathPoint(){},syncJointControls(){},
        sampleOlpJointMotion(){},finishOlpJointMotion(){},requestRender(){},
        createRapidMoveState:(...args)=>{const p=core.createRapidMoveState(...args);plans.push(p);return p;}});
    for(const name of ['createDefaultTcpProfile','normalizeTcpProfile','ensureRobotTcpProfiles','getRobotRapidMoveOptions','animateOlpJointMove'])
        vm.runInContext(source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}(?=\\r?\\n|$)`))[0],context);
    for(const move of fixture.moves) {
        await context.animateOlpJointMove(robot,move.end,100,{motionOptions:queued?{motionQueueTiming:queueTiming}:{}});
        boundaries.push(queueTiming.nextStartAt);
    }
    return {actual:clock,planned:plans.reduce((sum,p)=>sum+p.durationSeconds*1000/(override/100),0),plans,boundaries};
}

for(const override of [100,50]) test(`queued S7 Z0 segments share the motion timeline at ${override}%`,async()=>{
    const queued=await run({override}),separate=await run({queued:false,override});
    assert.ok(queued.boundaries.every(Number.isFinite),'Each completed profile must retain its scheduled end time.');
    let expected=0;
    queued.plans.forEach((p,i)=>{expected+=p.durationSeconds*1000/(override/100);assert.ok(Math.abs(queued.boundaries[i]-expected)<1e-7);assert.equal(p.velocity,0);});
    assert.ok(queued.actual>=queued.planned-1e-7);
    assert.ok(queued.actual-queued.planned<=20+1e-7,'Only the final display callback may contribute an endpoint delay.');
    assert.ok(queued.actual<separate.actual,'Intermediate callback lateness must not accumulate.');
    assert.deepEqual(queued.plans.map(p=>p.durationSeconds),separate.plans.map(p=>p.durationSeconds));
});
