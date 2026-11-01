import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getS7RampParameters,getS7RampTimeMilliseconds,getS7FreePlanTransitionMilliseconds,
  S7_NATIVE_MECHANICAL_JERK_PARAMETERS,getS7MechanicalJerkTimeSeconds,getS7RapidMoveJerkTiming} from '../../2_3DSimulation/s7-native-ramp.mjs';
const gold=JSON.parse(readFileSync(new URL('../fixtures/simulation-s7-native-ramp-gold.json',import.meta.url),'utf8'));

test('S7 configured ramp mapping matches original ARM preprocessing',()=>{
  assert.equal(gold.runStrDefaultStartRampPercent,50);
  assert.equal(gold.runStrDefaultStopRampPercent,50);
  assert.equal(gold.defaultJerkTimeMs,50);
  for(const row of gold.preprocessingOracle) {
    const start=getS7RampParameters(row.startRampPercent);
    const stop=getS7RampParameters(row.stopRampPercent);
    assert.equal(start.localJerkRatioPerMillisecond,row.startLocalJerkRatioPerMs);
    assert.equal(stop.localJerkRatioPerMillisecond,row.stopLocalJerkRatioPerMs);
    assert.equal(stop.jerkLevel,row.storedJerkLevel);
    assert.equal(getS7RampTimeMilliseconds(row.startRampPercent),row.startConfiguredRampMs);
  }
});

test('S7 FreePlan transition clamp matches isolated original ARM execution',()=>{
  for(const row of gold.clampOracle)
    assert.equal(getS7FreePlanTransitionMilliseconds(row.periodSeconds,row.jerkLevel,row.setJerkTimeMs),row.actualTransitionMs);
});

test('S7 ramp command and minimum time limits remain finite',()=>{
  assert.deepEqual(getS7RampParameters(0),getS7RampParameters(1));
  assert.deepEqual(getS7RampParameters(200),getS7RampParameters(120));
  const limited=getS7RampParameters(120,10,8);
  assert.ok(limited.rampTimeMilliseconds>=7.999999);
  assert.throws(()=>getS7RampParameters(NaN),/finite/);
  assert.throws(()=>getS7RampParameters(50,0),/positive/);
});

test('selected S7 mechanical parameters disable mechanical-time branch exactly as native',()=>{
  assert.deepEqual(Object.values(S7_NATIVE_MECHANICAL_JERK_PARAMETERS),gold.selectedS7MechanicalParameters);
  for(const row of gold.mechanicalOracle)
    assert.equal(getS7MechanicalJerkTimeSeconds(row.armLengthMm,row.payloadMassKg),row.actualMechanicalJerkTimeSeconds);
  assert.equal(getS7RapidMoveJerkTiming({naturalPeriodSeconds:.04}).transitionTimeMilliseconds,40);
  assert.equal(getS7RapidMoveJerkTiming({naturalPeriodSeconds:.1}).transitionTimeMilliseconds,75);
});
