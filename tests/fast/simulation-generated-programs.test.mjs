import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {generateOlpGeneratorCases,importGeneratedCase,createGeneratedProgramPlant} from '../support/generated-olp-projects.mjs';
const repoRoot=process.env.INOROBOT_OLP_TEST_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const moduleRoot=process.env.INOROBOT_OLP_MODULE_ROOT??path.join(repoRoot,'2_3DSimulation');
const {buildOlpProjectFromFiles}=await import(pathToFileURL(path.join(moduleRoot,'olp-project-core.mjs')));
const {OlpRuntime}=await import(pathToFileURL(path.join(moduleRoot,'olp-runtime.mjs')));
const cases=generateOlpGeneratorCases({repoRoot});
const all=cases.find(entry=>entry.name==='options-control-7');

async function setup(entry=all) {
    const project=await importGeneratedCase(entry,buildOlpProjectFromFiles);
    const plant=createGeneratedProgramPlant(project),runtime=new OlpRuntime(project,plant.adapter);
    for(const[name,value]of Object.entries({xwTray_index:1,xwSet_speed:100,xwPeel_speed:40,xPeel_start:1}))
        if(plant.get(name)!==undefined)plant.set(name,value);
    return {entry,project,plant,runtime};
}
function driver(f,lines) {
    const file='generated-olp-test-driver.pro';
    const includes=f.project.programFiles.filter(name=>!/(?:^|\/)(?:main|PLC_[^/]*)\.pro$/i.test(name));
    const text=[...includes.map(name=>`Include "${name}";`),'Start;',...lines,'End;'].join('\n');
    f.project.programs.push({path:file,text});f.project.programFiles.push(file);
    f.runtime.refreshProgramSources();
    return file;
}
async function execute(f,lines,{timeout=3000}={}) {
    const file=driver(f,lines),timer=setTimeout(()=>f.runtime.stop(),timeout);
    try {await f.runtime.run(file);assert.notEqual(f.runtime.phase,'error');}
    finally {clearTimeout(timer);}
}
const seedLines=number=>[`R_Cur_pos = 1;`,`B_Cur_process = ${number};`,`B_Tool = 1;`,`B_Wobj = 0;`,`B_PR = ${number*10};`];
const coordinateEqual=(actual,expected)=>{assert.equal(actual.length,expected.length);actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-9,`${actual} != ${expected}`));};

test('all actual generator configurations import declared programs, task metadata, labels and point files',async()=>{
    assert.equal(cases.length,75);
    let programs=0;
    for(const entry of cases) {
        const project=await importGeneratedCase(entry,buildOlpProjectFromFiles);
        assert.deepEqual(project.programFiles,[...entry.projectInfo.ProgramFiles],entry.name);
        assert.deepEqual(project.projectInfo.MultiTaskInfos,[...entry.projectInfo.MultiTaskInfos],entry.name);
        assert.equal(project.pointFiles.length,entry.projectInfo.RobPointFiles.length,entry.name);
        assert.equal(project.labels.B_Tool,'B[0]',entry.name);
        assert.equal(project.labels.B_Cur_process,'B[4]',entry.name);
        assert.equal(project.labels.R_Cur_pos,'R[0]',entry.name);
        assert.equal(project.projectInfo.MultiTaskInfos[0].EnterProgramFile,'PLC_internal.pro');
        assert.equal(project.projectInfo.MultiTaskInfos.every(task=>task.TaskType===1&&task.IsActive),true);
        for(const program of project.programs) {
            assert.doesNotMatch(program.text,/\bundefined\b/,`${entry.name}/${program.path}`);
            for(const match of program.text.matchAll(/\bInclude\s+"([^"]+)"/gi))assert.ok(project.programFiles.includes(match[1]));
        }
        programs+=project.programs.length;
    }
    assert.equal(programs,565);
});

