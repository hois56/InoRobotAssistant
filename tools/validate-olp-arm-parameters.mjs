import assert from 'node:assert/strict';
import { OlpRuntime } from '../2_3DSimulation/olp-runtime.mjs';

const loading = {
    kind: 'point',
    sourceSymbol: 'P',
    index: 0,
    name: 'Loading',
    values: [-524, 317, -55, 0, 0, 0],
    armParameters: [1, 0, 0, 1]
};
const runtime = new OlpRuntime({
    programs: [{ path: 'main.pro', text: 'MovJ Offset(Loading,Z[40]),V[100],Z[CP];' }],
    pointFiles: [{ path: 'Data/P.pts', kind: 'point', records: [loading] }],
    pointRecords: [loading]
});

const offset = runtime.getMotionTarget('Offset(Loading,Z[40])');
assert.deepEqual(offset.values.slice(0, 3), [-524, 317, -15]);
assert.deepEqual(offset.armParameters, [1, 0, 0, 1]);

const motion = runtime.parseMotion('MovJ Offset(Loading,Z[40]),V[100],Z[CP];');
assert.deepEqual(motion.options.targetOverride.armParameters, [1, 0, 0, 1]);

console.log('OLP arm-parameter validation passed: P.pts arm configuration survives named-point offsets and motion parsing.');
