import { engine, numbers } from './wasm/engine.mjs';

const scaraErrors = [
    '', 'XY target radius is not finite', 'XY target is outside the SCARA arm reach',
    'target orientation contains unsupported tilt', 'Z target is below the SCARA lower limit',
    'Z target is above the SCARA upper limit', 'no SCARA joint solution satisfies the joint limits'
];

export function scaraInverse(joints, manifest, position, rotation, elbowSign, turn) {
    const state = numbers(12);
    for (let i = 0; i < 4; i++) {
        state[i] = joints[i].angle;
        state[i + 4] = joints[i].definition.min;
        state[i + 8] = joints[i].definition.max;
    }
    const [arm1, arm2] = manifest.structure;
    const status = engine.scara_inverse(position.x, position.y, position.z - (manifest.tcp?.[2] || 0),
        rotation.z * (180 / Math.PI), Math.hypot(rotation.x, rotation.y), arm1, arm2 * (manifest.secondArmDirection || 1),
        elbowSign, turn);
    return status ? { reason: scaraErrors[status] } : { angles: Array.from(numbers(4)) };
}

export function inverseJointStep(tcp, linearError, angularError, tasks, joints, scale, damping, linearLimit, angularLimit) {
    const values = numbers(9 + 3 * tasks.length + 7 * joints.length);
    tcp.toArray(values, 0);
    linearError.toArray(values, 3);
    angularError.toArray(values, 6);
    let cursor = 9;
    for (const { axis } of tasks) {
        axis.toArray(values, cursor);
        cursor += 3;
    }
    for (const joint of joints) {
        const parentRotation = joint.group.parent.getWorldQuaternion(joint.group.quaternion.clone());
        const axis = joint.axis.clone().applyQuaternion(parentRotation).normalize();
        const position = joint.group.getWorldPosition(joint.group.position.clone());
        values[cursor++] = Number(joint.definition.type === 'prismatic');
        axis.toArray(values, cursor);
        position.toArray(values, cursor + 3);
        cursor += 6;
    }
    if (!engine.ik_step(joints.length, tasks.length, scale, damping, linearLimit, angularLimit)) return null;
    return Array.from(numbers(joints.length));
}
