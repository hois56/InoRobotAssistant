import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {generateOlpGeneratorCases,importGeneratedCase,createGeneratedProgramPlant} from '../support/generated-olp-projects.mjs';
const repoRoot=process.env.INOROBOT_OLP_TEST_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const moduleRoot=process.env.INOROBOT_OLP_MODULE_ROOT??path.join(repoRoot,'2_3DSimulation');
const {buildOlpProjectFromFiles}=await import(pathToFileURL(path.join(moduleRoot,'olp-project-core.mjs')));
const {OlpRuntime}=await import(pathToFileURL(path.join(moduleRoot,'olp-project-runtime.mjs')));
const cases=generateOlpGeneratorCases({repoRoot});
const until=async(condition,message)=>{
    const deadline=performance.now()+2500;
    while(!condition()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
    assert.ok(condition(),`Timed out waiting for ${message}`);
};
async function setup() {
    const entry=cases.find(entry=>entry.name==='options-control-7');
    const project=await importGeneratedCase(entry,buildOlpProjectFromFiles),plant=createGeneratedProgramPlant(project);
    plant.set('xwTray_index',1);plant.set('xwSet_speed',80);plant.set('xwPeel_speed',40);
    plant.set('yRobot_home_sts',1);
    let sample=0;
    // A controlled external position stream exercises the generated producer's
    // exact Dist()/0.1 calculation, without making a controller CT claim.
    plant.adapter.getCurrentPosition=async()=>{sample++;return[3*sample,4*sample,0,0,0,0];};
    plant.adapter.delay=async milliseconds=>{plant.calls.delays.push(milliseconds);await new Promise(resolve=>setTimeout(resolve,1));};
    return{project,plant,runtime:new OlpRuntime(project,plant.adapter)};
}
async function stopSession(f,running) {
    f.runtime.stop();
    try{await running;}catch(error){if(!f.runtime.cancelled)throw error;}
    assert.ok(f.runtime.backgroundTasks.every(task=>!task.runtime.running));
}

test('the actual generated main executes a complete IO-controlled cycle while configured PLC services share controller globals',async()=>{
    const f=await setup();f.plant.set('xwProcess_work_pos',1);
    let completed=false;
    const write=f.runtime.sessionAdapter.writeAddress;
    f.runtime.adapter.writeAddress=f.runtime.sessionAdapter.writeAddress=(address,value,runtime)=>{
        write(address,value,runtime);
        if(f.plant.get('yP1_work_pos_comp')===1){completed=true;f.plant.set('xwProcess_work_pos',0);}
    };
    const running=f.runtime.run('main.pro');running.catch(()=>{});
    try {
        await until(()=>completed&&f.plant.get('ywProcess_work_busy')===0&&f.plant.calls.torque.length>=6,'generated process completion and static torque data');
        assert.equal(f.plant.calls.homes.length,1);
        assert.equal(f.plant.calls.moves.length,6);
        assert.equal(f.runtime.readSymbol('R_Cur_pos'),111);
        assert.equal(f.runtime.readSymbol('Tool[1].TLoad.Mass'),10);
        assert.equal(f.plant.get('ywProcess_work_comp'),1);
        assert.equal(f.plant.get('ywProcess_work_busy'),0);
        assert.equal(f.runtime.velocityRate,80);
        assert.ok(f.runtime.readSymbol('D_J1_cur_torque')>0);
        assert.equal(f.runtime.readSymbol('D[1]'),f.runtime.readSymbol('D_J1_cur_torque'));
        await until(()=>f.plant.get('ywCur_TCP_speed')===50,'generated TCP speed producer');
        assert.equal(f.runtime.readSymbol('D_TCP_speed'),50);
        assert.equal(f.runtime.readSymbol('D[0]'),50);
        assert.equal(f.runtime.backgroundTasks.length,2);
        assert.ok(f.runtime.backgroundTasks.every(task=>task.runtime.running));
        assert.ok(f.plant.calls.delays.includes(100));
    } finally {await stopSession(f,running);}
});

test('foreground Pause and single-step leave generated cyclic PLC tasks running; Stop drains the owned project tasks',async()=>{
    const f=await setup();
    const running=f.runtime.run('main.pro');running.catch(()=>{});
    try {
        await until(()=>f.runtime.backgroundTasks.length===2&&f.plant.calls.homes.length===1,'foreground initialization');
        f.runtime.togglePause();
        await until(()=>f.runtime.paused,'foreground pause');
        const before=f.plant.calls.torque.length;
        await until(()=>f.plant.calls.torque.length>before+6,'background PLC scans during foreground pause');
        assert.equal(f.runtime.paused,true);
        assert.equal(f.plant.calls.moves.length,0);
        f.runtime.stepOnce();
        await until(()=>f.runtime.paused,'foreground single-step completion');
        const after=f.plant.calls.torque.length;
        await until(()=>f.plant.calls.torque.length>after+6,'background PLC scans during single-step pause');
    } finally {await stopSession(f,running);}
});

test('a generated static service failure reports its actual program context and stops the foreground instead of returning invented zero data',async()=>{
    const f=await setup();
    delete f.runtime.sessionAdapter.getTorque;
    await assert.rejects(f.runtime.run('main.pro'),/torque|GetTorque/i);
    assert.equal(f.runtime.phase,'error');
    assert.match(f.runtime.lastError,/PLC_internal\.pro/);
    assert.ok(f.runtime.backgroundTasks.every(task=>!task.runtime.running));
});
