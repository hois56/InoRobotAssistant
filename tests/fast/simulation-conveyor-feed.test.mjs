import test from 'node:test';
import assert from 'node:assert/strict';
import { planConveyorFeed, normalizeConveyorFeedVariation, conveyorFeedEnvelope, sampleConveyorFeedRotation } from '../../2_3DSimulation/conveyor-feed-core.mjs';
import { advanceConveyorObject } from '../../2_3DSimulation/conveyor-core.mjs';

test('distance-based supply keeps the same pitch across frame rates and speed changes', () => {
    for (const fps of [10, 30, 60, 120]) {
        let phase = 140, travelled = 0;
        const births = [];
        for (let i = 0; i < fps * 10; i++) {
            const distance = (i < fps * 5 ? 100 : 200) / fps;
            const result = planConveyorFeed(phase, distance, 140);
            births.push(...result.offsets.map(offset => travelled + offset));
            travelled += distance; phase = result.progress;
        }
        assert.equal(births.length, 11);
        for (let i = 0; i < births.length; i++) assert.ok(Math.abs(births[i] - i * 140) < 1e-6);
        assert.deepEqual(planConveyorFeed(phase, 0, 140), { offsets: [], progress: phase });
    }
});

test('new objects within one frame retain their distinct birth distances', () => {
    assert.deepEqual(planConveyorFeed(40, 130, 40), { offsets: [0, 40, 80, 120], progress: 10 });
    assert.deepEqual(planConveyorFeed(10, 30, 40), { offsets: [30], progress: 0 });
    assert.deepEqual(planConveyorFeed(0, 1, 40), { offsets: [], progress: 1 });
    assert.throws(() => planConveyorFeed(0, 10, 0));
});

test('generated workpieces can leave the belt while ordinary workpieces still stop at its edge', () => {
    const belt = { min: { x: -400, y: -80, z: 0 }, max: { x: 400, y: 80, z: 30 } };
    const object = { min: { x: 360, y: -20, z: 30 }, max: { x: 400, y: 20, z: 70 } };
    assert.equal(advanceConveyorObject(belt, object, 'X', 100, 1), 0);
    assert.equal(advanceConveyorObject(belt, object, 'X', 100, 1, 2, true), 100);
    assert.equal(advanceConveyorObject(belt, object, '-X', 100, 1, 2, true), -100);
    assert.equal(advanceConveyorObject(belt, { ...object, min: { ...object.min, z: 100 } }, 'X', 100, 1, 2, true), 0);
});

test('feed variation defaults support vision trials and explicit zero preserves aligned supply', () => {
    assert.deepEqual(normalizeConveyorFeedVariation({}), { positionRange: 20, rotationRange: 15 });
    assert.deepEqual(normalizeConveyorFeedVariation({ positionRange: '0', rotationRange: '0' }), { positionRange: 0, rotationRange: 0 });
    for (const value of ['', -1, NaN, Infinity, 1000001]) assert.throws(() => normalizeConveyorFeedVariation({ positionRange: value }));
    for (const value of ['', -1, NaN, Infinity, 181]) assert.throws(() => normalizeConveyorFeedVariation({ rotationRange: value }));
});

test('reserved footprints cover every sampled rotation while narrow belts constrain yaw', () => {
    for (const size of [[40, 40, 20], [120, 20, 40], [20, 120, 30]]) {
        for (const range of [0, 15, 90, 180]) {
            const envelope = conveyorFeedEnvelope(size, range);
            for (const span of [[800, 160], [160, 800], [size[0], size[1]], [size[0] + 5, size[1] + 5]]) {
                for (let i = 0; i <= 100; i++) {
                    const angle = sampleConveyorFeedRotation(size, span, range, () => i / 100);
                    assert.ok(Math.abs(angle) <= range * Math.PI / 180);
                    const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
                    const footprint = [size[0] * c + size[1] * s, size[1] * c + size[0] * s];
                    for (const axis of [0, 1]) {
                        assert.ok(footprint[axis] <= span[axis] + 1e-8);
                        assert.ok(footprint[axis] <= envelope[axis] + 1e-8);
                    }
                }
            }
        }
    }
    assert.equal(sampleConveyorFeedRotation([40, 40, 20], [800, 160], 15, () => 1), 15 * Math.PI / 180);
    assert.deepEqual(conveyorFeedEnvelope([120, 20, 40], 0), [120, 20, 40]);
});
