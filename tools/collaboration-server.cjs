const http = require('http');
const crypto = require('crypto');

const HOST = process.env.INOROBOT_COLLAB_HOST || '0.0.0.0';
const PORT = Number(process.argv[2] || process.env.INOROBOT_COLLAB_PORT || 8787);
const ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const PARTICIPANT_RECONNECT_GRACE_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 35000;
const MAX_MESSAGES_PER_SECOND = 100;
const ALLOWED_ORIGINS = new Set(
    String(process.env.INOROBOT_COLLAB_ALLOWED_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
);

let collaborationCore;
const rooms = new Map();
const peers = new Set();

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function randomToken(prefix) {
    return `${prefix}-${crypto.randomBytes(24).toString('base64url')}`;
}

function isPrivateOrLoopbackHostname(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    const match = host.match(/^172\.(\d{1,3})\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (ALLOWED_ORIGINS.has('*') || ALLOWED_ORIGINS.has(origin)) return true;
    try {
        const parsed = new URL(origin);
        return ['http:', 'https:'].includes(parsed.protocol)
            && isPrivateOrLoopbackHostname(parsed.hostname);
    } catch (_) {
        return false;
    }
}

function jsonBytes(value) {
    try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); } catch (_) { return Infinity; }
}

function websocketFrame(payload, opcode = 0x1) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    const first = Buffer.from([0x80 | (opcode & 0x0f)]);
    if (body.length < 126) return Buffer.concat([first, Buffer.from([body.length]), body]);
    if (body.length <= 0xffff) {
        const header = Buffer.alloc(4);
        header[0] = 0x80 | (opcode & 0x0f);
        header[1] = 126;
        header.writeUInt16BE(body.length, 2);
        return Buffer.concat([header, body]);
    }
    const header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
    return Buffer.concat([header, body]);
}

function sendFrame(peer, payload, opcode = 0x1) {
    if (!peer || peer.closed) return Promise.resolve();
    peer.sendQueue = peer.sendQueue
        .catch(() => { })
        .then(() => new Promise((resolve, reject) => {
            if (peer.closed) return resolve();
            peer.socket.write(websocketFrame(payload, opcode), (error) => error ? reject(error) : resolve());
        }))
        .catch(() => closePeer(peer, 1011, 'send failed'));
    return peer.sendQueue;
}

function sendJson(peer, payload) {
    let serialized;
    try { serialized = JSON.stringify(payload); } catch (_) { return Promise.resolve(); }
    return sendFrame(peer, serialized);
}

function sendError(peer, code, message, requestId = null) {
    return sendJson(peer, {
        type: 'error',
        code,
        message,
        ...(requestId ? { requestId } : {})
    });
}

function closePeer(peer, code = 1000, reason = '') {
    if (!peer || peer.closed) return;
    peer.closed = true;
    peers.delete(peer);
    if (peer.handshakeTimer) clearTimeout(peer.handshakeTimer);
    try {
        if (peer.socket.writable) peer.socket.write(websocketFrame(Buffer.from(reason).subarray(0, 120), 0x8));
    } catch (_) { }
    peer.socket.removeAllListeners('data');
    peer.socket.removeAllListeners('error');
    peer.socket.removeAllListeners('close');
    try { peer.socket.end(); } catch (_) { }
    try { peer.socket.destroy(); } catch (_) { }
    handlePeerDisconnected(peer, code, reason);
}

function getParticipant(room, userId) {
    return room?.participants.get(String(userId || '')) || null;
}

function getPublicParticipants(room) {
    return [...room.participants.values()].map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
        role: participant.role,
        connected: Boolean(participant.socket && !participant.socket.closed),
        claimedRobotId: room.robots.find((robot) => robot.ownerUserId === participant.userId)?.robotId || null
    }));
}

function getPublicRobots(room, includeStates = true) {
    return room.robots.map((robot) => ({
        robotId: robot.robotId,
        name: robot.name,
        jointCount: robot.jointCount,
        jointLimits: robot.jointLimits,
        ownerUserId: robot.ownerUserId,
        ownerDisplayName: robot.ownerDisplayName,
        ...(includeStates && robot.lastState ? {
            lastState: collaborationCore.createRobotStatePayload(robot, {
                sequence: robot.lastSequence,
                payload: robot.lastState
            }, robot.serverSequence)
        } : {})
    }));
}

