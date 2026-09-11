export const COLLABORATION_PROTOCOL = 'inorobot-collaboration-v1';
export const COLLABORATION_WS_PATH = '/collaboration';
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = '0123456789';
export const MAX_COLLABORATION_PARTICIPANTS = 4;
export const MAX_COLLABORATION_ROBOTS = 32;
export const MAX_COLLABORATION_JOINTS = 12;
export const MAX_COLLABORATION_MESSAGE_BYTES = 256 * 1024;
export const MAX_COLLABORATION_SNAPSHOT_BYTES = 2 * 1024 * 1024;
export const COLLABORATION_STATE_INTERVAL_MS = 40;

const COLLABORATION_MESSAGE_TYPES = new Set([
    'createRoom',
    'joinRoom',
    'reconnectRoom',
    'robotClaim',
    'robotRelease',
    'robotState',
    'robotCommand',
    'sceneCommand',
    'resyncRequest',
    'heartbeat',
    'heartbeatAck',
    'leaveRoom'
]);

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampInteger(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function cloneJson(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return null;
    }
}

export function normalizeRoomCode(value) {
    return String(value ?? '').replace(/[^0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(value) {
    const code = String(value ?? '');
    return code.length === ROOM_CODE_LENGTH
        && [...code].every((character) => ROOM_CODE_ALPHABET.includes(character));
}

export function createRoomCode(random = Math.random) {
    let code = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        const sample = Number(random());
        const normalized = Number.isFinite(sample) ? sample - Math.floor(sample) : 0;
        code += ROOM_CODE_ALPHABET[Math.floor(normalized * ROOM_CODE_ALPHABET.length)];
    }
    return code;
}

export function normalizeDisplayName(value, fallback = 'Guest') {
    const name = String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 32);
    return name || fallback;
}

export function normalizeRobotDescriptor(value) {
    if (!isRecord(value)) return null;
    const robotId = String(value.robotId ?? value.instanceId ?? '').trim().slice(0, 120);
    if (!robotId) return null;
    const rawLimits = Array.isArray(value.jointLimits) ? value.jointLimits : [];
    const jointCount = clampInteger(value.jointCount || rawLimits.length, 1, MAX_COLLABORATION_JOINTS);
    const jointLimits = Array.from({ length: jointCount }, (_, index) => {
        const limit = Array.isArray(rawLimits[index]) ? rawLimits[index] : [];
        const min = finiteNumber(limit[0], -360);
        const max = finiteNumber(limit[1], 360);
        return min < max ? [min, max] : [-360, 360];
    });
    return {
        robotId,
        name: normalizeDisplayName(value.name || value.displayName, robotId),
        jointCount,
        jointLimits,
        ownerUserId: null,
        ownerDisplayName: null,
        lastState: null,
        lastSequence: 0,
        serverSequence: 0
    };
}

export function normalizeRobotDescriptors(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
        .slice(0, MAX_COLLABORATION_ROBOTS)
        .map(normalizeRobotDescriptor)
        .filter((robot) => robot && !seen.has(robot.robotId) && seen.add(robot.robotId));
}

function normalizeTcpPose(value) {
    if (!isRecord(value)) return null;
    const position = Array.isArray(value.position) && value.position.length === 3
        ? value.position.map((entry) => finiteNumber(entry))
        : null;
    const rotation = Array.isArray(value.rotation) && value.rotation.length === 4
        ? value.rotation.map((entry) => finiteNumber(entry))
        : null;
    if (!position || !rotation) return null;
    return { position, rotation };
}

export function normalizeRobotState(payload, robot = null) {
    if (!isRecord(payload) || !Array.isArray(payload.jointAngles)) {
        return { ok: false, reason: 'invalid-joint-array' };
    }
    const jointCount = Number(robot?.jointCount || payload.jointAngles.length);
    if (!Number.isInteger(jointCount)
        || jointCount < 1
        || jointCount > MAX_COLLABORATION_JOINTS
        || payload.jointAngles.length !== jointCount) {
        return { ok: false, reason: 'invalid-joint-count' };
    }
    const jointLimits = Array.isArray(robot?.jointLimits) ? robot.jointLimits : [];
    const jointAngles = payload.jointAngles.map((value, index) => {
        const numeric = Number(value);
        const limit = Array.isArray(jointLimits[index]) ? jointLimits[index] : [-100000, 100000];
        if (!Number.isFinite(numeric) || numeric < Number(limit[0]) || numeric > Number(limit[1])) return NaN;
        return numeric;
    });
    if (jointAngles.some((value) => !Number.isFinite(value))) return { ok: false, reason: 'invalid-joint-value' };
    const externalAxes = Array.isArray(payload.externalAxes) && payload.externalAxes.length === 6
        ? payload.externalAxes.map((value) => finiteNumber(value))
        : [0, 0, 0, 0, 0, 0];
    return {
        ok: true,
        state: {
            jointAngles,
            externalAxes,
            tcpPose: normalizeTcpPose(payload.tcpPose),
            connected: payload.connected === true,
            streaming: payload.streaming === true,
            alarm: payload.alarm === true,
            estop: payload.estop === true,
            controllerSource: String(payload.controllerSource || 'bridge').slice(0, 24)
        }
    };
}

export function normalizeWorkspaceSnapshot(snapshot, maxBytes = MAX_COLLABORATION_SNAPSHOT_BYTES) {
    if (!isRecord(snapshot)) return { ok: false, reason: 'invalid-snapshot' };
    const clone = cloneJson(snapshot);
    if (!clone) return { ok: false, reason: 'snapshot-not-serializable' };
    // Camera, panel layout, selection and collapsed tree state are local to
    // each browser. Keep the scene and motion data but avoid overwriting the
    // guest's local view while joining a room.
    clone.camera = null;
    clone.selection = {};
    clone.viewConfiguration = { viewPresets: [] };
    clone.collapsedModelIds = [];
    let serialized;
    try {
        serialized = JSON.stringify(clone);
    } catch (_) {
        return { ok: false, reason: 'snapshot-not-serializable' };
    }
    if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
        return { ok: false, reason: 'snapshot-too-large' };
    }
    return { ok: true, snapshot: clone, byteLength: new TextEncoder().encode(serialized).byteLength };
}

