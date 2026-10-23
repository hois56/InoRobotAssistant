// Controller arm parameters (ArmType[0..3]) as defined in the Inovance Teach
// Pendant User Manual, "Concepts and Terms > Arm parameters".

// Every 90° changes the value by 1: [-90, 0) is -1, [0, 90) is 0, [90, 180) is 1.
export function armQuadrant(angleDegrees) {
    const angle = Number(angleDegrees) || 0;
    return Math.floor((angle + 1e-9) / 90);
}

// Rotates an (x, z) vector of the 6-axis arm plane about the +Y axis.
function rotateArmPlane([x, z], radians) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return [x * cos + z * sin, -x * sin + z * cos];
}

function planeCross([ax, az], [bx, bz]) {
    return ax * bz - az * bx;
}

// ArmType[3] of a 6-axis robot combines waist (forward 0 / backward 4),
// elbow (upward 0 / downward 2) and wrist (flipped 0 / not flipped 1).
// Pivots are the J2, J3 and J5 axis positions [x, y, z] at the zero pose;
// J2, J3 and J5 turn about -Y, so a positive J5 bends the wrist upward (flipped).
export function sixAxisArmConfiguration({ shoulderPivot, elbowPivot, wristPivot }, jointAngles) {
    const [, j2 = 0, j3 = 0, , j5 = 0] = jointAngles.map((value) => Number(value) || 0);
    const toRadians = (degrees) => -degrees * Math.PI / 180;
    const upperArmAtZero = [elbowPivot[0] - shoulderPivot[0], elbowPivot[2] - shoulderPivot[2]];
    const forearmAtZero = [wristPivot[0] - elbowPivot[0], wristPivot[2] - elbowPivot[2]];
    const upperArm = rotateArmPlane(upperArmAtZero, toRadians(j2));
    const forearm = rotateArmPlane(forearmAtZero, toRadians(j2 + j3));
    // The wrist centre's distance in front of the J1 axis decides the waist side.
    const waistBackward = shoulderPivot[0] + upperArm[0] + forearm[0] < -1e-9;
    // The zero pose is elbow upward; crossing the stretched or folded pose flips the side.
    const elbowDownward = Math.sign(planeCross(upperArm, forearm)) * Math.sign(planeCross(upperArmAtZero, forearmAtZero)) < 0;
    const wristFlipped = j5 > 1e-9;
    return (waistBackward ? 4 : 0) + (elbowDownward ? 2 : 0) + (wristFlipped ? 0 : 1);
}

export function sixAxisArmParameters(pivots, jointAngles) {
    return [
        armQuadrant(jointAngles[0]),
        armQuadrant(jointAngles[3]),
        armQuadrant(jointAngles[5]),
        sixAxisArmConfiguration(pivots, jointAngles)
    ];
}

// SCARA ArmType[0] is the hand (left -1 / right 1); ArmType[3] is the J4 turn.
// Ceiling variants invert the second-link direction, so their J2 sign is mirrored.
export function scaraArmParameters(jointAngles, secondArmDirection = 1) {
    const j2 = Number(jointAngles[1]) || 0;
    const direction = Math.sign(secondArmDirection) || 1;
    return [(j2 < 0 ? -1 : 1) * direction, 0, 0, armQuadrant(jointAngles[3])];
}

// The controller moves to the reachable arm parameter closest to the requested
// one, so keep the J4 candidates whose turn is nearest to ArmType[3].
export function closestArmTurnCandidates(candidates, armTurn) {
    if (!Number.isInteger(armTurn) || !candidates.length) return candidates;
    const distance = (angle) => Math.abs(armQuadrant(angle) - armTurn);
    const best = Math.min(...candidates.map(distance));
    return candidates.filter((angle) => distance(angle) === best);
}
