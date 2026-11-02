import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=process.env.INOROBOT_OLP_TEST_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=fs.readFileSync(process.env.INOROBOT_OLP_MAIN_PATH??path.join(repo,'2_3DSimulation/main.js'),'utf8');
const core=await import(pathToFileURL(path.join(repo,'2_3DSimulation/motion-program-core.mjs')));
const telemetry=await import(pathToFileURL(path.join(repo,'2_3DSimulation/olp-torque-feedback.mjs')));
const {OlpRuntime}=await import(pathToFileURL(path.join(repo,'2_3DSimulation/olp-project-runtime.mjs')));
const THREE=await import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(repo,'3_ToolSelector/vendor/three/three.module.js'),'utf8')).toString('base64')}`);
const extract=name=>source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}(?=\\r?\\n|$)`))?.[0];

async function simulate({kind='joint',pause=false,stop=false,analytic=false,override=100,duration=.5}={}) {
    let clock=0,pauses=0;const frames=[],snapshots=[],paused=[];
    const robot=new THREE.Group();robot.userData={joints:[{angle:0}],manifest:{}};
    const motion={enabled:analytic,nativeScalarProfile:analytic,durationSeconds:1,elapsedSeconds:0};
    const runtime={paused:false,cancelled:false,waitIfPaused:async()=>{
        pauses++;const angle=robot.userData.joints[0].angle;
        paused.push({angle,sample:telemetry.getOlpJointMotionSample(robot)});
        clock+=200;await Promise.resolve();
        assert.equal(robot.userData.joints[0].angle,angle,'joints moved during Pause');
        if(stop){runtime.cancelled=true;throw new Error('OLP stopped');}
        runtime.paused=false;
    }};
    const sample=(...args)=>{const value=telemetry.sampleOlpJointMotion(...args);snapshots.push({...value,velocities:[...value.velocities],accelerations:[...value.accelerations]});return value;};
    const progress=metrics=>{
        frames.push({time:clock,active:metrics.elapsedSeconds,duration:metrics.durationSeconds,angle:robot.userData.joints[0].angle,sample:telemetry.getOlpJointMotionSample(robot)});
        if(pause&&pauses===0&&metrics.elapsedSeconds>=.1)runtime.paused=true;
    };
    const context=vm.createContext({...core,THREE,robot,runtime,state:{programSpeedOverride:override},performance:{now:()=>clock},
        window:{setTimeout:fn=>{clock+=16;queueMicrotask(fn);}},
        createRapidMoveState:()=>motion,calculateMovjDuration:()=>duration,calculateMovlDuration:()=>duration,
        advanceRapidMoveState:(state,delta)=>{
            state.elapsedSeconds+=delta;const t=Math.min(1,state.elapsedSeconds);
            state.velocity=t<1?2*t:0;state.acceleration=t<1?2:0;
            return{progress:t*t};
        },
        setJointAngle:(joint,value)=>joint.angle=value,
        solveRobotIK:(_robot,pose)=>{robot.userData.joints[0].angle=pose.position.x;return{success:true};},
        restoreRobotJointAngles:(_robot,angles)=>angles.forEach((value,i)=>robot.userData.joints[i].angle=value),
        getOlpEffectiveMotionSpeed:()=>100,getOlpAccelerationScale:()=>1,getOlpMotionCallbacks:()=>({onProgress:progress}),
        getRobotRapidMoveOptions:()=>({}),captureCurrentTcpTarget(){},appendTcpPathPoint(){},syncJointControls(){},requestRender(){},
        getOlpJointMotionSample:telemetry.getOlpJointMotionSample,sampleOlpJointMotion:sample,
        finishOlpJointMotion:(r,t=clock)=>telemetry.finishOlpJointMotion(r,t)
    });
    const helper=extract('waitForOlpMotionResume');if(helper)vm.runInContext(helper,context);
    vm.runInContext(extract('animateOlpJointMove')+'\n'+extract('animateOlpCartesianPath'),context);
    const pose=x=>({position:new THREE.Vector3(x,0,0),quaternion:new THREE.Quaternion()});
    let error;
    try {
        if(kind==='path')await context.animateOlpCartesianPath(robot,'MOVL',[pose(0),pose(1)],100,runtime);
        else await context.animateOlpJointMove(robot,[1],100,{runtime,onProgress:progress,
            ...(kind==='linear'?{motion:'MOVL',startPose:pose(0),targetPose:pose(1)}:{})});
    } catch(problem){error=problem;}
    return{frames,snapshots,paused,pauses,clock,error,robot};
}

