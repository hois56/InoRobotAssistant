/** Offline fixed-envelope Rapid MovJ estimator using the SPC25 dynamics kernel.
 * Native M/C/G arithmetic and packaged model data are distinct from the sampled
 * path envelope below. Full FreePlanAdapt and physical Z0 overlap are not ported.
 */
import {RAPID_MODEL_DATA} from './rapid-model-data.mjs?v=20261102-models-2';
import {createNativeDynamicsKernel,nativeNaturalPeriod,assembleNativeDynamicsModel} from './native-dynamics-kernel.mjs?v=20261102-models-2';
import {planFirmwareSCurve} from './firmware-scurve.mjs?v=20261102-scurve160-1';
import {getS7RampParameters,getS7MechanicalJerkTimeSeconds,getS7FreePlanTransitionMilliseconds} from './s7-native-ramp.mjs?v=20261102-s7-ramp-1';
import {nativeSixTcpPositionMm} from './robot-rapid-kinematics.mjs?v=20261102-models-2';

const DEG=Math.PI/180;
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const mv=(matrix,vector)=>matrix.map(row=>dot(row,vector));
const finite=(value,name)=>{if(!Number.isFinite(value))throw new TypeError(`${name} must be finite`);return value;};
/** Normal TrajcryAccPlan -> FreePlanDyncSet initially uses one START set time
 * and the final STOP preprocessing jerkLevel for both transitions. Subsequent
 * TrajcryDecPlan iteration is outside this fixed-envelope estimator.
 */
export function getRobotRapidMoveJerkTiming({naturalPeriodSeconds,armLengthMm,payloadMassKg,
    mechanicalParameters,startRampPercent=50,stopRampPercent=startRampPercent,startTimeMs,stopTimeMs}) {
    const start=getS7RampParameters(startRampPercent,startTimeMs),stop=getS7RampParameters(stopRampPercent,stopTimeMs);
    const mechanicalTimeSeconds=getS7MechanicalJerkTimeSeconds(armLengthMm,payloadMassKg,mechanicalParameters);
    const clampSetTimeMilliseconds=Math.fround(1/start.localJerkRatioPerMillisecond);
    const transitionTimeMilliseconds=getS7FreePlanTransitionMilliseconds(Math.max(naturalPeriodSeconds,mechanicalTimeSeconds),
        stop.jerkLevel,clampSetTimeMilliseconds);
    const shared={sharedJerkLevel:stop.jerkLevel,clampSetTimeMilliseconds,mechanicalTimeSeconds,transitionTimeMilliseconds};
    return {start:{...start,...shared},stop:{...stop,...shared}};
}
function vector(value,length,name) {
    if(!Array.isArray(value)||value.length!==length)throw new TypeError(`${name} must contain ${length} numbers`);
    return value.map((v,i)=>finite(v,`${name}[${i}]`));
}
function percent(value,name) {
    const number=value===0||value==null?100:value;
    if(!(finite(number,name)>0&&number<=100))throw new RangeError(`${name} must be in (0,100]`);
    return number/100;
}

/** Exact catalog identity, never a family/reach substring match. */
export function resolveRapidDynamicsModel(options={}) {
    const {modelFolder,modelName,sourceModel,dynamicsSourceModel}=options;
    const rows=Object.entries(RAPID_MODEL_DATA.models);
    let entry=modelFolder?RAPID_MODEL_DATA.models[modelFolder]:null;
    if(!entry&&modelFolder)return null;
    if(!entry)entry=rows.find(([folder,row])=>folder===modelName||row.catalogName===modelName||row.variantIds.includes(modelName))?.[1];
    if(!entry)return null;
    if(modelName&&modelName!==entry.catalogName&&modelName!==entry.catalogFolder
        &&!entry.variantIds.includes(modelName))return null;
    if(options.robotType&&options.robotType!==entry.robotType)return null;
    const requested=dynamicsSourceModel??sourceModel??(entry.variantIds.includes(modelName)?modelName:null);
    if(requested&&!entry.variantIds.includes(requested))throw new RangeError(`Dynamics variant does not match ${entry.catalogFolder}`);
    const id=requested??entry.defaultVariantId;
    if(!id)return null;
    return {catalog:entry,model:RAPID_MODEL_DATA.variants[id],sourceModel:id,
        selectionReason:requested?'explicit-source-model':entry.selectionReason};
}

