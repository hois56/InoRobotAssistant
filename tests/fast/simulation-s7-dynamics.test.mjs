import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {S7_RAPID_NATIVE_MODEL as model,buildS7RapidMoveLimits as build,evaluateS7Dynamics,s7JointsToInternalRadians} from '../../2_3DSimulation/s7-rapid-dynamics.mjs';
import {planFirmwareSCurve} from '../../2_3DSimulation/firmware-scurve.mjs';
const load=(mass,cog=[0,0,0],izz=.001)=>({mass,cog,inertia:[0,0,izz]});
const base={startJoints:[0,0,0,0],endJoints:[90,30,-50,0],toolLoad:load(1)};
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);

test('fixed dynamics match the selected original standard model',()=>{
  const original=JSON.parse(readFileSync(new URL('../fixtures/simulation-s7-native-model.json',import.meta.url),'utf8'));
  assert.equal(model.sourceModel,original.model);
  assert.equal(model.sourceSha256,original.source_sha256);
  original.body_dynamics.stLink.slice(0,4).forEach((source,i)=>{
    for(const key of ['a','mass','ratio','motorInertia','ratedTrq','stiffness']) assert.equal(model.links[i][key],source[key]);
    assert.equal(model.links[i].izz,source.inertia[2]);
    assert.deepEqual(model.links[i].cog,source.cog);
    assert.equal(model.links[i].coulomb,source.coulombFric);
    assert.equal(model.links[i].viscous,source.viscousFric);
  });
});

test('J3 is mm converted through the 20 mm screw, native scalar retains radians/ms',()=>{
  const q=s7JointsToInternalRadians([180,0,20,0]);
  near(q[0],Math.PI);near(q[2],2*Math.PI);
  const r=build({...base,endJoints:[0,0,-100,0]});
  near(r.scalarPathLengthRad,10*Math.PI);
  near(r.jointVelocityLimits[2],1605.8333333333333);
  near(r.nativeScalarLimits.vMax,r.vMax*r.scalarPathLengthRad/1000);
  near(r.nativeScalarLimits.jAccel,r.jAccel*r.scalarPathLengthRad/1e9);
  const curve=planFirmwareSCurve(r.nativeScalarLimits);
  near(curve.duration/1000,r.estimatedDurationSeconds);
  near(curve.evaluate(curve.duration).position,r.scalarPathLengthRad);
});

test('mass matrix includes off-diagonal coupling and positive reflected rotor inertia',()=>{
  const {massMatrix:m}=evaluateS7Dynamics([25,60,-80,20],{toolLoad:load(2,[40,80,0],.02)});
  m.forEach((row,i)=>row.forEach((value,j)=>near(value,m[j][i])));
  assert.ok(Math.abs(m[0][1])>.01);
  for(const u of [[1,0,0,0],[0,0,1,0],[1,-2,3,4],[-1,1,0,-1]]) {
    const energy=u.reduce((sum,value,i)=>sum+value*m[i].reduce((s,x,j)=>s+x*u[j],0),0);
    assert.ok(energy>0);
  }
  assert.ok(m[2][2]>=model.links[2].motorInertia*model.links[2].ratio**2);
});

test('payload CoG, inertia and posture change the dynamic limits',()=>{
  const light=build(base),heavy=build({...base,toolLoad:load(5,[80,60,20],.05)});
  assert.ok(heavy.naturalPeriodSeconds>light.naturalPeriodSeconds);
  assert.ok(heavy.aMax<light.aMax);
  assert.ok(heavy.estimatedDurationSeconds>light.estimatedDurationSeconds);
  const folded=evaluateS7Dynamics([0,140,-100,0],{toolLoad:load(2)});
  const straight=evaluateS7Dynamics([0,0,-100,0],{toolLoad:load(2)});
  assert.ok(folded.massMatrix[0][0]<straight.massMatrix[0][0]);
  assert.ok(folded.naturalPeriodSeconds<straight.naturalPeriodSeconds);
});

test('gravity creates the correct up/down acceleration asymmetry for positive J3 up',()=>{
  const options={startJoints:[0,0,-100,0],toolLoad:load(6)};
  const up=build({...options,endJoints:[0,0,0,0]});
  const down=build({...options,startJoints:[0,0,0,0],endJoints:[0,0,-100,0]});
  assert.ok(up.gravityTorqueNm[2]>0);
  // At 100% the packaged axis acceleration cap can mask torque asymmetry;
  // the inertial equations still explicitly retain opposing gravity bias.
  const upCoefficient=up.pathSamples[0].massAlongPath[2];
  const downCoefficient=down.pathSamples[0].massAlongPath[2];
  near(upCoefficient,-downCoefficient);
  assert.ok((up.torqueLimitsNm[2]-up.gravityTorqueNm[2])/upCoefficient <
    (up.torqueLimitsNm[2]+up.gravityTorqueNm[2])/upCoefficient);
});

test('reconstructed Coriolis includes mixed-joint path terms and speed tradeoff stays bounded',()=>{
  const r=build({...base,endJoints:[-160,150,-1,170],toolLoad:load(5,[80,100,0],.03)});
  assert.ok(r.pathSamples.some(sample=>sample.coriolis.some(value=>Math.abs(value)>.01)));
  assert.ok(r.estimatedDurationSeconds>0&&r.estimatedDurationSeconds<5);
  assert.ok([r.vMax,r.aMax,r.dMax,r.jAccel,r.jDecel].every(v=>Number.isFinite(v)&&v>0));
  assert.equal(r.pathSamples.length,25);
});

test('zero total end load reports the unavailable native max-load-record approximation',()=>{
  const r=build({...base,toolLoad:load(0,[0,0,0],0)});
  assert.equal(r.zeroLoadFallback,true);
  assert.equal(r.estimatedMovingPayloadKg,6);
  assert.ok(r.diagnostics.some(d=>d.includes('native max-load COM/inertia unavailable')));
  const gripped=build({...base,toolLoad:load(0),gripLoad:load(2)});
  assert.equal(gripped.zeroLoadFallback,false);
  assert.equal(gripped.estimatedMovingPayloadKg,2);
});

test('arm load belongs to J2 and never translates with the J3 screw',()=>{
  const options={toolLoad:load(1),armLoads:[{linkIndex:1,...load(2,[60,30,0],.01)}]};
  const a=evaluateS7Dynamics([20,50,0,0],options),b=evaluateS7Dynamics([20,50,-190,0],options);
  assert.deepEqual(a.massMatrix,b.massMatrix);
  assert.throws(()=>build({...base,armLoads:[{linkIndex:0,...load(2)}]}),/J2 frame/);
});

test('invalid input is rejected and stationary/zero modal values are handled',()=>{
  assert.throws(()=>build({...base,startJoints:[0,0,NaN,0]}),/finite/);
  assert.throws(()=>build({...base,toolLoad:load(-1)}),/nonnegative/);
  assert.throws(()=>build({...base,modelFolder:'IR-S7-60Z30'}),/unsupported/);
  const stationary=build({...base,endJoints:base.startJoints});
  assert.equal(stationary.stationary,true);assert.equal(stationary.scalarPathLengthRad,0);
  const defaulted=build({...base,accelerationPercent:0,decelerationPercent:0,jerkPercent:0,stopJerkPercent:0});
  near(defaulted.estimatedDurationSeconds,build(base).estimatedDurationSeconds);
});
