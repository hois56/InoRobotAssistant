import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../2_3DSimulation/olp-runtime.mjs',import.meta.url),'utf8');
function fixture(kind='long') {
    let clock=0;const timers=[];
    const delay=(callback,ms)=>{timers.push(ms);queueMicrotask(()=>{clock+=ms;callback();});};
    const context=vm.createContext({ AbortController,performance:{now:()=>clock},setTimeout:delay,clearTimeout(){},console});
    vm.runInContext(source.replace(/\bexport\s+(?=(?:const|class|function))/g,'').replace(/^export\s*\{[^}]+\};?\s*$/mg,'')+'\nglobalThis.Runtime=OlpRuntime;',context);
    const move=kind==='sync'?()=>{clock+=1;}:()=>new Promise(resolve=>delay(resolve,kind==='long'?100:1));
    const runtime=new context.Runtime({programPath:'main.pro',programs:[{path:'main.pro',text:'Start;\nEnd;'}]},{move});
    return {runtime,timers};
}
const command={motion:'MOVJ',pointExpression:'P[1]',speed:100,options:{}};
test('a completed long asynchronous motion does not add a redundant zero-delay timer',async()=>{
    const {runtime,timers}=fixture();
    await runtime.executeMotion(command);await runtime.yieldExecutionSlice();
    assert.deepEqual(timers,[100]);
    assert.equal(runtime.instructionCount,1);
});
for(const kind of ['sync','short']) test(`short ${kind} work retains the CPU yield budget`,async()=>{
    const {runtime,timers}=fixture(kind);
    for(let i=0;i<4;i++){await runtime.executeMotion(command);await runtime.yieldExecutionSlice();}
    assert.deepEqual(timers,kind==='sync'?[0]:[1,1,1,1,0]);
});
test('instruction 256 still forces a yield after an awaited motion',async()=>{
    const {runtime,timers}=fixture();runtime.instructionCount=255;
    await runtime.executeMotion(command);await runtime.yieldExecutionSlice();
    assert.deepEqual(timers,[100,0]);
    assert.equal(runtime.instructionCount,256);
});
