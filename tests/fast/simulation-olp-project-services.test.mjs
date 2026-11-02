import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repoRoot=process.env.INOROBOT_OLP_TEST_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const moduleRoot=process.env.INOROBOT_OLP_MODULE_ROOT??path.join(repoRoot,'2_3DSimulation');
const load=name=>import(pathToFileURL(path.join(moduleRoot,name)));
const {OlpRuntime}=await load('olp-project-runtime.mjs');
const {OlpSocketService}=await load('olp-socket-service.mjs');
const {OlpTorqueFeedback,sampleOlpJointMotion,finishOlpJointMotion}=await load('olp-torque-feedback.mjs');
const {resolveRapidDynamicsModel}=await load('robot-rapid-dynamics.mjs');

const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function within(promise,milliseconds=1500) {
    let timer;
    try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Service test timed out')),milliseconds);})]);}
    finally{clearTimeout(timer);}
}
async function until(condition) {
    const deadline=performance.now()+1500;
    while(!condition()&&performance.now()<deadline)await sleep(1);
    assert.ok(condition(),'Expected project service state was not reached');
}
function project(main='Start;\nEnd;',plc='Start;\nScans = Scans + 1;\nDelay 0.001;\nEnd;') {
    const programs=[{path:'shared.pro',text:'Global Int Scans = 0;'},
        {path:'main.pro',text:`Include "shared.pro";\n${main}`},
        {path:'PLC_internal.pro',text:`Include "shared.pro";\n${plc}`}];
    return {programs,programFiles:programs.map(entry=>entry.path),programPath:'main.pro',
        pointFiles:[],pointRecords:[],labels:{},projectInfo:{
            MultiTaskInfos:[{TaskId:1,TaskType:1,IsActive:true,EnterProgramFile:'PLC_internal.pro'}]}};
}
async function stop(runtime,running) {
    runtime.stop();
    await within(Promise.resolve(running).catch(error=>{if(!runtime.cancelled)throw error;}));
    assert.equal(runtime.running,false);
    assert.ok(runtime.backgroundTasks.every(task=>!task.runtime.running));
}

test('native type-1 cyclic tasks survive foreground End and Stop owns the whole project session',async()=>{
    const notifications=[];
    const runtime=new OlpRuntime(project(),{onStopped:snapshot=>notifications.push(snapshot)});
    const running=runtime.run();running.catch(()=>{});
    try {
        await until(()=>runtime.foregroundCompleted&&runtime.readSymbol('Scans')>=3);
        assert.equal(runtime.running,true);
        assert.equal(runtime.phase,'running');
        assert.equal(notifications.length,0);
        assert.ok(runtime.backgroundTasks[0].scans>=2);
        assert.equal(runtime.backgroundTasks[0].runtime.globalMemory,runtime.globalMemory);
    } finally {await stop(runtime,running);}
    assert.equal(runtime.phase,'stopped');
    assert.equal(notifications.length,1);
    assert.equal(notifications[0].backgroundTasks[0].running,false);
});

test('foreground and static task errors preserve the failing file and stop every owned interpreter',async()=>{
    for(const failedFile of ['main.pro','PLC_internal.pro']) {
        const runtime=new OlpRuntime(failedFile==='main.pro'
            ?project('Start;\nUnsupportedGeneratedCommand;\nEnd;')
            :project('Start;\nWait 0;\nEnd;','Start;\nUnsupportedGeneratedCommand;\nEnd;'));
        await assert.rejects(within(runtime.run()),error=>{
            assert.match(error.message,new RegExp(failedFile.replace('.','\\.')));
            assert.match(error.message,/UnsupportedGeneratedCommand/);
            return true;
        });
        assert.equal(runtime.phase,'error');
        assert.match(runtime.lastError,new RegExp(failedFile.replace('.','\\.')));
        assert.ok(runtime.backgroundTasks.every(task=>!task.runtime.running));
    }
});

