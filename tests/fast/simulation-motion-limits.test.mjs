import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { calculateMovjDuration, createRapidMoveState } from '../../2_3DSimulation/motion-program-core.mjs';
import { auditSimulationMotion } from '../../tools/audit-simulation-motion.mjs';

const joints = [{ definition: { maxSpeed: 80, maxAcceleration: 100, maxDeceleration: 100 } }];

test('normal MOVJ duration observes acceleration and deceleration percentages independently', () => {
    const full = calculateMovjDuration([0], [10], joints, 100);
    const lowDec = calculateMovjDuration([0], [10], joints, 100, { acceleration: 100, deceleration: 10 });
    const lowAcc = calculateMovjDuration([0], [10], joints, 100, { accelerationPercent: 10, decelerationPercent: 100 });
    assert.ok(lowDec >= full * Math.sqrt(10) - 1e-10);
    assert.ok(Math.abs(lowAcc - lowDec) < 1e-10);
    assert.ok(calculateMovjDuration([0], [10], joints, 100, { deceleration: .5 }) >= full * Math.sqrt(200) - 1e-10);
    // Lower acceleration must not slow an already speed-limited long move.
    assert.equal(calculateMovjDuration([0], [10000], joints, 100, { acceleration: 10 }),
        calculateMovjDuration([0], [10000], joints, 100));
});

test('OLP conservative scaling respects the smaller Acc/Dec rather than their average', () => {
    const source = fs.readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
    const context = vm.createContext({});
    vm.runInContext(source.match(/function getOlpAccelerationScale\([^]*?\n\}/)[0], context);
    assert.ok(Math.abs(context.getOlpAccelerationScale({ acceleration: 100, deceleration: 10 }) - Math.sqrt(.1)) < 1e-10);
    assert.equal(context.getOlpAccelerationScale({ acceleration: 120, deceleration: 120 }), 1);
    assert.ok(Math.abs(context.getOlpAccelerationScale({ deceleration: .5 }) - Math.sqrt(.005)) < 1e-10);
});

test('Rapid Move without an exact source respects catalog acceleration and instruction percentages', () => {
    const full = createRapidMoveState([0], [10], joints, 100, { enabled: true });
    const slow = createRapidMoveState([0], [10], joints, 50,
        { enabled: true, accelerationPercent: 20, decelerationPercent: 30 });
    assert.ok(full.maxProgressAcceleration <= 10);
    assert.ok(Math.abs(slow.maxProgressVelocity / full.maxProgressVelocity - .5) < 1e-10);
    assert.ok(Math.abs(slow.maxProgressAcceleration / full.maxProgressAcceleration - .2) < 1e-10);
    assert.ok(Math.abs(slow.maxProgressDeceleration / full.maxProgressDeceleration - .3) < 1e-10);
});

test('ordinary and Rapid Move data match their respective firmware records for all mapped models', () => {
    const rows = auditSimulationMotion();
    assert.equal(rows.length, 31);
    assert.equal(rows.filter(row => row.status === 'matched').length, 29);
    assert.deepEqual(rows.filter(row => row.status === 'source-selection-required').map(row => row.folder), ['IR-R35-185', 'IR-R50-250']);
    assert.deepEqual(rows.filter(row => row.status === 'mismatch'), []);
});
