import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planFirmwareSCurve} from '../../2_3DSimulation/firmware-scurve.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/firmware-scurve-gold.json', import.meta.url)));
const nativeFixture = JSON.parse(fs.readFileSync(new URL('../fixtures/firmware-scurve-native-unit-gold.json', import.meta.url)));
const scaraFixture = JSON.parse(fs.readFileSync(new URL('../fixtures/firmware-scurve-scara-gold.json', import.meta.url)));
const goldCases = [...fixture.cases, ...nativeFixture.cases, ...scaraFixture.cases];
const close = (a, b, label, tol = 2e-10) => assert.ok(
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} != ${b}`);

for (const [index, expected] of goldCases.entries()) {
  const profile = planFirmwareSCurve(expected.input);
  close(profile.duration, expected.duration, `gold duration ${index}`);
  expected.stageDurations.forEach((t, i) => close(profile.stageDurations[i], t, `gold stage ${index}/${i}`));
  assert.deepEqual(profile.evaluate(0), {position: 0, velocity: 0, acceleration: 0});
  assert.deepEqual(profile.evaluate(profile.duration), {position: expected.input.distance, velocity: 0, acceleration: 0});
  let last = -Infinity;
  for (let i = 0; i < 33; i++) {
    const sample = profile.evaluate(profile.duration * i / 32);
    assert.ok(sample.position >= last - 1e-8, `monotonic position ${index}`);
    assert.ok(sample.velocity <= expected.input.vMax * (1 + 1e-8), `velocity cap ${index}`);
    assert.ok(sample.acceleration <= expected.input.aMax * (1 + 1e-8), `acceleration cap ${index}`);
    assert.ok(sample.acceleration >= -expected.input.dMax * (1 + 1e-8), `deceleration cap ${index}`);
    last = sample.position;
  }
  for (const s of profile.segments.slice(1)) {
    if (s.startTime <= 0 || s.startTime >= profile.duration) continue;
    const at = profile.evaluate(s.startTime);
    close(at.position, s.startPosition, 'position continuity');
    close(at.velocity, s.startVelocity, 'velocity continuity');
    close(at.acceleration, s.startAcceleration, 'acceleration continuity');
  }
}
const example = {distance: 10, vMax: 100, aMax: 200, jAccel: 1000};
close(planFirmwareSCurve(example).duration, 0.716227766016838, 'short firmware profile');
assert.ok(Math.abs(planFirmwareSCurve(example).duration - 0.6839903786706788) > .03,
  'must retain firmware short-distance rule, not generic time-optimal result');
const reverse = planFirmwareSCurve({...example, distance: -10});
const forward = planFirmwareSCurve(example);
for (let i = 0; i < 20; i++) {
  const t = forward.duration * i / 20, p = forward.evaluate(t), n = reverse.evaluate(t);
  for (const key of ['position','velocity','acceleration']) close(n[key], -p[key], 'reverse '+key);
}
assert.equal(planFirmwareSCurve({...example, distance: 0}).duration, 0);
assert.throws(() => planFirmwareSCurve({...example, startVelocity: 1}), /Only zero/);
for (const key of ['vMax','aMax','dMax','jAccel','jDecel']) {
  assert.throws(() => planFirmwareSCurve({...example, [key]: 0}), RangeError);
}
const nativeShort = planFirmwareSCurve(nativeFixture.cases[0].input);
const wrongSeconds = planFirmwareSCurve({distance: .05, vMax: 2, aMax: 5, jAccel: 100});
assert.ok(Math.abs(nativeShort.duration / 1000 - wrongSeconds.duration) > .005,
  'unit-sensitive firmware early-exit requires native rad/ms inputs');
console.log(`PASS: ${goldCases.length} original ARM gold profiles (ArticulatedArm_A, Scara_A, Scara_R); native units, boundaries, continuity, limits, reverse, validation`);
