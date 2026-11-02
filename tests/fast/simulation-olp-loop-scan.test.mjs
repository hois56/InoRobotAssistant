import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(process.env.OLP_RUNTIME_TEST_SOURCE||new URL('../../2_3DSimulation/olp-runtime.mjs',import.meta.url),'utf8');

function fixture(body,{onTimer=()=>{},readAddress=()=>0,maxLoopIterations,adapter={}}={}) {
    let clock=0,runtime;const timers=[];
    // Model a Windows host whose setTimeout(0) completes after one 15.625ms
    // tick. The clock is wall time, and TimeOut must retain every actual wait.
    const context=vm.createContext({AbortController,TextEncoder,console,
        performance:{now:()=>clock},clearTimeout(){},setTimeout:(callback,ms)=>{
            timers.push(ms);queueMicrotask(()=>{clock+=ms===0?15.625:ms;onTimer(ms,runtime);callback();});return timers.length;
        }});
    vm.runInContext(source.replace(/\bexport\s+(?=(?:const|class|function))/g,'').replace(/^export\s*\{[^}]+\};?\s*$/mg,'')+'\nglobalThis.Runtime=OlpRuntime;',context);
    runtime=new context.Runtime({programPath:'main.pro',programFiles:['main.pro'],programs:[{path:'main.pro',text:`Start;\n${body}\nEnd;`}]},{...adapter,readAddress:adapter.readAddress||readAddress,maxLoopIterations});
    return {runtime,timers,getClock:()=>clock,advance:ms=>{clock+=ms;},delay:ms=>new Promise(resolve=>context.setTimeout(resolve,ms))};
}

test('cheap For, While and nested Goto back edges do not add timer waits',async()=>{
    const {runtime,timers}=fixture(`TimeStart(0);
Int i;
For i=0,i<10,Step[1]
    R[0]=R[0]+1;
EndFor;
Int j=0;
While j<10
    j=j+1;
EndWhile;
L[0]:
R[1]=R[1]+1;
If R[1]<10
    Goto L[0];
EndIf;
TimeOut(0,D[0]);`);
    await runtime.run();
    assert.equal(runtime.readSymbol('R[0]'),10);assert.equal(runtime.readSymbol('R[1]'),10);
    assert.equal(runtime.readSymbol('j'),10);assert.deepEqual(timers,[]);
    assert.equal(runtime.readSymbol('D[0]'),0);
});

test('a coarse cooperative yield is not charged as CPU work in the following slice',async()=>{
    const {runtime,timers,getClock}=fixture('TimeStart(0);\n'+'R[0]=R[0]+1;\n'.repeat(300)+'TimeOut(0,D[0]);');
    await runtime.run();
    assert.deepEqual(timers,[0],'Only instruction 256 requires a cooperative yield.');
    assert.equal(runtime.readSymbol('R[0]'),300);assert.equal(getClock(),15.625);
    assert.equal(runtime.readSymbol('D[0]'),15.625/1000,'TimeOut must include the real scheduler wait.');
});

for(const [name,body]of [
    ['For','For R[0]=0,True,Step[1]\nEndFor;'],
    ['While','While True\nEndWhile;'],
    ['Goto','L[0]:\nGoto L[0];']
]) {
    test(`infinite ${name} remains cancellable through the cooperative budget`,async()=>{
        const {runtime,timers}=fixture(body,{onTimer:(ms,r)=>{if(ms===0)r.stop();}});
        await assert.rejects(runtime.run(),/OLP stopped/);
        assert.equal(runtime.phase,'stopped');assert.ok(runtime.instructionCount>=256);
        assert.deepEqual(timers,[0]);
    });
    test(`infinite ${name} observes Pause before continuing and can then Stop`,async()=>{
        let paused=false;
        const {runtime,timers}=fixture(body,{onTimer:(ms,r)=>{
            if(ms===0&&!paused){r.togglePause();paused=r.paused;}
            else if(ms===50)r.stop();
        }});
        await assert.rejects(runtime.run(),/OLP stopped/);
        assert.equal(paused,true);assert.equal(runtime.phase,'stopped');assert.deepEqual(timers,[0,50]);
    });
}

test('explicit Delay and Wait retain actual wall-clock waiting',async()=>{
    let input=0;
    const {runtime,timers}=fixture('TimeStart(0);\nDelay T[0.05];\nWait In[0]==ON;\nTimeOut(0,D[0]);',{
        readAddress:()=>input,onTimer:ms=>{if(ms===20)input=1;}
    });
    await runtime.run();
    assert.ok(timers.filter(ms=>ms>0).reduce((a,b)=>a+b,0)>=50);
    assert.ok(runtime.readSymbol('D[0]')>=.05);
});

