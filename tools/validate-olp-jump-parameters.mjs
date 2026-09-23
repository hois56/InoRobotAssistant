import assert from 'node:assert/strict';
import { OlpRuntime } from '../2_3DSimulation/olp-runtime.mjs';

const loading = {
    kind: 'point',
    index: 0,
    name: 'Loading',
    sourceSymbol: 'P',
    values: [-524.000047, 357, -55, 0, 0, 0]
};
const runtime = new OlpRuntime({
    pointFiles: [{ path: 'Data/P.pts', kind: 'point', records: [loading] }],
    pointRecords: [loading],
    programs: []
});

const jump = runtime.parseMotion('Jump Loading,V[100],Z[0],Tool[1],Wobj[0],LH[0],MH[-20],RH[0];');
assert.equal(jump.motion, 'JUMP');
assert.equal(jump.pointExpression, 'Loading');
assert.equal(jump.options.jumpLiftHeight, 0);
assert.equal(jump.options.jumpMiddleHeight, -20);
assert.equal(jump.options.jumpReturnHeight, 0);
assert.equal(jump.options.jumpHeight, null);

const offset = runtime.getMotionTarget('Offset(Loading, Z[40])');
assert.deepEqual(offset.values.slice(0, 3), [-524.000047, 357, -15]);

console.log('OLP JUMP parameter validation passed: LH/MH/RH parsed and Z offset resolved.');