export function getRobotById(robots, robotId) {
    const normalizedId = String(robotId ?? '').trim();
    return (Array.isArray(robots) ? robots : []).find((robot) => robot?.robotId === normalizedId) || null;
}

export function claimRobot(robots, userId, robotId, displayName = '') {
    const normalizedUserId = String(userId ?? '').trim();
    const robot = getRobotById(robots, robotId);
    if (!normalizedUserId || !robot) return { ok: false, reason: 'robot-not-found' };
    if (robot.ownerUserId && robot.ownerUserId !== normalizedUserId) return { ok: false, reason: 'robot-occupied' };
    const previousRobot = (Array.isArray(robots) ? robots : []).find((candidate) => (
        candidate.ownerUserId === normalizedUserId && candidate.robotId !== robot.robotId
    ));
    if (previousRobot) return { ok: false, reason: 'already-owns-robot', previousRobotId: previousRobot.robotId };
    robot.ownerUserId = normalizedUserId;
    robot.ownerDisplayName = normalizeDisplayName(displayName, normalizedUserId);
    return { ok: true, robot };
}

export function releaseRobot(robots, userId, robotId = null) {
    const normalizedUserId = String(userId ?? '').trim();
    const released = (Array.isArray(robots) ? robots : []).filter((robot) => (
        robot.ownerUserId === normalizedUserId
            && (!robotId || robot.robotId === String(robotId))
    ));
    released.forEach((robot) => {
        robot.ownerUserId = null;
        robot.ownerDisplayName = null;
    });
    return released.map((robot) => robot.robotId);
}

export function isNewerSequence(previousSequence, nextSequence) {
    const previous = Number(previousSequence) || 0;
    const next = Number(nextSequence);
    return Number.isSafeInteger(next) && next > previous && next >= 1;
}

export function isSupportedCollaborationMessage(value) {
    return isRecord(value) && COLLABORATION_MESSAGE_TYPES.has(String(value.type || ''));
}

export function createRobotStatePayload(robot, state, serverSequence = 0) {
    return {
        robotId: robot.robotId,
        sequence: Number(state.sequence) || 0,
        serverSequence: Number(serverSequence) || 0,
        payload: cloneJson(state.payload || state) || {}
    };
}
