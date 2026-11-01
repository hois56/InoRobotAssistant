import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {evaluateS7Dynamics,S7_RAPID_NATIVE_MODEL} from '../../2_3DSimulation/s7-rapid-dynamics.mjs';
const fixtureUrl=new URL('../fixtures/s7-native-dynamics-gold.json',import.meta.url);
const fixture=JSON.parse(fs.readFileSync(fixtureUrl,'utf8'));
const close=(actual,expected,label,relative=1e-7,floor=1e-3)=>assert.ok(
    Number.isFinite(actual)&&Math.abs(actual-expected)<=relative*Math.max(floor,Math.abs(expected)),
    `${label}: ${actual} != ${expected}`);

test('SCARA rigid-body M and gravity match 12 original ARM library cases',()=>{
    for(const [index,row] of fixture.cases.entries()) {
        const observed=evaluateS7Dynamics(row.joints,{toolLoad:row.load});
        assert.ok(observed.rigidBodyMassMatrix, 'rigid-body matrix must be separate from reflected rotor inertia');
        for(let i=0;i<4;i++)for(let j=0;j<4;j++) {
            close(observed.rigidBodyMassMatrix[i][j],row.massMatrix[i][j],`M ${index}/${i}/${j}`);
            const rotor=i===j ? S7_RAPID_NATIVE_MODEL.links[i].motorInertia*S7_RAPID_NATIVE_MODEL.links[i].ratio**2 : 0;
            close(observed.massMatrix[i][j]-observed.rigidBodyMassMatrix[i][j],rotor,`rotor ${index}/${i}/${j}`,1e-10);
        }
        row.gravity.forEach((value,i)=>close(observed.gravityTorqueNm[i],value,`gravity ${index}/${i}`));
    }
});

test('SCARA natural period uses native body-only M and MaxEigCalc convergence',()=>{
    for(const [index,row] of fixture.cases.entries()) {
        const observed=evaluateS7Dynamics(row.joints,{toolLoad:row.load});
        close(observed.naturalPeriodSeconds,row.naturalPeriodSeconds,`native natural period ${index}`,3e-7);
    }
});