function createRoomSnapshotMessage(room, participant, restoreWorkspace = false) {
    return {
        type: 'roomSnapshot',
        roomCode: room.roomCode,
        roomToken: room.roomToken,
        userToken: participant.userToken,
        userId: participant.userId,
        role: participant.role,
        hostUserId: room.hostUserId,
        participants: getPublicParticipants(room),
        robots: getPublicRobots(room),
        workspaceSnapshot: room.workspaceSnapshot,
        sceneCommands: room.sceneCommands.slice(-100),
        restoreWorkspace,
        serverTime: Date.now()
    };
}

function broadcastRoom(room, payload, { exclude = null } = {}) {
    room.participants.forEach((participant) => {
        if (!participant.socket || participant.socket.closed || participant.socket === exclude) return;
        void sendJson(participant.socket, payload);
    });
}

function broadcastRoomState(room) {
    broadcastRoom(room, {
        type: 'roomState',
        roomCode: room.roomCode,
        hostUserId: room.hostUserId,
        participants: getPublicParticipants(room),
        robots: getPublicRobots(room, false),
        serverTime: Date.now()
    });
}

function touchRoom(room) {
    if (room) room.lastActivityAt = Date.now();
}

function attachParticipant(peer, room, participant) {
    if (peer.handshakeTimer) {
        clearTimeout(peer.handshakeTimer);
        peer.handshakeTimer = null;
    }
    if (participant.socket && participant.socket !== peer && !participant.socket.closed) {
        closePeer(participant.socket, 4001, 'replaced by reconnect');
    }
    peer.room = room;
    peer.participant = participant;
    participant.socket = peer;
    participant.lastSeenAt = Date.now();
    touchRoom(room);
}

function createUser(room, displayName, role) {
    const userId = randomToken('user');
    const participant = {
        userId,
        userToken: randomToken('session'),
        displayName: collaborationCore.normalizeDisplayName(displayName, role === 'host' ? 'Host' : 'Guest'),
        role,
        socket: null,
        lastSeenAt: Date.now()
    };
    room.participants.set(userId, participant);
    return participant;
}

function createUniqueRoomCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const code = collaborationCore.createRoomCode(() => crypto.randomInt(0, 0x1000000) / 0x1000000);
        if (!rooms.has(code)) return code;
    }
    return null;
}

function getRoomForPeer(peer) {
    const room = peer.room;
    const participant = peer.participant;
    if (!room || !participant || participant.socket !== peer || peer.closed) return null;
    return room;
}

function isAuthenticatedMessage(peer, message) {
    const room = getRoomForPeer(peer);
    if (!room) return false;
    if (message.roomToken && message.roomToken !== room.roomToken) return false;
    return true;
}

function createRoom(peer, message) {
    const requestId = String(message.requestId || '').slice(0, 80);
    const snapshotResult = collaborationCore.normalizeWorkspaceSnapshot(message.workspaceSnapshot);
    if (!snapshotResult.ok) return sendError(peer, snapshotResult.reason, '공유할 시뮬레이션 스냅샷을 확인할 수 없습니다.', requestId);
    const robots = collaborationCore.normalizeRobotDescriptors(message.robots);
    const roomCode = createUniqueRoomCode();
    if (!roomCode) return sendError(peer, 'room-unavailable', '새 협업 방을 만들 수 없습니다.', requestId);
    const room = {
        roomCode,
        roomToken: randomToken('room'),
        hostUserId: null,
        workspaceSnapshot: snapshotResult.snapshot,
        robots,
        participants: new Map(),
        sceneCommands: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now()
    };
    const participant = createUser(room, message.displayName, 'host');
    room.hostUserId = participant.userId;
    rooms.set(roomCode, room);
    attachParticipant(peer, room, participant);
    void sendJson(peer, {
        type: 'roomCreated',
        requestId,
        roomCode,
        roomToken: room.roomToken,
        userToken: participant.userToken,
        userId: participant.userId,
        role: participant.role
    });
    void sendJson(peer, createRoomSnapshotMessage(room, participant, false));
    console.log(`Collaboration room ${roomCode} created.`);
}

