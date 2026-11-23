import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVirtualControllerMessage, VirtualControllerSampleBuffer } from '../../2_3DSimulation/virtual-controller-core.mjs';

test('a vacuum pulse between two frames keeps both poses and the measured position rate', () => {
    const buffer = new VirtualControllerSampleBuffer();
    const samples = [
        [false, 0, 0], [true, 4, 1], [true, 9, 0], [false, 1000 / 60, 0]
    ];
    for (const [outputEdge, time, output] of samples) {
        const sample = parseVirtualControllerMessage({
            type: 'robotState', data: { outputEdge, sequence: buffer.nextSampleId, timestamp: time,
                joints: [time, 0, 0, 0], tcp: [time, 2, 3, 4, 5, 6], outputs: { 0: output } }
        }, time);
        assert.equal(buffer.push(sample), true);
        assert.deepEqual(buffer.getLatest().position, [time, 2, 3]);
        assert.equal(buffer.getLatest().outputs[0], output);
    }
    assert.ok(Math.abs(buffer.getRateHz() - 60) < 1e-9);
});

test('a K14 snapshot exposes the upper 47 standard output bits and fieldbus together', () => {
    const packed = new Uint8Array(256);
    packed[0] = 1;
    const sample = parseVirtualControllerMessage({ type: 'robotState', data: {
        sourceSequence: 1, controllerCycle: 10, joints: [0, 0, 0, 0],
        outputs: { 16: 0, 17: 1, 63: 1, 64: 1 }, fieldbusOutputs: packed
    } });
    assert.equal(sample.outputs[17], 1);
    assert.equal(sample.outputs[63], 1);
    assert.equal(sample.outputs[64], undefined);
    assert.equal(sample.outputs[512], 1);
});

test('the panel counts actual arrivals across the full previous second during bursty delivery', () => {
    const buffer = new VirtualControllerSampleBuffer();
    const state = receivedAt => ({ kind: 'state', receivedAt, joints: [0, 0, 0, 0] });
    buffer.push(state(0));
    for (let i = 1; i <= 60; i++) buffer.push(state(100 + Math.floor((i - 1) / 3) * 45));
    buffer.push({ ...state(999), outputEdge: true });
    assert.equal(buffer.getRateHz(1000), 60);
    assert.equal(buffer.getRateHz(1800), 12);
    assert.equal(buffer.getRateHz(2100), 0);
});
