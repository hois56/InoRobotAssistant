import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from '../../2_3DSimulation/motion-program-core.mjs';
import * as tool from '../../2_3DSimulation/tool-data-core.mjs';
const threeSource=fs.readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js',import.meta.url),'utf8');
const THREE=await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');
const {payload,moves}=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-s7-timing-path.json',import.meta.url),'utf8'));
const names=['createDefaultTcpProfile','normalizeTcpProfile','ensureRobotTcpProfiles','getRobotRapidMoveOptions','animateOlpJointMove'];

async function run({renderWorkMs=0,minimumTimerMs=0,override=100,enabled=true}={}) {
    let clock=0;const waits=[],plans=[];
    const robot=new THREE.Group(),state={models:[],programSpeedOverride:override};
    robot.userData={manifest:{robotType:'scara',structure:[325,275,0,20],rapidMove:{enabled}},
        motionModelName:'IR-S7-60Z20S-INT',motionModelFolder:'IR-S7-60Z20',activeTcpProfileIndex:1,
        tcpProfiles:Array.from({length:16},(_,i)=>({position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),load:tool.normalizeToolLoad(i===1?payload:null)})),
        joints:moves[0].start.map((angle,i)=>({angle,definition:{type:i===2?'prismatic':'revolute',
            maxSpeed:[414.8,735.3,1605.833333,2000][i],maxAcceleration:[1200,2150,4444.444444,8000][i],maxDeceleration:[1200,2150,4444.444444,8000][i]}}))};
    const context=vm.createContext({...core,...tool,THREE,state,TCP_PROFILE_COUNT:16,
        performance:{now:()=>clock},window:{setTimeout:(callback,delay)=>{waits.push(delay);clock+=Math.max(.000001,minimumTimerMs,delay);queueMicrotask(callback);}},
        normalizeArmLoadProperties:v=>v,getArmLoadJointIndex:m=>m.userData.attachmentJointIndex,
        setJointAngle:(joint,value)=>{joint.angle=value;},captureCurrentTcpTarget(){},appendTcpPathPoint(){},syncJointControls(){},
        requestRender:()=>{clock+=renderWorkMs;},
        createRapidMoveState:(...args)=>{const plan=core.createRapidMoveState(...args);plans.push(plan.durationSeconds);return plan;}});
    for(const name of names) vm.runInContext(source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}(?=\\r?\\n|$)`))[0],context);
    for(const move of moves) await context.animateOlpJointMove(robot,move.end,100);
    return {actualSeconds:clock/1000,plannedSeconds:plans.reduce((sum,t)=>sum+t,0)/(override/100),waits};
}

for(const settings of [{},{renderWorkMs:2},{renderWorkMs:2,minimumTimerMs:4},{renderWorkMs:2,override:50}]) {
    test(`S7 OLP endpoint scheduling excludes repeated fixed waits ${JSON.stringify(settings)}`,async()=>{
        const result=await run(settings);
        const allowance=(3*(2*(settings.renderWorkMs||0)+(settings.minimumTimerMs||0))+.001)/1000;
        assert.ok(result.actualSeconds+1e-9>=result.plannedSeconds);
        assert.ok(result.actualSeconds-result.plannedSeconds<=allowance,
            `Endpoint delay ${result.actualSeconds-result.plannedSeconds}s exceeds render/timer work ${allowance}s`);
        assert.ok(result.waits.some(t=>t<16));
    });
}
test('non-S7-analytic motion keeps its existing frame cadence',async()=>{
    const result=await run({enabled:false});
    assert.ok(result.waits.length>0);
    assert.ok(result.waits.every(t=>t===16));
});
