import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRapidMoveState} from '../../2_3DSimulation/motion-program-core.mjs';
const reference=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-s7-timing-path.json',import.meta.url),'utf8'));

test('the supplied S7 three-move cycle stays near its measured VC motion time',()=>{
    // This is one externally measured stop-to-stop reference, not a general
    // robot accuracy guarantee. Browser scheduling is tested separately.
    const seconds=reference.moves.reduce((sum,move)=>sum+createRapidMoveState(move.start,move.end,[],100,{
        enabled:true,robotType:'scara',modelName:'IR-S7-60Z20',toolLoad:reference.payload
    }).durationSeconds,0);
    const relativeError=Math.abs(seconds-reference.referenceVcTimeSeconds)/reference.referenceVcTimeSeconds;
    assert.ok(relativeError<.03,`planned ${seconds}s, supplied VC ${reference.referenceVcTimeSeconds}s`);
});
