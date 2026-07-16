export const VIRTUAL_CONTROLLER_HOST = '127.0.0.1';
export const VIRTUAL_CONTROLLER_BRIDGE_URL = 'ws://127.0.0.1:5055/ws';
export const VIRTUAL_CONTROLLER_SAMPLE_INTERVAL_MS = 4;
export const VIRTUAL_CONTROLLER_RENDER_DELAY_MS = 12;

const TRACE_POSITION_KEYS = [
    ['pos_x', 'posX', 'PosX'],
    ['pos_y', 'posY', 'PosY'],
    ['pos_z', 'posZ', 'PosZ']
];
const TRACE_ROTATION_KEYS = [
    ['pos_a', 'posA', 'PosA'],
    ['pos_b', 'posB', 'PosB'],
    ['pos_c', 'posC', 'PosC']
];

function readFiniteNumber(source, keys) {
    for (const key of keys) {
        if (!source || !Object.prototype.hasOwnProperty.call(source, key) || source[key] === null) continue;
        const value = Number(source[key]);
        if (Number.isFinite(value)) return value;
    }
    return null;
}

function normalizeSignedDegrees(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
}

export function interpolateVirtualControllerJoints(previous, next, alpha, jointTypes = []) {
    if (!Array.isArray(previous) || !Array.isArray(next)) return [];
    const length = Math.min(previous.length, next.length);
    const amount = Math.min(1, Math.max(0, Number(alpha) || 0));
    return Array.from({ length }, (_, index) => {
        const start = Number(previous[index]);
        const end = Number(next[index]);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        const delta = jointTypes[index] === 'prismatic'
            ? end - start
            : normalizeSignedDegrees(end - start);
        return start + delta * amount;
    });
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
    const position = TRACE_POSITION_KEYS.map((keys) => readFiniteNumber(data, keys));
    const rotation = TRACE_ROTATION_KEYS.map((keys) => readFiniteNumber(data, keys));
    if ([...position, ...rotation].some((value) => value === null)) {
        return { kind: 'invalid', reason: 'pose' };
    }

    return {
        kind: 'pose',
        receivedAt: Number.isFinite(receivedAt) ? receivedAt : 0,
        controllerTime: readFiniteNumber(data, ['time', 'Time']),
        position,
        rotation
    };
}

export class VirtualControllerSampleBuffer {
    constructor(maxSamples = 64) {
        this.maxSamples = Math.max(2, Math.floor(maxSamples));
        this.samples = [];
        this.recentReceiveTimes = [];
    }

    clear() {
        this.samples.length = 0;
        this.recentReceiveTimes.length = 0;
    }

    push(sample) {
        if (!sample || !['pose', 'state'].includes(sample.kind) || !Number.isFinite(sample.receivedAt)) return false;
        const last = this.samples.at(-1);
        const timestamp = last && sample.receivedAt <= last.receivedAt
            ? last.receivedAt + 0.001
            : sample.receivedAt;
        this.samples.push({ ...sample, receivedAt: timestamp });
        if (this.samples.length > this.maxSamples) {
            this.samples.splice(0, this.samples.length - this.maxSamples);
        }
        this.recentReceiveTimes.push(timestamp);
        const cutoff = timestamp - 1000;
        while (this.recentReceiveTimes.length && this.recentReceiveTimes[0] < cutoff) {
            this.recentReceiveTimes.shift();
        }
        return true;
    }

    getWindow(renderAt) {
        if (!this.samples.length) return null;
        while (this.samples.length > 2 && this.samples[1].receivedAt <= renderAt) {
            this.samples.shift();
        }
        const previous = this.samples[0];
        const next = this.samples[1] || previous;
        const span = next.receivedAt - previous.receivedAt;
        const alpha = span > 0
            ? Math.min(1, Math.max(0, (renderAt - previous.receivedAt) / span))
            : 1;
        return { previous, next, alpha };
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
