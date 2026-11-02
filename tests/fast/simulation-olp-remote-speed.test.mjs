import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repoRoot=process.env.INOROBOT_OLP_TEST_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const moduleRoot=process.env.INOROBOT_OLP_MODULE_ROOT??path.join(repoRoot,'2_3DSimulation');
const {OlpRuntime,createOlpGlobalMemory}=await import(pathToFileURL(path.join(moduleRoot,'olp-runtime.mjs')));
const speedMap={ioType:0,funcId:8296,memAddr:656,length:16,mapped:true,address:'INW[41]'};
function fixture({mapping=speedMap,mode={controlMode:3,remoteManual:false},globalMemory}={}) {
    const words=new Map([[41,80]]),reads=[];
    const adapter={globalMemory,readAddress:address=>{reads.push(address);return words.get(address.index)??0;}};
    if(mode!==null)adapter.getControllerExecutionMode=()=>mode;
    const runtime=new OlpRuntime({programs:[],labels:{xwSet_speed:'INW[41]'},remoteIoMapping:mapping?[mapping]:[]},adapter);
    return {runtime,adapter,words,reads,mode};
}

test('labels and mapping presence alone never override explicit modal Velset Rate',async()=>{
    for(const options of [{mapping:null},{mode:null},{mode:{controlMode:0,remoteManual:false}},
        {mode:{controlMode:3,remoteManual:true}}]) {
        const {runtime}=fixture(options);
        await runtime.executeLine('Velset Rate[37];');
        assert.equal(runtime.getLiveVelocityRate(),37);
        assert.equal(runtime.getEffectiveMotionSpeed(50),18.5);
    }
});

test('exact function mapping selects its memory address and ignores lookalike names or malformed width',async()=>{
    for(const mapping of [{...speedMap,funcId:8297,name:'Speed settings'},
        {...speedMap,ioType:1},{...speedMap,mapped:false},{...speedMap,memAddr:-1},
        {...speedMap,memAddr:657},{...speedMap,length:1}]) {
        const {runtime}=fixture({mapping});runtime.velocityRate=42;
        assert.equal(runtime.getLiveVelocityRate(),42);
    }
    const f=fixture({mapping:{...speedMap,memAddr:704,address:'INW[41]'}});
    f.words.set(44,63);
    assert.equal(f.runtime.getLiveVelocityRate(),63);
    assert.deepEqual(f.reads.at(-1),{prefix:'INW',index:44});
});

test('mapped value changes follow native range rules and unchanged words preserve later modal commands',async()=>{
    const f=fixture();
    assert.equal(f.runtime.getLiveVelocityRate(),80);
    await f.runtime.executeLine('Velset Rate[35];');
    assert.equal(f.runtime.getLiveVelocityRate(),35);
    assert.equal(f.runtime.getLiveVelocityRate(),35);
    for(const [word,expected] of [[50,50],[0,50],[101,50],[65535,50],[1,1],[100,100]]) {
        f.words.set(41,word);assert.equal(f.runtime.getLiveVelocityRate(),expected);
    }
});

test('source-command polling establishes mapped changes before a following explicit Velset instruction',async()=>{
    const f=fixture();
    await f.runtime.executeLine('Velset Rate[27];');
    assert.equal(f.runtime.getLiveVelocityRate(),27);
    f.words.set(41,70);
    await f.runtime.executeLine('Velset Rate[31];');
    assert.equal(f.runtime.getLiveVelocityRate(),31);
});

test('mapped speed and program Rate commands share one controller grade across task interpreters',async()=>{
    const globalMemory=createOlpGlobalMemory();
    const main=fixture({globalMemory}),plc=fixture({globalMemory});
    assert.equal(main.runtime.getLiveVelocityRate(),80);
    await main.runtime.executeLine('Velset Rate[29];');
    assert.equal(plc.runtime.getLiveVelocityRate(),29);
    const late=fixture({globalMemory});
    assert.equal(late.runtime.velocityRate,29,'constructing a task must not reset controller override');
    plc.words.set(41,60);assert.equal(plc.runtime.getLiveVelocityRate(),60);
    main.words.set(41,60);
    assert.equal(main.runtime.getLiveVelocityRate(),60);
    assert.equal(main.runtime.velocityRate,60);
});

test('remote manual and control-mode transitions gate mapped updates',async()=>{
    const f=fixture();
    assert.equal(f.runtime.getLiveVelocityRate(),80);
    await f.runtime.executeLine('Velset Rate[40];');
    f.mode.remoteManual=true;f.words.set(41,25);
    assert.equal(f.runtime.getLiveVelocityRate(),40);
    f.mode.remoteManual=false;
    assert.equal(f.runtime.getLiveVelocityRate(),25);
    await f.runtime.executeLine('Velset Rate[45];');
    f.mode.controlMode=0;assert.equal(f.runtime.getLiveVelocityRate(),45);
    f.mode.controlMode=3;assert.equal(f.runtime.getLiveVelocityRate(),25);
});

test('original native mapped-word trigger fixture agrees with scoped simulator polling',()=>{
    const nativePath=new URL('../fixtures/olp-control-leaf-gold.json',import.meta.url);
    const native=JSON.parse(fs.readFileSync(nativePath,'utf8'));
    assert.match(native.hashes['librobot.so'],/^[a-f0-9]{64}$/);
    const f=fixture();let expected=100;
    for(const row of native.mappedVelocityTrigger8296) {
        f.words.set(41,row.inputWord);f.mode.remoteManual=Boolean(row.remoteManual);
        if(row.globalVelocitySetterCalls.length)expected=row.globalVelocitySetterCalls.at(-1)[0];
        assert.equal(f.runtime.getLiveVelocityRate(),expected,JSON.stringify(row));
    }
});
