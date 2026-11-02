import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createNativeDynamicsKernel,nativeNaturalPeriod,assembleNativeDynamicsModel} from '../../2_3DSimulation/native-dynamics-kernel.mjs';
import {RAPID_MODEL_DATA as models} from '../../2_3DSimulation/rapid-model-data.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/robot-native-kernel-gold.json',import.meta.url),'utf8'));
const assemblyFixture=JSON.parse(fs.readFileSync(new URL('../fixtures/robot-native-assembly-gold.json',import.meta.url),'utf8'));
const armFrameFixture=JSON.parse(fs.readFileSync(new URL('../fixtures/robot-native-six-arm-frame-gold.json',import.meta.url),'utf8'));

for(const group of fixture.groups)test(`${group.robotType} M/C1/C2/G matches original ARM matrix execution`,()=>{
    const kernel=createNativeDynamicsKernel({robotType:group.robotType,links:group.effectiveLinks});
    for(const [index,row] of group.cases.entries()) {
        const observed=kernel.evaluate(row.q);
        // Matrix outputs are float32 in the original library. The generated
        // arithmetic must retain those boundaries, not merely approximate M.
        for(const [actual,expected,label] of [
            [observed.rigidBodyMassMatrix,row.M,'M'],[observed.C1,row.C1,'C1'],
            [observed.C2,row.C2,'C2'],[observed.gravityTorqueNm,row.G,'G']
        ])assert.deepEqual(actual.flat(),expected,`${group.model}/${index}/${label}`);
        const period=nativeNaturalPeriod(observed.rigidBodyMassMatrix,group.effectiveLinks.map(link=>link[16]));
        assert.ok(Math.abs(period-row.naturalPeriodSeconds)<3e-7*Math.max(.001,row.naturalPeriodSeconds));
    }
});

test('parameter-command load/DH/gravity assembly and torques match original native execution for all catalog models',()=>{
    assert.equal(assemblyFixture.cases.length,31);
    for(const row of assemblyFixture.cases) {
        const observed=assembleNativeDynamicsModel(row.model,row.options);
        observed.links.forEach((link,i)=>link.forEach((value,j)=>assert.ok(
            Math.abs(value-row.effectiveLinks[i][j])<1e-12*Math.max(1e-6,Math.abs(value)),`${row.catalogFolder}/link${i}/${j}`)));
        const kernel=createNativeDynamicsKernel(observed);
        const result=kernel.evaluate(row.q);
        assert.deepEqual(result.rigidBodyMassMatrix.flat(),row.M,`${row.catalogFolder}/M`);
        assert.deepEqual(result.C1.flat(),row.C1,`${row.catalogFolder}/C1`);
        assert.deepEqual(result.C2.flat(),row.C2,`${row.catalogFolder}/C2`);
        assert.deepEqual(result.gravityTorqueNm,row.G,`${row.catalogFolder}/G`);
        result.coriolis(row.velocity).forEach((value,i)=>assert.ok(
            Math.abs(value-row.coriolisTorque[i])<1e-12*Math.max(1,Math.abs(value)),`${row.catalogFolder}/Cqd${i}`));
        const period=nativeNaturalPeriod(result.rigidBodyMassMatrix,row.model.links.map(link=>link.stiffness));
        assert.ok(Math.abs(period-row.naturalPeriodSeconds)<3e-7*Math.max(.001,row.naturalPeriodSeconds),`${row.catalogFolder}/period`);
    }
});

test('native kernels reject malformed SI records and joint inputs',()=>{
    const group=fixture.groups[0];
    assert.throws(()=>createNativeDynamicsKernel({robotType:group.robotType,links:group.effectiveLinks.slice(1)}),/effective links/);
    const bad=structuredClone(group.effectiveLinks);bad[0][3]=NaN;
    assert.throws(()=>createNativeDynamicsKernel({robotType:group.robotType,links:bad}),/finite/);
    const kernel=createNativeDynamicsKernel({robotType:group.robotType,links:group.effectiveLinks});
    assert.throws(()=>kernel.evaluate([0,0,0,0]),/finite internal radians/);
    assert.throws(()=>kernel.evaluate([0,0,0,0,0,Infinity]),/finite internal radians/);
});

test('zero-load substitution reports its effective mass and multiple accessories combine in one link frame',()=>{
    const row=assemblyFixture.cases.find(row=>row.catalogFolder==='IR-S4-40Z15');
    const substituted=assembleNativeDynamicsModel(row.model,{});
    assert.equal(substituted.zeroLoadFallback,true);
    assert.equal(substituted.payloadMassKg,Number(row.model.nominalPayloadKg));
    assert.ok(substituted.diagnostics.some(message=>message.includes('max-load COM/inertia')));
    const options={toolLoad:{mass:1,cog:[0,0,0],inertia:[0,0,0]}};
    const separate=assembleNativeDynamicsModel(row.model,{...options,armLoads:[
        {linkIndex:1,mass:1,cog:[0,0,0],inertia:[.001,.002,.003]},
        {linkIndex:1,mass:2,cog:[30,0,0],inertia:[.004,.005,.006]}
    ]});
    // Combined COM is20mm; parallel-axis contribution is .0006kg*m^2
    // about Y/Z. This expectation is independent of the assembly helper.
    const combined=assembleNativeDynamicsModel(row.model,{...options,armLoads:[
        {linkIndex:1,mass:3,cog:[20,0,0],inertia:[.005,.0076,.0096]}
    ]});
    separate.links.forEach((link,i)=>link.forEach((value,j)=>assert.ok(
        Math.abs(value-combined.links[i][j])<1e-12*Math.max(1,Math.abs(value)),`accessory merge ${i}/${j}`)));
});

test('six-axis accessory frames match original ARM isolated-body dynamics and Cartesian Jacobians',()=>{
    assert.equal(armFrameFixture.cases.length,84);
    for(const row of armFrameFixture.cases) {
        const entry=models.models[row.model];
        const model=structuredClone(models.variants[entry.defaultVariantId??entry.variantIds[0]]);
        for(const link of model.links)Object.assign(link,{mass:0,cog:[0,0,0],inertia:[0,0,0,0,0,0]});
        const assembled=assembleNativeDynamicsModel(model,{zeroLoadFallback:false,armLoads:[{
            linkIndex:row.linkIndex,mass:2.3,cog:row.nativeCogMeters.map(v=>v*1000),inertia:row.nativeInertia
        }]});
        const result=createNativeDynamicsKernel(assembled).evaluate(row.joints.map(v=>v*Math.PI/180));
        // The fixture executed a2.3kg isolated body at the source CAD COM.
        // Its Cartesian Jacobian was constructed independently of native DH.
        result.rigidBodyMassMatrix.forEach((matrixRow,i)=>matrixRow.forEach((value,j)=>{
            assert.equal(value,row.nativeM[i][j],`${row.model}/native M${i}${j}`);
            assert.ok(Math.abs(value-row.cartesianM[i][j])<2e-6*Math.max(1,Math.abs(value)),`${row.model}/Cartesian M${i}${j}`);
        }));
        result.gravityTorqueNm.forEach((value,i)=>{
            assert.equal(value,row.nativeG[i]);
            assert.ok(Math.abs(value-row.cartesianG[i])<2e-6*Math.max(1,Math.abs(value)),`${row.model}/Cartesian G${i}`);
        });
    }
});
