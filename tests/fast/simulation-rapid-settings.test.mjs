import assert from 'node:assert/strict';
import test from 'node:test';
import {OlpRuntime} from '../../2_3DSimulation/olp-runtime.mjs';

async function motions(text) {
    const seen = [];
    const project = {programPath:'main.pro', programFiles:['main.pro'], programs:[{path:'main.pro',text:`Start\n${text}\nEnd`}],
        pointRecords:[{kind:'jointPoint',sourceSymbol:'JP',index:0,name:'Target',values:[0,0,-30,0]}]};
    await new OlpRuntime(project, {move:async (_m,_p,_s,_project,_runtime,options) => seen.push(options)}).run();
    return seen;
}

test('RapidMove CP/PTP modes remain independent across commands', async () => {
    const seen = await motions('RapidMove(PTP, ON);\nRapidMove(CP, OFF);\nMovJ JP[0];\nRapidMove(ALL, OFF);\nMovJ JP[0];');
    assert.deepEqual(seen.map(o=>o.rapidMove), [{ptp:true,cp:false},{ptp:false,cp:false}]);
});

test('positive SetAcc overrides command Acc/Dec and OFF restores them', async () => {
    const seen = await motions('SetAcc(25, 35);\nSetAccRamp(20, 30);\nMovJ JP[0], Acc[90], Dec[80];\nSetAcc OFF;\nMovJ JP[0], Acc[90], Dec[80];');
    assert.deepEqual(seen.map(o=>[o.acceleration,o.deceleration]), [[25,35],[90,80]]);
    assert.deepEqual(seen[0].accelerationRamp,[20,30]);
});
