/*
 * Offline RapidMove engineering estimator for one fixed standard S7 model.
 * Exact packaged fields and native unit conversions are kept separate from the
 * sampled path planner. This is not a complete port of FreePlanAdapt and
 * has not been calibrated against a connected robot.
 */
import {planFirmwareSCurve} from './firmware-scurve.mjs?v=20261102-scurve160-1';
import {getS7RapidMoveJerkTiming} from './s7-native-ramp.mjs?v=20261102-s7-ramp-1';
const PI = Math.PI;
const DEG = PI / 180;
const SCREW_M_PER_RAD = 0.020 / (2 * PI);
const SOURCE = 'IR-S7-60Z20S3-C2LH-INT_01741021';
const LINKS = [
  {a:.325,mass:3.4141462617,cog:[.1521754091,0,0],izz:.0713425268,ratio:81,motorInertia:.0001235964,ratedTrq:1.6,stiffness:49105.3283900963,coulomb:9.5515449321,viscous:5.8351187444},
  {a:.275,mass:6.2271917368,cog:[.0820925744,0,0],izz:.0644832895,ratio:51,motorInertia:.0000649,ratedTrq:.96,stiffness:13241.9071838359,coulomb:5.3949058103,viscous:2.4938793127},
  {a:0,mass:.4947,cog:[0,0,0],izz:.00009956,ratio:1.2682926829,motorInertia:.0000102,ratedTrq:.48,stiffness:354.7405777852,coulomb:.108369,viscous:.00052},
  {a:0,mass:.4947,cog:[0,0,0],izz:.000529,ratio:13.6363636364,motorInertia:.0000238,ratedTrq:.48,stiffness:416.7966667035,coulomb:.2107098216,viscous:.0224234149}
];
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const S7_RAPID_NATIVE_MODEL = freeze({
  sourceModel:SOURCE,
  sourcePath:`params_package/Standard/Body/${SOURCE}/${SOURCE}.json`,
  sourceSha256:'93852072012378f40d8db0661b603e4b35d2076e89cf73cbcfe9fa4d52c82360',
  simulatorModelName:'IR-S7-60Z20S-INT',simulatorModelFolder:'IR-S7-60Z20',
  jointUnits:['deg','deg','mm','deg'],screwLeadMm:20,nominalPayloadKg:6,
  rapidVelocityDegreesPerSecond:[414.8,735.3,28905,2000],
  rapidAccelerationDegreesPerSecondSquared:[6000,6000,800000,80000],
  defaultModalRampPercent:50,defaultJerkTimeMilliseconds:50,initialPlanningTorqueRatios:[2,2,2,2],links:LINKS
});
const zeros = () => Array.from({length:4},()=>[0,0,0,0]);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const mv = (m,v) => m.map(row=>dot(row,v));
const rotate = (p,t) => [Math.cos(t)*p[0]-Math.sin(t)*p[1],Math.sin(t)*p[0]+Math.cos(t)*p[1]];
const perp = p => [-p[1],p[0],0];
function finite(value,name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function vector(value,name,length=3) {
  if (!Array.isArray(value) || value.length!==length) throw new TypeError(`${name} must contain ${length} numbers`);
  return value.map((v,i)=>finite(v,`${name}[${i}]`));
}
function normalizeLoad(value,name) {
  if (value == null) return {mass:0,cog:[0,0,0],inertia:[0,0,0]};
  const mass=finite(value.mass??0,`${name}.mass`);
  const cog=vector(value.cog??[0,0,0],`${name}.cog`).map(v=>v/1000);
  const inertia=vector(value.inertia??[0,0,0],`${name}.inertia`);
  if (mass<0 || inertia.some(v=>v<0)) throw new RangeError(`${name} mass and principal inertia must be nonnegative`);
  return {mass,cog,inertia};
}
function percent(value,fallback,name) {
  const number=value===0?fallback:(value??fallback);
  finite(number,name);
  if (number<=0 || number>100) throw new RangeError(`${name} must be in (0,100]`);
  return number/100;
}
export function s7JointsToInternalRadians(joints) {
  const q=vector(joints,'joints',4);
  return [q[0]*DEG,q[1]*DEG,q[2]*2*PI/20,q[3]*DEG];
}
function bodyMatrix(m,q,body,frame) {
  if (body.mass===0 && body.inertia[2]===0) return;
  const t1=q[0],t2=t1+q[1],t4=t2+q[3];
  const p1=rotate([LINKS[0].a,0],t1),p2=rotate([LINKS[1].a,0],t2);
  const local=rotate(body.cog,frame===0?t1:frame===1?t2:t4);
  let p,rel,j=[[0,0,0],[0,0,0],[0,0,0],[0,0,0]],w;
  if (frame===0) {
    p=local;j[0]=perp(p);w=[1,0,0,0];
  } else if (frame===1) {
    p=[p1[0]+local[0],p1[1]+local[1]];
    j[0]=perp(p);j[1]=perp(local);w=[1,1,0,0];
  } else {
    rel=[p2[0]+local[0],p2[1]+local[1]];
    p=[p1[0]+rel[0],p1[1]+rel[1]];
    j[0]=perp(p);j[1]=perp(rel);j[2]=[0,0,SCREW_M_PER_RAD];
    if (frame===3) j[3]=perp(local);
    w=frame===3?[1,1,0,1]:[1,1,0,0];
  }
  for(let i=0;i<4;i++) for(let k=0;k<4;k++) m[i][k]+=body.mass*dot(j[i],j[k])+body.inertia[2]*w[i]*w[k];
}
function prepareLoads(options,diagnostics) {
  const tool=normalizeLoad(options.toolLoad,'toolLoad'),grip=normalizeLoad(options.gripLoad,'gripLoad');
  const distal=[tool,grip];
  // Native DyncPlanLoadUpdat substitutes its max-load record below 1e-5 kg.
  // That live record is unavailable offline. Nominal 6 kg at the flange with
  // zero COM inertia is an explicitly disclosed approximation of that branch.
  const zeroLoadFallback=tool.mass+grip.mass<1e-5;
  if (zeroLoadFallback) {
    distal.length=0;distal.push({mass:6,cog:[0,0,0],inertia:[0,0,0]});
    diagnostics.push('zero-load-native-branch: approximated by nominal 6 kg at flange; native max-load COM/inertia unavailable');
  }
  const arms=(options.armLoads??[]).map((load,i)=>{
    if (load.linkIndex!==1) throw new RangeError(`armLoads[${i}].linkIndex must be 1 (zero-based J2 frame)`);
    return normalizeLoad(load,`armLoads[${i}]`);
  });
  return {distal,arms,zeroLoadFallback,toolMassKg:tool.mass,gripMassKg:grip.mass};
}
function massMatrix(q,loads,includeRotor=true) {
  const m=zeros();
  // The original SCARA library uses bodies 0, 1 and 3. Index 2 carries the
  // screw/motor parameters and is not a second distal rigid body.
  LINKS.forEach((link,index)=>{if(index!==2) bodyMatrix(m,q,{mass:link.mass,cog:link.cog,inertia:[0,0,link.izz]},index);});
  loads.arms.forEach(body=>bodyMatrix(m,q,body,1));
  loads.distal.forEach(body=>bodyMatrix(m,q,body,3));
  // Native ForwordDyncCalc adds reflected motor inertia for torque limits;
  // MaxNaturalCycleCalc uses the rigid-body matrix before that addition.
  if(includeRotor) LINKS.forEach((link,i)=>{m[i][i]+=link.motorInertia*link.ratio**2;});
  return m;
}
function coriolisAlongPath(q,u,loads) {
  const h=1e-5,derivatives=[];
  for(let k=0;k<4;k++) {
    if(k===2) {derivatives.push(zeros());continue;}
    const hi=q.slice(),lo=q.slice();hi[k]+=h;lo[k]-=h;
    const mh=massMatrix(hi,loads),ml=massMatrix(lo,loads);
    derivatives.push(mh.map((row,i)=>row.map((v,j)=>(v-ml[i][j])/(2*h))));
  }
  return [0,1,2,3].map(i=>{
    let c=0;
    for(let j=0;j<4;j++) for(let k=0;k<4;k++)
      c+=(derivatives[k][i][j]+derivatives[j][i][k]-derivatives[i][j][k])*u[j]*u[k]/2;
    return c;
  });
}
function naturalPeriod(rigidBodyMatrix) {
  // MC_Scara_A MaxNaturalCycleCalc + MaxEigCalc: float32 matrix output,
  // row division by stiffness, max-norm power iteration from [1,0,0,0],
  // 10 iterations, absolute eigenvalue tolerance 2.533e-8.
  const a=rigidBodyMatrix.map((row,i)=>row.map(v=>Math.fround(v)/LINKS[i].stiffness));
  let vector=[1,0,0,0],previous=0;
  for(let iteration=0;iteration<10;iteration++) {
    const next=mv(a,vector),eigenvalue=Math.max(...next.map(Math.abs));
    if(Math.abs(eigenvalue-previous)<=2.533e-8) return 2*PI*Math.sqrt(eigenvalue);
    previous=eigenvalue;
    vector=next.map(v=>v/eigenvalue);
  }
  return 2*PI*Math.sqrt(previous);
}
function gravityTorque(loads) {
  // Native SCARA gravity output includes the final rigid body and end load.
  const distalMass=LINKS[3].mass+loads.distal.reduce((sum,body)=>sum+body.mass,0);
  return [0,0,distalMass*9.81*SCREW_M_PER_RAD,0];
}
/** Model diagnostic; q input is simulator [deg,deg,mm,deg]. */
export function evaluateS7Dynamics(joints,options={}) {
  const diagnostics=[],loads=prepareLoads(options,diagnostics),q=s7JointsToInternalRadians(joints);
  const m=massMatrix(q,loads),rigidBody=massMatrix(q,loads,false);
  return {massMatrix:m,rigidBodyMassMatrix:rigidBody,gravityTorqueNm:gravityTorque(loads),
    naturalPeriodSeconds:naturalPeriod(rigidBody),zeroLoadFallback:loads.zeroLoadFallback,diagnostics};
}
function biasRange(sample,index,vMax,u,gravity) {
  const c=sample.coriolis[index],f=LINKS[index].viscous*u[index];
  const constant=gravity[index]+(u[index]===0?0:LINKS[index].coulomb*Math.sign(u[index]));
  const speeds=[0,vMax],vertex=c===0?-1:-f/(2*c);
  if(vertex>0&&vertex<vMax) speeds.push(vertex);
  const values=speeds.map(v=>constant+f*v+c*v*v);
  return [Math.min(...values),Math.max(...values)];
}
/**
 * Joint positions: [J1 deg, J2 deg, J3 mm (+Z up), J4 deg].
 * Tool/grip load: kg, flange cog mm, COM principal inertia kg m^2.
 * Arm loads: same units, linkIndex:1, cog in the zero-based J2 frame.
 * Returned v/a/j are normalized path-progress per second; nativeScalarLimits
 * uses actual joint-path radians and milliseconds for planFirmwareSCurve.
 */
export function buildS7RapidMoveLimits(options={}) {
  const {modelName,modelFolder}=options;
  if(modelFolder && ![SOURCE,'IR-S7-60Z20'].includes(modelFolder)) throw new RangeError('unsupported S7 model folder');
  if(modelName && ![SOURCE,'IR-S7-60Z20S-INT','IR-S7-60Z20'].includes(modelName)) throw new RangeError('unsupported S7 model name');
  const q0=s7JointsToInternalRadians(options.startJoints),q1=s7JointsToInternalRadians(options.endJoints);
  const u=q1.map((v,i)=>v-q0[i]),length=Math.hypot(...u);
  const diagnostics=[...(options.loadDiagnostics??[])],loads=prepareLoads(options,diagnostics);
  const speedScale=percent(options.speedPercent,100,'speedPercent');
  const accScale=percent(options.accelerationPercent,100,'accelerationPercent');
  const decScale=percent(options.decelerationPercent,100,'decelerationPercent');
  const startRampPercent=options.jerkPercent||S7_RAPID_NATIVE_MODEL.defaultModalRampPercent;
  const stopRampPercent=options.stopJerkPercent||startRampPercent;
  const vAxes=S7_RAPID_NATIVE_MODEL.rapidVelocityDegreesPerSecond.map(v=>v*DEG);
  const aAxes=S7_RAPID_NATIVE_MODEL.rapidAccelerationDegreesPerSecondSquared.map(v=>v*DEG);
  const axisCap=limits=>Math.min(...u.map((v,i)=>Math.abs(v)>1e-12?limits[i]/Math.abs(v):Infinity));
  const jointVelocityLimits=[414.8,735.3,28905*20/360,2000];
  const base={sourceModel:SOURCE,jointVelocityLimits,scalarPathLengthRad:length,
    units:{joints:['deg','deg','mm','deg'],progressTime:'s',nativePath:'rad',nativeTime:'ms'},
    zeroLoadFallback:loads.zeroLoadFallback,diagnostics,
    fidelity:'engineering-estimate; exact packaged parameters and unit conversion, reconstructed rigid-body/jerk limits',
    limitations:['No learned torque coefficients or live calibration','Sampled rigid-body path model with diagonal COM inertia','One fixed envelope over sampled path; full FreePlan iteration is not ported','Low-power motion planning is not ported','No robot cycle-time accuracy has been established']};
  if(length<1e-12) return {...base,stationary:true,vMax:0,aMax:0,dMax:0,jAccel:0,jDecel:0,
    nativeScalarLimits:{distance:0,vMax:0,aMax:0,dMax:0,jAccel:0,jDecel:0}};
  const count=25,samples=[];
  const gravity=gravityTorque(loads);
  const torqueLimits=LINKS.map(link=>2*link.ratedTrq*link.ratio);
  for(let step=0;step<count;step++) {
    const progress=step/(count-1),q=q0.map((v,i)=>v+u[i]*progress),m=massMatrix(q,loads);
    samples.push({progress,massMatrix:m,massAlongPath:mv(m,u),coriolis:coriolisAlongPath(q,u,loads),naturalPeriodSeconds:naturalPeriod(massMatrix(q,loads,false))});
  }
  const feasible=v=>samples.every(sample=>torqueLimits.every((t,i)=>{
    const [lo,hi]=biasRange(sample,i,v,u,gravity);return lo>=-t&&hi<=t;
  }));
  let vMax=axisCap(vAxes)*speedScale;
  if(!feasible(0)) throw new RangeError('load/gravity/friction exceeds the reconstructed planning torque envelope');
  if(!feasible(vMax)) {
    let lo=0,hi=vMax;
    for(let i=0;i<48;i++) {const mid=(lo+hi)/2;if(feasible(mid)) lo=mid;else hi=mid;}
    // Leave an explicitly numerical margin for positive acceleration. This is
    // not a native firmware scaling factor.
    vMax=lo*(1-1e-6);diagnostics.push('velocity limited by reconstructed Coriolis/friction/gravity torque envelope');
  }
  const naturalPeriodSeconds=Math.max(...samples.map(sample=>sample.naturalPeriodSeconds));
  // Normal/high-power Rapid MovJ selects FreePlanAdapt, not the CP
  // AdaptivePlanning branch. Use its native ramp mapping and transition clamp.
  // The selected model disables the mechanical-time branch, so arm length
  // does not affect these timing calls. The global path envelope remains an
  // estimate of the native planner's changing limits along the path.
  const payloadMassKg=loads.distal.reduce((sum,body)=>sum+body.mass,0);
  const startJerkTiming=getS7RapidMoveJerkTiming({naturalPeriodSeconds,payloadMassKg,
    rampPercent:startRampPercent,defaultTimeMilliseconds:S7_RAPID_NATIVE_MODEL.defaultJerkTimeMilliseconds});
  const stopJerkTiming=getS7RapidMoveJerkTiming({naturalPeriodSeconds,payloadMassKg,
    rampPercent:stopRampPercent,defaultTimeMilliseconds:S7_RAPID_NATIVE_MODEL.defaultJerkTimeMilliseconds});
  const limitAtSpeed=v=>{
    let a=axisCap(aAxes),d=axisCap(aAxes);
    for(const sample of samples) for(let i=0;i<4;i++) {
      const [lo,hi]=biasRange(sample,i,v,u,gravity),k=sample.massAlongPath[i],t=torqueLimits[i];
      if(Math.abs(k)<1e-15) continue;
      a=Math.min(a,k>0?(t-hi)/k:(-t-lo)/k);
      d=Math.min(d,k>0?(t+lo)/k:(hi-t)/k);
    }
    // Engineering control policy: scale the final torque/axis envelope so
    // commanded Acc/Dec also affect torque-limited moves. The native firmware
    // mapping of command percentages onto dynamic acceleration is unverified.
    a*=accScale;d*=decScale;
    return {vMax:v,aMax:a,dMax:d,jAccel:a*1000/startJerkTiming.transitionTimeMilliseconds,jDecel:d*1000/stopJerkTiming.transitionTimeMilliseconds};
  };
  const nativeLimits=limits=>({distance:length,vMax:limits.vMax*length/1e3,
    aMax:limits.aMax*length/1e6,dMax:limits.dMax*length/1e6,
    jAccel:limits.jAccel*length/1e9,jDecel:limits.jDecel*length/1e9});
  // Fixed envelopes couple speed and available torque. Merely using the
  // torque-limited speed boundary leaves almost no acceleration. Choose the
  // fastest admissible envelope among sampled velocity levels instead.
  const velocityCeiling=vMax;
  let selected=null;
  for(let i=1;i<=32;i++) {
    const limits=limitAtSpeed(velocityCeiling*i/32);
    if(!(limits.aMax>0&&limits.dMax>0)) continue;
    const duration=planFirmwareSCurve(nativeLimits(limits)).duration;
    if(selected===null||duration<selected.duration) selected={...limits,duration};
  }
  if(!selected) throw new RangeError('no positive acceleration remains in the reconstructed planning torque envelope');
  ({vMax}=selected);
  const {aMax,dMax,jAccel,jDecel}=selected;
  if(vMax<velocityCeiling) diagnostics.push('speed/acceleration tradeoff selected from 32 admissible fixed-envelope velocity levels');
  diagnostics.push('normal/high-power Rapid MovJ native ramp timing; fixed path envelope remains estimated');
  return {...base,stationary:false,vMax,aMax,dMax,jAccel,jDecel,
    maxProgressVelocity:vMax,maxProgressAcceleration:aMax,maxProgressDeceleration:dMax,
    maxProgressJerk:jAccel,maxProgressStopJerk:jDecel,
    nativeScalarLimits:nativeLimits(selected),estimatedDurationSeconds:selected.duration/1000,
    naturalPeriodSeconds,startJerkTiming,stopJerkTiming,torqueLimitsNm:torqueLimits,gravityTorqueNm:gravity,
    estimatedMovingPayloadKg:loads.distal.reduce((s,v)=>s+v.mass,0),
    pathSamples:samples.map(({progress,massAlongPath,coriolis,naturalPeriodSeconds})=>({progress,massAlongPath,coriolis,naturalPeriodSeconds}))};
}
