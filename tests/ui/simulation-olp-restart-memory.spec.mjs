import {test,expect} from '@playwright/test';

const memoryProgram=`Global Int InitOnce = 7;
Int PrivateScratch = 5;
Start;
R[10] = R[10] + 1;
PrivateScratch = PrivateScratch + 1;
If R[10] == 1
    B[10] = ON;
    InitOnce = 99;
    Tool[2].TLoad.Mass = 2.5;
    LoadPoints("P01.pts");
EndIf;
Wait In[520] == ON;
Clear All;
Wait In[521] == ON;
End;`;
const remoteProgram=`Start;
Velset Rate[25];
Wait In[520] == ON;
Velset Rate[35];
Wait In[521] == ON;
End;`;

async function setup(page,program,{mapping=false}={}) {
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();let source=await response.text();
        // Red regression mode removes exactly the new persistence capture.
        // Every other production statement and runtime service stays intact.
        if(process.env.INOROBOT_OLP_MEMORY_RED==='1') {
            const capture='    olpProjectMemoryBanks.set(targetRobot, {project: targetProject, memory: runtime.globalMemory});';
            expect(source).toContain(capture);source=source.replace(capture,'');
        }
        source+='\nwindow.__restartSession={state,buildOlpProjectFromFiles,activateOlpProject,startOlpSession,getOlpRuntimeForRobot,setOlpInputFromIoSimulator,IO_SIMULATOR_DIRECTIONS};';
        await route.fulfill({response,body:source});
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(()=>window.__restartSession?.state.renderer);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(()=>window.__restartSession.state.models.some(model=>model.userData.tcpFrame));
    await page.evaluate(async({program,mapping})=>{
        const a=window.__restartSession;
        a.robot=a.state.models.find(model=>model.userData.tcpFrame);
        a.source={
            'Session.prj':JSON.stringify({FileType:'RobotProjectConfigFile',IsMainActive:true,
                MultiTaskCount:0,MultiTaskInfos:[],ProgramFilesCount:1,ProgramFiles:['main.pro']}),
            'main.pro':program,
            'Data/P.pts':'P[100] = 400, 100, -50, 0, 0, 0; 1,0,0,0;',
            'Data/P01.pts':'P[100] = 450, 100, -50, 0, 0, 0; 1,0,0,0;'
        };
        if(mapping)a.source['Remote_IO_mapping.dat']=JSON.stringify({BusIoFuncMap:[
            {IoType:0,FuncId:0,MemAddr:512,Length:1,Name:'Start program'},
            {IoType:0,FuncId:8296,MemAddr:656,Length:16,Name:'Set override'}
        ]});
        a.makeProject=()=>a.buildOlpProjectFromFiles(Object.entries(a.source).map(([path,text])=>({
            name:path.split('/').at(-1),relativePath:`Session/${path}`,text:async()=>text
        })));
        a.project=await a.makeProject();
        a.activateOlpProject(a.project,{robot:a.robot,enabled:true,connectBus:false});
        a.input=(bitStart,value,bitWidth=1)=>a.setOlpInputFromIoSimulator({
            direction:a.IO_SIMULATOR_DIRECTIONS.INPUT,bitStart,bitEnd:bitStart+bitWidth-1,bitWidth
        },value);
        a.start=(remoteIo=false)=>{
            a.running=a.startOlpSession({robot:a.robot,remoteIo});
            a.runtime=a.getOlpRuntimeForRobot(a.robot);
        };
        a.stop=async()=>{a.runtime.stop();await a.running;};
        a.snapshot=()=>({r:a.runtime.readSymbol('R[10]'),b:a.runtime.readSymbol('B[10]'),
            named:a.runtime.readSymbol('InitOnce'),tool:a.runtime.readSymbol('Tool[2].TLoad.Mass'),
            local:a.runtime.readSymbol('PrivateScratch'),recipe:a.runtime.activePointFile,
            error:a.runtime.lastError});
    },{program,mapping});
}
async function waitAt(page,input) {
    await page.waitForFunction(input=>{
        const r=window.__restartSession.runtime;
        if(r?.lastError)throw new Error(r.lastError);
        return r?.waitCondition?.includes(`In[${input}]`);
    },input);
}
test.afterEach(async({page})=>{
    await page.evaluate(async()=>{
        const a=window.__restartSession;
        if(a?.runtime?.running){a.runtime.stop();await a.running;}
    }).catch(()=>{});
});