test('every generated process variant executes its real work path with controlled external IO and camera replies',async()=>{
    let executed=0;
    for(const entry of cases)for(const step of entry.steps) {
        const f=await setup(entry),number=step.No;
        for(const name of [`xP${number}_work_pos_start`,`yP${number}_work_pos_busy`])
            if(f.plant.get(name)!==undefined)f.plant.set(name,1);
        if(f.plant.get('xwProcess_work_pos')!==undefined)f.plant.set('xwProcess_work_pos',2**(number-1));
        await execute(f,[...seedLines(number),`${step.ProcessName}.P${number}_pos();`]);
        const peeling=step.WorkType==='Peeling'||step.WorkMethod==='Peeling';
        assert.equal(f.runtime.readSymbol('R_Cur_pos'),number*100+(peeling?20:11),`${entry.name}/${step.ProcessName}`);
        assert.ok(f.plant.calls.moves.length>=4,`${entry.name} must execute actual motion statements`);
        assert.ok(f.plant.calls.moves.every(move=>move.target?.values.every(Number.isFinite)));
        assert.equal(f.plant.calls.moves.at(-1).motion,'MOVL');
        if(step.WorkMethod==='Put'&&!peeling)assert.equal(f.plant.calls.moves.at(-1).options.deceleration,5);
        if(peeling)assert.equal(f.plant.calls.moves.at(-1).options.speedMode,'absolute');
        if(step.VisionUse==='Use - Socket'&&!['Check','Calibration'].includes(step.WorkMethod))
            coordinateEqual(f.runtime.readPositionSymbol('PR[0]'),[1.25,-2.5,0,3.75,0,0]);
        if(entry.options.EnableToolControl&&['Vacuum','Gripper'].includes(step.ToolType))
            assert.ok(f.plant.calls.writes.some(write=>Number(write.value)===1));
        executed++;
    }
    assert.ok(executed>=100,'The option matrix must execute every generated process module, not only parse it');
});

test('the actual generated tray range guard raises its alarm before motion for invalid requested cells',async()=>{
    for(const cell of [0,9]) {
        const f=await setup();f.plant.set('xwTray_index',cell);
        await assert.rejects(execute(f,[...seedLines(1),'sP01_Tray_Get.P1_pos();']),/Alarm\[12\]/);
        assert.equal(f.plant.calls.moves.length,0);
    }
});

test('tray and vision offsets read signed 32-bit input fields and use typed integer row/column division',async()=>{
    const f=await setup();
    for(const[name,value]of Object.entries({xwOffset_1_X:-12345,xwOffset_1_Y:25000,xwOffset_1_Z:-30000,xwOffset_1_A:100000,
        xwVision_offset_X:-5000,xwVision_offset_Y:12500,xwVision_offset_A:-20000}))f.plant.setInt(name,value);
    f.plant.set('xwTray_index',6);
    await execute(f,[...seedLines(1),'s02_offset.Set_PR();']);
    coordinateEqual(f.runtime.readPositionSymbol('PR[10]'),[-13.9845,24.25,-3,8,0,0]);
});

test('generated return paths retain switch fall-through, range cases and explicit return-path breaks',async()=>{
    for(const [returnPath,expected,count]of [[10,110,1],[1,103,4],[0,100,5]]) {
        const f=await setup();
        await execute(f,[...seedLines(1),'R_Cur_pos = 111;',`s01_initial.Return_move(${returnPath});`]);
        assert.equal(f.runtime.readSymbol('R_Cur_pos'),expected);
        assert.equal(f.plant.calls.moves.length,count);
    }
});

test('generated recipe switching selects each real point file and reports its native numeric recipe number',async()=>{
    for(const recipe of [0,1,2]) {
        const f=await setup();f.plant.set('xwP_file_switch',recipe);f.plant.set('ywCur_P_file',recipe===0?2:0);
        await execute(f,['s01_initial.Manual_set_recipe();']);
        assert.equal(path.basename(f.runtime.activePointFile),recipe===0?'P.pts':`P0${recipe}.pts`);
        assert.equal(f.plant.get('ywCur_P_file'),recipe);
    }
});

