import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {nativeSixFlangePositionMm,nativeSixFlangeRotation,nativeSixTcpPositionMm} from '../../2_3DSimulation/robot-rapid-kinematics.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/robot-native-six-fk-gold.json',import.meta.url),'utf8'));

test('six-axis joint angles preserve the original native FK signs and internal J2 offset',()=>{
    for(const group of fixture.groups)for(const row of group.cases) {
        const q=row.joints.map(value=>value*Math.PI/180);
        const position=nativeSixFlangePositionMm(q,group.structure);
        const error=Math.hypot(...position.map((value,i)=>value-row.position[i]));
        assert.ok(error<1e-9,`${group.catalogFolder} ${row.joints}: ${error} mm`);
        nativeSixFlangeRotation(q).forEach((value,i)=>assert.ok(Math.abs(value-row.rotation[i])<1e-12));
    }
});

test('six-axis mechanical reach uses active TCP translation in the rotated flange frame',()=>{
    for(const group of fixture.groups)for(const row of group.tcpCases) {
        const q=row.joints.map(value=>value*Math.PI/180);
        const position=nativeSixTcpPositionMm(q,group.structure,row.toolTranslationMm);
        assert.ok(Math.hypot(...position.map((value,i)=>value-row.position[i]))<1e-9,
            `${group.catalogFolder} TCP ${row.toolTranslationMm}`);
    }
});