test('real OLP Stop/Start preserves controller globals, Tool and recipe while Clear and project replacement reset registers',async({page})=>{
    await setup(page,memoryProgram);
    await page.evaluate(()=>{const a=window.__restartSession;a.start();a.firstMemory=a.runtime.globalMemory;});
    await waitAt(page,520);
    expect(await page.evaluate(()=>window.__restartSession.snapshot())).toEqual({
        r:1,b:1,named:99,tool:2.5,local:6,recipe:'Data/P01.pts',error:null
    });
    await page.evaluate(async()=>{const a=window.__restartSession;await a.stop();});
    expect(await page.evaluate(()=>window.__restartSession.getOlpRuntimeForRobot(window.__restartSession.robot))).toBeNull();
    await page.evaluate(()=>window.__restartSession.start());await waitAt(page,520);
    expect(await page.evaluate(()=>window.__restartSession.snapshot())).toEqual({
        r:2,b:1,named:99,tool:2.5,local:6,recipe:'Data/P01.pts',error:null
    });
    expect(await page.evaluate(()=>{const a=window.__restartSession;return a.runtime.globalMemory===a.firstMemory;})).toBe(true);
    await page.evaluate(()=>window.__restartSession.input(520,1));await waitAt(page,521);
    const cleared=await page.evaluate(()=>window.__restartSession.snapshot());
    expect([cleared.r,cleared.b,cleared.named,cleared.tool]).toEqual([0,0,0,0]);
    await page.evaluate(async()=>{
        const a=window.__restartSession;await a.stop();a.input(520,0);
        a.project=await a.makeProject();a.activateOlpProject(a.project,{robot:a.robot,enabled:true,connectBus:false});a.start();
    });
    await waitAt(page,520);
    expect(await page.evaluate(()=>window.__restartSession.snapshot())).toEqual({
        r:1,b:1,named:99,tool:2.5,local:6,recipe:'Data/P01.pts',error:null
    });
    expect(await page.evaluate(()=>{const a=window.__restartSession;return a.runtime.globalMemory===a.firstMemory;})).toBe(false);
});

test('real OLP session adapters distinguish direct Start and mapped Remote IO Start and apply changed override words',async({page})=>{
    await setup(page,remoteProgram,{mapping:true});
    await page.evaluate(()=>window.__restartSession.start());await waitAt(page,520);
    expect(await page.evaluate(()=>window.__restartSession.runtime.adapter.getControllerExecutionMode())).toEqual({controlMode:null,remoteManual:false});
    await page.evaluate(()=>window.__restartSession.input(656,70,16));
    expect(await page.evaluate(()=>window.__restartSession.runtime.getLiveVelocityRate())).toBe(25);
    await page.evaluate(async()=>{const a=window.__restartSession;await a.stop();a.start(true);});await waitAt(page,520);
    expect(await page.evaluate(()=>window.__restartSession.runtime.adapter.getControllerExecutionMode())).toEqual({controlMode:3,remoteManual:false});
    await page.evaluate(()=>{const a=window.__restartSession;a.runtime.getLiveVelocityRate();a.input(656,60,16);});
    expect(await page.evaluate(()=>window.__restartSession.runtime.getLiveVelocityRate())).toBe(60);
    await page.evaluate(()=>window.__restartSession.input(520,1));await waitAt(page,521);
    expect(await page.evaluate(()=>window.__restartSession.runtime.getLiveVelocityRate())).toBe(35);
    await page.evaluate(()=>window.__restartSession.input(656,90,16));
    expect(await page.evaluate(()=>window.__restartSession.runtime.getLiveVelocityRate())).toBe(90);
    await page.evaluate(async()=>{const a=window.__restartSession;await a.stop();a.input(520,0);a.input(512,0);a.input(512,1);});
    await page.waitForFunction(()=>{const a=window.__restartSession;return a.getOlpRuntimeForRobot(a.robot)?.running;});
    await page.evaluate(()=>{const a=window.__restartSession;a.runtime=a.getOlpRuntimeForRobot(a.robot);});await waitAt(page,520);
    expect(await page.evaluate(()=>window.__restartSession.runtime.adapter.getControllerExecutionMode())).toEqual({controlMode:3,remoteManual:false});
    await page.evaluate(()=>{const a=window.__restartSession;a.runtime.getLiveVelocityRate();a.input(656,95,16);});
    expect(await page.evaluate(()=>window.__restartSession.runtime.getLiveVelocityRate())).toBe(95);
});
