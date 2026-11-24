// K14: scene distances are millimetres; the encoder counts quadrature edges.
// One clock drives scene motion, sensor edges and capture encoder latches.
import { engine, numbers } from './wasm/engine.mjs';
const MAX_EVENTS = 500;
const MAX_SAMPLE_SECONDS = 0.25;

export function forEachConveyorTrackingStep(elapsed, advance) {
    const steps = Math.max(1, Math.ceil(elapsed / MAX_SAMPLE_SECONDS));
    const seconds = elapsed / steps;
    for (let step = 0; step < steps; step++) advance(seconds);
}
const AXES = ['x', 'y', 'z'];

function finite(value, name, min = -1e9, max = 1e9) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new RangeError(name);
    return value;
}
function integer(value, name, min, max) {
    finite(value, name, min, max);
    if (!Number.isInteger(value)) throw new RangeError(name);
    return value;
}
function bounds(box) {
    for (const axis of AXES) {
        finite(box?.min?.[axis], 'bounds.min'); finite(box?.max?.[axis], 'bounds.max');
        if (box.min[axis] > box.max[axis]) throw new RangeError('inverted bounds');
    }
    return box;
}
function encoder(position, scale) {
    const count = Math.trunc(position * scale);
    if (!Number.isSafeInteger(count)) throw new RangeError('encoder exceeds exact JavaScript integer range');
    return BigInt(count).toString();
}

// Closed interval during which a translated AABB overlaps a sensor AABB.
// Sweeping, instead of sampling only the end, retains short/fast detections.
export function sweptSensorInterval(before, after, sensor) {
    bounds(before); bounds(after); bounds(sensor);
    const data = numbers(18);
    let i = 0;
    for (const box of [before, after, sensor]) {
        for (const p of [box.min, box.max]) {
            data[i++] = p.x;
            data[i++] = p.y;
            data[i++] = p.z;
        }
    }
    const result = engine.sensor_interval();
    if (result < 0) throw new RangeError('sensor sweep requires a translated object');
    return result ? [data[0], data[1]] : null;
}

function quadrature(count) {
    const phase = Number((BigInt(count) % 4n + 4n) % 4n);
    return [[0, 0], [0, 1], [1, 1], [1, 0]][phase];
}

function intervalsUnion(intervals) {
    const merged = [];
    for (const interval of intervals.sort((a, b) => a[0] - b[0])) {
        const tail = merged.at(-1);
        if (tail && interval[0] <= tail[1]) tail[1] = Math.max(tail[1], interval[1]);
        else merged.push([...interval]);
    }
    return merged;
}

export function isConveyorSensorAddress(address) {
    return Number.isInteger(address) && ((address >= 0 && address <= 64) || (address >= 512 && address <= 2559));
}

export class ConveyorTracking {
    constructor({ conveyor = 0, countsPerMm = 1000, session, sensors = [], captureOffset = [0, 0, 0, 0, 0, 0] } = {}) {
        this.conveyor = integer(conveyor, 'conveyor', 0, 3);
        this.countsPerMm = finite(countsPerMm, 'countsPerMm', 0.00001, 1e9);
        if (typeof session !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(session)) throw new RangeError('session');
        this.session = session;
        if (!Array.isArray(captureOffset) || captureOffset.length !== 6) throw new RangeError('captureOffset');
        this.captureOffset = captureOffset.map(n => finite(n, 'captureOffset'));
        this.sensors = sensors.map(sensor => {
            if (!isConveyorSensorAddress(sensor.address)) throw new RangeError('sensor address');
            return { id: String(sensor.id), address: sensor.address, bounds: structuredClone(bounds(sensor.bounds)) };
        });
        if (this.sensors.length > 32 || new Set(this.sensors.map(s => s.id)).size !== this.sensors.length
            || new Set(this.sensors.map(s => s.address)).size !== this.sensors.length
            || this.sensors.some(s => !s.id || (s.address > 64 && s.address < 512))) throw new RangeError('sensor mapping');
        this.position = 0; this.positionError = 0; this.elapsed = 0; this.sequence = 0; this.eventId = 0;
        this.levels = new Map(this.sensors.map(s => [s.id, false]));
        this.pending = []; this.acknowledged = 0; this.lastFrame = null;
        this.processingCaptures = [];
        this.captureTriggers = [];
    }

