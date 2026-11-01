import assert from 'node:assert/strict';
import test from 'node:test';
import {createRapidMoveState, advanceRapidMoveState} from '../../2_3DSimulation/motion-program-core.mjs';

const joints = [414.8, 735.3, 1605.8333333333333, 2000].map((maxSpeed, index) => ({
    definition: {type: index === 2 ? 'prismatic' : 'revolute', maxSpeed, maxAcceleration: 100, maxDeceleration: 100}
}));
const start = [0, -40, -20, 0];
const target = [50, 35, -110, 90];
const options = {enabled: true, modelName: 'IR-S7-60Z20', robotType: 'scara', toolLoad: {mass: 1, cog: [0,0,0], inertia: [0,0,0]}};
const make = (extra = {}, from = start, to = target) => createRapidMoveState(from, to, joints, 100, {...options, ...extra});

test('S7 Z20 uses the selected firmware model and converts J3 screw speed to mm/s', () => {
    const state = make();
    assert.equal(state.planner, 's7-rapid-dynamics');
    assert.equal(state.dynamics.sourceModel, 'IR-S7-60Z20S3-C2LH-INT_01741021');
    assert.ok(Math.abs(state.dynamics.jointVelocityLimits[2] - 1605.8333333333333) < 1e-9);
    assert.ok(state.durationSeconds > 0 && Number.isFinite(state.durationSeconds));
    // The unrelated ordinary playback acceleration of 100 above must not set Rapid acceleration.
    assert.ok(state.maxProgressAcceleration > 100 / 90);
});

test('S7 end load and separate acceleration/deceleration change the planned time', () => {
    const light = make();
    const heavy = make({toolLoad: {mass: 7, cog: [100,0,0], inertia: [.02,.02,.04]}});
    assert.ok(heavy.durationSeconds > light.durationSeconds);
    assert.ok(make({accelerationPercent: 10}).durationSeconds > light.durationSeconds);
    assert.ok(make({decelerationPercent: 10}).durationSeconds > light.durationSeconds);
});

test('S7 analytic motion advances the entire elapsed interval and finishes at rest', () => {
    const one = make(), many = make();
    const total = one.durationSeconds * .63;
    advanceRapidMoveState(one, total, start, target, null, 'scara');
    for (let i = 0; i < 63; i++) advanceRapidMoveState(many, total / 63, start, target, null, 'scara');
    assert.ok(Math.abs(one.progress - many.progress) < 1e-10);
    assert.ok(one.progress > 0 && one.progress < 1);
    advanceRapidMoveState(one, one.durationSeconds, start, target, null, 'scara');
    assert.equal(one.progress, 1);
    assert.equal(one.velocity, 0);
    assert.equal(one.completed, true);
});

test('S7 mapping is limited to Z20 and disabled RapidMove keeps the existing path', () => {
    assert.notEqual(make({modelName: 'IR-S7-60Z30'}).planner, 's7-rapid-dynamics');
    assert.notEqual(make({enabled: false}).planner, 's7-rapid-dynamics');
    assert.notEqual(make({robotType: 'six-axis', modelName:'IR-R7H-90'}).planner, 's7-rapid-dynamics');
});
