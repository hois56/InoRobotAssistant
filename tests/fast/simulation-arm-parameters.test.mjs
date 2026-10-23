import test from 'node:test';
import assert from 'node:assert/strict';
import {
    armQuadrant,
    sixAxisArmParameters,
    scaraArmParameters,
    closestArmTurnCandidates
} from '../../2_3DSimulation/arm-parameter-core.mjs';

// IR-R4-56S structure [0, 260, 20, 300, 70, 330]: J2, J3 and J5 pivots at the zero pose.
const r4Pivots = { shoulderPivot: [0, 0, 330], elbowPivot: [0, 0, 590], wristPivot: [300, 0, 610] };

test('관절 회전수 Arm 파라미터는 매뉴얼처럼 90° 단위로 바뀐다', () => {
    assert.deepEqual(
        [-360, -270.5, -180, -90, -0.5, 0, 89.9, 90, 180, 270, 359.9].map(armQuadrant),
        [-4, -4, -2, -1, -1, 0, 0, 1, 2, 3, 3]
    );
});

test('6축 Arm 3은 허리·엘보·손목 형태를 매뉴얼 표의 0~7로 계산한다', () => {
    // Zero pose: waist forward, elbow upward, wrist not flipped.
    assert.deepEqual(sixAxisArmParameters(r4Pivots, [0, 0, 0, 0, 0, 0]), [0, 0, 0, 1]);
    // Tool pointing down (J5 negative) keeps the wrist not flipped; J5 positive flips it.
    assert.equal(sixAxisArmParameters(r4Pivots, [0, 0, 0, 0, -90, 0])[3], 1);
    assert.equal(sixAxisArmParameters(r4Pivots, [0, 0, 0, 0, 30, 0])[3], 0);
    // Forearm raised past the stretched pose (about 86.2° for R4) turns the elbow downward.
    assert.equal(sixAxisArmParameters(r4Pivots, [0, 0, 80, 0, -10, 0])[3], 1);
    assert.equal(sixAxisArmParameters(r4Pivots, [0, -40, 100, 0, -10, 0])[3], 3);
    // Raising the forearm far enough also moves the wrist centre behind J1.
    assert.equal(sixAxisArmParameters(r4Pivots, [0, 0, 120, 0, -10, 0])[3], 7);
    // Leaning the upper arm back puts the wrist centre behind the J1 axis.
    assert.equal(sixAxisArmParameters(r4Pivots, [0, 60, 0, 0, -10, 0])[3], 5);
    assert.equal(sixAxisArmParameters(r4Pivots, [0, 60, 0, 0, 10, 0])[3], 4);
    assert.deepEqual(sixAxisArmParameters(r4Pivots, [-100, 0, 0, 190, -10, -270]), [-2, 2, -3, 1]);
});

test('스카라 Arm 파라미터는 손 방향과 J4 회전수만 사용한다', () => {
    assert.deepEqual(scaraArmParameters([10, 45, 0, 100]), [1, 0, 0, 1]);
    assert.deepEqual(scaraArmParameters([10, -45, 0, -45]), [-1, 0, 0, -1]);
    assert.deepEqual(scaraArmParameters([10, 45, 0, 0], -1), [-1, 0, 0, 0]);
});

test('스카라 J4 후보는 요청한 Arm 3에 가장 가까운 회전수를 고른다', () => {
    assert.deepEqual(closestArmTurnCandidates([-260, 100], 1), [100]);
    assert.deepEqual(closestArmTurnCandidates([-260, 100], -3), [-260]);
    // An unreachable turn falls back to the nearest one rather than failing.
    assert.deepEqual(closestArmTurnCandidates([-260, 100], 3), [100]);
    assert.deepEqual(closestArmTurnCandidates([-260, 100], undefined), [-260, 100]);
});