function joinRoom(peer, message, reconnect = false) {
    const requestId = String(message.requestId || '').slice(0, 80);
    const rawRoomCode = String(message.roomCode || '').trim();
    if (!collaborationCore.isValidRoomCode(rawRoomCode)) {
        return sendError(peer, 'invalid-room-code', '방 코드는 숫자로 된 4자리 코드여야 합니다.', requestId);
    }
    const roomCode = collaborationCore.normalizeRoomCode(rawRoomCode);
    const room = rooms.get(roomCode);
    if (!collaborationCore.isValidRoomCode(roomCode) || !room) {
        return sendError(peer, 'room-not-found', '방 코드를 찾을 수 없습니다.', requestId);
    }
    touchRoom(room);
    let participant = null;
    if (reconnect) {
        participant = [...room.participants.values()].find((candidate) => (
            candidate.userToken === String(message.userToken || '')
        ));
        if (!participant || participant.lastSeenAt + PARTICIPANT_RECONNECT_GRACE_MS < Date.now()) {
            return sendError(peer, 'session-expired', '협업 세션이 만료되었습니다. 방에 다시 참여해 주세요.', requestId);
        }
        if (message.roomToken !== room.roomToken) {
            return sendError(peer, 'invalid-room-token', '협업 방 인증 정보가 올바르지 않습니다.', requestId);
        }
    } else {
        if (room.participants.size >= collaborationCore.MAX_COLLABORATION_PARTICIPANTS) {
            return sendError(peer, 'room-full', '협업 방은 최대 4명까지 참여할 수 있습니다.', requestId);
        }
        participant = createUser(room, message.displayName, 'guest');
    }
    const hadActiveSocket = Boolean(participant.socket && !participant.socket.closed);
    attachParticipant(peer, room, participant);
    if (reconnect || hadActiveSocket) {
        void sendJson(peer, createRoomSnapshotMessage(room, participant, true));
        return;
    }
    void sendJson(peer, {
        type: 'roomJoined',
        requestId,
        roomCode,
        roomToken: room.roomToken,
        userToken: participant.userToken,
        userId: participant.userId,
        role: participant.role
    });
    void sendJson(peer, createRoomSnapshotMessage(room, participant, true));
    broadcastRoom(room, {
        type: 'participantJoined',
        participant: {
            userId: participant.userId,
            displayName: participant.displayName,
            role: participant.role,
            connected: true,
            claimedRobotId: null
        },
        participants: getPublicParticipants(room),
        robots: getPublicRobots(room, false),
        serverTime: Date.now()
    }, { exclude: peer });
    console.log(`Participant joined collaboration room ${roomCode}.`);
}

function requireOwnedRobot(peer, robotId) {
    const room = getRoomForPeer(peer);
    const robot = collaborationCore.getRobotById(room?.robots, robotId);
    if (!room || !robot || robot.ownerUserId !== peer.participant.userId) return { room: null, robot: null };
    return { room, robot };
}

function handleRobotClaim(peer, message) {
    const room = getRoomForPeer(peer);
    if (!room) return sendError(peer, 'not-in-room', '협업 방에 연결되어 있지 않습니다.');
    const result = collaborationCore.claimRobot(
        room.robots,
        peer.participant.userId,
        message.robotId,
        peer.participant.displayName
    );
    if (!result.ok) {
        const messages = {
            'robot-not-found': '선택한 로봇을 찾을 수 없습니다.',
            'robot-occupied': '다른 사용자가 제어 중인 로봇입니다.',
            'already-owns-robot': '한 사용자는 한 대의 로봇만 점유할 수 있습니다.'
        };
        return sendError(peer, result.reason, messages[result.reason] || '로봇 제어권을 얻을 수 없습니다.', message.requestId);
    }
    touchRoom(room);
    broadcastRoom(room, {
        type: 'robotAssignment',
        robotId: result.robot.robotId,
        ownerUserId: result.robot.ownerUserId,
        ownerDisplayName: result.robot.ownerDisplayName,
        participants: getPublicParticipants(room),
        robots: getPublicRobots(room, false),
        serverTime: Date.now()
    });
}

function handleRobotRelease(peer, message) {
    const room = getRoomForPeer(peer);
    if (!room) return sendError(peer, 'not-in-room', '협업 방에 연결되어 있지 않습니다.');
    const released = collaborationCore.releaseRobot(room.robots, peer.participant.userId, message.robotId || null);
    if (!released.length) return;
    touchRoom(room);
    broadcastRoom(room, {
        type: 'robotAssignment',
        releasedRobotIds: released,
        participants: getPublicParticipants(room),
        robots: getPublicRobots(room, false),
        serverTime: Date.now()
    });
}

