import test from 'node:test';
import assert from 'node:assert/strict';
import { ConveyorTracking, forEachConveyorTrackingStep, sweptSensorInterval } from '../../2_3DSimulation/conveyor-tracking-core.mjs';

const box = (x, width = 2) => ({ min: { x, y: 0, z: 0 }, max: { x: x + width, y: 2, z: 2 } });
const sensor = { id: 'photo', address: 512, bounds: box(10, 1) };
const create = options => new ConveyorTracking({ session: 'test-1', sensors: [sensor], ...options });

test('legacy automatic capture is ignored and an empty controller capture still acknowledges the trigger', () => {
    const tracking = create({ captureOffset: [10, 20, 30, 0, 0, 90], sensors: [{ ...sensor, capture: true }] });
    const frame = tracking.sample({ seconds: .02, distance: 20, objects: [{ before: box(0), after: box(20) }],
        captureAt: fraction => { assert.equal(fraction, .4); return [{ id: 'work', type: 2, pose: [10, 0, 2, 0, 0, 0] }]; },
        captures: [{ fraction: 1, requestId: 7, objects: [] }] });
    const shots = frame.events.filter(event => event.kind === 'vision');
    assert.deepEqual(frame.events.map(event => event.kind), ['sensor', 'sensor', 'vision']);
    assert.equal(shots[0].encoder, '20000');
    assert.equal(shots[0].requestId, 7); assert.equal(shots[0].objects.length, 0);
    assert.deepEqual(frame.captureOffset, [10, 20, 30, 0, 0, 90]);
});

test('fractional pulses accumulate, forward and reverse quadrature use signed counts', () => {
    const tracking = create({ countsPerMm: 3 });
    for (let i = 0; i < 10; ++i) tracking.sample({ seconds: 0.01, distance: 0.1 });
    assert.equal(tracking.lastFrame.encoder, '3');
    const reverse = create({ countsPerMm: 10 });
    const frame = reverse.sample({ seconds: 0.01, distance: -0.1 });
    assert.equal(frame.encoder, '-1'); assert.deepEqual(frame.quadrature, [1, 0]);
});

test('camera processing delays delivery while retaining the exposure position and encoder', () => {
    const tracking = create({ sensors: [] });
    let frame=tracking.sample({ seconds:.02,distance:2,captureDelaySeconds:.1,
        captures:[{fraction:.5,requestId:4,objects:[{id:'moving',type:1,pose:[100,0,0,0,0,0]}]}] });
    assert.equal(frame.events.length,0);
    for(let i=0;i<5;i++)frame=tracking.sample({seconds:.02,distance:2});
    assert.equal(frame.encoder,'12000');assert.equal(frame.events.length,1);
    assert.equal(frame.events[0].encoder,'1000');assert.equal(frame.events[0].position,1);
    assert.equal(frame.events[0].time,.01);assert.equal(frame.events[0].requestId,4);
});

test('fast object generates both sensor edges and latches the crossing encoder', () => {
    const tracking = create();
    const frame = tracking.sample({ seconds: 0.02, distance: 20, objects: [{ before: box(0), after: box(20) }] });
    assert.deepEqual(frame.events.map(e => [e.value, e.encoder]), [[1, '8000'], [0, '11000']]);
    assert.equal(frame.sensors[0].value, 0);
    assert.equal(frame.events[0].time, 0.008);
});

test('throttled scene steps preserve distance and sensor capture at 440 mm/s', () => {
    const tracking = create();
    let position = 0;
    forEachConveyorTrackingStep(0.75, seconds => {
        const distance = 440 * seconds;
        tracking.sample({
            seconds,
            distance,
            objects: [{ before: box(position), after: box(position + distance) }],
            sensorCapture: { distance: 5, capture: () => [{ id: 'part', type: 0, pose: [13, 0, 2, 0, 0, 0] }] }
        });
        position += distance;
    });
    assert.equal(position, 330);
    assert.equal(tracking.lastFrame.encoder, '330000');
    assert.equal(tracking.lastFrame.velocity, 440);
    assert.deepEqual(tracking.lastFrame.events.map(event => [event.kind, event.encoder]),
        [['sensor', '8000'], ['sensor', '11000'], ['vision', '13000']]);
});

