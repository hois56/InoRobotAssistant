import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {getS7RampParameters,getS7MechanicalJerkTimeSeconds} from '../../2_3DSimulation/s7-native-ramp.mjs';
import {getRobotRapidMoveJerkTiming} from '../../2_3DSimulation/robot-rapid-dynamics.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}`,import.meta.url),'utf8'));

test('model-specific default times and command levels match original SCARA and Six ARM preprocessing',()=>{
    const fixture=read('robot-native-ramp-levels-gold.json');
    for(const row of fixture.cases) {
        const actual=getS7RampParameters(row.commandPercent,row.defaultTimeMs);
        assert.equal(actual.localJerkRatioPerMillisecond,row.localJerkRatioPerMs,JSON.stringify(row));
        assert.equal(actual.jerkLevel,row.jerkLevel,JSON.stringify(row));
    }
});

test('six-axis mechanical periods use native mm/kg and preserve negative values before the natural-period maximum',()=>{
    for(const row of read('robot-native-six-mechanical-gold.json').cases)
        assert.equal(getS7MechanicalJerkTimeSeconds(row.armLengthMm,row.actualToolGripMassKg,row.parameters),row.nativeSeconds);
});

test('unequal ramps retain native initial shared STOP factor and START set-time clamp',()=>{
    const fixture=read('robot-native-unequal-ramp-gold.json');
    const disabledMechanical={massSlope:0,referenceMassKg:0,baseTimeMilliseconds:0,referenceLengthMm:40,lengthSlopeMillisecondsPerMm:40};
    for(const row of fixture.cases) {
        const actual=getRobotRapidMoveJerkTiming({naturalPeriodSeconds:row.periodSeconds,armLengthMm:0,payloadMassKg:1,
            mechanicalParameters:disabledMechanical,startRampPercent:row.startPercent,stopRampPercent:row.stopPercent,
            startTimeMs:row.defaultTimeMs,stopTimeMs:row.defaultTimeMs});
        assert.equal(actual.start.localJerkRatioPerMillisecond,row.startLocalJerkPerMs);
        assert.equal(actual.stop.localJerkRatioPerMillisecond,row.stopLocalJerkPerMs);
        for(const side of [actual.start,actual.stop]) {
            assert.equal(side.sharedJerkLevel,row.sharedStopJerkLevel);
            assert.equal(side.clampSetTimeMilliseconds,row.sharedStartSetJerkTimeMs);
            assert.equal(side.transitionTimeMilliseconds,row.nativeTransitionTimeMs,JSON.stringify(row));
        }
    }
});
