import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from '../../2_3DSimulation/motion-program-core.mjs';

const source = fs.readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const start = source.indexOf('function advanceMotionSegment(session, timestamp) {');
const end = source.indexOf('\nfunction updateMotionSessions(', start);
assert.ok(start >= 0 && end > start, 'actual production advanceMotionSegment must be found');

const startAngles = [0, -40, -20, 0];
const targetAngles = [50, 35, -110, 90];
const noop = () => {};

function makeSession(override) {
    const robot = {userData: {
        manifest: {robotType: 'scara'},
        joints: startAngles.map(angle => ({angle}))
    }, updateMatrixWorld: noop};
    const rapidMove = core.createRapidMoveState(startAngles, targetAngles, robot.userData.joints, 100, {
        enabled: true, robotType: 'scara', modelName: 'IR-S7-60Z20',
        toolLoad: {mass: 1, cog: [0, 0, 0], inertia: [0, 0, 0]}
    });
    assert.equal(rapidMove.planner, 's7-rapid-dynamics');
    const program = {};
    const context = vm.createContext({
        ...core,
        state: {programSpeedOverride: override, activeArticulatedModel: null},
        THREE: {MathUtils: {lerp: (a,b,t) => a+(b-a)*t}},
        isIoMotion: () => false,
        advanceRobotTravelAxis: noop,
        setJointAngle: (joint, angle) => {joint.angle = angle;},
        ensureMotionProgram: () => program,
        motionSessionProgress: (_session, progress) => progress,
        captureCurrentTcpTarget: noop,
        updateTcpPresentation: noop,
        appendTcpPathPoint: noop,
        syncJointControls: noop,
        syncWorkOriginOutputStates: noop
    });
    vm.runInContext(source.slice(start, end), context);
    const segment = {type: 'MOVJ', step: {name: 'Clock regression'}, startAngles, targetAngles,
        startTime: 1000, rapidMove, motionDuration: rapidMove.durationSeconds*1000,
        duration: rapidMove.durationSeconds*1000+core.MOTION_SETTLING_DELAY_SECONDS*1000};
    return {advance: context.advanceMotionSegment, session: {robot, segment}, rapidMove};
}

for (const override of [100, 50]) {
    test(`S7 RapidMove schedules the next segment on raw time at ${override}% override`, () => {
        const {advance, session, rapidMove} = makeSession(override);
        const {segment} = session;
        // Cross the end by a small amount, as a real display frame normally does.
        const completedAt = segment.startTime + rapidMove.durationSeconds*1000/(override/100) + 2;
        assert.equal(advance(session, completedAt), false, 'settling starts after completing motion');
        assert.equal(rapidMove.completed, true);
        const settlingMilliseconds = core.MOTION_SETTLING_DELAY_SECONDS*1000;
        const nextSegmentStart = segment.startTime + segment.duration;
        assert.ok(Math.abs(nextSegmentStart - (completedAt + settlingMilliseconds)) < 1e-8,
            `next segment starts at ${nextSegmentStart}; raw completion+settling is ${completedAt + settlingMilliseconds}`);
        assert.equal(advance(session, completedAt + settlingMilliseconds), true);
    });
}