test('generated teaching arrays drive all four taught move types and retain module/global scope',async()=>{
    const f=await setup();f.plant.set('xTeach_mode',1);
    for(const[name,value]of Object.entries({xwTeach_offset_X:15000,xwTeach_offset_Y:-20000,xwTeach_offset_Z:30000,xwTeach_offset_A:40000}))f.plant.setInt(name,value);
    await execute(f,[...seedLines(1),'s03_teach_mode.Set_path();',
        'iCur_pos_idx = 0;','s03_teach_mode.Teach_move();','iCur_pos_idx = 4;','s03_teach_mode.Teach_move();',
        'iCur_pos_idx = 5;','s03_teach_mode.Teach_move();','B_Cur_process = 3;','B_PR = 30;',
        's03_teach_mode.Set_path();','iCur_pos_idx = 4;','s03_teach_mode.Teach_move();']);
    assert.equal(f.runtime.readSymbol('aiP_num[1][0]'),100);
    assert.equal(f.runtime.readSymbol('aiP_num[1][5]'),111);
    assert.equal(f.runtime.readSymbol('aiMove_type[1][5]'),3);
    assert.deepEqual(f.plant.calls.moves.map(move=>move.motion),['MOVJ','MOVJ','MOVL','MOVL']);
    assert.deepEqual(f.plant.calls.moves.map(move=>move.speed),[30,30,30,30]);
    coordinateEqual(f.plant.calls.moves[0].target.values,[0,0,0,0,0,0]);
    coordinateEqual(f.plant.calls.moves[2].target.values,[1.5,-2,3,4,0,0]);
});

test('generated teaching SavePoints updates active data records/text without changing the other recipe',async()=>{
    const f=await setup();
    const other=f.project.files.get('Data/P01.pts').text;
    await execute(f,['P[110] = (1.5,-2,3,4,0,0);','SavePoints;']);
    assert.equal(f.plant.calls.saved.length,1);
    const active=f.project.pointFiles.find(file=>file.path===f.runtime.activePointFile);
    coordinateEqual(active.records.find(record=>record.index===110).values,[1.5,-2,3,4,0,0]);
    assert.equal(f.project.files.get('Data/P01.pts').text,other);
    const restored=await buildOlpProjectFromFiles([...f.project.files.values()].map(file=>({name:path.basename(file.path),relativePath:file.path,text:async()=>file.text})));
    coordinateEqual(restored.pointFiles.find(file=>file.path===active.path).records.find(record=>record.index===110).values,[1.5,-2,3,4,0,0]);
});

test('generated client/server vision functions consume actual channel data instead of substituting success or zero offsets',async()=>{
    for(const caseName of ['options-control-7','socket-server']) {
        const f=await setup(cases.find(entry=>entry.name===caseName));
        await execute(f,[...seedLines(4),'sP04_Vision_Check.P4_pos();']);
        coordinateEqual(f.runtime.readPositionSymbol('PR[0]'),[1.25,-2.5,0,3.75,0,0]);
        assert.ok(f.plant.calls.socket.some(call=>call.kind==='send'&&call.text==='Shot'));
        assert.ok(f.plant.calls.socket.some(call=>call.kind==='receive'&&call.channel===2&&call.timeout===100));
        assert.ok(f.plant.calls.socket.some(call=>call.kind==='buffer'&&call.offset===0&&call.length===100&&call.channel===2));
        assert.equal(f.plant.calls.socket.some(call=>call.kind==='open'),caseName!=='socket-server');
    }
});

test('generated torque service reads finite joint values and preserves maximum history in global aliases',async()=>{
    const f=await setup();
    await f.runtime.run('PLC_internal.pro');
    assert.equal(f.plant.get('xReIO_run_all_static'),0);
    assert.deepEqual(f.plant.calls.torque,[1,2,3,4,5,6]);
    const first=f.runtime.readSymbol('D_J1_cur_torque');assert.ok(first>0);
    assert.equal(f.runtime.readSymbol('D[1]'),first);
    assert.equal(f.runtime.readSymbol('D_J1_max_torque'),first);
    f.runtime.adapter.getTorque=()=>1;
    await f.runtime.run('PLC_internal.pro');
    assert.ok(f.runtime.readSymbol('D_J1_cur_torque')<first);
    assert.equal(f.runtime.readSymbol('D_J1_max_torque'),first);
});

test('generated Init_signal clears exactly its application output range',async()=>{
    const f=await setup();
    for(let bit=519;bit<=640;bit++)f.plant.write({prefix:'OUT',index:bit},1);
    await execute(f,['s01_initial.Init_signal();']);
    for(let bit=520;bit<=639;bit++)assert.equal(f.plant.read({prefix:'OUT',index:bit}),0,`Out[${bit}]`);
    assert.equal(f.plant.read({prefix:'OUT',index:519}),1);assert.equal(f.plant.read({prefix:'OUT',index:640}),1);
});
