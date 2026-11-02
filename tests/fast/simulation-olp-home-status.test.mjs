import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repoRoot=process.env.INOROBOT_OLP_TEST_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const moduleRoot=process.env.INOROBOT_OLP_MODULE_ROOT??path.join(repoRoot,'2_3DSimulation');
const {evaluateOlpHomeStatus,OLP_HOME_DEFAULT_TOLERANCE,OLP_HOME_TOLERANCE_EPSILON}=
    await import(pathToFileURL(path.join(moduleRoot,'olp-home-status.mjs')));

test('work-origin status agrees with original configured native evaluator cases',()=>{
    const native=JSON.parse(fs.readFileSync(new URL('../fixtures/olp-home-status-leaf-gold.json',import.meta.url),'utf8'));
    assert.equal(OLP_HOME_TOLERANCE_EPSILON,native.toleranceEpsilon);
    assert.match(native.sha256,/^[a-f0-9]{64}$/);
    for(const row of native.cases) {
        const result=evaluateOlpHomeStatus({mode:row.mode,outputBit:row.configuredOutput,
            joints:Array(6).fill(0),jointTolerance:Array(6).fill(.01),
            externalAxes:Array(row.externalAxisCount).fill(0),externalTolerance:.01},
            [row.joint1Delta,0,0,0,0,0],
            row.externalAxisCount?[row.external1Delta]:[],row.independentAxisMask);
        assert.equal(result,row.writes.length?Boolean(row.writes[0].value):null,JSON.stringify(row));
    }
});

test('unconfigured output stays untouched and default tolerance comes from packaged native configuration',()=>{
    assert.equal(evaluateOlpHomeStatus(null,null),null);
    assert.equal(evaluateOlpHomeStatus({mode:0,outputBit:519},null),null);
    assert.equal(evaluateOlpHomeStatus({mode:1,outputBit:-1},null),null);
    assert.equal(OLP_HOME_DEFAULT_TOLERANCE,.01000000001);
    const config={mode:1,outputBit:519,joints:[0,0,0,0]};
    assert.equal(evaluateOlpHomeStatus(config,[.0108,0,0,0]),true);
    assert.equal(evaluateOlpHomeStatus(config,[.011,0,0,0]),false);
    assert.equal(evaluateOlpHomeStatus(config,[0,0,0,360]),false,'native joint comparison does not wrap Euler angles');
});

test('configured axis tolerances and SCARA external-axis mask retain their individual meanings',()=>{
    const config={mode:2,outputBit:600,joints:[0,0,-50,0],jointTolerance:[.1,.2,.3,.4],
        externalAxes:[10],externalTolerance:[.5]};
    assert.equal(evaluateOlpHomeStatus(config,[.09,.19,-49.71,.39],[10.49]),true);
    assert.equal(evaluateOlpHomeStatus(config,[.09,.21,-49.71,.39],[10.49]),false);
    assert.equal(evaluateOlpHomeStatus(config,[.09,.19,-49.71,.39],[20]),false);
    assert.equal(evaluateOlpHomeStatus(config,[.09,.19,-49.71,.39],[20],1<<4),true);
    assert.throws(()=>evaluateOlpHomeStatus(config,[0,0,-50,0],[10,20]),/every current external axis/);
});