test('overlapping objects form one sensor pulse; stopping preserves occupied level', () => {
    const tracking = create();
    const frame = tracking.sample({ seconds: 0.02, distance: 10,
        objects: [{ before: box(0, 5), after: box(10, 5) }, { before: box(-3, 5), after: box(7, 5) }] });
    assert.equal(frame.events.length, 1); assert.equal(frame.sensors[0].value, 1);
    tracking.acknowledge({ session: 'test-1', eventId: 1 });
    const stop = tracking.sample({ seconds: 0.1, distance: 0, objects: [{ before: box(10, 5), after: box(10, 5) }] });
    assert.equal(stop.encoder, '10000'); assert.equal(stop.events.length, 0); assert.equal(stop.sensors[0].value, 1);
});

test('reverse traversal and sensor across another lane', () => {
    assert.deepEqual(sweptSensorInterval(box(20), box(0), sensor.bounds), [0.45, 0.6]);
    const otherLane = box(10); otherLane.min.y = 3; otherLane.max.y = 5;
    assert.equal(sweptSensorInterval(box(0), box(20), otherLane), null);
});

test('vision captures preserve trigger count, type and six-axis pose while responses are retried', () => {
    const tracking = create();
    const object = { id: 'part', type: 3, pose: [10, 4, 2, 0, 0, 30] };
    const first = tracking.sample({ seconds: 0.1, distance: 10, captures: [{ fraction: 0.25, objects: [object] }] });
    assert.equal(first.events[0].encoder, '2500'); assert.deepEqual(first.events[0].objects[0], object);
    object.pose[0] = 99; first.events[0].objects[0].pose[0] = 88;
    const second = tracking.sample({ seconds: 0.1, distance: 10 });
    assert.equal(second.events[0].id, 1); assert.equal(second.events[0].objects[0].pose[0], 10);
    assert.equal(tracking.acknowledge({ session: 'wrong', eventId: 1 }), false);
    tracking.acknowledge({ session: 'test-1', eventId: 1 });
    assert.equal(tracking.sample({ seconds: 0, distance: 0 }).events.length, 0);
});

test('invalid data and event overflow are transactional; resets require a new session', () => {
    const tracking = create();
    assert.throws(() => tracking.sample({ seconds: 2, distance: 100 }), RangeError);
    assert.throws(() => tracking.sample({ seconds: 0, distance: 1 }), RangeError);
    assert.throws(() => tracking.sample({ seconds: 0.1, distance: 1, captures: [{ objects: [{ type: 16, pose: [0, 0, 0, 0, 0, 0] }] }] }), RangeError);
    assert.equal(tracking.sequence, 0); assert.equal(tracking.position, 0);
    for (let i = 0; i < 500; ++i) tracking.sample({ seconds: 0, distance: 0, captures: [{ objects: [] }] });
    assert.throws(() => tracking.sample({ seconds: 0.1, distance: 10, captures: [{ objects: [] }] }), /full/);
    assert.equal(tracking.position, 0); assert.equal(tracking.sequence, 500);
});

test('channels and mapping errors are isolated', () => {
    const one = create({ conveyor: 1 }), two = create({ conveyor: 2 });
    one.sample({ seconds: 0.1, distance: 10 });
    assert.equal(two.position, 0);
    assert.throws(() => create({ sensors: [sensor, sensor] }), /mapping/);
    assert.throws(() => create({ sensors: [{ ...sensor, address: 100 }] }), /sensor address/);
    assert.throws(() => create({ conveyor: 4 }), RangeError);
    assert.throws(() => create({ countsPerMm: NaN }), RangeError);
    assert.throws(() => create({ countsPerMm: .000001 }), RangeError);
});

test('standard sensor inputs preserve address zero and sensor edges', () => {
    for (const address of [0, 1, 64, 512, 2559]) {
        const tracking = create({ sensors: [{ ...sensor, address }] });
        const frame = tracking.sample({ seconds: .02, distance: 20, objects: [{ before: box(0), after: box(20) }] });
        assert.equal(frame.sensors[0].address, address);
        assert.deepEqual(frame.events.map(event => [event.address, event.value]), [[address, 1], [address, 0]]);
    }
    for (const address of [-1, 65, 511, 2560, .5])
        assert.throws(() => create({ sensors: [{ ...sensor, address }] }), RangeError);
});