test('a later static scan error still reaches the session after the foreground has completed',async()=>{
    const notifications=[];
    const runtime=new OlpRuntime(project('Start;\nEnd;',
        'Start;\nScans = Scans + 1;\nDelay 0.001;\nIf Scans >= 3\nUnsupportedGeneratedCommand;\nEndIf;\nEnd;'),
        {onStopped:snapshot=>notifications.push(snapshot)});
    const running=runtime.run();running.catch(()=>{});
    await until(()=>runtime.foregroundCompleted);
    await assert.rejects(within(running),/PLC_internal\.pro.*UnsupportedGeneratedCommand/);
    assert.equal(runtime.phase,'error');
    assert.equal(runtime.running,false);
    assert.equal(runtime.backgroundTasks[0].runtime.running,false);
    assert.equal(notifications.length,1);
    assert.equal(notifications[0].phase,'error');
});

test('Stop after foreground End cancels a static socket wait instead of waiting for its timeout',async()=>{
    const socket=new OlpSocketService({pollMilliseconds:1});
    let receiving=false;
    const receive=socket.receive.bind(socket);
    socket.receive=(...args)=>{receiving=true;return receive(...args);};
    const runtime=new OlpRuntime(project('Start;\nEnd;',
        'Start;\nGet Port[2], T[100], Goto L800;\nL800:\nEnd;'),{socket});
    const running=runtime.run();running.catch(()=>{});
    try {
        await until(()=>runtime.foregroundCompleted&&receiving);
    } finally {await stop(runtime,running);}
    assert.equal(runtime.phase,'stopped');
    assert.equal(runtime.lastError,null);
});

test('project startup rejects unsupported task kinds and ambiguous task paths before executing the foreground',async()=>{
    const unsupported=project();unsupported.projectInfo.MultiTaskInfos[0].TaskType=2;
    await assert.rejects(new OlpRuntime(unsupported).run(),/Unsupported project task type: 2/);
    const ambiguous=project();ambiguous.programFiles.push('other/PLC_internal.pro');
    await assert.rejects(new OlpRuntime(ambiguous).run(),/missing or ambiguous/);
});

test('a virtual socket requires an explicit peer and never invents a camera response',async()=>{
    let clock=0;
    const socket=new OlpSocketService({now:()=>clock+=10,pollMilliseconds:0});
    assert.equal(socket.getState(2),0);
    const request={host:'192.168.1.10',port:5000,channel:2,mode:'Single'};
    assert.equal(socket.open(request),0);
    assert.throws(()=>socket.send(2,'TAKE'),/not connected/);
    socket.configure(2,{available:true});
    assert.equal(socket.open(request),1);
    socket.send(2,'TAKE');
    assert.equal(socket.snapshot(2).pendingFrames,0);
    assert.equal(await socket.receive(2,.02),false);
    assert.equal(socket.getBuffer(0,100,2),'');
});

test('socket receive consumes one frame at a time and byte offsets are independent of UTF-16 positions',async()=>{
    const socket=new OlpSocketService({pollMilliseconds:0});
    socket.configure(2,{available:true});
    socket.open({host:'127.0.0.1',port:5001,channel:2,mode:'Single'});
    socket.inject(2,'AéB');socket.inject(2,'1.25,-2.5,3.75');
    assert.equal(await socket.receive(2,.1),true);
    assert.equal(socket.getBuffer(1,2,2),'é');
    assert.equal(socket.getBuffer(3,1,2),'B');
    assert.equal(socket.snapshot(2).pendingFrames,1);
    assert.equal(await socket.receive(2,.1),true);
    assert.equal(socket.getBuffer(0,100,2),'1.25,-2.5,3.75');
    assert.equal(socket.snapshot(2).pendingFrames,0);
    socket.inject(2,'old response');socket.close(2);
    assert.equal(socket.snapshot(2).connected,false);
    assert.equal(socket.snapshot(2).pendingFrames,0);
    assert.equal(socket.getBuffer(0,100,2),'');
});