function handleRobotState(peer, message) {
    const { room, robot } = requireOwnedRobot(peer, message.robotId);
    if (!room || !robot) return sendError(peer, 'robot-not-owned', '점유하지 않은 로봇의 상태는 전송할 수 없습니다.', message.requestId);
    const sequence = Number(message.sequence);
    if (!collaborationCore.isNewerSequence(robot.lastSequence, sequence)) {
        return sendError(peer, 'stale-state', '오래된 로봇 상태는 적용하지 않습니다.', message.requestId);
    }
    const normalized = collaborationCore.normalizeRobotState(message.payload, robot);
    if (!normalized.ok) return sendError(peer, normalized.reason, '로봇 상태 형식이 올바르지 않습니다.', message.requestId);
    robot.lastSequence = sequence;
    robot.lastState = normalized.state;
    robot.serverSequence += 1;
    touchRoom(room);
    broadcastRoom(room, {
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

function handleRobotCommand(peer, message) {
    const { room, robot } = requireOwnedRobot(peer, message.robotId);
    if (!room || !robot) return sendError(peer, 'robot-not-owned', '점유하지 않은 로봇에는 명령을 보낼 수 없습니다.', message.requestId);
    const command = String(message.command || '').toLowerCase();
    if (!['stop', 'reset'].includes(command)) return sendError(peer, 'unsupported-command', '지원하지 않는 로봇 명령입니다.', message.requestId);
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
    touchRoom(room);
    broadcastRoom(room, {
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

function handleSceneCommand(peer, message) {
    const room = getRoomForPeer(peer);
    if (!room) return sendError(peer, 'not-in-room', '협업 방에 연결되어 있지 않습니다.');
    if (peer.participant.userId !== room.hostUserId) return sendError(peer, 'host-only', '공유 장면 변경은 호스트만 요청할 수 있습니다.', message.requestId);
    if (!isRecord(message.command) || jsonBytes(message.command) > 32 * 1024) {
        return sendError(peer, 'invalid-scene-command', '장면 변경 명령이 올바르지 않습니다.', message.requestId);
    }
    const kind = String(message.command.kind || '');
    if (!['transform', 'visibility', 'delete', 'add'].includes(kind)) {
        return sendError(peer, 'unsupported-scene-command', '지원하지 않는 장면 변경입니다.', message.requestId);
    }
    touchRoom(room);
    room.sceneCommands.push({ command: message.command, userId: peer.participant.userId });
    if (room.sceneCommands.length > 100) room.sceneCommands.splice(0, room.sceneCommands.length - 100);
    broadcastRoom(room, {
        type: 'sceneCommandApplied',
        command: message.command,
        userId: peer.participant.userId,
        serverTime: Date.now()
    });
}

function removeParticipant(peer, code = 1000, reason = 'participant left') {
    const room = getRoomForPeer(peer);
    const participant = peer.participant;
    if (!room || !participant) return closePeer(peer, code, reason);
    const releasedRobotIds = collaborationCore.releaseRobot(room.robots, participant.userId);
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
    touchRoom(room);
    broadcastRoom(room, {
        type: 'participantLeft',
        userId: participant.userId,
        displayName: participant.displayName,
        connected: false,
        releasedRobotIds,
        participants: getPublicParticipants(room),
        robots: getPublicRobots(room, false),
        code,
        reason,
        serverTime: Date.now()
    });
    closePeer(peer, code, reason);
}

function handleMessage(peer, message) {
    if (!collaborationCore.isSupportedCollaborationMessage(message)) {
        return sendError(peer, 'invalid-message', '지원하지 않는 협업 메시지입니다.');
    }
    const type = String(message.type);
    if (type === 'createRoom') return peer.room ? sendError(peer, 'already-in-room', '이미 협업 방에 연결되어 있습니다.') : createRoom(peer, message);
    if (type === 'joinRoom') return peer.room ? sendError(peer, 'already-in-room', '이미 협업 방에 연결되어 있습니다.') : joinRoom(peer, message, false);
    if (type === 'reconnectRoom') return peer.room ? sendError(peer, 'already-in-room', '이미 협업 방에 연결되어 있습니다.') : joinRoom(peer, message, true);
    if (!isAuthenticatedMessage(peer, message)) return sendError(peer, 'not-in-room', '협업 방 인증이 필요합니다.');
    const room = peer.room;
    if (type === 'leaveRoom') return removeParticipant(peer);
    if (type === 'robotClaim') return handleRobotClaim(peer, message);
    if (type === 'robotRelease') return handleRobotRelease(peer, message);
    if (type === 'robotState') return handleRobotState(peer, message);
    if (type === 'robotCommand') return handleRobotCommand(peer, message);
    if (type === 'sceneCommand') return handleSceneCommand(peer, message);
    if (type === 'resyncRequest') {
        touchRoom(room);
        return sendJson(peer, createRoomSnapshotMessage(room, peer.participant, true));
    }
    if (type === 'heartbeat') {
        peer.lastHeartbeatAt = Date.now();
        touchRoom(room);
        return sendJson(peer, { type: 'heartbeatAck', serverTime: Date.now() });
    }
    if (type === 'heartbeatAck') {
        peer.lastHeartbeatAt = Date.now();
        touchRoom(room);
        return;
    }
}

function handlePeerDisconnected(peer, code, reason) {
    const room = peer.room;
    const participant = peer.participant;
    if (!room || !participant || participant.socket !== peer) return;
    participant.socket = null;
    participant.lastSeenAt = Date.now();
    touchRoom(room);
    broadcastRoom(room, {
        type: 'participantLeft',
        userId: participant.userId,
        displayName: participant.displayName,
        connected: false,
        releasedRobotIds: [],
        participants: getPublicParticipants(room),
        robots: getPublicRobots(room, false),
        code,
        reason,
        serverTime: Date.now()
    });
    console.log(`Participant disconnected from collaboration room ${room.roomCode} (code ${code}, ${reason || 'no reason'}).`);
}

function consumeFrames(peer) {
    while (!peer.closed && peer.buffer.length >= 2) {
        const first = peer.buffer[0];
        const second = peer.buffer[1];
        const opcode = first & 0x0f;
        const masked = (second & 0x80) !== 0;
        if (!masked) return closePeer(peer, 1002, 'client frame must be masked');
        let length = second & 0x7f;
        let offset = 2;
        if (length === 126) {
            if (peer.buffer.length < 4) return;
            length = peer.buffer.readUInt16BE(2);
            offset = 4;
        } else if (length === 127) {
            if (peer.buffer.length < 10) return;
            const longLength = peer.buffer.readBigUInt64BE(2);
            if (longLength > BigInt(collaborationCore.MAX_COLLABORATION_MESSAGE_BYTES)) {
                return closePeer(peer, 1009, 'message too large');
            }
            length = Number(longLength);
            offset = 10;
        }
        if (length > collaborationCore.MAX_COLLABORATION_MESSAGE_BYTES) return closePeer(peer, 1009, 'message too large');
        const total = offset + 4 + length;
        if (peer.buffer.length < total) return;
        const mask = peer.buffer.subarray(offset, offset + 4);
        const payload = Buffer.from(peer.buffer.subarray(offset + 4, total));
        peer.buffer = peer.buffer.subarray(total);
        for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
        if (opcode === 0x8) return closePeer(peer, 1000, 'client closed');
        if (opcode === 0x9) {
            void sendFrame(peer, payload, 0xA);
            continue;
        }
        if (opcode === 0xA) continue;
        if (opcode !== 0x1) return closePeer(peer, 1003, 'text frames only');
        const now = Date.now();
        if (now - peer.rateWindow.start >= 1000) peer.rateWindow = { start: now, count: 0 };
        peer.rateWindow.count += 1;
        if (peer.rateWindow.count > MAX_MESSAGES_PER_SECOND) return closePeer(peer, 1008, 'rate limit');
        let parsed;
        try { parsed = JSON.parse(payload.toString('utf8')); } catch (_) {
            return closePeer(peer, 1007, 'invalid json');
        }
        handleMessage(peer, parsed);
    }
}

function acceptWebSocket(request, socket, head) {
    if (request.url !== collaborationCore.COLLABORATION_WS_PATH
        && request.url !== `${collaborationCore.COLLABORATION_WS_PATH}/`) return socket.destroy();
    if (!isAllowedOrigin(request.headers.origin)) return socket.destroy();
    const key = request.headers['sec-websocket-key'];
    if (!key) return socket.destroy();
    const accept = crypto.createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
    socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n'
    ].join('\r\n'));
    socket.setNoDelay(true);
    const peer = {
        socket,
        room: null,
        participant: null,
        closed: false,
        buffer: Buffer.alloc(0),
        sendQueue: Promise.resolve(),
        rateWindow: { start: Date.now(), count: 0 },
        lastHeartbeatAt: Date.now(),
        handshakeTimer: setTimeout(() => closePeer(peer, 1008, 'handshake timeout'), 10000)
    };
    peers.add(peer);
    socket.on('data', (chunk) => {
        if (peer.closed) return;
        if (peer.buffer.length + chunk.length > collaborationCore.MAX_COLLABORATION_MESSAGE_BYTES + 64 * 1024) {
            return closePeer(peer, 1009, 'message too large');
        }
        peer.buffer = Buffer.concat([peer.buffer, chunk]);
        consumeFrames(peer);
    });
    socket.on('error', () => closePeer(peer, 1001, 'socket error'));
    socket.on('close', () => closePeer(peer, 1000, 'socket closed'));
    if (head?.length) {
        peer.buffer = Buffer.from(head);
        consumeFrames(peer);
    }
}

function cleanupRooms() {
    const now = Date.now();
    rooms.forEach((room, roomCode) => {
        const expiredParticipants = [...room.participants.values()].filter((participant) => (
            !participant.socket
            && participant.lastSeenAt + PARTICIPANT_RECONNECT_GRACE_MS < now
        ));
        expiredParticipants.forEach((participant) => {
            const releasedRobotIds = collaborationCore.releaseRobot(room.robots, participant.userId);
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
            if (releasedRobotIds.length) {
                broadcastRoom(room, {
                    type: 'robotAssignment',
                    releasedRobotIds,
                    participants: getPublicParticipants(room),
                    robots: getPublicRobots(room, false),
                    serverTime: Date.now()
                });
            }
        });
        const hasConnectedParticipant = [...room.participants.values()].some((participant) => participant.socket && !participant.socket.closed);
        const allParticipantsExpired = [...room.participants.values()].every((participant) => (
            participant.lastSeenAt + PARTICIPANT_RECONNECT_GRACE_MS < now
        ));
        if (!hasConnectedParticipant && (room.lastActivityAt + ROOM_IDLE_TIMEOUT_MS < now || allParticipantsExpired)) {
            rooms.delete(roomCode);
            console.log(`Collaboration room ${roomCode} expired.`);
        }
    });
}

async function main() {
    collaborationCore = await import('../2_3DSimulation/collaboration-core.mjs');
    const server = http.createServer((request, response) => {
        if (request.url === '/health' || request.url === '/api/health') {
            response.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff'
            });
            response.end(JSON.stringify({
                service: 'InoRobot Collaboration Server',
                protocol: collaborationCore.COLLABORATION_PROTOCOL,
                rooms: rooms.size,
                connectedPeers: [...peers].filter((peer) => !peer.closed).length,
                maxParticipants: collaborationCore.MAX_COLLABORATION_PARTICIPANTS
            }));
            return;
        }
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    });
    server.on('upgrade', acceptWebSocket);
    server.on('error', (error) => {
        console.error(error.code === 'EADDRINUSE'
            ? `Port ${PORT} is already in use.`
            : error.message);
        process.exitCode = 1;
    });
    setInterval(() => {
        const now = Date.now();
        peers.forEach((peer) => {
            if (peer.closed) return;
            if (now - peer.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) return closePeer(peer, 1001, 'heartbeat timeout');
            void sendJson(peer, { type: 'heartbeat', serverTime: now });
        });
        cleanupRooms();
    }, HEARTBEAT_INTERVAL_MS).unref();
    server.listen(PORT, HOST, () => {
        console.log(`InoRobot Collaboration Server is running on ${HOST}:${PORT}.`);
        console.log(`WebSocket: ws://<server-host>:${PORT}${collaborationCore.COLLABORATION_WS_PATH}`);
        console.log('Rooms are stored in memory and expire after inactivity.');
    });
}

main().catch((error) => {
    console.error('Unable to start collaboration server:', error);
    process.exitCode = 1;
});