export function hasRapidDynamicsModel(options={}) {return resolveRapidDynamicsModel(options)!==null;}

export function jointsToNativeRadians(joints,model) {
    const q=vector(joints,model.axisCount,'joints');
    return q.map((value,i)=>model.screwLeadMm&&i===2?value*2*Math.PI/model.screwLeadMm:value*DEG);
}

function makeKernel(selected,options) {
    // The assembly routine accepts simulator load units (kg, mm, kg*m^2).
    return assembleNativeDynamicsModel(selected.model,options);
}

export function evaluateRobotDynamics(joints,options={}) {
    const selected=resolveRapidDynamicsModel(options);
    if(!selected)throw new RangeError('No exact firmware dynamics model selected');
    const assembly=makeKernel(selected,options);
    const kernel=createNativeDynamicsKernel(assembly);
    const result=kernel.evaluate(jointsToNativeRadians(joints,selected.model));
    const massMatrix=result.rigidBodyMassMatrix.map((row,i)=>row.map((value,j)=>value+(i===j
        ?selected.model.links[i].motorInertia*selected.model.links[i].ratio**2:0)));
    return {...result,massMatrix,sourceModel:selected.sourceModel,
        naturalPeriodSeconds:nativeNaturalPeriod(result.rigidBodyMassMatrix,selected.model.links.map(link=>link.stiffness)),
        zeroLoadFallback:assembly.zeroLoadFallback,diagnostics:assembly.diagnostics};
}

function biasRange(sample,index,speed,u,links) {
    const c=sample.coriolis[index],friction=links[index].viscousFric*u[index];
    const constant=sample.gravityTorqueNm[index]+(u[index]===0?0:links[index].coulombFric*Math.sign(u[index]));
    const speeds=[0,speed],vertex=c===0?-1:-friction/(2*c);
    if(vertex>0&&vertex<speed)speeds.push(vertex);
    const values=speeds.map(v=>constant+friction*v+c*v*v);
    return [Math.min(...values),Math.max(...values)];
}

const profileCache=new Map();
/** Reuse identical offline profiles across OLP loops; clock measurement remains
 * wall time. The bounded cache includes the model, trajectory, every load and
 * each command limit. A change to any physical input requires a fresh solve.
 */
export function buildRobotRapidMoveLimits(options={}) {
    const selected=resolveRapidDynamicsModel(options);
    if(!selected)throw new RangeError('No exact firmware dynamics model selected');
    const key=JSON.stringify([selected.sourceModel,selected.selectionReason,options.startJoints,options.endJoints,
        options.toolLoad,options.gripLoad,options.armLoads,options.speedPercent,
        options.accelerationPercent,options.decelerationPercent,options.jerkPercent,
        options.stopJerkPercent,options.loadDiagnostics,options.zeroLoadFallback,options.gripTranslationMm,options.toolTranslationMm],(_key,value)=>{
        if(typeof value==='number'&&!Number.isFinite(value))throw new TypeError('Motion/load inputs must be finite');
        return value;
    });
    if(profileCache.has(key)) {
        const result=profileCache.get(key);
        profileCache.delete(key);profileCache.set(key,result);
        return result;
    }
    const result=buildUncachedRobotRapidMoveLimits(options);
    const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
    profileCache.set(key,freeze(result));
    if(profileCache.size>64)profileCache.delete(profileCache.keys().next().value);
    return result;
}