for(const kind of ['joint','linear','path'])test(`UI Pause freezes an active ${kind} motion without counting paused time or changing resume derivatives`,async()=>{
    const baseline=await simulate({kind}),paused=await simulate({kind,pause:true});
    assert.equal(baseline.error,undefined);assert.equal(paused.error,undefined);assert.equal(paused.pauses,1);
    assert.equal(paused.clock,baseline.clock+200);
    assert.deepEqual(paused.frames.map(frame=>frame.angle),baseline.frames.map(frame=>frame.angle));
    assert.deepEqual(paused.frames.map(frame=>frame.active),baseline.frames.map(frame=>frame.active));
    assert.deepEqual(paused.frames.map(frame=>frame.sample.velocities),baseline.frames.map(frame=>frame.sample.velocities));
    assert.deepEqual(paused.frames.map(frame=>frame.sample.accelerations),baseline.frames.map(frame=>frame.sample.accelerations));
    assert.deepEqual(paused.paused[0].sample.velocities,[0]);assert.deepEqual(paused.paused[0].sample.accelerations,[0]);
});

test('Stop while the current motion is paused cancels it at the frozen pose',async()=>{
    const result=await simulate({pause:true,stop:true});assert.match(result.error?.message??'',/OLP stopped/);
    assert.equal(result.robot.userData.joints[0].angle,result.paused[0].angle);
    assert.deepEqual(telemetry.getOlpJointMotionSample(result.robot).velocities,[0]);
});

test('a slow generated zone-blend path retains its calculated duration beyond eight seconds',async()=>{
    const result=await simulate({kind:'path',duration:12});assert.equal(result.error,undefined);
    assert.equal(result.frames.at(-1).duration,12);assert.ok(result.clock>=12000&&result.clock<12016);
});

test('queued native profile timing excludes Pause and analytic derivatives include the playback override',async()=>{
    const result=await simulate({analytic:true,pause:true,override:50});
    assert.equal(result.error,undefined);assert.equal(result.pauses,1);
    for(const frame of result.frames.slice(1,-1)) {
        // q = t_profile^2 and dt_profile/dt_wall = 0.5.
        assert.ok(Math.abs(frame.sample.velocities[0]-frame.active*.5)<1e-10);
        assert.ok(Math.abs(frame.sample.accelerations[0]-.5)<1e-10);
    }
});

test('the Pause instruction completes its own STEP and prevents the following physical command until resume',async()=>{
    const program={path:'main.pro',text:'Start;\nPause;\nMovJ P[0],V[100],Z[0];\nEnd;'};
    const project={programs:[program],programFiles:['main.pro'],programPath:'main.pro',pointRecords:[{kind:'point',sourceSymbol:'P',index:0,values:[1,0,0,0,0,0]}]};
    let moves=0;const runtime=new OlpRuntime(project,{move:async()=>{moves++;}}),running=runtime.run();
    const deadline=performance.now()+1000;while(!runtime.paused&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
    assert.equal(runtime.paused,true);assert.equal(moves,0);runtime.stepOnce();
    while(moves===0&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
    assert.equal(moves,1);runtime.stop();await running.catch(error=>{assert.match(error.message,/OLP stopped/);});
});
