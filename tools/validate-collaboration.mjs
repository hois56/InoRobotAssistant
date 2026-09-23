import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    COLLABORATION_PROTOCOL,
    COLLABORATION_WS_PATH,
    MAX_COLLABORATION_PARTICIPANTS,
    MAX_COLLABORATION_JOINTS,
    ROOM_CODE_ALPHABET,
    ROOM_CODE_LENGTH,
    claimRobot,
    createRoomCode,
    createRobotStatePayload,
    isNewerSequence,
    isSupportedCollaborationMessage,
    isValidRoomCode,
    normalizeRobotDescriptors,
    normalizeRobotState,
    normalizeRoomCode,
    normalizeWorkspaceSnapshot,
    releaseRobot
} from '../2_3DSimulation/collaboration-core.mjs';

assert.equal(COLLABORATION_PROTOCOL, 'inorobot-collaboration-v1');
assert.equal(COLLABORATION_WS_PATH, '/collaboration');
assert.equal(MAX_COLLABORATION_PARTICIPANTS, 4);
assert.equal(ROOM_CODE_LENGTH, 4);
assert.equal(ROOM_CODE_ALPHABET, '0123456789');
assert.equal(createRoomCode(() => 0), ROOM_CODE_ALPHABET[0].repeat(ROOM_CODE_LENGTH));
assert.equal(createRoomCode(() => 0.999999), ROOM_CODE_ALPHABET.at(-1).repeat(ROOM_CODE_LENGTH));
assert.equal(normalizeRoomCode(' 12-3a4! '), '1234');
assert.equal(isValidRoomCode('1234'), true);
assert.equal(isValidRoomCode('123'), false, 'room codes must contain exactly four digits');
assert.equal(isValidRoomCode('12345'), false, 'room codes must contain exactly four digits');
assert.equal(isValidRoomCode('12A4'), false, 'room codes must contain digits only');
assert.equal(isValidRoomCode('12A34'), false, 'room codes must contain digits only');

const robots = normalizeRobotDescriptors([
    {
        robotId: 'robot-1',
        name: 'Robot 1',
        jointCount: 2,
        jointLimits: [[-90, 90], [0, 100]]
    },
    {
        robotId: 'robot-2',
        name: 'Robot 2',
        jointCount: 2,
        jointLimits: [[-180, 180], [-180, 180]]
    },
    { robotId: 'robot-1', name: 'duplicate' }
]);
assert.equal(robots.length, 2, 'robot descriptors must be unique by robotId');

assert.equal(claimRobot(robots, 'user-a', 'robot-1', 'PC A').ok, true);
assert.equal(claimRobot(robots, 'user-b', 'robot-1', 'PC B').reason, 'robot-occupied');
assert.equal(claimRobot(robots, 'user-a', 'robot-2', 'PC A').reason, 'already-owns-robot');
assert.deepEqual(releaseRobot(robots, 'user-a', 'robot-1'), ['robot-1']);
assert.equal(claimRobot(robots, 'user-b', 'robot-2', 'PC B').ok, true);

const robot = robots[0];
const validState = normalizeRobotState({
    jointAngles: [-20, 40],
    tcpPose: { position: [1, 2, 3], rotation: [0, 0, 0, 1] },
    connected: true,
    streaming: true,
    alarm: false,
    estop: false,
    controllerSource: 'bridge'
}, robot);
assert.equal(validState.ok, true);
assert.deepEqual(validState.state.jointAngles, [-20, 40]);
assert.equal(normalizeRobotState({ jointAngles: [-20] }, robot).ok, false);
assert.equal(normalizeRobotState({ jointAngles: [-20, 140] }, robot).ok, false);
assert.equal(normalizeRobotState({ jointAngles: [-20, 40], tcpPose: { position: [1], rotation: [0, 0, 0, 1] } }, robot).ok, true);
assert.equal(isNewerSequence(3, 4), true);
assert.equal(isNewerSequence(4, 4), false);
assert.equal(isNewerSequence(4, 2), false);
assert.equal(isSupportedCollaborationMessage({ type: 'robotState' }), true);
assert.equal(isSupportedCollaborationMessage({ type: 'unknown' }), false);
assert.deepEqual(
    createRobotStatePayload(robot, { sequence: 4, payload: { jointAngles: [0, 1] } }, 8),
    { robotId: 'robot-1', sequence: 4, serverSequence: 8, payload: { jointAngles: [0, 1] } }
);

