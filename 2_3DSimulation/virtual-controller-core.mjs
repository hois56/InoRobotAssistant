export const VIRTUAL_CONTROLLER_HOST = '127.0.0.1';
export const VIRTUAL_CONTROLLER_BRIDGE_URL = 'ws://127.0.0.1:5055/ws';
export const VIRTUAL_CONTROLLER_BRIDGE_HEALTH_URL = 'http://127.0.0.1:5055/api/health';
export const VIRTUAL_CONTROLLER_TRACE_URL = 'ws://127.0.0.1:5000/ws';
export const VIRTUAL_CONTROLLER_SAMPLE_INTERVAL_MS = 4;

export const VIRTUAL_CONTROLLER_SOURCES = Object.freeze({
    bridge: Object.freeze({
        id: 'bridge',
        label: '전용 브리지',
        socketUrl: VIRTUAL_CONTROLLER_BRIDGE_URL,
        healthUrl: VIRTUAL_CONTROLLER_BRIDGE_HEALTH_URL,
        startCommand: 'startStream',
        stopCommand: 'stopStream'
    }),
    trace: Object.freeze({
        id: 'trace',
        label: 'Trace 도구',
        socketUrl: VIRTUAL_CONTROLLER_TRACE_URL,
        startCommand: 'startTrace',
        stopCommand: 'stopTrace'
    })
});

export function getVirtualControllerSource(sourceId) {
    return VIRTUAL_CONTROLLER_SOURCES[sourceId] || VIRTUAL_CONTROLLER_SOURCES.bridge;
}

const TRACE_JOINT_KEYS = Array.from({ length: 6 }, (_, index) => {
    const jointNumber = index + 1;
    return [
        `joint_pos_j${jointNumber}`,
        `joint_position_j${jointNumber}`,
        `joint_${jointNumber}`,
        `joint${jointNumber}`,
        `j${jointNumber}`
    ];
});

function readFiniteNumber(source, keys) {
    for (const key of keys) {
        if (!source || !Object.prototype.hasOwnProperty.call(source, key) || source[key] === null) continue;
        const value = Number(source[key]);
        if (Number.isFinite(value)) return value;
    }
    return null;
}

function readTraceJoints(data) {
    const packed = [data?.joints, data?.jointPositions, data?.joint_positions]
        .find((candidate) => Array.isArray(candidate));
    if (packed) {
        const joints = packed.map(Number);
        if (joints.length >= 4 && joints.every(Number.isFinite)) return joints;
    }

    const joints = TRACE_JOINT_KEYS.map((keys) => readFiniteNumber(data, keys));
    return joints.every((value) => value !== null) ? joints : null;
}

export function parseVirtualControllerMessage(raw, receivedAt = 0) {
    let message;
    try {
        message = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return { kind: 'invalid', reason: 'json' };
    }
    if (!message || typeof message !== 'object') return { kind: 'invalid', reason: 'message' };

    if (message.type === 'robotState') {
        const data = message.data;
        const joints = Array.isArray(data?.joints) ? data.joints.map(Number) : [];
        if (joints.length < 4 || joints.some((value) => !Number.isFinite(value))) {
            return { kind: 'invalid', reason: 'joints' };
        }
        const tcp = Array.isArray(data?.tcp) ? data.tcp.map(Number) : [];
        const hasTcp = tcp.length >= 6 && tcp.slice(0, 6).every(Number.isFinite);
        return {
            kind: 'state',
            receivedAt: Number.isFinite(receivedAt) ? receivedAt : 0,
            controllerTime: readFiniteNumber(data, ['timestamp', 'Timestamp']),
            sequence: readFiniteNumber(data, ['sequence', 'Sequence']),
            joints,
            position: hasTcp ? tcp.slice(0, 3) : null,
            rotation: hasTcp ? tcp.slice(3, 6) : null
        };
    }

    if (message.type !== 'traceData') {
        return { kind: 'event', type: String(message.type || ''), message };
    }

    const data = message.data;
    if (!data || typeof data !== 'object') return { kind: 'invalid', reason: 'data' };
    const joints = readTraceJoints(data);
    if (!joints) return { kind: 'invalid', reason: 'trace-joints' };

    return {
        kind: 'state',
        receivedAt: Number.isFinite(receivedAt) ? receivedAt : 0,
        controllerTime: readFiniteNumber(data, ['time', 'Time']),
        joints,
        position: null,
        rotation: null
    };
}

export class VirtualControllerSampleBuffer {
    constructor() {
        this.latestSample = null;
        this.recentReceiveTimes = [];
        this.nextSampleId = 1;
    }

    clear() {
        this.latestSample = null;
        this.recentReceiveTimes.length = 0;
        this.nextSampleId = 1;
    }

    push(sample) {
        if (!sample || sample.kind !== 'state' || !Number.isFinite(sample.receivedAt)) return false;
        const last = this.latestSample;
        const timestamp = last && sample.receivedAt <= last.receivedAt
            ? last.receivedAt + 0.001
            : sample.receivedAt;
        this.latestSample = { ...sample, receivedAt: timestamp, sampleId: this.nextSampleId };
        this.nextSampleId += 1;
        this.recentReceiveTimes.push(timestamp);
        const cutoff = timestamp - 1000;
        while (this.recentReceiveTimes.length && this.recentReceiveTimes[0] < cutoff) {
            this.recentReceiveTimes.shift();
        }
        return true;
    }

    getLatest() {
        return this.latestSample;
    }

    getRateHz(now = this.recentReceiveTimes.at(-1) ?? 0) {
        const cutoff = now - 1000;
        while (this.recentReceiveTimes.length && this.recentReceiveTimes[0] < cutoff) {
            this.recentReceiveTimes.shift();
        }
        if (this.recentReceiveTimes.length < 2) return 0;
        const duration = this.recentReceiveTimes.at(-1) - this.recentReceiveTimes[0];
        return duration > 0 ? ((this.recentReceiveTimes.length - 1) * 1000) / duration : 0;
    }
}