test('a permanent scan can pass 100000 iterations and finish on external input',async()=>{
    let input=0;
    const {runtime,timers}=fixture('While In[0]==OFF\nEndWhile;\nR[0]=1;',{
        readAddress:()=>input,onTimer:(ms,r)=>{if(ms===0&&r.instructionCount>100100)input=1;}
    });
    await runtime.run();
    assert.equal(runtime.phase,'completed');assert.equal(runtime.readSymbol('R[0]'),1);
    assert.ok(runtime.instructionCount>100100);assert.ok(timers.length>1&&timers.length<500);
});

test('an explicit offline debug limit is separate from normal native-style scan execution',async()=>{
    for(const body of ['For R[0]=0,True,Step[1]\nEndFor;','While True\nEndWhile;','L[0]:\nIf True\nGoto L[0];\nEndIf;']) {
        const {runtime}=fixture(body,{maxLoopIterations:5});
        await assert.rejects(runtime.run(),/configured.*iteration limit/);
    }
});

test('Delay resumes with a fresh CPU slice without excluding its actual wall time',async()=>{
    const body='TimeStart(0);\nDelay T[0.05];\nTimeOut(0,D[0]);';
    const fallback=fixture(body);await fallback.runtime.run();
    assert.equal(fallback.runtime.readSymbol('D[0]'),.05);assert.deepEqual(fallback.timers,[20,20,10]);
    let provided;
    provided=fixture(body,{adapter:{delay:ms=>provided.delay(ms)}});await provided.runtime.run();
    assert.equal(provided.runtime.readSymbol('D[0]'),.05);assert.deepEqual(provided.timers,[50]);
});

test('condition polling and socket receive resume without a redundant scheduler timer',async()=>{
    let input=0;
    const condition=fixture('TimeStart(0);\nWait In[0]==ON;\nTimeOut(0,D[0]);',{
        readAddress:()=>input,onTimer:ms=>{if(ms===20)input=1;}
    });
    await condition.runtime.run();assert.equal(condition.runtime.readSymbol('D[0]'),.02);assert.deepEqual(condition.timers,[20]);
    for(const legacy of [false,true]) {
        let f;
        const receive=()=>f.delay(35).then(()=>true);
        f=fixture('TimeStart(0);\nGet Port[2],T[1];\nTimeOut(0,D[0]);',{
            adapter:legacy?{socketCommand:receive}:{socket:{receive}}
        });
        await f.runtime.run();assert.equal(f.runtime.readSymbol('D[0]'),.035);assert.deepEqual(f.timers,[35]);
    }
});

test('Pause and STEP permit waits restart the CPU budget after their actual wait',async()=>{
    for(const step of [false,true]) {
        const f=fixture('',{onTimer:(ms,r)=>{if(ms===50){r.paused=false;if(step)r.stepPermit=1;}}});
        await f.runtime.executeLine('TimeStart(0);');
        if(step){f.runtime.stepMode=true;f.runtime.stepPermit=0;await f.runtime.waitForExecutionPermit();}
        else{f.runtime.paused=true;await f.runtime.waitIfPaused();}
        await f.runtime.yieldExecutionSlice();await f.runtime.executeLine('TimeOut(0,D[0]);');
        assert.equal(f.runtime.readSymbol('D[0]'),.05);assert.deepEqual(f.timers,[50]);
    }
});

test('motion barriers also exclude known waiting from the next CPU slice',async()=>{
    const f=fixture('');await f.runtime.executeLine('TimeStart(0);');
    f.runtime.startMotion(f.delay(40),{nwait:true});await f.runtime.awaitPendingMotions();
    await f.runtime.yieldExecutionSlice();await f.runtime.executeLine('TimeOut(0,D[0]);');
    assert.equal(f.runtime.readSymbol('D[0]'),.04);assert.deepEqual(f.timers,[40]);
});

test('synchronous provider work remains chargeable CPU time',async()=>{
    let f;
    f=fixture('TimeStart(0);\nDelay T[0.05];\nTimeOut(0,D[0]);',{
        adapter:{delay:()=>{f.advance(5);return Promise.resolve();}}
    });
    await f.runtime.run();
    assert.deepEqual(f.timers,[0]);assert.equal(f.runtime.readSymbol('D[0]'),20.625/1000);
});