    // Returns displacement to use for the rendered belt. A caller must pass
    // before/after geometry from that same step to sample(), without a new clock.
    movement(seconds, speed) {
        finite(seconds, 'seconds', 0, MAX_SAMPLE_SECONDS); finite(speed, 'speed', -5000, 5000);
        return seconds * speed;
    }

    reconnectFrame() {
        return structuredClone(this.frame(0, encoder(this.position, this.countsPerMm)));
    }

    sample(input) {
        const step = this.prepareStep(input);
        const shots = input.captures ?? [];
        const automatic = shots.length ? [] : step.exposures.map(fraction => ({
            fraction, objects: input.sensorCapture.capture(fraction)
        }));
        this.recordStep(step, shots.length ? shots : automatic, input.captureDelaySeconds);
        return structuredClone(this.frame(step.velocity, step.count, step.quadrature));
    }

    // Crossings and exposures use the same encoder sample as the rendered movement.
    prepareStep({ seconds, distance, objects = [], sensorCapture = null }) {
        finite(seconds, 'seconds', 0, MAX_SAMPLE_SECONDS); finite(distance, 'distance', -1250, 1250);
        if (seconds === 0 && distance !== 0) throw new RangeError('motion needs elapsed time');
        if (seconds > 0 && Math.abs(distance / seconds) > 5000.000001) throw new RangeError('speed');
        if (!Array.isArray(objects) || objects.length > MAX_EVENTS) throw new RangeError('objects');
        // Compensated summation keeps repeated sub-pulse steps from losing a
        // whole encoder edge at boundaries (ten 0.1 mm steps must be 1 mm).
        const correctedDistance = distance - this.positionError;
        const position = this.position + correctedDistance;
        const positionError = (position - this.position) - correctedDistance;
        const count = encoder(position, this.countsPerMm);
        const events = [], levels = new Map(this.levels);
        const scheduled = sensorCapture ? [...this.captureTriggers] : [];
        const triggerDistance = finite(sensorCapture?.distance ?? 0, 'sensor trigger distance', 0, 1e6);
        const exposures = [];
        const direction = Math.sign(distance);
        const startTime = this.elapsed, startPosition = this.position;
        const stamp = fraction => ({
            time: startTime + seconds * fraction,
            position: startPosition + distance * fraction,
            encoder: encoder(startPosition + distance * fraction, this.countsPerMm)
        });
        for (const sensor of this.sensors) {
            const intervals = objects.map(object => sweptSensorInterval(object.before, object.after, sensor.bounds)).filter(Boolean);
            const occupied = intervalsUnion(intervals);
            let level = levels.get(sensor.id);
            const edge = (value, fraction) => {
                if (level === value) return;
                level = value;
                events.push({ kind: 'sensor', sensor: sensor.id, address: sensor.address, value: value ? 1 : 0,
                    ...stamp(fraction) });
                if (value && sensorCapture) {
                    if (triggerDistance) scheduled.push({ position: this.position + distance * fraction, direction });
                    else exposures.push(fraction);
                }
            };
            if (!occupied.length || occupied[0][0] > 0) edge(false, 0);
            for (const [enter, leave] of occupied) {
                edge(true, enter);
                if (leave < 1) edge(false, leave);
            }
            levels.set(sensor.id, level);
        }
        const pendingTriggers = [];
        for (const shot of scheduled) {
            const travel = shot.direction || direction;
            const travelled = distance * travel;
            const remainingDistance = triggerDistance - (this.position - shot.position) * travel;
            if (travelled > 0 && remainingDistance <= travelled + 1e-9) {
                exposures.push(Math.max(0, Math.min(1, remainingDistance / travelled)));
            } else {
                pendingTriggers.push({ ...shot, direction: travel });
            }
        }
        if (pendingTriggers.length > MAX_EVENTS) throw new RangeError('unacknowledged conveyor events full');
        return { position, positionError, count, quadrature: quadrature(count), levels, events, exposures, pendingTriggers, stamp,
            elapsed: startTime + seconds, velocity: seconds ? distance / seconds : 0 };
    }

