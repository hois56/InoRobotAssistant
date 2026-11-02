import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {RAPID_MODEL_DATA as data} from '../../2_3DSimulation/rapid-model-data.mjs';
import {buildRobotRapidMoveLimits as build,evaluateRobotDynamics,resolveRapidDynamicsModel as resolve,
    jointsToNativeRadians} from '../../2_3DSimulation/robot-rapid-dynamics.mjs';
import {planFirmwareSCurve} from '../../2_3DSimulation/firmware-scurve.mjs';

const catalog=JSON.parse(fs.readFileSync(new URL('../../2_3DSimulation/models/models.json',import.meta.url),'utf8')).filter(row=>row.folder);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const load={mass:1,cog:[10,20,30],inertia:[.001,.002,.003]};
const options=folder=>({modelFolder:folder,modelName:data.models[folder].catalogName,
    robotType:data.models[folder].robotType,toolLoad:load,
    startJoints:data.models[folder].axisCount===6?[0,-30,40,0,20,0]:[0,-30,-40,0],
    endJoints:data.models[folder].axisCount===6?[20,-25,50,15,25,30]:[20,10,-70,30]});

test('catalog identity selects all 15 priority models and 29 verified INT defaults',()=>{
    assert.equal(Object.keys(data.models).length,31);
    assert.equal(Object.values(data.models).filter(row=>row.defaultVariantId).length,29);
    assert.equal(Object.values(data.models).filter(row=>row.priority<=8).length,15);
    for(const row of catalog) {
        const selected=resolve({modelFolder:row.folder,modelName:row.name,robotType:row.robotType});
        const configured=data.models[row.folder];
        assert.deepEqual(configured.geometry,row.structure,`${row.folder} exact geometry`);
        if(!configured.defaultVariantId) {
            assert.equal(selected,null);
            assert.equal(configured.sourceSelectionRequired,true);
            continue;
        }
        assert.equal(selected.sourceModel,configured.defaultVariantId);
        assert.equal(selected.model.isIntVariant,true);
        assert.match(selected.model.sourceSha256,/^[a-f0-9]{64}$/);
        assert.equal(resolve({modelName:row.folder}).sourceModel,selected.sourceModel);
        assert.equal(resolve({modelName:row.name}).sourceModel,selected.sourceModel);
    }
});

test('model resolution never aliases a different reach, stroke, controller or robot type',()=>{
    assert.equal(resolve({modelName:'IR-R7H-900'}),null);
    assert.equal(resolve({modelName:'IR-S7-60Z30'}),null);
    assert.equal(resolve({modelFolder:'IR-S7-60Z20',modelName:'IR-S7-70Z20S-INT'}),null);
    assert.equal(resolve({modelName:'IR-R7H-90',robotType:'scara'}),null);
    const folder='IR-R7H-70',[first,second]=data.models[folder].variantIds;
    const before=resolve({modelFolder:folder}).sourceModel;
    assert.equal(resolve({modelFolder:folder,sourceModel:first}).sourceModel,first);
    assert.equal(resolve({modelFolder:folder,dynamicsSourceModel:second}).sourceModel,second);
    assert.equal(resolve({modelFolder:folder}).sourceModel,before,'One robot override must not mutate another robot default');
    assert.notDeepEqual(data.variants[first].links,data.variants[second].links);
    assert.throws(()=>resolve({modelFolder:folder,sourceModel:data.models['IR-R7H-90'].defaultVariantId}),/does not match/);
});

test('R35/R50 non-INT alternatives require an explicit source choice',()=>{
    for(const folder of ['IR-R35-185','IR-R50-250']) {
        assert.equal(resolve({modelFolder:folder}),null);
        for(const id of data.models[folder].variantIds) {
            const result=resolve({modelFolder:folder,sourceModel:id});
            assert.equal(result.sourceModel,id);
            assert.equal(result.model.isIntVariant,false);
        }
    }
});

test('SCARA lead is model-specific and revolute joints stay in degrees',()=>{
    for(const [folder,lead] of [['IR-S4-40Z15',16],['IR-S7-60Z20',20],['IR-S25-100Z42',50]]) {
        const model=resolve({modelFolder:folder}).model;
        assert.equal(model.screwLeadMm,lead);
        const q=jointsToNativeRadians([180,-90,lead,45],model);
        [Math.PI,-Math.PI/2,2*Math.PI,Math.PI/4].forEach((expected,i)=>near(q[i],expected));
    }
    const model=resolve({modelFolder:'IR-R7H-90'}).model;
    jointsToNativeRadians([180,-90,90,45,30,-60],model)
        .forEach((value,i)=>near(value,[180,-90,90,45,30,-60][i]*Math.PI/180));
});

