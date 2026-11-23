import test from 'node:test';
import assert from 'node:assert/strict';
import { VirtualControllerSampleBuffer } from '../../2_3DSimulation/virtual-controller-core.mjs';

function trackingErrors(delays, noise) {
    const buffer = new VirtualControllerSampleBuffer();
    const errors = [];
    let index = 0;
    for (let now = 0; now < 1500; now += 1000 / 120) {
        while (index * 20 + delays[index % delays.length] <= now) {
            const time = index * 20;
            buffer.push({ kind: 'state', sequence: index + 1, controllerTime: 1800000000000 + time,
                receivedAt: time + delays[index % delays.length], joints: [.44 * time + noise[index % noise.length]] });
            index++;
        }
        if (now > 500) {
            const pose = buffer.getTrackingRenderPose(now);
            errors.push(pose.joints[0] - .44 * pose.time);
        }
    }
    return Math.max(...errors) - Math.min(...errors);
}

test('regular 440 mm/s motion stays smooth when bridge packets arrive at irregular intervals', () => {
    const spread = trackingErrors([16, 25, 9, 19, 12, 14], [0]);
    assert.ok(spread < .45, `frame-to-frame relative position spread ${spread} mm`);
});

test('submillimetre sample noise is damped while constant velocity is preserved', () => {
    const spread = trackingErrors([16], [-.5, .5]);
    assert.ok(spread < .3, `remaining position spread ${spread} mm`);
    assert.ok(trackingErrors([16], [0]) < 1e-8);
});

test('playback uses the new endpoint on a bridge clock reset and settles at the last actual pose', () => {
    const buffer = new VirtualControllerSampleBuffer();
    const send = (sequence, controllerTime, receivedAt, joints) => buffer.push({ kind: 'state', sequence, controllerTime, receivedAt, joints });
    send(1, 700, 20, [1]);
    send(2, 720, 43, [2]);
    send(3, 100, 60, [9]);
    assert.deepEqual(buffer.getTrackingRenderPose(61), { time: 60, joints: [9] });
    send(4, 120, 80, [8]);
    assert.deepEqual(buffer.getTrackingRenderPose(138)?.joints, [8]);
    assert.equal(buffer.getTrackingRenderPose(180), null);
    assert.deepEqual(buffer.getLatest().joints, [8]);
});

test('native 60 Hz feedback uses the 16 ms display clock and holds at the latest sample', () => {
    const buffer = new VirtualControllerSampleBuffer();
    const send = (sampledAt, delay) => buffer.push({ kind: 'state', sampledAt,
        receivedAt: sampledAt + delay, joints: [.44 * sampledAt] });
    send(0, 5);
    send(1000 / 60, 2);
    send(2000 / 60, 9);
    send(50, 3);
    const pose = buffer.getTrackingRenderPose(60);
    assert.equal(pose.time, 44);
    assert.ok(Math.abs(pose.joints[0] - .44 * 44) < 1e-8);
    assert.deepEqual(buffer.getTrackingRenderPose(88), { time: 50, joints: [22] });
});

test('16 ms display interpolation keeps the fitted pose inside the measured travel after a stop', () => {
    const buffer = new VirtualControllerSampleBuffer();
    [0, 10, 10, 10].forEach((position, index) => buffer.push({ kind: 'state',
        sampledAt: index * 16, receivedAt: index * 16 + 2, joints: [position] }));
    assert.equal(buffer.getTrackingRenderPose(60).joints[0], 10);
});