function buildUncachedRobotRapidMoveLimits(options={}) {
    const selected=resolveRapidDynamicsModel(options);
    if(!selected)throw new RangeError('No exact firmware dynamics model selected');
    const model=selected.model,axes=model.axisCount,links=model.links;
    const assembly=makeKernel(selected,options);
    const toolTranslationMm=vector(options.toolTranslationMm??[0,0,0],3,'toolTranslationMm');
    const diagnostics=[...(options.loadDiagnostics??[]),...(assembly.diagnostics??[])];
    const q0=jointsToNativeRadians(options.startJoints,model),q1=jointsToNativeRadians(options.endJoints,model);
    const u=q1.map((v,i)=>v-q0[i]),length=Math.hypot(...u);
    const speedScale=percent(options.speedPercent,'speedPercent');
    const accScale=percent(options.accelerationPercent,'accelerationPercent');
    const decScale=percent(options.decelerationPercent,'decelerationPercent');
    const vAxes=model.velocityDegPerSec.map(v=>v*DEG),aAxes=model.accelerationDegPerSec2.map(v=>v*DEG);
    const cap=limits=>Math.min(...u.map((v,i)=>Math.abs(v)>1e-12?limits[i]/Math.abs(v):Infinity));
    const base={sourceModel:selected.sourceModel,sourceSha256:model.sourceSha256,
        modelFolder:selected.catalog.catalogFolder,selectionReason:selected.selectionReason,isIntVariant:model.isIntVariant,
        jointVelocityLimits:model.velocityDegPerSec.map((v,i)=>model.screwLeadMm&&i===2?v*model.screwLeadMm/360:v),
        scalarPathLengthRad:length,zeroLoadFallback:assembly.zeroLoadFallback,diagnostics,toolTranslationMm,
        mechanicalPayloadMassKg:assembly.actualToolGripMassKg,
        units:{joints:Array.from({length:axes},(_,i)=>model.screwLeadMm&&i===2?'mm':'deg'),nativePath:'rad',nativeTime:'ms',progressTime:'s'},
        fidelity:'engineering estimate; original SPC25 M/C/G arithmetic, packaged parameters, sampled fixed path envelope',
        limitations:['No learned torque coefficients or live calibration','One fixed envelope over 25 path samples; full FreePlanAdapt and TrajcryDecPlan replanning are not ported',
            'Low-power planning and physical Z0 overlap are not ported','Zero-load branch uses nominal flange payload when the live max-load record is unavailable',
            'No general robot cycle-time accuracy has been established']};
    if(length<1e-12)return {...base,stationary:true,vMax:0,aMax:0,dMax:0,jAccel:0,jDecel:0,
        nativeScalarLimits:{distance:0,vMax:0,aMax:0,dMax:0,jAccel:0,jDecel:0}};
    const kernel=createNativeDynamicsKernel(assembly);
    const stiffness=links.map(link=>link.stiffness);
    const torqueLimits=links.map((link,i)=>model.initialPlanningTorqueRatios[i]*link.ratedTrq*link.ratio);
    const samples=Array.from({length:25},(_,step)=>{
        const progress=step/24,q=q0.map((v,i)=>v+u[i]*progress),native=kernel.evaluate(q);
        const matrix=native.rigidBodyMassMatrix.map((row,i)=>row.map((v,j)=>v+(i===j?links[i].motorInertia*links[i].ratio**2:0)));
        return {progress,massAlongPath:mv(matrix,u),coriolis:native.coriolis(u),gravityTorqueNm:native.gravityTorqueNm,
            armLengthMm:model.robotType==='six-axis'?Math.hypot(...nativeSixTcpPositionMm(q,model.kinematicStructure,toolTranslationMm)):0,
            naturalPeriodSeconds:nativeNaturalPeriod(native.rigidBodyMassMatrix,stiffness)};
    });
    if(samples.some(s=>![...s.massAlongPath,...s.coriolis,...s.gravityTorqueNm,s.naturalPeriodSeconds].every(Number.isFinite)))
        throw new RangeError('Firmware dynamics produced a non-finite path limit');
    const feasible=v=>samples.every(sample=>torqueLimits.every((t,i)=>{
        const [lo,hi]=biasRange(sample,i,v,u,links);return lo>=-t&&hi<=t;
    }));
    let vMax=cap(vAxes)*speedScale;
    if(!feasible(0))throw new RangeError('Load/gravity/friction exceeds the offline planning torque envelope');
    if(!feasible(vMax)) {
        let lo=0,hi=vMax;
        for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(feasible(mid))lo=mid;else hi=mid;}
        vMax=lo*(1-1e-6); // numerical margin, not a native scaling coefficient
        diagnostics.push('Velocity limited by Coriolis/friction/gravity torque envelope');
    }
    const naturalPeriodSeconds=Math.max(...samples.map(s=>s.naturalPeriodSeconds));
    const timing=getRobotRapidMoveJerkTiming({naturalPeriodSeconds,payloadMassKg:assembly.actualToolGripMassKg,
        armLengthMm:Math.max(...samples.map(s=>s.armLengthMm)),mechanicalParameters:model.mechanical,
        startRampPercent:options.jerkPercent||50,stopRampPercent:options.stopJerkPercent||options.jerkPercent||50,
        startTimeMs:model.ramp.startMs,stopTimeMs:model.ramp.stopMs});
    const startJerkTiming=timing.start,stopJerkTiming=timing.stop;
    const limitAtSpeed=v=>{
        let a=cap(aAxes),d=cap(aAxes);
        for(const sample of samples)for(let i=0;i<axes;i++){
            const [lo,hi]=biasRange(sample,i,v,u,links),k=sample.massAlongPath[i],t=torqueLimits[i];
            if(Math.abs(k)<1e-15)continue;
            a=Math.min(a,k>0?(t-hi)/k:(-t-lo)/k);
            d=Math.min(d,k>0?(t+lo)/k:(hi-t)/k);
        }
        // Same explicit engineering percentage policy as the validated S7
        // estimator. Native dynamic-acceleration percentage precedence varies.
        a*=accScale;d*=decScale;
        return {vMax:v,aMax:a,dMax:d,jAccel:a*1000/startJerkTiming.transitionTimeMilliseconds,
            jDecel:d*1000/stopJerkTiming.transitionTimeMilliseconds};
    };
    const nativeLimits=l=>({distance:length,vMax:l.vMax*length/1e3,aMax:l.aMax*length/1e6,
        dMax:l.dMax*length/1e6,jAccel:l.jAccel*length/1e9,jDecel:l.jDecel*length/1e9});
    let selectedEnvelope=null;
    for(let i=1;i<=32;i++){
        const limits=limitAtSpeed(vMax*i/32);
        if(!(limits.aMax>0&&limits.dMax>0))continue;
        const duration=planFirmwareSCurve(nativeLimits(limits)).duration;
        if(selectedEnvelope===null||duration<selectedEnvelope.duration)selectedEnvelope={...limits,duration};
    }
    if(!selectedEnvelope)throw new RangeError('No positive acceleration remains in the offline planning torque envelope');
    const {aMax,dMax,jAccel,jDecel}=selectedEnvelope;vMax=selectedEnvelope.vMax;
    return {...base,stationary:false,vMax,aMax,dMax,jAccel,jDecel,
        maxProgressVelocity:vMax,maxProgressAcceleration:aMax,maxProgressDeceleration:dMax,
        maxProgressJerk:jAccel,maxProgressStopJerk:jDecel,nativeScalarLimits:nativeLimits(selectedEnvelope),
        estimatedDurationSeconds:selectedEnvelope.duration/1000,naturalPeriodSeconds,startJerkTiming,stopJerkTiming,
        torqueLimitsNm:torqueLimits,gravityTorqueNm:samples[0].gravityTorqueNm,estimatedMovingPayloadKg:assembly.payloadMassKg,
        pathSamples:samples};
}