for(const [folder,entry] of Object.entries(data.models).filter(([,row])=>row.defaultVariantId))
test(`${folder} uses its own native model and finite rad/ms scalar profile`,()=>{
    const result=build(options(folder));
    assert.equal(result.sourceModel,entry.defaultVariantId);
    assert.equal(result.sourceSha256,data.variants[entry.defaultVariantId].sourceSha256);
    assert.ok([result.vMax,result.aMax,result.dMax,result.jAccel,result.jDecel,result.estimatedDurationSeconds]
        .every(value=>Number.isFinite(value)&&value>0));
    const source=data.variants[entry.defaultVariantId];
    source.velocityDegPerSec.forEach((v,i)=>near(result.jointVelocityLimits[i],source.screwLeadMm&&i===2?v*source.screwLeadMm/360:v));
    assert.equal(result.pathSamples.length,25);
    near(result.nativeScalarLimits.distance,result.scalarPathLengthRad);
    near(result.nativeScalarLimits.vMax,result.vMax*result.scalarPathLengthRad/1000);
    near(result.nativeScalarLimits.aMax,result.aMax*result.scalarPathLengthRad/1e6);
    const profile=planFirmwareSCurve(result.nativeScalarLimits);
    near(profile.duration/1000,result.estimatedDurationSeconds);
    near(profile.evaluate(profile.duration).position,result.scalarPathLengthRad);
});

test('R7 dynamics use payload, gravity and posture; rotor inertia stays separate',()=>{
    const base={...options('IR-R7H-90'),toolLoad:{mass:1,cog:[0,0,0],inertia:[0,0,0]}};
    const light=evaluateRobotDynamics([0,0,0,0,0,0],base);
    const heavy=evaluateRobotDynamics([0,0,0,0,0,0],{...base,toolLoad:{mass:5,cog:[60,40,120],inertia:[.03,.04,.02]}});
    const turned=evaluateRobotDynamics([20,30,50,10,-20,40],base);
    assert.ok(heavy.rigidBodyMassMatrix[0][0]>light.rigidBodyMassMatrix[0][0]);
    assert.notDeepEqual(heavy.gravityTorqueNm,light.gravityTorqueNm);
    assert.notDeepEqual(turned.gravityTorqueNm,light.gravityTorqueNm);
    const model=resolve(base).model;
    for(let i=0;i<6;i++)for(let j=0;j<6;j++)near(light.massMatrix[i][j]-light.rigidBodyMassMatrix[i][j],i===j?model.links[i].motorInertia*model.links[i].ratio**2:0);
});

test('repeated planning never reuses limits from a different load, speed, pose or source',()=>{
    const base=options('IR-R7H-70');
    const first=build(base);
    assert.equal(build(structuredClone(base)),first,'Identical loop inputs reuse the prepared profile');
    assert.equal(Object.isFrozen(first),true);
    assert.equal(Object.isFrozen(first.pathSamples),true);
    const heavier=build({...base,toolLoad:{...load,mass:3}});
    assert.equal(heavier.estimatedMovingPayloadKg,3);
    assert.notDeepEqual(heavier.pathSamples[0].massAlongPath,first.pathSamples[0].massAlongPath);
    const slower=build({...base,speedPercent:10});
    assert.ok(slower.vMax<first.vMax);
    const changedPose=build({...base,endJoints:[30,-20,60,20,30,40]});
    assert.notEqual(changedPose.scalarPathLengthRad,first.scalarPathLengthRad);
    const alternate=data.models['IR-R7H-70'].variantIds.find(id=>id!==first.sourceModel);
    assert.equal(build({...base,sourceModel:alternate}).sourceModel,alternate);
    assert.equal(build(base).sourceModel,first.sourceModel);
    near(build(base).estimatedDurationSeconds,first.estimatedDurationSeconds);
    assert.equal(build({...base,gripLoad:{mass:.5,cog:[0,0,0],inertia:[0,0,0]}}).estimatedMovingPayloadKg,1.5);
    const withArm=build({...base,armLoads:[{linkIndex:2,mass:.5,cog:[0,0,0],inertia:[0,0,0]}]});
    assert.notDeepEqual(withArm.pathSamples[0].massAlongPath,first.pathSamples[0].massAlongPath);
    assert.ok(build({...base,accelerationPercent:10}).aMax<first.aMax);
    assert.ok(build({...base,decelerationPercent:10}).dMax<first.dMax);
    assert.notEqual(build({...base,jerkPercent:10}).startJerkTiming.transitionTimeMilliseconds,first.startJerkTiming.transitionTimeMilliseconds);
    assert.notEqual(build({...base,stopJerkPercent:10}).stopJerkTiming.transitionTimeMilliseconds,first.stopJerkTiming.transitionTimeMilliseconds);
    assert.throws(()=>build({...base,speedPercent:NaN}),/finite/);
});