test('reconnecting preserves encoder, occupied sensor and unacknowledged detection IDs', () => {
    const tracking = create();
    const occupied = box(10, 1);
    const first = tracking.sample({ seconds:.02, distance:20, objects:[{before:box(0,1),after:occupied}],
        captures:[{objects:[{id:'retained',type:3,pose:[10,4,2,0,0,30]}]}] });
    const resumed = tracking.reconnectFrame();
    assert.equal(resumed.encoder, first.encoder);
    assert.equal(resumed.session, first.session);
    assert.equal(resumed.sequence, first.sequence+1);
    assert.deepEqual(resumed.events, first.events);
    assert.deepEqual(resumed.sensors, first.sensors);
    assert.equal(resumed.velocity,0);
    tracking.acknowledge({session:tracking.session,eventId:tracking.eventId});
    const after = tracking.sample({seconds:.02,distance:0,objects:[{before:occupied,after:occupied}]});
    assert.deepEqual(after.events,[]);
    assert.equal(after.encoder,first.encoder);
});

test('reconnecting discards obsolete capture results and retains a current delayed capture', () => {
    const tracking = create({ sensors: [] });
    tracking.sample({ seconds: .01, distance: 1, captures: [{ requestId: 7, objects: [] }, { objects: [] }] });
    tracking.sample({ seconds: .01, distance: 1, captureDelaySeconds: .5,
        captures: [{ requestId: 7, objects: [] }, { requestId: 8, objects: [] }] });

    assert.equal(tracking.resumeEvents({ session: tracking.session, eventId: 0, flags: 8 }), true);
    const resumed = tracking.reconnectFrame();
    assert.equal(resumed.encoder, '2000');
    assert.deepEqual(resumed.events.map(event => [event.id, event.requestId]), [[1, 0]]);

    tracking.sample({ seconds: .25, distance: 0 });
    const frame = tracking.sample({ seconds: .25, distance: 0 });
    assert.deepEqual(frame.events.map(event => [event.id, event.requestId]), [[1, 0], [2, 8]]);
});

for (const direction of [1, -1]) test('sensor-triggered exposure waits for the configured distance along travel (' + direction + ')', () => {
    const tracking = create();
    const exposures = [];
    const sensorCapture = { distance: 15, capture: fraction => { exposures.push(fraction); return []; } };
    const crossing = direction > 0 ? { before: box(0), after: box(20) } : { before: box(20), after: box(0) };
    const initial = tracking.sample({ seconds: .02, distance: direction * 20, objects: [crossing], sensorCapture, captureDelaySeconds: .05 });
    assert.deepEqual(initial.events.map(event => event.kind), ['sensor', 'sensor']);
    tracking.acknowledge({ session: tracking.session, eventId: 2 });
    tracking.sample({ seconds: .15, distance: 0, sensorCapture, captureDelaySeconds: .05 });
    assert.deepEqual(exposures, []);
    const next = tracking.sample({ seconds: .02, distance: direction * 10, sensorCapture, captureDelaySeconds: .05 });
    assert.equal(next.events.length, 0);
    assert.deepEqual(exposures, [direction > 0 ? .3 : .4]);
    const delivered = tracking.sample({ seconds: .08, distance: direction * 20, sensorCapture, captureDelaySeconds: .05 });
    assert.deepEqual(delivered.events.map(event => [event.kind, event.requestId, event.encoder]),
        [['vision', 0, direction > 0 ? '23000' : '-24000']]);
});

test('zero-distance automatic capture uses one rising edge, including when a request coincides', () => {
    const tracking = create();
    let exposed = 0;
    const mode = { distance: 0, capture: () => { exposed++; return []; } };
    const moving = { before: box(0), after: box(10) };
    const first = tracking.sample({ seconds: .02, distance: 10, objects: [moving], sensorCapture: mode });
    assert.deepEqual(first.events.map(event => [event.kind, event.encoder]), [['sensor', '8000'], ['vision', '8000']]);
    tracking.acknowledge({ session: tracking.session, eventId: 2 });
    const occupied = { before: box(10), after: box(10) };
    assert.deepEqual(tracking.sample({ seconds: .02, distance: 0, objects: [occupied], sensorCapture: mode }).events, []);
    assert.equal(exposed, 1);
    const second = create().sample({ seconds: .02, distance: 10, objects: [moving], sensorCapture: mode,
        captures: [{ requestId: 7, objects: [] }] });
    assert.deepEqual(second.events.filter(event => event.kind === 'vision').map(event => event.requestId), [7]);
    assert.equal(exposed, 1);
});
