import {
    COLLABORATION_PROTOCOL,
    COLLABORATION_WS_PATH,
    MAX_COLLABORATION_MESSAGE_BYTES,
    MAX_COLLABORATION_PARTICIPANTS,
    createRobotStatePayload,
    createRoomCode,
    getRobotById,
    isNewerSequence,
    isSupportedCollaborationMessage,
    isValidRoomCode,
    normalizeDisplayName,
    normalizeRobotDescriptors,
    normalizeRobotState,
    normalizeRoomCode,
    normalizeWorkspaceSnapshot,
    claimRobot,
    releaseRobot
} from '../../2_3DSimulation/collaboration-core.mjs';

const ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const PARTICIPANT_RECONNECT_GRACE_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 10 * 1000;
const HEARTBEAT_TIMEOUT_MS = 35 * 1000;
const MAX_MESSAGES_PER_SECOND = 100;

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function randomToken(prefix) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return `${prefix}-${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

function createRandomSample() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] / 0x100000000;
}

function jsonBytes(value) {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch (_) {
        return Infinity;
    }
}

function safeCloseReason(reason) {
    return String(reason || '').slice(0, 120);
}

function isPrivateOrLoopbackHostname(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    const match = host.match(/^172\.(\d{1,3})\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function isAllowedOrigin(origin, env) {
    if (!origin) return true;
    const allowedOrigins = new Set(
        String(env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((value) => value.trim().replace(/\/$/, ''))
            .filter(Boolean)
    );
    if (allowedOrigins.has('*') || allowedOrigins.has(origin.replace(/\/$/, ''))) return true;
    try {
        const parsed = new URL(origin);
        return ['http:', 'https:'].includes(parsed.protocol)
            && isPrivateOrLoopbackHostname(parsed.hostname);
    } catch (_) {
        return false;
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health' || url.pathname === '/api/health') {
            const id = env.COLLABORATION_HUB.idFromName('global');
            return env.COLLABORATION_HUB.get(id).fetch(request);
        }
        if (url.pathname !== COLLABORATION_WS_PATH && url.pathname !== `${COLLABORATION_WS_PATH}/`) {
            return json({ ok: false, message: 'Not found.' }, 404);
        }
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
            return json({ ok: false, message: 'WebSocket upgrade required.' }, 426);
        }
        if (!isAllowedOrigin(request.headers.get('Origin'), env)) {
            return new Response('Forbidden', { status: 403 });
        }
        const id = env.COLLABORATION_HUB.idFromName('global');
        return env.COLLABORATION_HUB.get(id).fetch(request);
    }
};

export class CollaborationHub {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.rooms = new Map();
        this.peers = new Set();
        this.cleanupTimer = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
    }

    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/health' || url.pathname === '/api/health') {
            return json({
                service: 'InoRobot Collaboration Server',
                protocol: COLLABORATION_PROTOCOL,
                rooms: this.rooms.size,
                connectedPeers: [...this.peers].filter((peer) => !peer.closed).length,
                maxParticipants: MAX_COLLABORATION_PARTICIPANTS
            });
        }
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
            return json({ ok: false, message: 'WebSocket upgrade required.' }, 426);
        }

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();

        const peer = {
            socket: server,
            room: null,
            participant: null,
            closed: false,
            lastHeartbeatAt: Date.now(),
            rateWindow: { start: Date.now(), count: 0 }
        };
        this.peers.add(peer);
        server.addEventListener('message', (event) => this.handleRawMessage(peer, event.data));
        server.addEventListener('close', (event) => {
            this.closePeer(peer, event.code || 1000, event.reason || 'socket closed');
        });
        server.addEventListener('error', () => {
            this.closePeer(peer, 1001, 'socket error');
        });

        return new Response(null, { status: 101, webSocket: client });
    }

    tick() {
        const now = Date.now();
        [...this.peers].forEach((peer) => {
            if (peer.closed) return;
            if (now - peer.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
                this.closePeer(peer, 1001, 'heartbeat timeout');
                return;
            }
            this.sendJson(peer, { type: 'heartbeat', serverTime: now });
        });
        this.cleanupRooms(now);
    }

    sendJson(peer, payload) {
        if (!peer || peer.closed) return;
        let serialized;
        try {
            serialized = JSON.stringify(payload);
            if (new TextEncoder().encode(serialized).byteLength > MAX_COLLABORATION_MESSAGE_BYTES) {
                this.closePeer(peer, 1009, 'message too large');
                return;
            }
            peer.socket.send(serialized);
        } catch (_) {
            this.closePeer(peer, 1011, 'send failed');
        }
    }

    sendError(peer, code, message, requestId = null) {
        this.sendJson(peer, {
            type: 'error',
            code,
            message,
            ...(requestId ? { requestId } : {})
        });
    }

    closePeer(peer, code = 1000, reason = '') {
        if (!peer || peer.closed) return;
        peer.closed = true;
        this.peers.delete(peer);
        this.handlePeerDisconnected(peer, code, reason);
        try { peer.socket.close(code, safeCloseReason(reason)); } catch (_) { }
    }

    getParticipant(room, userId) {
        return room?.participants.get(String(userId || '')) || null;
    }

    getPublicParticipants(room) {
        return [...room.participants.values()].map((participant) => ({
            userId: participant.userId,
            displayName: participant.displayName,
            role: participant.role,
            connected: Boolean(participant.socket && !participant.socket.closed),
            claimedRobotId: room.robots.find((robot) => robot.ownerUserId === participant.userId)?.robotId || null
        }));
    }

    getPublicRobots(room, includeStates = true) {
        return room.robots.map((robot) => ({
            robotId: robot.robotId,
            name: robot.name,
            jointCount: robot.jointCount,
            jointLimits: robot.jointLimits,
            ownerUserId: robot.ownerUserId,
            ownerDisplayName: robot.ownerDisplayName,
            ...(includeStates && robot.lastState ? {
                lastState: createRobotStatePayload(robot, {
                    sequence: robot.lastSequence,
                    payload: robot.lastState
                }, robot.serverSequence)
            } : {})
        }));
    }

    createRoomSnapshotMessage(room, participant, restoreWorkspace = false) {
        return {
            type: 'roomSnapshot',
            roomCode: room.roomCode,
            roomToken: room.roomToken,
            userToken: participant.userToken,
            userId: participant.userId,
            role: participant.role,
            hostUserId: room.hostUserId,
            participants: this.getPublicParticipants(room),
            robots: this.getPublicRobots(room),
            workspaceSnapshot: room.workspaceSnapshot,
            sceneCommands: room.sceneCommands.slice(-100),
            restoreWorkspace,
            serverTime: Date.now()
        };
    }

    broadcastRoom(room, payload, { exclude = null } = {}) {
        room.participants.forEach((participant) => {
            if (!participant.socket || participant.socket.closed || participant.socket === exclude) return;
            this.sendJson(participant.socket, payload);
        });
    }

    touchRoom(room) {
        if (room) room.lastActivityAt = Date.now();
    }

    attachParticipant(peer, room, participant) {
        if (participant.socket && participant.socket !== peer && !participant.socket.closed) {
            this.closePeer(participant.socket, 4001, 'replaced by reconnect');
        }
        peer.room = room;
        peer.participant = participant;
        participant.socket = peer;
        participant.lastSeenAt = Date.now();
        this.touchRoom(room);
    }

    createUser(room, displayName, role) {
        const participant = {
            userId: randomToken('user'),
            userToken: randomToken('session'),
            displayName: normalizeDisplayName(displayName, role === 'host' ? 'Host' : 'Guest'),
            role,
            socket: null,
            lastSeenAt: Date.now()
        };
        room.participants.set(participant.userId, participant);
        return participant;
    }

    createUniqueRoomCode() {
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const code = createRoomCode(createRandomSample);
            if (!this.rooms.has(code)) return code;
        }
        return null;
    }

    getRoomForPeer(peer) {
        const room = peer.room;
        const participant = peer.participant;
        if (!room || !participant || participant.socket !== peer || peer.closed) return null;
        return room;
    }

    isAuthenticatedMessage(peer, message) {
        const room = this.getRoomForPeer(peer);
        if (!room) return false;
        return !message.roomToken || message.roomToken === room.roomToken;
    }

    createRoom(peer, message) {
        const requestId = String(message.requestId || '').slice(0, 80);
        const snapshotResult = normalizeWorkspaceSnapshot(message.workspaceSnapshot);
        if (!snapshotResult.ok) {
            this.sendError(peer, snapshotResult.reason, '공유할 시뮬레이션 스냅샷을 확인할 수 없습니다.', requestId);
            return;
        }
        const roomCode = this.createUniqueRoomCode();
        if (!roomCode) {
            this.sendError(peer, 'room-unavailable', '새 협업 방을 만들 수 없습니다.', requestId);
            return;
        }
        const room = {
            roomCode,
            roomToken: randomToken('room'),
            hostUserId: null,
            workspaceSnapshot: snapshotResult.snapshot,
            robots: normalizeRobotDescriptors(message.robots),
            participants: new Map(),
            sceneCommands: [],
            createdAt: Date.now(),
            lastActivityAt: Date.now()
        };
        const participant = this.createUser(room, message.displayName, 'host');
        room.hostUserId = participant.userId;
        this.rooms.set(roomCode, room);
        this.attachParticipant(peer, room, participant);
        this.sendJson(peer, {
            type: 'roomCreated',
            requestId,
            roomCode,
            roomToken: room.roomToken,
            userToken: participant.userToken,
            userId: participant.userId,
            role: participant.role
        });
        this.sendJson(peer, this.createRoomSnapshotMessage(room, participant, false));
    }

    joinRoom(peer, message, reconnect = false) {
        const requestId = String(message.requestId || '').slice(0, 80);
        const rawRoomCode = String(message.roomCode || '').trim();
        if (!isValidRoomCode(rawRoomCode)) {
            this.sendError(peer, 'invalid-room-code', '방 코드는 숫자로 된 4자리 코드여야 합니다.', requestId);
            return;
        }
        const roomCode = normalizeRoomCode(rawRoomCode);
        const room = this.rooms.get(roomCode);
        if (!room) {
            this.sendError(peer, 'room-not-found', '방 코드를 찾을 수 없습니다.', requestId);
            return;
        }
        this.touchRoom(room);
        let participant = null;
        if (reconnect) {
            participant = [...room.participants.values()].find((candidate) => (
                candidate.userToken === String(message.userToken || '')
            ));
            if (!participant || participant.lastSeenAt + PARTICIPANT_RECONNECT_GRACE_MS < Date.now()) {
                this.sendError(peer, 'session-expired', '협업 세션이 만료되었습니다. 방에 다시 참여해 주세요.', requestId);
                return;
            }
            if (message.roomToken !== room.roomToken) {
                this.sendError(peer, 'invalid-room-token', '협업 방 인증 정보가 올바르지 않습니다.', requestId);
                return;
            }
        } else {
            if (room.participants.size >= MAX_COLLABORATION_PARTICIPANTS) {
                this.sendError(peer, 'room-full', '협업 방은 최대 2명까지 참여할 수 있습니다.', requestId);
                return;
            }
            participant = this.createUser(room, message.displayName, 'guest');
        }
        const hadActiveSocket = Boolean(participant.socket && !participant.socket.closed);
        this.attachParticipant(peer, room, participant);
        if (reconnect || hadActiveSocket) {
            this.sendJson(peer, this.createRoomSnapshotMessage(room, participant, true));
            return;
        }
        this.sendJson(peer, {
            type: 'roomJoined',
            requestId,
            roomCode,
            roomToken: room.roomToken,
            userToken: participant.userToken,
            userId: participant.userId,
            role: participant.role
        });
        this.sendJson(peer, this.createRoomSnapshotMessage(room, participant, true));
        this.broadcastRoom(room, {
            type: 'participantJoined',
            participant: {
                userId: participant.userId,
                displayName: participant.displayName,
                role: participant.role,
                connected: true,
                claimedRobotId: null
            },
            participants: this.getPublicParticipants(room),
            robots: this.getPublicRobots(room, false),
            serverTime: Date.now()
        }, { exclude: peer });
    }

    requireOwnedRobot(peer, robotId) {
        const room = this.getRoomForPeer(peer);
        const robot = getRobotById(room?.robots, robotId);
        if (!room || !robot || robot.ownerUserId !== peer.participant.userId) {
            return { room: null, robot: null };
        }
        return { room, robot };
    }

    handleRobotClaim(peer, message) {
        const room = this.getRoomForPeer(peer);
        if (!room) return this.sendError(peer, 'not-in-room', '협업 방에 연결되어 있지 않습니다.');
        const result = claimRobot(room.robots, peer.participant.userId, message.robotId, peer.participant.displayName);
        if (!result.ok) {
            const messages = {
                'robot-not-found': '선택한 로봇을 찾을 수 없습니다.',
                'robot-occupied': '다른 사용자가 제어 중인 로봇입니다.',
                'already-owns-robot': '한 사용자는 한 대의 로봇만 점유할 수 있습니다.'
            };
            this.sendError(peer, result.reason, messages[result.reason] || '로봇 제어권을 얻을 수 없습니다.', message.requestId);
            return;
        }
        this.touchRoom(room);
        this.broadcastRoom(room, {
            type: 'robotAssignment',
            robotId: result.robot.robotId,
            ownerUserId: result.robot.ownerUserId,
            ownerDisplayName: result.robot.ownerDisplayName,
            participants: this.getPublicParticipants(room),
            robots: this.getPublicRobots(room, false),
            serverTime: Date.now()
        });
    }

    handleRobotRelease(peer, message) {
        const room = this.getRoomForPeer(peer);
        if (!room) return this.sendError(peer, 'not-in-room', '협업 방에 연결되어 있지 않습니다.');
        const released = releaseRobot(room.robots, peer.participant.userId, message.robotId || null);
        if (!released.length) return;
        this.touchRoom(room);
        this.broadcastRoom(room, {
            type: 'robotAssignment',
            releasedRobotIds: released,
            participants: this.getPublicParticipants(room),
            robots: this.getPublicRobots(room, false),
            serverTime: Date.now()
        });
    }

    handleRobotState(peer, message) {
        const { room, robot } = this.requireOwnedRobot(peer, message.robotId);
        if (!room || !robot) {
            this.sendError(peer, 'robot-not-owned', '점유하지 않은 로봇의 상태는 전송할 수 없습니다.', message.requestId);
            return;
        }
        const sequence = Number(message.sequence);
        if (!isNewerSequence(robot.lastSequence, sequence)) {
            this.sendError(peer, 'stale-state', '오래된 로봇 상태는 적용하지 않습니다.', message.requestId);
            return;
        }
        const normalized = normalizeRobotState(message.payload, robot);
        if (!normalized.ok) {
            this.sendError(peer, normalized.reason, '로봇 상태 형식이 올바르지 않습니다.', message.requestId);
            return;
        }
        robot.lastSequence = sequence;
        robot.lastState = normalized.state;
        robot.serverSequence += 1;
        this.touchRoom(room);
        this.broadcastRoom(room, {
            type: 'robotStateBroadcast',
            roomCode: room.roomCode,
            robotId: robot.robotId,
            userId: peer.participant.userId,
            sequence,
            serverSequence: robot.serverSequence,
            payload: normalized.state,
            serverTime: Date.now()
        });
    }

    handleRobotCommand(peer, message) {
        const { room, robot } = this.requireOwnedRobot(peer, message.robotId);
        if (!room || !robot) {
            this.sendError(peer, 'robot-not-owned', '점유하지 않은 로봇에는 명령을 보낼 수 없습니다.', message.requestId);
            return;
        }
        const command = String(message.command || '').toLowerCase();
        if (!['stop', 'reset'].includes(command)) {
            this.sendError(peer, 'unsupported-command', '지원하지 않는 로봇 명령입니다.', message.requestId);
            return;
        }
        if (command === 'reset') {
            robot.serverSequence += 1;
            robot.lastState = {
                jointAngles: Array.from({ length: robot.jointCount }, () => 0),
                tcpPose: null,
                connected: false,
                streaming: false,
                alarm: false,
                estop: false,
                controllerSource: 'collaboration'
            };
        } else if (robot.lastState) {
            robot.lastState = { ...robot.lastState, connected: false, streaming: false };
            robot.serverSequence += 1;
        }
        this.touchRoom(room);
        this.broadcastRoom(room, {
            type: 'robotCommandApplied',
            robotId: robot.robotId,
            command,
            userId: peer.participant.userId,
            sequence: robot.lastSequence,
            serverSequence: robot.serverSequence,
            payload: robot.lastState,
            serverTime: Date.now()
        });
    }

    handleSceneCommand(peer, message) {
        const room = this.getRoomForPeer(peer);
        if (!room) return this.sendError(peer, 'not-in-room', '협업 방에 연결되어 있지 않습니다.');
        if (peer.participant.userId !== room.hostUserId) {
            return this.sendError(peer, 'host-only', '공유 장면 변경은 호스트만 요청할 수 있습니다.', message.requestId);
        }
        if (!isRecord(message.command) || jsonBytes(message.command) > 32 * 1024) {
            return this.sendError(peer, 'invalid-scene-command', '장면 변경 명령이 올바르지 않습니다.', message.requestId);
        }
        const kind = String(message.command.kind || '');
        if (!['transform', 'visibility', 'delete', 'add'].includes(kind)) {
            return this.sendError(peer, 'unsupported-scene-command', '지원하지 않는 장면 변경입니다.', message.requestId);
        }
        this.touchRoom(room);
        room.sceneCommands.push({ command: message.command, userId: peer.participant.userId });
        if (room.sceneCommands.length > 100) room.sceneCommands.splice(0, room.sceneCommands.length - 100);
        this.broadcastRoom(room, {
            type: 'sceneCommandApplied',
            command: message.command,
            userId: peer.participant.userId,
            serverTime: Date.now()
        });
    }

    removeParticipant(peer, code = 1000, reason = 'participant left') {
        const room = this.getRoomForPeer(peer);
        const participant = peer.participant;
        if (!room || !participant) return this.closePeer(peer, code, reason);
        const releasedRobotIds = releaseRobot(room.robots, participant.userId);
        room.participants.delete(participant.userId);
        if (room.hostUserId === participant.userId) {
            const replacement = [...room.participants.values()].find((candidate) => candidate.role === 'guest');
            if (replacement) {
                replacement.role = 'host';
                room.hostUserId = replacement.userId;
            } else {
                room.hostUserId = null;
            }
        }
        peer.room = null;
        peer.participant = null;
        this.touchRoom(room);
        this.broadcastRoom(room, {
            type: 'participantLeft',
            userId: participant.userId,
            displayName: participant.displayName,
            connected: false,
            releasedRobotIds,
            participants: this.getPublicParticipants(room),
            robots: this.getPublicRobots(room, false),
            code,
            reason,
            serverTime: Date.now()
        });
        this.closePeer(peer, code, reason);
    }

    handleMessage(peer, message) {
        if (!isSupportedCollaborationMessage(message)) {
            this.sendError(peer, 'invalid-message', '지원하지 않는 협업 메시지입니다.');
            return;
        }
        const type = String(message.type);
        if (type === 'createRoom') {
            if (peer.room) this.sendError(peer, 'already-in-room', '이미 협업 방에 연결되어 있습니다.');
            else this.createRoom(peer, message);
            return;
        }
        if (type === 'joinRoom') {
            if (peer.room) this.sendError(peer, 'already-in-room', '이미 협업 방에 연결되어 있습니다.');
            else this.joinRoom(peer, message, false);
            return;
        }
        if (type === 'reconnectRoom') {
            if (peer.room) this.sendError(peer, 'already-in-room', '이미 협업 방에 연결되어 있습니다.');
            else this.joinRoom(peer, message, true);
            return;
        }
        if (!this.isAuthenticatedMessage(peer, message)) {
            this.sendError(peer, 'not-in-room', '협업 방 인증이 필요합니다.');
            return;
        }
        const room = peer.room;
        if (type === 'leaveRoom') return this.removeParticipant(peer);
        if (type === 'robotClaim') return this.handleRobotClaim(peer, message);
        if (type === 'robotRelease') return this.handleRobotRelease(peer, message);
        if (type === 'robotState') return this.handleRobotState(peer, message);
        if (type === 'robotCommand') return this.handleRobotCommand(peer, message);
        if (type === 'sceneCommand') return this.handleSceneCommand(peer, message);
        if (type === 'resyncRequest') {
            this.touchRoom(room);
            this.sendJson(peer, this.createRoomSnapshotMessage(room, peer.participant, true));
            return;
        }
        if (type === 'heartbeat') {
            peer.lastHeartbeatAt = Date.now();
            this.touchRoom(room);
            this.sendJson(peer, { type: 'heartbeatAck', serverTime: Date.now() });
            return;
        }
        if (type === 'heartbeatAck') {
            peer.lastHeartbeatAt = Date.now();
            this.touchRoom(room);
        }
    }

    handleRawMessage(peer, raw) {
        if (peer.closed || typeof raw !== 'string') {
            this.closePeer(peer, 1003, 'text frames only');
            return;
        }
        if (new TextEncoder().encode(raw).byteLength > MAX_COLLABORATION_MESSAGE_BYTES) {
            this.closePeer(peer, 1009, 'message too large');
            return;
        }
        const now = Date.now();
        if (now - peer.rateWindow.start >= 1000) peer.rateWindow = { start: now, count: 0 };
        peer.rateWindow.count += 1;
        if (peer.rateWindow.count > MAX_MESSAGES_PER_SECOND) {
            this.closePeer(peer, 1008, 'rate limit');
            return;
        }
        let message;
        try { message = JSON.parse(raw); } catch (_) {
            this.closePeer(peer, 1007, 'invalid json');
            return;
        }
        this.handleMessage(peer, message);
    }

    handlePeerDisconnected(peer, code, reason) {
        const room = peer.room;
        const participant = peer.participant;
        if (!room || !participant || participant.socket !== peer) return;
        participant.socket = null;
        participant.lastSeenAt = Date.now();
        this.touchRoom(room);
        this.broadcastRoom(room, {
            type: 'participantLeft',
            userId: participant.userId,
            displayName: participant.displayName,
            connected: false,
            releasedRobotIds: [],
            participants: this.getPublicParticipants(room),
            robots: this.getPublicRobots(room, false),
            code,
            reason,
            serverTime: Date.now()
        });
    }

    cleanupRooms(now) {
        this.rooms.forEach((room, roomCode) => {
            const expiredParticipants = [...room.participants.values()].filter((participant) => (
                !participant.socket && participant.lastSeenAt + PARTICIPANT_RECONNECT_GRACE_MS < now
            ));
            expiredParticipants.forEach((participant) => {
                const releasedRobotIds = releaseRobot(room.robots, participant.userId);
                room.participants.delete(participant.userId);
                if (room.hostUserId === participant.userId) {
                    const replacement = [...room.participants.values()].find((candidate) => candidate.role === 'guest');
                    room.hostUserId = replacement?.userId || null;
                    if (replacement) replacement.role = 'host';
                }
                if (releasedRobotIds.length) {
                    this.broadcastRoom(room, {
                        type: 'robotAssignment',
                        releasedRobotIds,
                        participants: this.getPublicParticipants(room),
                        robots: this.getPublicRobots(room, false),
                        serverTime: Date.now()
                    });
                }
            });
            const hasConnectedParticipant = [...room.participants.values()].some((participant) => (
                participant.socket && !participant.socket.closed
            ));
            const allParticipantsExpired = [...room.participants.values()].every((participant) => (
                participant.lastSeenAt + PARTICIPANT_RECONNECT_GRACE_MS < now
            ));
            if (!hasConnectedParticipant && (room.lastActivityAt + ROOM_IDLE_TIMEOUT_MS < now || allParticipantsExpired)) {
                this.rooms.delete(roomCode);
            }
        });
    }
}
