import test from 'node:test';
import assert from 'node:assert/strict';
const moduleUrl=process.env.S7_RAPID_DYNAMICS_MODULE || new URL('../../2_3DSimulation/s7-rapid-dynamics.mjs',import.meta.url);
const {buildS7RapidMoveLimits:build}=await import(moduleUrl);

test('S7 acceleration and deceleration percentages affect torque-limited moves',()=>{
  const options={startJoints:[0,0,-20,0],endJoints:[30,0,-20,0],
    toolLoad:{mass:6,cog:[100,100,0],inertia:[.1,.1,.1]}};
  const normal=build(options);
  const halfAcceleration=build({...options,accelerationPercent:50});
  const halfDeceleration=build({...options,decelerationPercent:50});
  const bothHalf=build({...options,accelerationPercent:50,decelerationPercent:50});
  assert.ok(halfAcceleration.estimatedDurationSeconds>normal.estimatedDurationSeconds*1.01,
    `Acc50 must change a torque-limited move: ${halfAcceleration.estimatedDurationSeconds} versus ${normal.estimatedDurationSeconds}`);
  assert.ok(halfDeceleration.estimatedDurationSeconds>normal.estimatedDurationSeconds*1.01,
    `Dec50 must change a torque-limited move: ${halfDeceleration.estimatedDurationSeconds} versus ${normal.estimatedDurationSeconds}`);
  assert.ok(bothHalf.estimatedDurationSeconds>Math.max(halfAcceleration.estimatedDurationSeconds,halfDeceleration.estimatedDurationSeconds));
});
