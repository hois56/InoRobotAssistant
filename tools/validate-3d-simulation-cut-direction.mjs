import assert from 'node:assert/strict';
import { getExtrudeCutLayout, normalizeExtrudeCutDirection } from '../2_3DSimulation/extrude-cut-core.mjs';

assert.equal(normalizeExtrudeCutDirection('positive'), 'positive');
assert.equal(normalizeExtrudeCutDirection('negative'), 'negative');
assert.equal(normalizeExtrudeCutDirection('unexpected'), 'positive');

assert.deepEqual(getExtrudeCutLayout(100, 25, 'positive'), {
    direction: 'positive',
    cutStartZ: 0,
    cutEndZ: 25,
    remainingStartZ: 25,
    remainingEndZ: 100,
    remainingHeight: 75
});
assert.deepEqual(getExtrudeCutLayout(100, 25, 'negative'), {
    direction: 'negative',
    cutStartZ: 75,
    cutEndZ: 100,
    remainingStartZ: 0,
    remainingEndZ: 75,
    remainingHeight: 75
});
assert.equal(getExtrudeCutLayout(100, 0, 'positive'), null);
assert.equal(getExtrudeCutLayout(100, 101, 'positive'), null);

console.log('3D Simulation extrude-cut direction validation passed.');