test('explicit reply fixtures, independent channels, timeout validation and cancellation remain visible',async()=>{
    const sent=[];
    const socket=new OlpSocketService({onSend:message=>sent.push(message),pollMilliseconds:1});
    socket.configure(2,{available:true,replyText:'0,0,0'});
    socket.open({host:'127.0.0.1',port:5001,channel:2,mode:'Single'});
    socket.send(2,'SHOT');
    assert.equal(sent[0].text,'SHOT');
    assert.equal(await socket.receive(2,.1),true);
    assert.equal(socket.getBuffer(0,100,2),'0,0,0');
    assert.equal(socket.getState(3),0);
    assert.throws(()=>socket.getBuffer(-1,1,2),/nonnegative byte counts/);
    await assert.rejects(socket.receive(2,-1),/nonnegative seconds/);
    const runtime={cancelled:false,waitIfPaused:async()=>{}};
    const pending=socket.receive(2,0,runtime);
    runtime.cancelled=true;
    await assert.rejects(within(pending),/OLP stopped/);
});

test('S7 screw gravity and acceleration normalize to motor percentage with native feedback quantization',()=>{
    const options={modelName:'IR-S7-60Z20S3-C2LH-INT_01741021',
        toolLoad:{mass:2,cog:[0,0,0],inertia:[0,0,0]}};
    const {model}=resolveRapidDynamicsModel(options);
    const feedback=new OlpTorqueFeedback();
    const state={joints:[20,30,-50,40],options};
    const leadMeters=model.screwLeadMm*.001;
    const movingMass=model.links[3].mass+options.toolLoad.mass;
    const motor=model.links[2];
    const gravity=movingMass*9.81*leadMeters/(2*Math.PI);
    const quantized=jointNm=>Math.fround(Math.max(-32768,Math.min(32767,
        Math.round(jointNm/(motor.ratio*motor.ratedTrq)*1000)))*.1);
    assert.equal(feedback.read(3,state),quantized(gravity));
    assert.equal(feedback.read(1,state),0);
    assert.equal(feedback.read(2,state),0);
    assert.equal(feedback.read(4,state),0);
    const screwInertia=movingMass*(leadMeters/(2*Math.PI))**2+motor.motorInertia*motor.ratio**2;
    const accelerationMmPerSecond2=5000;
    const accelerationRadians=accelerationMmPerSecond2*2*Math.PI/model.screwLeadMm;
    assert.equal(feedback.read(3,{...state,accelerations:[0,0,accelerationMmPerSecond2,0]}),
        quantized(gravity+screwInertia*accelerationRadians));
    assert.throws(()=>feedback.read(0,state),/axis must be 1/);
    assert.throws(()=>feedback.read(1,{joints:[0],options:{modelName:'unavailable-model'}}),/matching firmware dynamics model/);
});

test('displayed joint samples use seconds, analytic derivatives take precedence and finished motion clears them',()=>{
    const robot={userData:{joints:[{angle:0},{angle:10},{angle:-40},{angle:20}]}};
    assert.deepEqual(sampleOlpJointMotion(robot,1000).velocities,[0,0,0,0]);
    robot.userData.joints[0].angle=5;
    const sample=sampleOlpJointMotion(robot,1100);
    assert.deepEqual(sample.velocities,[50,0,0,0]);
    assert.deepEqual(sample.accelerations,[500,0,0,0]);
    const exact=sampleOlpJointMotion(robot,1101,{velocities:[1,2,3,4],accelerations:[5,6,7,8]});
    assert.deepEqual(exact.velocities,[1,2,3,4]);
    assert.deepEqual(exact.accelerations,[5,6,7,8]);
    const finished=finishOlpJointMotion(robot,1200);
    assert.deepEqual(finished.velocities,[0,0,0,0]);
    assert.deepEqual(finished.accelerations,[0,0,0,0]);
});
