import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const repoRoot=process.env.INOROBOT_OLP_TEST_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const overrides=process.env.INOROBOT_GENERATOR_STAGE;

function fixture() {
    const alerts=[],state={zipConstructed:0,previews:0};
    const context=vm.createContext({Date,console,crypto:{randomUUID:()=> 'wait-limit-process'},window:{},
        document:{addEventListener(){},getElementById(){return{value:'WaitLimitProject'};}},
        alert:message=>alerts.push(message),JSZip:class{constructor(){state.zipConstructed++;throw new Error('ZIP construction reached');}}});
    for(const file of ['assets.js','generator.js','app.js']) {
        const source=overrides&&file!=='assets.js'?path.join(overrides,file):path.join(repoRoot,'4_ProjectGenerator',file);
        vm.runInContext(fs.readFileSync(source,'utf8'),context,{filename:source});
    }
    context.onPreview=()=>state.previews++;
    vm.runInContext('updatePreview=()=>onPreview();globalThis.api={Generator,state,ProcessStep,exportProj};',context);
    const api=context.api;
    api.state.steps=[new api.ProcessStep(1)];
    return{context,api,alerts,observed:state};
}

test('additional waits stop at Wait9 before the reserved Pre_work position number',()=>{
    const f=fixture(),step=f.api.state.steps[0];step.ExtraWaitCount=7;
    f.context.window.addExtraWait(0);
    assert.equal(step.ExtraWaitCount,8);assert.equal(f.observed.previews,1);
    f.context.window.addExtraWait(0);
    assert.equal(step.ExtraWaitCount,8);assert.equal(f.observed.previews,1);
    assert.match(f.alerts.at(-1),/8/);
});

test('legacy invalid wait counts are rejected before export without silently changing the configured process',async()=>{
    for(const value of [9,-1,1.5]) {
        const f=fixture();f.api.state.steps[0].ExtraWaitCount=value;
        await f.api.exportProj();
        assert.equal(f.observed.zipConstructed,0);
        assert.equal(f.api.state.steps[0].ExtraWaitCount,value);
        assert.match(f.alerts.at(-1),/0.*8/);
    }
});

test('valid 0 through 8 additional waits retain unique point addresses and the original process naming',()=>{
    const f=fixture(),step=f.api.state.steps[0];
    for(let extra=0;extra<=8;extra++) {
        step.ExtraWaitCount=extra;
        assert.equal(f.api.Generator.LastWaitOffset(step),extra+1);
        const text=f.api.Generator.DataPoints(f.api.state.steps,f.api.state.options);
        const numbers=[...text.matchAll(/^P\[(\d+)\]/gm)].map(match=>Number(match[1]));
        assert.equal(new Set(numbers).size,numbers.length);
        assert.ok(numbers.includes(110)&&numbers.includes(111));
        assert.equal(step.ProcessName,'sP01_Tray_Get');
        if(extra===8){assert.ok(numbers.includes(109));assert.match(text,/P1_Wait9/);}
    }
});