const originalSnapshot = {
    motionProject: { robots: [] },
    camera: { position: [1, 2, 3] },
    selection: { selectedModelId: 'local-only' },
    viewConfiguration: { viewPresets: [{ name: 'local-only' }] },
    collapsedModelIds: ['local-only']
};
const normalizedSnapshot = normalizeWorkspaceSnapshot(originalSnapshot);
assert.equal(normalizedSnapshot.ok, true);
assert.equal(normalizedSnapshot.snapshot.camera, null);
assert.deepEqual(normalizedSnapshot.snapshot.selection, {});
assert.deepEqual(normalizedSnapshot.snapshot.viewConfiguration, { viewPresets: [] });
assert.deepEqual(normalizedSnapshot.snapshot.collapsedModelIds, []);
assert.equal(normalizeWorkspaceSnapshot({ payload: 'too large' }, 8).reason, 'snapshot-too-large');

const [serverSource, pageSource, htmlSource, styleSource] = await Promise.all([
    readFile(new URL('./collaboration-server.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8')
]);
const snapshotRestoreStart = pageSource.indexOf('async function applyCollaborationRoomSnapshot');
const sceneCommandStart = pageSource.indexOf('function applyCollaborationSceneCommand', snapshotRestoreStart);
assert.ok(snapshotRestoreStart >= 0 && sceneCommandStart > snapshotRestoreStart);
const snapshotRestoreSource = pageSource.slice(snapshotRestoreStart, sceneCommandStart);
const restoreAwaitIndex = snapshotRestoreSource.indexOf('await restoreWorkspaceSnapshot');
assert.ok(restoreAwaitIndex >= 0);
assert.equal(
    snapshotRestoreSource.indexOf('updateCollaborationRobotSnapshot(message.robots, message.participants)', restoreAwaitIndex),
    -1,
    'workspace restore must not reapply the stale pre-claim room snapshot'
);
[
    'COLLABORATION_WS_PATH',
    'MAX_COLLABORATION_PARTICIPANTS',
    'PARTICIPANT_RECONNECT_GRACE_MS',
    'HEARTBEAT_TIMEOUT_MS',
    'MAX_MESSAGES_PER_SECOND',
    'requireOwnedRobot',
    'isNewerSequence',
    'createRoomSnapshotMessage'
].forEach((token) => assert.match(serverSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
[
    'state.collaboration',
    'isCollaborationRobotLocallyControllable',
    'applyRemoteCollaborationRobotState',
    'applyCollaborationRoomSnapshot',
    'requestCollaborationConnection',
    'sendCollaborationRobotCommand'
].forEach((token) => assert.match(pageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
[
    'collaboration-panel',
    'collaboration-create-room',
    'collaboration-join-room',
    'collaboration-robot-list',
    'data-panel-toggle="collaboration-panel"'
].forEach((token) => assert.match(htmlSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
assert.match(htmlSource, /id="collaboration-room-code-input" type="text" maxlength="4" inputmode="numeric" pattern="\[0-9\]\{4\}"/);
assert.match(htmlSource, /placeholder="4자리 코드" data-i18n-placeholder="legacy\.4자리 코드"/);
assert.match(pageSource, /방 코드는 숫자로 된 4자리 코드여야 합니다\./);
assert.match(serverSource, /const rawRoomCode = String\(message\.roomCode \|\| ''\)\.trim\(\)/);
assert.match(serverSource, /collaborationCore\.isValidRoomCode\(rawRoomCode\)/);
assert.doesNotMatch(styleSource, /\.viewer-control-dock > button\[data-panel-toggle="collaboration-panel"\]/);
assert.match(styleSource, /\.collaboration-room-actions\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 5\.7rem/);
assert.match(styleSource, /\.collaboration-join-row\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 4\.6rem/);
assert.match(styleSource, /\.collaboration-room-actions button,[\s\S]*?min-height: 32px/);
assert.doesNotMatch(styleSource, /#collaboration-create-room,[\s\S]*?min-height: 42px/);

console.log('Collaboration validation passed.');