    advance(step) {
        this.position = step.position;
        this.positionError = step.positionError;
        this.elapsed = step.elapsed;
        this.levels = step.levels;
        this.captureTriggers = step.pendingTriggers;
    }

    // Each VC owns its camera requests, event numbering and acknowledgement queue.
    recordStep(step, shots = [], captureDelaySeconds = 0) {
        finite(captureDelaySeconds, 'camera processing time', 0, 60);
        if (!Array.isArray(shots)) throw new RangeError('captures');
        if (!shots.length && !step.events.length && !this.processingCaptures.length) {
            if (this.pending.length + step.pendingTriggers.length > MAX_EVENTS) throw new RangeError('unacknowledged conveyor events full');
            this.advance(step);
            return;
        }
        const events = step.events.map(edge => ({ ...edge,
            address: this.sensors.find(sensor => sensor.id === edge.sensor).address }));
        const processing = [...this.processingCaptures];
        for (const capture of shots) {
            const fraction = finite(capture.fraction ?? 1, 'capture fraction', 0, 1);
            if (!Array.isArray(capture.objects) || capture.objects.length > MAX_EVENTS) throw new RangeError('vision objects');
            const detected = capture.objects.map(object => {
                if (!Array.isArray(object.pose) || object.pose.length !== 6) throw new RangeError('vision pose');
                return { id: String(object.id), type: integer(object.type, 'object type', 0, 15),
                    pose: object.pose.map(n => finite(n, 'vision coordinate')) };
            });
            const event = { kind: 'vision', requestId: integer(capture.requestId ?? 0, 'capture request', 0, 2147483647), objects: detected, ...step.stamp(fraction) };
            processing.push({ readyAt: event.time + captureDelaySeconds, event });
        }
        const remaining = [];
        for (const shot of processing) {
            if (shot.readyAt <= step.elapsed) events.push(shot.event);
            else remaining.push(shot);
        }
        events.sort((a, b) => a.time - b.time);
        if (this.pending.length + events.length + remaining.length + step.pendingTriggers.length > MAX_EVENTS) throw new RangeError('unacknowledged conveyor events full');
        // Commit after every validation. Failed frames do not move the encoder.
        for (const event of events) event.id = ++this.eventId;
        if (events.length) this.pending = this.pending.concat(events);
        this.processingCaptures = remaining;
        this.advance(step);
    }

    frame(velocity, count, phase = quadrature(count)) {
        this.lastFrame = {
            version: 1, session: this.session, conveyor: this.conveyor, sequence: ++this.sequence,
            time: this.elapsed, position: this.position, encoder: count, countsPerMm: this.countsPerMm,
            captureOffset: this.captureOffset, velocity,
            quadrature: phase,
            sensors: this.sensors.map(s => ({ id: s.id, address: s.address, value: this.levels.get(s.id) ? 1 : 0 })),
            events: this.pending
        };
        return this.lastFrame;
    }

    resumeEvents(reply) {
        if (reply.session !== this.session) throw new RangeError('conveyor session');
        const { eventId, flags: requestId } = reply;
        const retained = this.acknowledge(reply);
        // A reset controller starts over. A live controller can only accept a
        // camera response for its current request, including delayed results.
        const stillRequested = event => !event.requestId || event.requestId === requestId;
        this.pending = retained ? this.pending.filter(stillRequested) : [];
        this.processingCaptures = retained
            ? this.processingCaptures.filter(({ event }) => stillRequested(event)) : [];
        if (!retained) this.captureTriggers = [];
        this.eventId = this.acknowledged = eventId;
        this.pending = this.pending.map(event => ({ ...event, id: ++this.eventId }));
        return Boolean(requestId && (this.pending.some(event => event.requestId === requestId)
            || this.processingCaptures.some(({ event }) => event.requestId === requestId)));
    }

    acknowledge({ session, eventId }) {
        if (session !== this.session) return false;
        integer(eventId, 'event acknowledgement', 0, this.eventId);
        if (eventId < this.acknowledged) return false;
        this.acknowledged = eventId;
        if (this.pending.length && this.pending[0].id <= eventId) this.pending = this.pending.filter(event => event.id > eventId);
        return true;
    }
}
