import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    MOTION_PROJECT_SCHEMA_VERSION,
    S_CURVE_PEAK_VELOCITY,
    S_CURVE_PEAK_ACCELERATION,
    MOTION_SETTLING_DELAY_SECONDS,
    MAX_MOVL_SPEED,
    DEFAULT_MOVJ_SPEED,
    DEFAULT_DELAY_SECONDS,
    MIN_DELAY_SECONDS,
    MAX_DELAY_SECONDS,
    MIN_POINT_INDEX,
    MAX_POINT_INDEX,
    MAX_POINT_LABEL_LENGTH,
    formatMotionPointName,
    formatPositionPointRecordLine,
    isMotionPointMotion,
    isValidMotionPointLabel,
    sCurveProgress,
    interpolateLinearPosition,
    slerpQuaternion,
    calculateMovjDuration,
    calculateMovlDuration,
    calculateDelayDuration,
    calculateCycleElapsedSeconds,
    advanceMotionCursor,
    resolveDirectionalMotionType,
    getDirectionalTimerActions,
    cloneMotionProgram,
    reorderMotionSteps,
    normalizeMotionProject
} from '../2_3DSimulation/motion-program-core.mjs';

const closeTo = (actual, expected, epsilon = 1e-9) => {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

closeTo(sCurveProgress(0), 0);
closeTo(sCurveProgress(0.5), 0.5);
closeTo(sCurveProgress(1), 1);
closeTo(sCurveProgress(0.25), 0.103515625);
closeTo(sCurveProgress(0.25), 1 - sCurveProgress(0.75));

const lineStart = [10, -20, 30];
const lineTarget = [110, 180, -70];
for (let sample = 0; sample <= 100; sample += 1) {
    const progress = sample / 100;
    const position = interpolateLinearPosition(lineStart, lineTarget, progress);
    position.forEach((value, axis) => closeTo(
        value,
        lineStart[axis] + (lineTarget[axis] - lineStart[axis]) * progress,
        1e-10
    ));
}
const halfwayRotation = slerpQuaternion([0, 0, 0, 1], [0, 0, 1, 0], 0.5);
closeTo(Math.hypot(...halfwayRotation), 1, 1e-12);
closeTo(Math.abs(halfwayRotation[2]), Math.SQRT1_2, 1e-12);
closeTo(Math.abs(halfwayRotation[3]), Math.SQRT1_2, 1e-12);

const revolute = { definition: { type: 'revolute', maxSpeed: 360, maxAcceleration: 720 } };
const prismatic = { definition: { type: 'prismatic', maxSpeed: 1000 } };
closeTo(S_CURVE_PEAK_VELOCITY, 1.875);
closeTo(S_CURVE_PEAK_ACCELERATION, 10 / Math.sqrt(3));
closeTo(MOTION_SETTLING_DELAY_SECONDS, 0.02);
closeTo(calculateMovjDuration([0], [180], [revolute], 100), Math.sqrt(180 * S_CURVE_PEAK_ACCELERATION / 720));
closeTo(calculateMovjDuration([0], [250], [prismatic], 50), 250 * S_CURVE_PEAK_VELOCITY / 500);
closeTo(
    calculateMovjDuration([0, 0], [90, 250], [revolute, prismatic], 100),
    Math.sqrt(90 * S_CURVE_PEAK_ACCELERATION / 720)
);
closeTo(calculateMovjDuration([0], [180], [{ definition: { type: 'revolute' } }], 100), 1.875);
closeTo(calculateMovlDuration(100, 0, 100), 1.875);
closeTo(calculateMovlDuration(0, 180, 1000), 3.75);
closeTo(calculateMovlDuration(0, 0, 100), 0.1);
closeTo(MAX_MOVL_SPEED, 2500);
assert.equal(DEFAULT_MOVJ_SPEED, 100, 'New movement commands must start at 100% speed.');
closeTo(calculateMovlDuration(1500, 0, MAX_MOVL_SPEED), 1.125);
closeTo(calculateMovlDuration(1500, 0, 3000), 1.125);
const asymmetricJoint = {
    definition: { type: 'revolute', maxSpeed: 1000, maxAcceleration: 720, maxDeceleration: 180 }
};
closeTo(
    calculateMovjDuration([0], [180], [asymmetricJoint], 100),
    Math.sqrt(180 * S_CURVE_PEAK_ACCELERATION / 180)
);
const cartesianMotion = {
    maxSpeed: 2500,
    maxAcceleration: 5000,
    maxRotationSpeed: 600,
    maxRotationAcceleration: 4000,
    stopDeceleration: 5000,
    rotationStopDeceleration: 4000
};
closeTo(calculateMovlDuration(2500, 0, 4000, cartesianMotion), 1.875);
closeTo(calculateMovlDuration(0, 600, 100, cartesianMotion), 1.875);
const decelerationLimitedCartesian = {
    ...cartesianMotion,
    maxAcceleration: 10000,
    stopDeceleration: 1000
};
closeTo(
    calculateMovlDuration(100, 0, 2500, decelerationLimitedCartesian),
    Math.sqrt(100 * S_CURVE_PEAK_ACCELERATION / 1000)
);
closeTo(calculateDelayDuration(2.5), 2.5);
closeTo(calculateDelayDuration(MIN_DELAY_SECONDS), MIN_DELAY_SECONDS);
closeTo(calculateDelayDuration(MAX_DELAY_SECONDS), MAX_DELAY_SECONDS);
closeTo(calculateDelayDuration(undefined), DEFAULT_DELAY_SECONDS);
closeTo(calculateCycleElapsedSeconds(1000, 2345), 1.345);
closeTo(calculateCycleElapsedSeconds(2345, 1000), 0);
assert.equal(calculateCycleElapsedSeconds(null, 1000), null);

const collectReverseCursors = (stepCount, transitionCount) => {
    const cursors = [0];
    const directions = [1];
    let playback = { cursor: 0, direction: 1 };
    for (let index = 0; index < transitionCount; index += 1) {
        playback = advanceMotionCursor({
            ...playback,
            stepCount,
            repeat: false,
            reverseRepeat: true
        });
        assert.equal(playback.completed, false);
        cursors.push(playback.cursor);
        directions.push(playback.direction);
    }
    return { cursors, directions };
};

assert.deepEqual(
    collectReverseCursors(10, 19).cursors,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1],
    'Ten rows must ping-pong without replaying either endpoint during a turn.'
);
assert.deepEqual(collectReverseCursors(3, 6).cursors, [0, 1, 2, 1, 0, 1, 2]);
assert.deepEqual(collectReverseCursors(2, 5).cursors, [0, 1, 0, 1, 0, 1]);
const oneStepReverse = collectReverseCursors(1, 4);
assert.deepEqual(oneStepReverse.cursors, [0, 0, 0, 0, 0]);
assert.deepEqual(oneStepReverse.directions, [1, 1, 1, 1, 1], 'A one-row reverse repeat must stay in the forward direction.');
assert.deepEqual(
    advanceMotionCursor({ cursor: 0, direction: -1, stepCount: 1, repeat: false, reverseRepeat: true }),
    { cursor: 0, direction: 1, completed: false, boundary: 'end' },
    'A one-row reverse repeat must recover a stale reverse direction without completing.'
);

assert.deepEqual(
    advanceMotionCursor({ cursor: 2, direction: 1, stepCount: 3, repeat: true, reverseRepeat: false }),
    { cursor: 0, direction: 1, completed: false, boundary: 'end' }
);
assert.deepEqual(
    advanceMotionCursor({ cursor: 2, direction: 1, stepCount: 3, repeat: false, reverseRepeat: false }),
    { cursor: 2, direction: 1, completed: true, boundary: 'end' }
);
assert.deepEqual(
    advanceMotionCursor({ cursor: 2, direction: -1, stepCount: 3, repeat: false, reverseRepeat: false }),
    { cursor: 1, direction: -1, completed: false, boundary: null }
);
assert.deepEqual(
    advanceMotionCursor({ cursor: 0, direction: -1, stepCount: 3, repeat: false, reverseRepeat: false }),
    { cursor: 0, direction: -1, completed: true, boundary: 'start' },
    'Turning reverse repeat off while descending must finish at the first row.'
);
assert.deepEqual(
    advanceMotionCursor({ cursor: 0, direction: -1, stepCount: 3, repeat: true, reverseRepeat: false }),
    { cursor: 0, direction: 1, completed: false, boundary: 'start' },
    'Switching from reverse repeat to normal repeat must restart in the forward direction.'
);
assert.deepEqual(
    advanceMotionCursor({ cursor: 0, direction: 1, stepCount: 0, repeat: true, reverseRepeat: true }),
    { cursor: 0, direction: 1, completed: true, boundary: 'empty' }
);

assert.equal(resolveDirectionalMotionType('TIME_START', 1), 'TIME_START');
assert.equal(resolveDirectionalMotionType('TIME_OUT', 1), 'TIME_OUT');
assert.equal(resolveDirectionalMotionType('TIME_START', -1), 'TIME_OUT');
assert.equal(resolveDirectionalMotionType('TIME_OUT', -1), 'TIME_START');
assert.equal(resolveDirectionalMotionType('MOVJ', -1), 'MOVJ');
assert.deepEqual(getDirectionalTimerActions('MOVJ', {
    cursor: 2, direction: 1, stepCount: 3, reverseRepeat: true
}), []);
assert.deepEqual(getDirectionalTimerActions('TIME_OUT', {
    cursor: 1, direction: 1, stepCount: 3, reverseRepeat: true
}), ['TIME_OUT']);
assert.deepEqual(getDirectionalTimerActions('TIME_OUT', {
    cursor: 2, direction: 1, stepCount: 3, reverseRepeat: true
}), ['TIME_OUT', 'TIME_START'], 'The last row must apply its forward and returning timer meanings once each.');
assert.deepEqual(getDirectionalTimerActions('TIME_START', {
    cursor: 0, direction: -1, stepCount: 3, reverseRepeat: true
}), ['TIME_OUT', 'TIME_START'], 'The first row must close the return timer and start the next forward timer.');
assert.deepEqual(getDirectionalTimerActions('TIME_START', {
    cursor: 0, direction: -1, stepCount: 3, repeat: false, reverseRepeat: false
}), ['TIME_OUT'], 'A disabled reverse repeat must not add a new forward timer action.');
assert.deepEqual(getDirectionalTimerActions('TIME_START', {
    cursor: 0, direction: -1, stepCount: 1, repeat: false, reverseRepeat: true
}), ['TIME_START'], 'A one-row reverse repeat must execute TIME_START once without swapping it.');
assert.deepEqual(getDirectionalTimerActions('TIME_OUT', {
    cursor: 0, direction: -1, stepCount: 1, repeat: false, reverseRepeat: true
}), ['TIME_OUT'], 'A one-row reverse repeat must execute TIME_OUT once without swapping it.');

assert.equal(MIN_POINT_INDEX, 0);
assert.equal(MAX_POINT_INDEX, 9999);
assert.equal(MAX_POINT_LABEL_LENGTH, 19);
assert.equal(formatMotionPointName(0), 'P[0]');
assert.equal(isMotionPointMotion('MOVJ'), true);
assert.equal(isMotionPointMotion('MOVL'), true);
assert.equal(isMotionPointMotion('DELAY'), false);
assert.equal(isValidMotionPointLabel('Pickup_01'), true);
assert.equal(isValidMotionPointLabel(''), true);
assert.equal(isValidMotionPointLabel('1Pickup'), false);
assert.equal(isValidMotionPointLabel('Pickup-01'), false);
assert.equal(isValidMotionPointLabel('A'.repeat(20)), false);
assert.equal(
    formatPositionPointRecordLine({
        pointIndex: 0,
        coordinates: [850, 600, 750, -0.000002, 0, 180],
        armParameters: [0, 0, 0, 1],
        externalAxes: [0, 0, 0, 0, 0, 0],
        label: 'Point1'
    }),
    'P[0] = 850.000000, 600.000000, 750.000000, -0.000002, 0.000000, 180.000000; 0, 0, 0, 1;0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000; Name=Point1;'
);
assert.equal(
    formatPositionPointRecordLine({
        pointIndex: 1,
        coordinates: [850.000009, 600, 800, -0.000004, 0.000002, 180],
        armParameters: [0, 0, 0, 1],
        externalAxes: [0, 0, 0, 0, 0, 0]
    }),
    'P[1] = 850.000009, 600.000000, 800.000000, -0.000004, 0.000002, 180.000000; 0, 0, 0, 1;0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000;'
);
assert.throws(() => formatPositionPointRecordLine({
    pointIndex: 10000,
    coordinates: [0, 0, 0, 0, 0, 0],
    armParameters: [0, 0, 0, 1],
    externalAxes: [0, 0, 0, 0, 0, 0]
}));

const stressDurations = [
    calculateMovjDuration([0], [45], [revolute], 20),
    calculateMovjDuration([0], [90], [revolute], 35),
    calculateMovlDuration(600, 0, 120),
    calculateMovlDuration(250, 90, 400)
];
const synchronizedStart = 5000;
const completionTimes = stressDurations.map((duration) => synchronizedStart + duration * 1000);
assert.equal(new Set(completionTimes).size, 4, 'Four synchronized robots must complete independently.');
for (let frame = 0; frame <= 10000; frame += 1) {
    stressDurations.forEach((duration, robotIndex) => {
        const progress = sCurveProgress(Math.min(1, frame / (duration * 1000)));
        const position = interpolateLinearPosition([0, robotIndex, 0], [100, robotIndex, 50], progress);
        assert.ok(position.every(Number.isFinite));
    });
}

const [
    catalogText,
    mainSource,
    motionCoreSource,
    workspaceRecoveryCoreSource,
    htmlSource,
    cssSource,
    changeLogSource,
    gs60SourceText,
    ...viewerLocaleTexts
] = await Promise.all([
    readFile(new URL('../2_3DSimulation/models/models.json', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/motion-program-core.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/workspace-recovery-core.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/수정사항 정리.txt', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/새 폴더/IR-GS60-120Z40S5-C1LNSX-INT_01741178.json', import.meta.url), 'utf8'),
    ...['ko', 'en', 'zh-CN', 'vi'].map((locale) => (
        readFile(new URL(`../Language/${locale}/robot-3d-viewer.json`, import.meta.url), 'utf8')
    ))
]);
const catalog = JSON.parse(catalogText);
const gs60Source = JSON.parse(gs60SourceText.replace(/^\uFEFF/, ''));
const viewerLocaleCodes = ['ko', 'en', 'zh-CN', 'vi'];
const viewerLocales = Object.fromEntries(viewerLocaleCodes.map((locale, index) => [
    locale,
    JSON.parse(viewerLocaleTexts[index]).legacy
]));
const viewerLocaleKeySets = viewerLocaleCodes.map((locale) => Object.keys(viewerLocales[locale]).sort());
viewerLocaleKeySets.slice(1).forEach((keys, index) => {
    assert.deepEqual(keys, viewerLocaleKeySets[0], `${viewerLocaleCodes[index + 1]} viewer locale keys must match Korean.`);
});

const workspaceRecoveryTranslationKeys = [
    '이전 작업 복구',
    '저장된 3D 시뮬레이션 작업이 있습니다. 불러오시겠습니까?',
    '마지막 저장: {time}',
    '로봇 {robots}대 · 3D 모델 {models}개',
    'OLP 프로젝트 {projects}개',
    '다른 창에서 연 작업은 독립된 복사본으로 저장되어 서로 덮어쓰지 않습니다.',
    '새 작업 시작',
    '이전 작업 불러오기',
    '같은 작업이 다른 창에서 열려 있어 이 창은 독립된 복사본으로 시작합니다.',
    '작업을 자동 저장하지 못했습니다.',
    '이전 작업을 불러오지 못했습니다.',
    '자동 복구 저장 공간이 부족합니다. 프로젝트를 파일로 저장해 주세요.',
    '저장된 작업 파일 일부를 찾을 수 없어 이전 작업을 모두 복구하지 못했습니다.',
    '3D 모델은 불러왔지만 원본 파일을 작업 복구 저장소에 저장하지 못했습니다.',
    'OLP 프로젝트는 불러왔지만 일부 바이너리 파일을 작업 복구 저장소에 저장하지 못했습니다.',
    '이전 작업 불러오는 중...',
    '이전 작업을 불러왔습니다.',
    '이 브라우저에서는 자동 복구 저장소를 사용할 수 없습니다.'
];
workspaceRecoveryTranslationKeys.forEach((source) => {
    const expectedPlaceholders = [...source.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
        .map((match) => match[1])
        .sort();
    viewerLocaleCodes.forEach((locale) => {
        assert.ok(
            Object.prototype.hasOwnProperty.call(viewerLocales[locale], source),
            `${locale} is missing workspace-recovery translation: ${source}`
        );
        const translated = String(viewerLocales[locale][source]);
        const translatedPlaceholders = [...translated.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
            .map((match) => match[1])
            .sort();
        assert.deepEqual(
            translatedPlaceholders,
            expectedPlaceholders,
            `${locale} changes workspace-recovery placeholders for: ${source}`
        );
        if (locale !== 'ko') {
            assert.doesNotMatch(translated, /[가-힣]/, `${locale} leaves workspace-recovery text untranslated: ${source}`);
        }
    });
});

const viewerTranslationSources = new Set([
    'Program', 'Program Panel', 'ROBOTS', 'CYCLE TIME',
    '대기', '실행 중', '일시정지', '완료', '오류', '정지됨',
    '사이클 타임 측정 중', '사이클 타임',
    'Tool이 TCP에 부착되었습니다.', '3D 모델링 불러오기 완료',
    '자세, DELAY 또는 타이머 명령을 추가하세요.', '프로그램 가능한 로봇이 없습니다.',
    '반복 실행 켜짐', '반복 실행 꺼짐',
    '프로젝트 복원에 실패했습니다.', '프로젝트 내보내기에 실패했습니다.',
    '프로젝트 불러오기에 실패했습니다.', '모션 경로 검증에 실패했습니다.',
    'TIME START 명령 추가', 'TIME OUT 명령 추가'
]);
for (const match of htmlSource.matchAll(/>([^<>]+)</g)) {
    const source = match[1].replace(/\s+/g, ' ').trim();
    if (/[가-힣]/.test(source)) viewerTranslationSources.add(source);
}
for (const match of htmlSource.matchAll(/(?:title|aria-label|placeholder|alt)=["']([^"']+)["']/g)) {
    if (/[가-힣]/.test(match[1])) viewerTranslationSources.add(match[1].trim());
}
[
    /(?:uiText|uiFormat|setStatus|setMotionProgramStatus)\(\s*["']([^"']+)["']/g,
    /recordHistory\(\s*["']([^"']+)["']/g
].forEach((expression) => {
    for (const match of mainSource.matchAll(expression)) {
        const source = match[1].replace(/\\n/g, '\n');
        if (/[가-힣]/.test(source)) viewerTranslationSources.add(source);
    }
});
viewerLocaleCodes.forEach((locale) => {
    viewerTranslationSources.forEach((source) => {
        assert.ok(Object.prototype.hasOwnProperty.call(viewerLocales[locale], source), `${locale} is missing viewer translation: ${source}`);
        const sourcePlaceholders = [...source.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
        const targetPlaceholders = [...String(viewerLocales[locale][source]).matchAll(/\{([A-Za-z0-9_]+)\}/g)]
            .map((match) => match[1]).sort();
        assert.deepEqual(targetPlaceholders, sourcePlaceholders, `${locale} changes placeholders for: ${source}`);
        if (locale !== 'ko' && /[가-힣]/.test(source)) {
            assert.doesNotMatch(viewerLocales[locale][source], /[가-힣]/, `${locale} leaves Korean viewer text untranslated: ${source}`);
        }
    });
});

[
    "export const WORKSPACE_SCHEMA_VERSION = 1;",
    "export const WORKSPACE_DB_NAME = 'inorobot-3d-simulation-workspaces';",
    "export const WORKSPACE_STORE_NAME = 'workspaces';",
    "export const WORKSPACE_ASSET_STORE_NAME = 'assets';",
    "export const WORKSPACE_LEASE_STORE_NAME = 'leases';",
    "export const WORKSPACE_SESSION_KEY = 'inorobot.3d-simulation.workspace-id.v1';",
    "export const WORKSPACE_START_CLEAN_SESSION_KEY = 'inorobot.3d-simulation.start-clean.v1';",
    "export const WORKSPACE_CHANNEL_NAME = 'inorobot.3d-simulation.workspace.v1';",
    'export class WorkspaceRecoveryStore',
    'export function normalizeWorkspaceRecord',
    'export function normalizeWorkspaceAsset',
    'export function collectWorkspaceAssetIds',
    'export function collectOrphanWorkspaceAssetIds',
    'export function evaluateWorkspaceLease',
    'export function assertWorkspaceLeaseOwnership',
    'export function decideWorkspaceStartup',
    'export function createForkedWorkspaceRecord',
    'export function getWorkspaceSummary',
    'export function isWorkspaceQuotaError'
].forEach((marker) => assert.ok(
    workspaceRecoveryCoreSource.includes(marker),
    `Missing workspace-recovery core marker: ${marker}`
));
assert.match(
    workspaceRecoveryCoreSource,
    /createObjectStore\(WORKSPACE_STORE_NAME, \{ keyPath: 'id' \}\)[\s\S]*?createObjectStore\(WORKSPACE_ASSET_STORE_NAME, \{ keyPath: 'id' \}\)[\s\S]*?createObjectStore\(WORKSPACE_LEASE_STORE_NAME, \{ keyPath: 'workspaceId' \}\)/,
    'Workspace recovery must persist workspace snapshots, immutable source assets and ownership leases in separate IndexedDB stores.'
);
[
    'async open()',
    'async getWorkspace(id)',
    'async listWorkspaces(',
    'async getLatestWorkspace(',
    'async putWorkspace(input)',
    'async saveWorkspaceWithLease(',
    'async getLease(workspaceId)',
    'async acquireLease(',
    'async renewLease(',
    'async releaseLease(',
    'async forkWorkspace(',
    'async archiveWorkspace(',
    'async pruneArchivedWorkspaces(',
    'async deleteWorkspace(',
    'async putAsset(input)',
    'async getAsset(',
    'async listAssets()',
    'async collectOrphanAssetIds()',
    'async deleteOrphanAssets({'
].forEach((marker) => assert.ok(
    workspaceRecoveryCoreSource.includes(marker),
    `WorkspaceRecoveryStore is missing operation: ${marker}`
));
assert.ok(
    workspaceRecoveryCoreSource.includes("throw workspaceError('Workspace revision changed in another window.', 'WORKSPACE_REVISION_CONFLICT')")
        && workspaceRecoveryCoreSource.includes("throw workspaceError('Workspace ownership was lost to another window.', 'WORKSPACE_LEASE_LOST')")
        && workspaceRecoveryCoreSource.includes("return { acquired: false, reason: 'live-owner'")
        && workspaceRecoveryCoreSource.includes("action: sessionHasLiveOwner ? 'offer-fork' : 'offer-restore'")
        && workspaceRecoveryCoreSource.includes("if (startClean) return { action: 'fresh'"),
    'Workspace saves and startup decisions must reject stale writers, offer a fork for a live owner, and preserve an explicit clean start.'
);
assert.ok(
    workspaceRecoveryCoreSource.includes('blob,')
        && workspaceRecoveryCoreSource.includes("throw workspaceError('Workspace asset size does not match its Blob.', 'INVALID_ASSET')")
        && workspaceRecoveryCoreSource.includes("throw workspaceError('An immutable workspace asset id is already in use.', 'ASSET_ID_CONFLICT')"),
    'Imported model source binaries must remain Blob-backed immutable assets with size validation.'
);
const workspaceNormalizeCoreSource = workspaceRecoveryCoreSource.slice(
    workspaceRecoveryCoreSource.indexOf('export function normalizeWorkspaceRecord('),
    workspaceRecoveryCoreSource.indexOf('export function normalizeWorkspaceAsset(')
);
assert.ok(
    workspaceNormalizeCoreSource.includes("const incompleteRecoveryFrom = String(input.incompleteRecoveryFrom || '').trim() || null;")
        && workspaceNormalizeCoreSource.includes('incompleteRecoveryFrom: incompleteRecoveryFrom === id ? null : incompleteRecoveryFrom'),
    'Workspace records must normalize partial-recovery provenance and reject a self-referencing complete source.'
);
const workspaceForkCoreSource = workspaceRecoveryCoreSource.slice(
    workspaceRecoveryCoreSource.indexOf('export function createForkedWorkspaceRecord('),
    workspaceRecoveryCoreSource.indexOf('export function getWorkspaceSummary(')
);
assert.match(
    workspaceForkCoreSource,
    /\.\.\.normalized,[\s\S]*?forkedFrom: normalized\.id,[\s\S]*?state: structuredClone\(normalized\.state\)/,
    'A duplicated tab/window must fork mutable workspace state while preserving asset refs and incomplete-recovery provenance.'
);
assert.ok(
    workspaceRecoveryCoreSource.includes('this.listWorkspaces({ includeArchived: true })')
        && workspaceRecoveryCoreSource.includes('collectOrphanWorkspaceAssetIds(workspaces, assets)'),
    'Asset cleanup must account for archived workspaces before deleting unreferenced binaries.'
);
assert.match(
    workspaceRecoveryCoreSource,
    /const olpProjects = Array\.isArray\(state\.olpProject\?\.files\)[\s\S]*?return \{ robots, models: imported \+ catalog, olpProjects \};/,
    'Workspace summaries must count a saved OLP project for the startup recovery dialog.'
);
const workspaceOrphanCleanupCoreSource = workspaceRecoveryCoreSource.slice(
    workspaceRecoveryCoreSource.indexOf('async deleteOrphanAssets(')
);
assert.ok(
    workspaceOrphanCleanupCoreSource.includes('async deleteOrphanAssets({ now = Date.now(), gracePeriodMs = 600000 } = {})')
        && workspaceOrphanCleanupCoreSource.includes("db.transaction([WORKSPACE_STORE_NAME, WORKSPACE_ASSET_STORE_NAME], 'readwrite')")
        && workspaceOrphanCleanupCoreSource.includes('requestResult(workspaceStore.getAll())')
        && workspaceOrphanCleanupCoreSource.includes('requestResult(assetStore.getAll())')
        && workspaceOrphanCleanupCoreSource.includes('const cutoff = now - Math.max(0, Number(gracePeriodMs) || 0);')
        && workspaceOrphanCleanupCoreSource.includes('Math.max(Number(asset?.lastUsedAt) || 0, Number(asset?.createdAt) || 0)')
        && workspaceOrphanCleanupCoreSource.includes('ids.forEach((id) => assetStore.delete(id));'),
    'Orphan cleanup must discover workspace references atomically and retain uncommitted import assets for a ten-minute grace period.'
);
const workspaceArchiveCoreSource = workspaceRecoveryCoreSource.slice(
    workspaceRecoveryCoreSource.indexOf('async archiveWorkspace('),
    workspaceRecoveryCoreSource.indexOf('async deleteWorkspace(')
);
assert.ok(
    workspaceArchiveCoreSource.includes('expectedRevision = null')
        && workspaceArchiveCoreSource.includes('requireUnleased = false')
        && workspaceArchiveCoreSource.includes("db.transaction([WORKSPACE_STORE_NAME, WORKSPACE_LEASE_STORE_NAME], 'readwrite')")
        && workspaceArchiveCoreSource.includes("'WORKSPACE_REVISION_CONFLICT'")
        && workspaceArchiveCoreSource.includes("'WORKSPACE_LEASE_ACTIVE'"),
    'Archiving a recovery source must atomically reject a changed revision or a newly acquired live lease.'
);
const workspacePruneCoreSource = workspaceRecoveryCoreSource.slice(
    workspaceRecoveryCoreSource.indexOf('async pruneArchivedWorkspaces('),
    workspaceRecoveryCoreSource.indexOf('async deleteWorkspace(')
);
assert.ok(
    workspacePruneCoreSource.includes('const retainedCount = Math.max(0, Math.trunc(Number(keep) || 0));')
        && workspacePruneCoreSource.includes("db.transaction([WORKSPACE_STORE_NAME, WORKSPACE_LEASE_STORE_NAME], 'readwrite')")
        && workspacePruneCoreSource.includes('record?.archived && record?.id')
        && workspacePruneCoreSource.includes('.sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))')
        && workspacePruneCoreSource.includes('const removedIds = archived.slice(retainedCount)')
        && workspacePruneCoreSource.includes('workspaces.delete(id);')
        && workspacePruneCoreSource.includes('leases.delete(id);'),
    'Archived-workspace pruning must retain the newest requested records and remove old workspace/lease metadata atomically.'
);

const workspaceRecoveryDialogStart = htmlSource.indexOf('<dialog id="workspace-recovery-dialog"');
const workspaceRecoveryDialogEnd = htmlSource.indexOf('</dialog>', workspaceRecoveryDialogStart);
assert.ok(workspaceRecoveryDialogStart >= 0 && workspaceRecoveryDialogEnd > workspaceRecoveryDialogStart, 'Viewer must expose the startup workspace-recovery dialog.');
const workspaceRecoveryDialogSource = htmlSource.slice(workspaceRecoveryDialogStart, workspaceRecoveryDialogEnd + '</dialog>'.length);
[
    'workspace-recovery-dialog-title',
    'workspace-recovery-description',
    'workspace-recovery-saved-at',
    'workspace-recovery-summary',
    'workspace-recovery-isolation-note',
    'workspace-recovery-error',
    'btn-workspace-new',
    'btn-workspace-restore'
].forEach((id) => assert.match(workspaceRecoveryDialogSource, new RegExp(`id=["']${id}["']`)));
assert.match(
    workspaceRecoveryDialogSource,
    /aria-labelledby="workspace-recovery-dialog-title"[\s\S]*?aria-describedby="workspace-recovery-description workspace-recovery-isolation-note"/,
    'The recovery decision must expose its title, description and multi-window isolation guidance to assistive technology.'
);
assert.match(workspaceRecoveryDialogSource, /id="workspace-recovery-error"[^>]*role="alert"[^>]*hidden/);
assert.deepEqual(
    [...workspaceRecoveryDialogSource.matchAll(/<button[^>]*id="([^"]+)"/g)].map((match) => match[1]),
    ['btn-workspace-new', 'btn-workspace-restore'],
    'Recovery must require an explicit New or Restore choice and must not expose a dismiss button.'
);
assert.match(workspaceRecoveryDialogSource, /id="workspace-recovery-saved-at">마지막 저장: \{time\}<\/p>/);
assert.match(workspaceRecoveryDialogSource, /id="workspace-recovery-summary">로봇 \{robots\}대 · 3D 모델 \{models\}개<\/p>/);
assert.ok(
    cssSource.includes('.workspace-recovery-dialog::backdrop')
        && cssSource.includes('.workspace-recovery-error[hidden]')
        && cssSource.includes('.workspace-recovery-dialog-actions button:focus-visible')
        && cssSource.includes('.workspace-recovery-dialog-actions button:disabled'),
    'The recovery dialog must provide a modal backdrop, hidden-error semantics, keyboard focus and disabled loading feedback.'
);
assert.ok(
    htmlSource.includes('style.css?v=20260815-workspace-recovery-1')
        && htmlSource.includes('main.js?v=20260815-workspace-recovery-1')
        && htmlSource.includes('/Language/runtime/locales-data.js?v=20260815-workspace-recovery-1'),
    'Workspace recovery must invalidate simulation style, module and localized-text caches.'
);
assert.ok(
    changeLogSource.includes('3D 시뮬레이션 작업을 창별로 독립 저장하고, 다시 열 때 이전 모델·위치값·프로그램·화면 설정과 OLP 프로젝트를 선택해 복구할 수 있도록 개선했습니다.'),
    'The user-facing version record must describe isolated autosave and full startup recovery without implementation detail.'
);

assert.ok(
    mainSource.includes("import * as WorkspaceRecovery from './workspace-recovery-core.mjs?v=20260815-workspace-recovery-1';")
        && mainSource.includes('workspaceRecovery: {')
        && mainSource.includes('pendingProbes: new Map()'),
    'The simulation must load the versioned workspace core and keep per-document recovery state.'
);
[
    "workspaceRecoveryDialog: document.getElementById('workspace-recovery-dialog')",
    "workspaceRecoverySavedAt: document.getElementById('workspace-recovery-saved-at')",
    "workspaceRecoverySummary: document.getElementById('workspace-recovery-summary')",
    "workspaceRecoveryIsolationNote: document.getElementById('workspace-recovery-isolation-note')",
    "workspaceRecoveryError: document.getElementById('workspace-recovery-error')",
    "btnWorkspaceNew: document.getElementById('btn-workspace-new')",
    "btnWorkspaceRestore: document.getElementById('btn-workspace-restore')"
].forEach((marker) => assert.ok(mainSource.includes(marker), `Missing recovery-dialog binding: ${marker}`));
const workspaceInitSource = mainSource.slice(
    mainSource.indexOf('async function init()'),
    mainSource.indexOf('function setupUI()')
);
assert.ok(
    workspaceInitSource.includes('if (IS_MANUAL_GUIDE_EMBED) renderMotionProgramPanel();')
        && workspaceInitSource.includes('else preserveWorkspaceStatus = await initializeWorkspaceRecovery();')
        && workspaceInitSource.includes("if (!preserveWorkspaceStatus) setStatus('Ready', '#22c55e');")
        && !workspaceInitSource.includes('restoreMotionProjectFromStorage()'),
    'Normal startup must await workspace recovery, preserve recovery errors, and leave the manual-guide embed storage-free.'
);
assert.ok(
    mainSource.includes("el.btnWorkspaceNew?.addEventListener('click', () => resolveWorkspaceRecoveryChoice('new'))")
        && mainSource.includes("el.btnWorkspaceRestore?.addEventListener('click', () => resolveWorkspaceRecoveryChoice('restore'))")
        && /el\.workspaceRecoveryDialog\?\.addEventListener\('cancel',[\s\S]*?event\.preventDefault\(\);[\s\S]*?\}\);/.test(mainSource),
    'The startup dialog must resolve only from its New/Restore buttons and must suppress native cancel.'
);
const pageHideSource = mainSource.slice(
    mainSource.indexOf("window.addEventListener('pagehide', (event) =>"),
    mainSource.indexOf("document.addEventListener('inorobot:i18nready'")
);
assert.ok(
    pageHideSource.includes('if (event.persisted || state.resetInProgress) return;')
        && pageHideSource.includes('void Promise.resolve(saveMotionProjectNow()).catch((error) => {')
        && pageHideSource.includes("console.warn('Final workspace save failed:', error)")
        && pageHideSource.includes('}).finally(() => {')
        && pageHideSource.includes('releaseWorkspaceOwnership();')
        && pageHideSource.indexOf('saveMotionProjectNow()')
            < pageHideSource.indexOf('releaseWorkspaceOwnership();'),
    'A real page hide must await the final durable save before releasing ownership, while preserving a BFCache document.'
);
const beforeUnloadSource = mainSource.slice(
    mainSource.indexOf("window.addEventListener('beforeunload', (event) =>"),
    mainSource.indexOf('function setFullscreenUiMode(')
);
assert.ok(
    beforeUnloadSource.includes('flushOlpPendingEdit();')
        && beforeUnloadSource.includes("event.returnValue = ''")
        && !beforeUnloadSource.includes('releaseWorkspaceOwnership'),
    'Unload prompting must flush the latest OLP text, and cancelling it must not disable autosave or release this document ownership.'
);

const workspaceSerializeSource = mainSource.slice(
    mainSource.indexOf('function serializeWorkspaceSnapshot()'),
    mainSource.indexOf('function serializeMotionProject()')
);
[
    'const motionProject = serializeMotionProject();',
    'const cameraChanged = state.camera && state.controls',
    'const interferenceChanged = JSON.stringify(state.interferenceZones)',
    'const monitoringChanged = JSON.stringify(state.endMonitoringObjects)',
    'hasWork,',
    'robotRuntime:',
    'programSelection:',
    'importedModels:',
    'catalogModels:',
    'assetIds:',
    'selectedModelId:',
    'activeRobotInstanceId:',
    'camera:',
    'gridVisible:',
    'outlineMode:',
    'collisionEnabled:',
    'viewConfiguration: serializeViewConfiguration()',
    'collapsedModelIds:'
].forEach((marker) => assert.ok(
    workspaceSerializeSource.includes(marker),
    `Workspace snapshot is missing scene state: ${marker}`
));
const workspaceOlpSerializeSource = mainSource.slice(
    mainSource.indexOf('function serializeWorkspaceOlpProject()'),
    mainSource.indexOf('function serializeWorkspaceSnapshot()')
);
[
    'schemaVersion: 1,',
    "name: String(project.name || 'OLP Project')",
    'programPath: project.programPath || null',
    "selectedFile: state.olp.selectedFile || ''",
    'enabled: Boolean(state.olp.enabled)',
    'projectDirty: Boolean(state.olp.projectDirty)',
    'files: [...project.files.values()].map((record) => ({',
    'binary: Boolean(record.binary)',
    "text: record.binary ? null : String(record.text ?? '')",
    'assetId: record.binary ? (record.workspaceAssetId || null) : null'
].forEach((marker) => assert.ok(
    workspaceOlpSerializeSource.includes(marker),
    `Saved OLP metadata is missing marker: ${marker}`
));
assert.doesNotMatch(
    workspaceOlpSerializeSource,
    /\b(?:blob|arrayBuffer)\b/,
    'OLP snapshots must reference binary assets by id instead of embedding their bytes in workspace metadata.'
);
assert.ok(
    workspaceSerializeSource.indexOf('flushOlpPendingEdit();')
        < workspaceSerializeSource.indexOf('const olpProject = serializeWorkspaceOlpProject();')
        && workspaceSerializeSource.includes('|| Boolean(olpProject)')
        && workspaceSerializeSource.includes('olpProject,')
        && workspaceSerializeSource.includes('.filter((file) => file.binary && file.assetId)')
        && workspaceSerializeSource.includes('.map((file) => file.assetId)'),
    'Every autosave must flush the visible OLP editor, mark OLP-only work as durable, and retain binary asset references.'
);
const olpBinaryPersistenceSource = mainSource.slice(
    mainSource.indexOf('async function persistOlpWorkspaceBinaryAssets(project)'),
    mainSource.indexOf('function activateOlpProject(')
);
assert.ok(
    olpBinaryPersistenceSource.includes('!record?.binary || record.workspaceAssetId || !record.file?.arrayBuffer')
        && olpBinaryPersistenceSource.includes('const bytes = await record.file.arrayBuffer();')
        && olpBinaryPersistenceSource.includes('record.workspaceAssetId = await persistImportedWorkspaceAsset(file, getFileExtension(name));')
        && olpBinaryPersistenceSource.includes("console.warn('OLP binary source could not be saved for workspace recovery:', error)")
        && olpBinaryPersistenceSource.includes('return failed;'),
    'OLP import must persist each binary once as an immutable workspace asset and report any partial persistence failure.'
);
const olpImportWorkspaceSource = mainSource.slice(
    mainSource.indexOf('async function handleOlpFolderImport('),
    mainSource.indexOf('async function saveOlpProjectAsZip()')
);
assert.ok(
    olpImportWorkspaceSource.indexOf('await persistOlpWorkspaceBinaryAssets(project)')
        < olpImportWorkspaceSource.indexOf('activateOlpProject(project, {')
        && olpImportWorkspaceSource.indexOf('activateOlpProject(project, {')
            < olpImportWorkspaceSource.indexOf('if (!options.suppressWorkspaceSave) scheduleMotionProjectSave();')
        && olpImportWorkspaceSource.indexOf('if (!options.suppressWorkspaceSave) scheduleMotionProjectSave();')
            < olpImportWorkspaceSource.indexOf("setStatus('OLP 프로젝트는 불러왔지만 일부 바이너리 파일을 작업 복구 저장소에 저장하지 못했습니다.'"),
    'A loaded OLP project must autosave after binary persistence, while leaving any asset warning as the final visible status.'
);
assert.ok(
    mainSource.includes("const assetId = WorkspaceRecovery.createWorkspaceId('asset')")
        && mainSource.includes("file.slice(0, file.size, file.type || '')")
        && mainSource.includes('const asset = await recovery.db.putAsset({'),
    'Imported model persistence must assign a fresh asset id and save the source File bytes as an IndexedDB Blob.'
);
assert.match(
    mainSource,
    /const asset = await recovery\.db\.putAsset\(\{[\s\S]*?name: file\.name,[\s\S]*?size: file\.size,[\s\S]*?lastModified:[\s\S]*?extension,[\s\S]*?blob[\s\S]*?\}\);/,
    'The durable asset must retain its source name, size, timestamp, extension and Blob.'
);
const importedModelAssetSource = mainSource.slice(
    mainSource.indexOf('async function handle3DImport(options = {})'),
    mainSource.indexOf('function isTestModel(')
);
assert.ok(
    importedModelAssetSource.includes('if (options.workspaceAssetId) importedModel.userData.workspaceAssetId = options.workspaceAssetId;')
        && importedModelAssetSource.includes('let assetPersistenceFailed = false;')
        && importedModelAssetSource.includes('assetPersistenceFailed = true;')
        && /updateUIStatus\(\);[\s\S]*?if \(assetPersistenceFailed\) \{[\s\S]*?원본 파일을 작업 복구 저장소에 저장하지 못했습니다/.test(importedModelAssetSource),
    'A model may finish importing only after retaining its asset reference, and a source-save failure must remain the final visible status.'
);
assert.ok(
    mainSource.includes('const asset = await state.workspaceRecovery.db.getAsset(entry.assetId, { touch: true });')
        && mainSource.includes('const file = new File([asset.blob], asset.name, {')
        && mainSource.includes('skipAssetPersistence: true')
        && mainSource.includes('workspaceModelId: entry.workspaceModelId')
        && mainSource.includes('applyWorkspaceChildMatrices(model, entry.childMatrices)')
        && mainSource.includes('applyWorkspaceMaterialColors(model, entry.materialColors)'),
    'Restoring an imported model must rebuild its File from IndexedDB and reapply stable ids, transforms, zero points and material state.'
);
const workspaceOlpRestoreSource = mainSource.slice(
    mainSource.indexOf('function createWorkspaceOlpFileWrapper('),
    mainSource.indexOf('async function clearOlpProjectForWorkspaceRestore()')
);
assert.ok(
    workspaceOlpRestoreSource.includes("relativePath: prefixRoot ? `__workspace__/${path}` : path")
        && workspaceOlpRestoreSource.includes('text: () => content.text()')
        && workspaceOlpRestoreSource.includes('arrayBuffer: () => content.arrayBuffer()')
        && workspaceOlpRestoreSource.includes('validateOlpImportFiles(validationFiles);')
        && workspaceOlpRestoreSource.includes('await state.workspaceRecovery.db.getAsset(entry.assetId, { touch: true })')
        && workspaceOlpRestoreSource.includes("warnings.push(entry?.path || entry?.name || 'OLP binary')")
        && workspaceOlpRestoreSource.includes("relativePath: String(file.relativePath || '').replace(/^__workspace__\\//, '')")
        && workspaceOlpRestoreSource.includes('const project = await buildOlpProjectFromFiles(files);')
        && workspaceOlpRestoreSource.includes('record.workspaceAssetId = saved.assetId;')
        && workspaceOlpRestoreSource.includes('selectedFile: snapshot.selectedFile ||')
        && workspaceOlpRestoreSource.includes('enabled: snapshot.enabled !== false')
        && workspaceOlpRestoreSource.includes('dirty: Boolean(snapshot.projectDirty)')
        && workspaceOlpRestoreSource.includes('connectBus: false'),
    'OLP recovery must validate files, restore selection/visibility/dirty state, and never auto-connect the Virtual Bus.'
);
const workspaceOlpClearSource = mainSource.slice(
    mainSource.indexOf('async function clearOlpProjectForWorkspaceRestore()'),
    mainSource.indexOf('async function restoreWorkspaceSnapshot(snapshot)')
);
assert.ok(
    workspaceOlpClearSource.includes('window.clearTimeout(state.olp.projectEditTimer);')
        && workspaceOlpClearSource.includes("await stopOlpSession('Workspace changed', { closeBus: true });")
        && workspaceOlpClearSource.includes('state.olp.project = null;')
        && workspaceOlpClearSource.includes('state.olp.projectDirty = false;')
        && workspaceOlpClearSource.includes('toggleOlpWorkspace(false, { connectBus: false, saveWorkspace: false });'),
    'Switching recovery workspaces must stop OLP runtime resources and clear project UI without scheduling an intermediate save.'
);
const workspaceRestoreSource = mainSource.slice(
    mainSource.indexOf('async function restoreWorkspaceSnapshot(snapshot)'),
    mainSource.indexOf('function workspaceSnapshotHasWork(')
);
assert.ok(
    workspaceRestoreSource.includes('await restoreMotionProjectData(motionProject);')
        && workspaceRestoreSource.includes('snapshot?.programSelection')
        && workspaceRestoreSource.includes('await restoreWorkspaceCatalogModel(entry);')
        && workspaceRestoreSource.indexOf("model?.placement !== 'tcp'") < workspaceRestoreSource.indexOf("model?.placement === 'tcp'")
        && workspaceRestoreSource.includes('warnings.push(...await restoreWorkspaceOlpProject(snapshot.olpProject));')
        && workspaceRestoreSource.indexOf('warnings.push(...await restoreWorkspaceOlpProject(snapshot.olpProject));')
            > workspaceRestoreSource.indexOf("model?.placement === 'tcp'")
        && workspaceRestoreSource.indexOf('warnings.push(...await restoreWorkspaceOlpProject(snapshot.olpProject));')
            < workspaceRestoreSource.indexOf('restoreWorkspaceViewConfiguration(snapshot?.viewConfiguration)')
        && workspaceRestoreSource.includes('restoreWorkspaceViewConfiguration(snapshot?.viewConfiguration)')
        && workspaceRestoreSource.includes('applyWorkspaceDisplayState(snapshot)')
        && workspaceRestoreSource.includes('applyWorkspaceCameraState(snapshot?.camera)')
        && workspaceRestoreSource.indexOf('state.activeProgramRobot = robotsById.get(selection.activeProgramRobotInstanceId)')
            < workspaceRestoreSource.indexOf('syncOlpHomeStatus(state.activeProgramRobot || state.activeArticulatedModel);')
        && !workspaceRestoreSource.includes('connectOlpVirtualBus(')
        && workspaceRestoreSource.includes('state.undoStack = []')
        && workspaceRestoreSource.includes('recovery.restoring = false;'),
    'Workspace restoration must rebuild robots/programs before scene tools, resync OLP Home state without opening Virtual Bus, then leave UI history/runtime clean.'
);

const olpWorkspaceEventSource = mainSource.slice(
    mainSource.indexOf("el.olpModeButton?.addEventListener('click'"),
    mainSource.indexOf("el.olpFileEditor?.addEventListener('scroll'")
);
assert.ok(
    /el\.olpFileSelect\?\.addEventListener\('change',[\s\S]*?flushOlpPendingEdit\(\);[\s\S]*?state\.olp\.selectedFile =[\s\S]*?scheduleMotionProjectSave\(\);/.test(olpWorkspaceEventSource)
        && /el\.olpFileEditor\?\.addEventListener\('input',[\s\S]*?state\.olp\.projectDirty = true;[\s\S]*?scheduleMotionProjectSave\(\);[\s\S]*?updateOlpFileText\(/.test(olpWorkspaceEventSource),
    'OLP selection and editor changes must flush pending text, retain dirty state, and trigger workspace autosave.'
);
const toggleOlpWorkspaceSource = mainSource.slice(
    mainSource.indexOf('function toggleOlpWorkspace('),
    mainSource.indexOf('const OLP_SYNTAX_ADDRESS_PATTERN')
);
assert.ok(
    toggleOlpWorkspaceSource.includes('if (saveWorkspace) scheduleMotionProjectSave();'),
    'Opening or closing the OLP workspace must be included in automatic recovery state.'
);
const saveOlpProjectAsZipSource = mainSource.slice(
    mainSource.indexOf('async function saveOlpProjectAsZip()'),
    mainSource.indexOf('async function writeOlpFileToDirectory(')
);
const saveOlpProjectAsFolderSource = mainSource.slice(
    mainSource.indexOf('async function saveOlpProjectAsFolder()'),
    mainSource.indexOf('function canonicalOlpAddress(')
);
[saveOlpProjectAsZipSource, saveOlpProjectAsFolderSource].forEach((source) => assert.ok(
    source.indexOf('state.olp.projectDirty = false;') >= 0
        && source.indexOf('state.olp.projectDirty = false;') < source.indexOf('scheduleMotionProjectSave();'),
    'Saving an OLP project to disk must autosave the cleared dirty flag.'
));
const workspaceHasWorkSource = mainSource.slice(
    mainSource.indexOf('function workspaceSnapshotHasWork('),
    mainSource.indexOf('function readSessionStorageValue(')
);
assert.ok(
    workspaceHasWorkSource.includes('Array.isArray(snapshot.olpProject?.files) && snapshot.olpProject.files.length > 0'),
    'An OLP-only workspace must be offered for startup recovery.'
);

const workspaceChoiceSource = mainSource.slice(
    mainSource.indexOf('function requestWorkspaceRecoveryChoice('),
    mainSource.indexOf('function closeWorkspaceRecoveryDialog(')
);
assert.ok(
    workspaceChoiceSource.includes('WorkspaceRecovery.getWorkspaceSummary(record)')
        && workspaceChoiceSource.includes('new Intl.DateTimeFormat(language')
        && workspaceChoiceSource.includes("uiFormat('마지막 저장: {time}'")
        && workspaceChoiceSource.includes("uiFormat('로봇 {robots}대 · 3D 모델 {models}개'")
        && workspaceChoiceSource.includes("uiFormat('OLP 프로젝트 {projects}개', { projects: summary.olpProjects })")
        && workspaceChoiceSource.includes('el.workspaceRecoveryDialog.showModal()')
        && workspaceChoiceSource.includes('recoveryChoiceResolver = resolve'),
    'The modal must show localized save metadata and wait for the required user decision.'
);
const workspaceChannelSource = mainSource.slice(
    mainSource.indexOf('function setupWorkspaceBroadcastChannel()'),
    mainSource.indexOf('async function claimWorkspaceLease(')
);
assert.ok(
    workspaceChannelSource.includes('new BroadcastChannel(WORKSPACE_BROADCAST_CHANNEL)')
        && workspaceChannelSource.includes("message.type === 'workspace-probe'")
        && workspaceChannelSource.includes('void Promise.resolve(saveMotionProjectNow())')
        && workspaceChannelSource.includes(".finally(() => {")
        && workspaceChannelSource.includes("type: 'workspace-alive'")
        && workspaceChannelSource.includes('revision: recovery.workspace?.revision || 0')
        && workspaceChannelSource.includes('recovery.pendingProbes')
        && workspaceChannelSource.includes('WORKSPACE_LIVE_PROBE_TIMEOUT_MS'),
    'A probed owner must finish its latest durable save before responding with its workspace revision to a duplicated tab.'
);
const workspaceHeartbeatSource = mainSource.slice(
    mainSource.indexOf('function startWorkspaceHeartbeat()'),
    mainSource.indexOf('function clearLegacyWorkspaceStorageAfterCommit()')
);
assert.ok(
    workspaceHeartbeatSource.includes("if (error?.code === 'WORKSPACE_LEASE_LOST') void forkWorkspaceAfterOwnershipLoss();")
        && workspaceHeartbeatSource.includes('incompleteRecoveryFrom: recovery.workspace?.incompleteRecoveryFrom || null')
        && workspaceHeartbeatSource.includes('recovery.saveQueued = true;')
        && workspaceHeartbeatSource.includes('if (!recovery.saveInFlight) queueMicrotask(() => void runWorkspaceSaveLoop());'),
    'Heartbeat-only lease loss must fork immediately, preserve partial-recovery provenance, and queue a durable save.'
);
const workspaceSaveLoopSource = mainSource.slice(
    mainSource.indexOf('async function runWorkspaceSaveLoop()'),
    mainSource.indexOf('async function findLatestWorkspaceCandidate(')
);
assert.ok(
    workspaceSaveLoopSource.includes('recovery.saveQueued = true;')
        && workspaceSaveLoopSource.includes('const snapshot = serializeWorkspaceSnapshot();')
        && workspaceSaveLoopSource.includes('await recovery.db.saveWorkspaceWithLease({')
        && workspaceSaveLoopSource.includes('expectedRevision: previous.revision')
        && workspaceSaveLoopSource.includes("error?.code === 'WORKSPACE_LEASE_LOST'")
        && workspaceSaveLoopSource.includes("error?.code === 'WORKSPACE_REVISION_CONFLICT'")
        && workspaceSaveLoopSource.includes('await forkWorkspaceAfterOwnershipLoss();')
        && workspaceSaveLoopSource.includes('WorkspaceRecovery.isWorkspaceQuotaError(error)'),
    'Autosave must serialize writes, enforce lease/revision ownership, fork on stale ownership and expose quota failures.'
);
const workspaceCandidateSource = mainSource.slice(
    mainSource.indexOf('async function findLatestWorkspaceCandidate('),
    mainSource.indexOf('function readLegacyWorkspaceCandidate(')
);
assert.ok(
    workspaceCandidateSource.includes('const recordById = new Map(records.map((record) => [record.id, record]));')
        && workspaceCandidateSource.includes('const preservedSourceIds = new Set(records')
        && workspaceCandidateSource.includes('.map((record) => record.incompleteRecoveryFrom)')
        && workspaceCandidateSource.includes('.filter((id) => id && recordById.has(id)));')
        && workspaceCandidateSource.includes('const orderedRecords = [...records].sort((left, right) => {')
        && workspaceCandidateSource.includes('const priority = (record) => preservedSourceIds.has(record.id)')
        && workspaceCandidateSource.includes('? 0')
        && workspaceCandidateSource.includes(': record.incompleteRecoveryFrom ? 2 : 1;')
        && workspaceCandidateSource.includes('return priority(left) - priority(right)')
        && workspaceCandidateSource.includes('for (const record of orderedRecords)')
        && workspaceCandidateSource.includes('let liveFallback = null;')
        && workspaceCandidateSource.includes('if (!live) return { record, live: false };')
        && workspaceCandidateSource.includes('if (!liveFallback) liveFallback = { record, live: true };')
        && workspaceCandidateSource.includes('return liveFallback;'),
    'Startup discovery must prefer an intact source still referenced by a partial recovery, rank partial targets last, and retain a live fallback.'
);
assert.doesNotMatch(
    mainSource,
    /localStorage\.setItem\(\s*(?:MOTION_PROJECT_STORAGE_KEY|VIEW_PRESETS_STORAGE_KEY)/,
    'Workspace state and imported binaries must never be written back to the shared legacy localStorage keys.'
);
assert.ok(
    mainSource.includes('const motionRaw = localStorage.getItem(MOTION_PROJECT_STORAGE_KEY);')
        && mainSource.includes('const viewRaw = localStorage.getItem(VIEW_PRESETS_STORAGE_KEY);')
        && mainSource.includes('clearLegacyWorkspaceStorageAfterCommit();'),
    'Legacy localStorage must be read only for migration and cleared only after a successful IndexedDB commit.'
);
const workspaceRecordFactorySource = mainSource.slice(
    mainSource.indexOf('function createWorkspaceRecord('),
    mainSource.indexOf('function resolveWorkspaceRecoveryChoice(')
);
assert.ok(
    workspaceRecordFactorySource.includes('incompleteRecoveryFrom: options.incompleteRecoveryFrom || null'),
    'New workspace records must accept provenance linking a partial recovery back to its intact source.'
);
const workspaceRecoveryInitSource = mainSource.slice(
    mainSource.indexOf('async function initializeWorkspaceRecovery()'),
    mainSource.indexOf('function releaseWorkspaceOwnership(')
);
[
    "recovery.ownerId = WorkspaceRecovery.createWorkspaceId('owner')",
    'new WorkspaceRecovery.WorkspaceRecoveryStore(window.indexedDB)',
    'readSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY)',
    "performance.getEntriesByType?.('navigation')?.[0]?.type || ''",
    "const reclaimingSessionReload = navigationType === 'reload' && Boolean(sessionWorkspaceId);",
    'await probeLiveWorkspaceOwner(source.id)',
    'const lease = await recovery.db.getLease(source.id);',
    'const reclaimingSameTabReload = reclaimingSessionReload',
    'Number(lease.expiresAt) > Date.now()',
    'const previousRevision = source.revision;',
    'for (let attempt = 0; attempt < 10; attempt += 1)',
    'const refreshed = await recovery.db.getWorkspace(source.id);',
    'if (source.revision > previousRevision) break;',
    'const candidate = await findLatestWorkspaceCandidate(await recovery.db.listWorkspaces());',
    'source = candidate?.record || null;',
    'sourceIsLive = Boolean(candidate?.live);',
    'readLegacyWorkspaceCandidate()',
    'let targetWorkspaceId = source && !sourceIsLive',
    '? source.id',
    'await claimWorkspaceLease(targetWorkspaceId',
    'await requestWorkspaceRecoveryChoice(source',
    'await restoreWorkspaceSnapshot(source.state)',
    'let restoreHadWarnings = false;',
    'restoreHadWarnings = true;',
    "setStatus('저장된 작업 파일 일부를 찾을 수 없어 이전 작업을 모두 복구하지 못했습니다.'",
    'if (restoreSelected && restoreHadWarnings && source?.id === recovery.workspaceId)',
    'await recovery.db.releaseLease(recovery.workspaceId, recovery.ownerId)',
    'writeSessionStorageValue(WORKSPACE_SESSION_POINTER_KEY, recovery.workspaceId)',
    'const reusingSourceRecord = Boolean(source && source.id === recovery.workspaceId);',
    'revision: reusingSourceRecord ? source.revision : 0',
    'createdAt: reusingSourceRecord ? source.createdAt : Date.now()',
    'await runWorkspaceSaveLoop()',
    'const targetWasCommitted = Number(recovery.workspace?.revision) > 0;',
    'source && !sourceIsLive && !legacySource && !restoreHadWarnings',
    'source.id !== recovery.workspaceId',
    'await recovery.db.archiveWorkspace(source.id, true, {',
    'expectedRevision: source.revision',
    'requireUnleased: true',
    "console.warn('Unable to archive the migrated workspace source:', error)",
    'await recovery.db.pruneArchivedWorkspaces({ keep: 1 });',
    'await recovery.db.deleteOrphanAssets({ gracePeriodMs: 600000 });',
    "console.warn('Unable to clean old workspace recovery records:', error)"
].forEach((marker) => assert.ok(
    workspaceRecoveryInitSource.includes(marker),
    `Workspace startup/isolation is missing marker: ${marker}`
));
const workspaceSessionSourceSelection = workspaceRecoveryInitSource.slice(
    workspaceRecoveryInitSource.indexOf('const sessionWorkspaceId = readSessionStorageValue('),
    workspaceRecoveryInitSource.indexOf('let sourceIsLive = false;')
);
assert.ok(
    workspaceSessionSourceSelection.includes('if (source?.incompleteRecoveryFrom && !startClean) {')
        && workspaceSessionSourceSelection.includes('const completeSource = await recovery.db.getWorkspace(source.incompleteRecoveryFrom);')
        && workspaceSessionSourceSelection.includes('if (completeSource && !completeSource.archived')
        && workspaceSessionSourceSelection.includes('&& workspaceSnapshotHasWork(completeSource.state)) {')
        && workspaceSessionSourceSelection.includes('source = completeSource;'),
    'A partial session pointer may select its intact source before lease/probe decisions only while that source remains unarchived and usable.'
);
const workspaceLiveCandidateRefreshSource = workspaceRecoveryInitSource.slice(
    workspaceRecoveryInitSource.indexOf('const candidate = await findLatestWorkspaceCandidate('),
    workspaceRecoveryInitSource.indexOf('let legacySource = null;')
);
assert.ok(
    workspaceLiveCandidateRefreshSource.includes('source = candidate?.record || null;')
        && workspaceLiveCandidateRefreshSource.includes('sourceIsLive = Boolean(candidate?.live);')
        && workspaceLiveCandidateRefreshSource.includes('if (source && sourceIsLive) {')
        && workspaceLiveCandidateRefreshSource.includes('const previousRevision = source.revision;')
        && workspaceLiveCandidateRefreshSource.includes('for (let attempt = 0; attempt < 10; attempt += 1)')
        && workspaceLiveCandidateRefreshSource.includes('const refreshed = await recovery.db.getWorkspace(source.id);')
        && workspaceLiveCandidateRefreshSource.includes('if (refreshed) source = refreshed;')
        && workspaceLiveCandidateRefreshSource.includes('if (source.revision > previousRevision) break;')
        && workspaceLiveCandidateRefreshSource.includes('await new Promise((resolve) => window.setTimeout(resolve, 100));'),
    'A new window without a session pointer must poll the live candidate until the owner probe-save revision is visible before offering recovery.'
);
const workspacePartialRecoveryCommitSource = workspaceRecoveryInitSource.slice(
    workspaceRecoveryInitSource.indexOf('let restoreSelected = false;'),
    workspaceRecoveryInitSource.indexOf('void (async () => {')
);
assert.ok(
    workspacePartialRecoveryCommitSource.includes('let incompleteRecoverySourceId = null;')
        && workspacePartialRecoveryCommitSource.includes('if (restoreSelected && restoreHadWarnings && source?.id) {')
        && workspacePartialRecoveryCommitSource.includes('incompleteRecoverySourceId = source.id;')
        && workspacePartialRecoveryCommitSource.includes('incompleteRecoveryFrom: incompleteRecoverySourceId')
        && workspacePartialRecoveryCommitSource.indexOf('await runWorkspaceSaveLoop();')
            < workspacePartialRecoveryCommitSource.indexOf('if (targetWasCommitted && incompleteRecoverySourceId) {')
        && workspacePartialRecoveryCommitSource.includes('record.id !== recovery.workspaceId')
        && workspacePartialRecoveryCommitSource.includes('record.incompleteRecoveryFrom === incompleteRecoverySourceId')
        && workspacePartialRecoveryCommitSource.includes('expectedRevision: record.revision')
        && workspacePartialRecoveryCommitSource.includes('requireUnleased: true')
        && workspacePartialRecoveryCommitSource.includes("console.warn('Unable to archive an older partial recovery:', error)"),
    'A warned partial restore must commit a provenance-marked target before atomically archiving older partial descendants while preserving the intact source.'
);
const workspaceResolvedPartialSource = workspacePartialRecoveryCommitSource.slice(
    workspacePartialRecoveryCommitSource.indexOf('if (targetWasCommitted && source && !sourceIsLive && !restoreHadWarnings) {'),
    workspacePartialRecoveryCommitSource.indexOf('if (targetWasCommitted && incompleteRecoverySourceId) {')
);
assert.ok(
    workspaceResolvedPartialSource.includes('const resolvedPartialRecords = (await recovery.db.listWorkspaces())')
        && workspaceResolvedPartialSource.includes('record.id !== recovery.workspaceId')
        && workspaceResolvedPartialSource.includes('record.incompleteRecoveryFrom === source.id')
        && workspaceResolvedPartialSource.includes('expectedRevision: record.revision')
        && workspaceResolvedPartialSource.includes('requireUnleased: true')
        && workspaceResolvedPartialSource.includes("console.warn('Unable to archive a resolved partial recovery:', error)")
        && workspacePartialRecoveryCommitSource.indexOf('await runWorkspaceSaveLoop();')
            < workspacePartialRecoveryCommitSource.indexOf('if (targetWasCommitted && source && !sourceIsLive && !restoreHadWarnings) {'),
    'After a full restore or New choice is durably committed, stale partial descendants except the current target must be archived with revision/lease guards.'
);
assert.ok(
    workspaceRecoveryInitSource.indexOf('await probeLiveWorkspaceOwner(source.id)')
        < workspaceRecoveryInitSource.indexOf('const lease = await recovery.db.getLease(source.id);')
        && workspaceRecoveryInitSource.indexOf('const reclaimingSameTabReload = reclaimingSessionReload')
            < workspaceRecoveryInitSource.indexOf('Number(lease.expiresAt) > Date.now()')
        && workspaceRecoveryInitSource.indexOf('const previousRevision = source.revision;')
            < workspaceRecoveryInitSource.indexOf('const refreshed = await recovery.db.getWorkspace(source.id);'),
    'BroadcastChannel timeout must still honor a live lease, while only a true reload may reclaim this tab and a live fork polls its newest revision.'
);
const workspaceLeaseClaimSource = workspaceRecoveryInitSource.slice(
    workspaceRecoveryInitSource.indexOf('let targetWorkspaceId = source && !sourceIsLive'),
    workspaceRecoveryInitSource.indexOf('recovery.workspaceId = targetWorkspaceId;')
);
assert.ok(
    workspaceLeaseClaimSource.includes('force: Boolean(reclaimingSessionReload && source && !sourceIsLive')
        && workspaceLeaseClaimSource.includes('source.id === sessionWorkspaceId && source.id === targetWorkspaceId)')
        && !workspaceLeaseClaimSource.includes('force: Boolean(source && !sourceIsLive && source.id === targetWorkspaceId)'),
    'Forced lease reclaim must be scoped to a real reload of the same session-pointer source; a latest-candidate race must fork instead.'
);
assert.ok(
    workspaceRecoveryInitSource.indexOf('const candidate = await findLatestWorkspaceCandidate(await recovery.db.listWorkspaces());')
        < workspaceRecoveryInitSource.indexOf('const recoveryWasOffered = Boolean(source && workspaceSnapshotHasWork(source.state)')
        && workspaceRecoveryInitSource.includes('isolatedCopy: sourceIsLive || source.id !== targetWorkspaceId')
        && workspaceRecoveryInitSource.indexOf('let targetWorkspaceId = source && !sourceIsLive')
            < workspaceRecoveryInitSource.indexOf('const reusingSourceRecord = Boolean(source && source.id === recovery.workspaceId);')
        && workspaceRecoveryInitSource.indexOf('await recovery.db.pruneArchivedWorkspaces({ keep: 1 });')
            < workspaceRecoveryInitSource.indexOf('await recovery.db.deleteOrphanAssets({ gracePeriodMs: 600000 });')
        && workspaceRecoveryInitSource.includes('source.id !== recovery.workspaceId')
        && workspaceRecoveryInitSource.includes('requireUnleased: true'),
    'A live/raced candidate must use isolated recovery, source archival must exclude the target and live leases, and pruned assets need a ten-minute grace period.'
);
assert.ok(
    mainSource.includes("writeSessionStorageValue(WORKSPACE_START_CLEAN_KEY, '1')")
        && mainSource.includes("const startClean = readSessionStorageValue(WORKSPACE_START_CLEAN_KEY) === '1'")
        && mainSource.includes("writeSessionStorageValue(WORKSPACE_START_CLEAN_KEY, null)"),
    'A reset must request one explicit clean startup without leaking that choice into later sessions.'
);
assert.match(
    workspaceRecoveryInitSource,
    /if \(choice === 'new'\) break;\s*closeWorkspaceRecoveryDialog\(\);\s*showLoading\(true, uiText\('이전 작업 불러오는 중\.\.\.'\)\);/,
    'Restore must leave the top-layer dialog before showing loading, so long model reconstruction remains visibly in progress.'
);
const resetSimulationSource = mainSource.slice(
    mainSource.indexOf('async function resetSimulation()'),
    mainSource.indexOf('function getInterferenceZoneRuntime(')
);
assert.ok(
    resetSimulationSource.includes('const resetLineageSourceId = recovery.workspace?.incompleteRecoveryFrom')
        && resetSimulationSource.includes('|| recovery.workspaceId;')
        && resetSimulationSource.includes('await recovery.db.deleteWorkspace(recovery.workspaceId, { ownerId: recovery.ownerId });')
        && resetSimulationSource.includes('record.id === resetLineageSourceId')
        && resetSimulationSource.includes('record.incompleteRecoveryFrom === resetLineageSourceId')
        && resetSimulationSource.includes('expectedRevision: record.revision')
        && resetSimulationSource.includes('requireUnleased: true')
        && resetSimulationSource.includes("console.warn('Unable to archive a reset recovery record:', error)")
        && resetSimulationSource.indexOf('await recovery.db.deleteWorkspace(recovery.workspaceId')
            < resetSimulationSource.indexOf('await recovery.db.archiveWorkspace(record.id, true, {')
        && !resetSimulationSource.includes('deleteOrphanAssets'),
    'Reset must delete this workspace, best-effort archive its complete/partial lineage with ownership guards, and leave live-window records/assets intact.'
);

const models = catalog.filter((entry) => entry.type === 'articulated-stl');
const scaraCount = models.filter((entry) => entry.robotType === 'scara').length;
const sixAxisCount = models.filter((entry) => entry.robotType === 'six-axis').length;
assert.equal(scaraCount, 17);
assert.equal(sixAxisCount, 12);
models.forEach((model) => {
    assert.equal(model.jointSpeeds.length, model.limits.length, `${model.name} must define one speed per joint.`);
    assert.ok(model.jointSpeeds.every((speed) => Number.isFinite(speed) && speed > 0), `${model.name} joint speeds must be positive.`);
    assert.equal(model.jointAccelerations.length, model.limits.length, `${model.name} must define one acceleration per joint.`);
    assert.ok(model.jointAccelerations.every((value) => Number.isFinite(value) && value > 0), `${model.name} joint accelerations must be positive.`);
    assert.equal(model.jointDecelerations.length, model.limits.length, `${model.name} must define one deceleration per joint.`);
    assert.ok(model.jointDecelerations.every((value) => Number.isFinite(value) && value > 0), `${model.name} joint decelerations must be positive.`);
    [
        'maxSpeed',
        'maxAcceleration',
        'maxRotationSpeed',
        'maxRotationAcceleration',
        'stopDeceleration',
        'rotationStopDeceleration'
    ].forEach((field) => assert.ok(
        Number.isFinite(model.cartesianMotion?.[field]) && model.cartesianMotion[field] > 0,
        `${model.name} Cartesian ${field} must be positive.`
    ));
});
assert.ok(new Set(models.map((model) => model.jointSpeeds.join(','))).size > 10, 'Joint speed profiles must vary by robot model.');
const r7h90 = models.find((model) => model.folder === 'IR-R7H-90');
const s4 = models.find((model) => model.folder === 'IR-S4-40Z15');
const gs60 = models.find((model) => model.folder === 'IR-GS60-120Z40');
const r15h = models.find((model) => model.folder === 'IR-R15H-145');
assert.deepEqual(r7h90.jointSpeeds, [336, 280, 390, 550, 438, 764.7]);
assert.deepEqual(s4.jointSpeeds, [705.9, 747.1, 1325.955556, 2600]);
const gs60JointSource = gs60Source.stMotion.stPlayback.stJoint;
const gs60CartesianSource = gs60Source.stMotion.stPlayback.stCartesian;
const gs60JointScale = [1, 1, gs60.structure[3] / 360, 1];
[
    ['jointSpeeds', 'dMaxVel'],
    ['jointAccelerations', 'dMaxAcc'],
    ['jointDecelerations', 'dStopDec']
].forEach(([catalogField, sourceField]) => {
    gs60[catalogField].forEach((value, index) => closeTo(
        value,
        gs60JointSource[sourceField][index] * gs60JointScale[index],
        1e-6
    ));
});
[
    ['maxSpeed', 'dMaxVel'],
    ['maxAcceleration', 'dMaxAcc'],
    ['maxRotationSpeed', 'dMaxRVel'],
    ['maxRotationAcceleration', 'dMaxRAcc'],
    ['stopDeceleration', 'dStopDec'],
    ['rotationStopDeceleration', 'dRStopDec']
].forEach(([catalogField, sourceField]) => closeTo(
    gs60.cartesianMotion[catalogField],
    gs60CartesianSource[sourceField]
));
assert.deepEqual(r15h.jointAccelerations, [600, 800, 1000, 1500, 2500, 1800]);
closeTo(calculateMovjDuration(
    [0, 0, 0, 0, 0, 0],
    [0, 280, 0, 0, 0, 0],
    r7h90.jointSpeeds.map((maxSpeed) => ({ definition: { type: 'revolute', maxSpeed } })),
    100
), 1.875);
closeTo(calculateMovjDuration(
    [0, 0, 0, 0],
    [0, 0, 150, 0],
    s4.jointSpeeds.map((maxSpeed, index) => ({ definition: { type: index === 2 ? 'prismatic' : 'revolute', maxSpeed } })),
    100
), 150 * S_CURVE_PEAK_VELOCITY / s4.jointSpeeds[2]);
closeTo(calculateMovjDuration(
    [0, 0, 0, 0, 0, 0],
    [90, 90, 90, 90, 90, 90],
    r15h.jointSpeeds.map((maxSpeed, index) => ({
        definition: {
            type: 'revolute',
            maxSpeed,
            maxAcceleration: r15h.jointAccelerations[index]
        }
    })),
    100
), Math.sqrt(90 * S_CURVE_PEAK_ACCELERATION / 600));

const r15hJoints = r15h.jointSpeeds.map((maxSpeed, index) => ({
    definition: {
        type: 'revolute',
        maxSpeed,
        maxAcceleration: r15h.jointAccelerations[index]
    }
}));
for (const speedPercent of [20, 50, 100]) {
    const speedScale = speedPercent / 100;
    const distances = [12, 35, 70, 110, 160, 240];
    const duration = calculateMovjDuration(
        Array(6).fill(0),
        distances,
        r15hJoints,
        speedPercent
    );
    for (let sample = 0; sample <= 1000; sample += 1) {
        const timeScale = sample / 1000;
        const normalizedVelocity = 30 * timeScale ** 2 * (1 - timeScale) ** 2;
        const normalizedAcceleration = 60 * timeScale - 180 * timeScale ** 2 + 120 * timeScale ** 3;
        distances.forEach((distance, index) => {
            const velocity = distance * normalizedVelocity / duration;
            const acceleration = Math.abs(distance * normalizedAcceleration / duration ** 2);
            assert.ok(velocity <= r15h.jointSpeeds[index] * speedScale + 1e-8, `R15H J${index + 1} exceeds its speed limit.`);
            assert.ok(acceleration <= r15h.jointAccelerations[index] + 1e-8, `R15H J${index + 1} exceeds its acceleration limit.`);
        });
    }
}

models.forEach((model) => {
    const joints = model.jointSpeeds.map((maxSpeed, index) => ({
        definition: {
            type: model.robotType === 'scara' && index === 2 ? 'prismatic' : 'revolute',
            maxSpeed,
            maxAcceleration: model.jointAccelerations[index],
            maxDeceleration: model.jointDecelerations[index]
        }
    }));
    const distances = model.limits.map(([minimum, maximum]) => Math.abs(maximum - minimum) * 0.6);
    [20, 100].forEach((speedPercent) => {
        const duration = calculateMovjDuration(
            Array(model.limits.length).fill(0),
            distances,
            joints,
            speedPercent
        );
        for (let sample = 0; sample <= 1000; sample += 1) {
            const timeScale = sample / 1000;
            const normalizedVelocity = 30 * timeScale ** 2 * (1 - timeScale) ** 2;
            const normalizedAcceleration = Math.abs(60 * timeScale - 180 * timeScale ** 2 + 120 * timeScale ** 3);
            distances.forEach((distance, index) => {
                const velocity = distance * normalizedVelocity / duration;
                const acceleration = distance * normalizedAcceleration / duration ** 2;
                assert.ok(
                    velocity <= model.jointSpeeds[index] * speedPercent / 100 + 1e-8,
                    `${model.name} J${index + 1} exceeds its speed limit.`
                );
                assert.ok(
                    acceleration <= model.jointAccelerations[index] + 1e-8,
                    `${model.name} J${index + 1} exceeds its acceleration limit.`
                );
                assert.ok(
                    acceleration <= model.jointDecelerations[index] + 1e-8,
                    `${model.name} J${index + 1} exceeds its deceleration limit.`
                );
            });
        }
    });

    const linearDistance = 1200;
    const rotationDistance = 180;
    const duration = calculateMovlDuration(
        linearDistance,
        rotationDistance,
        model.cartesianMotion.maxSpeed,
        model.cartesianMotion
    );
    for (let sample = 0; sample <= 1000; sample += 1) {
        const timeScale = sample / 1000;
        const normalizedVelocity = 30 * timeScale ** 2 * (1 - timeScale) ** 2;
        const normalizedAcceleration = Math.abs(60 * timeScale - 180 * timeScale ** 2 + 120 * timeScale ** 3);
        const linearVelocity = linearDistance * normalizedVelocity / duration;
        const linearAcceleration = linearDistance * normalizedAcceleration / duration ** 2;
        const rotationVelocity = rotationDistance * normalizedVelocity / duration;
        const rotationAcceleration = rotationDistance * normalizedAcceleration / duration ** 2;
        assert.ok(linearVelocity <= model.cartesianMotion.maxSpeed + 1e-8, `${model.name} MOVL exceeds its linear speed limit.`);
        assert.ok(linearAcceleration <= model.cartesianMotion.maxAcceleration + 1e-8, `${model.name} MOVL exceeds its linear acceleration limit.`);
        assert.ok(linearAcceleration <= model.cartesianMotion.stopDeceleration + 1e-8, `${model.name} MOVL exceeds its linear deceleration limit.`);
        assert.ok(rotationVelocity <= model.cartesianMotion.maxRotationSpeed + 1e-8, `${model.name} MOVL exceeds its rotation speed limit.`);
        assert.ok(rotationAcceleration <= model.cartesianMotion.maxRotationAcceleration + 1e-8, `${model.name} MOVL exceeds its rotation acceleration limit.`);
        assert.ok(rotationAcceleration <= model.cartesianMotion.rotationStopDeceleration + 1e-8, `${model.name} MOVL exceeds its rotation deceleration limit.`);
    }
});

const makeStep = (model, modelIndex, motion, speed) => ({
    id: `${model.folder}-${motion}`,
    name: motion === 'MOVJ' ? 'P[0]' : 'P[1]',
    pointIndex: motion === 'MOVJ' ? 0 : 1,
    label: motion === 'MOVJ' ? 'Pickup_01' : '',
    armParameters: [0, 0, 0, 1],
    externalAxes: [0, 0, 0, 0, 0, 0],
    motion,
    speed,
    joints: model.limits.map(([minimum, maximum], jointIndex) => (
        jointIndex === 0 ? (minimum + maximum) / 2 : 0
    )),
    tcp: {
        position: [modelIndex * 10, motion === 'MOVL' ? 25 : 0, 0],
        quaternion: [0, 0, 0, 1]
    }
});

const makeDelayStep = (model, modelIndex) => ({
    id: `${model.folder}-DELAY`,
    name: 'D003',
    motion: 'DELAY',
    delaySeconds: 1.5,
    joints: model.limits.map(() => 0),
    tcp: {
        position: [modelIndex * 10, 25, 0],
        quaternion: [0, 0, 0, 1]
    }
});

const makeTimerStep = (model, modelIndex, motion) => ({
    id: `${model.folder}-${motion}`,
    name: motion === 'TIME_START' ? 'TS004' : 'TO005',
    motion,
    joints: model.limits.map(() => 0),
    tcp: {
        position: [modelIndex * 10, 25, 0],
        quaternion: [0, 0, 0, 1]
    }
});

const fullProject = {
    schemaVersion: MOTION_PROJECT_SCHEMA_VERSION,
    repeatCurrentRobot: false,
    reverseRepeatCurrentRobot: false,
    repeat: true,
    reverseRepeat: false,
    robots: models.map((model, index) => ({
        instanceId: `robot-${index + 1}`,
        modelFolder: model.folder,
        displayName: `${model.name} #1`,
        robotType: model.robotType,
        jointCount: model.limits.length,
        included: index < 4,
        baseTransform: {
            position: [0, index * 600, 0],
            quaternion: [0, 0, 0, 1],
            scale: [1, 1, 1]
        },
        steps: [
            makeStep(model, index, 'MOVJ', 20),
            makeStep(model, index, 'MOVL', 100),
            makeDelayStep(model, index),
            makeTimerStep(model, index, 'TIME_START'),
            makeTimerStep(model, index, 'TIME_OUT')
        ]
    }))
};

const normalized = normalizeMotionProject(fullProject);
assert.equal(normalized.robots.length, 29);
assert.equal(normalized.robots.filter((robot) => robot.included).length, 4);
assert.equal(normalized.repeatCurrentRobot, false);
assert.equal(normalized.reverseRepeatCurrentRobot, false);
assert.equal(normalized.repeat, true);
assert.equal(normalized.reverseRepeat, false);
assert.equal(normalized.robots[0].steps[0].name, 'P[0]');
assert.equal(normalized.robots[0].steps[0].pointIndex, 0);
assert.equal(normalized.robots[0].steps[0].label, 'Pickup_01');
assert.deepEqual(normalized.robots[0].steps[0].armParameters, [0, 0, 0, 1]);
assert.deepEqual(normalized.robots[0].steps[0].externalAxes, [0, 0, 0, 0, 0, 0]);
assert.equal(normalized.robots[0].steps[2].motion, 'DELAY');
assert.equal(normalized.robots[0].steps[2].delaySeconds, 1.5);
assert.ok(!('pointIndex' in normalized.robots[0].steps[2]), 'Non-motion commands must not receive P[n] metadata.');
assert.equal(normalized.robots[0].steps[3].motion, 'TIME_START');
assert.equal(normalized.robots[0].steps[4].motion, 'TIME_OUT');
assert.ok(!('speed' in normalized.robots[0].steps[3]) && !('delaySeconds' in normalized.robots[0].steps[4]));
const viewProject = structuredClone(fullProject);
viewProject.robots[0].steps.push({
    id: 'robot-1-VIEW',
    name: 'View 3',
    motion: 'VIEW',
    viewSlot: 2,
    joints: models[0].limits.map(() => 0),
    tcp: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
});
const normalizedViewProject = normalizeMotionProject(viewProject);
assert.equal(normalizedViewProject.robots[0].steps[5].motion, 'VIEW');
assert.equal(normalizedViewProject.robots[0].steps[5].viewSlot, 2);
assert.equal(normalizedViewProject.robots[0].steps[5].name, 'View 3');
assert.throws(() => normalizeMotionProject({
    ...viewProject,
    robots: viewProject.robots.map((robot, index) => index === 0
        ? { ...robot, steps: robot.steps.map((step, stepIndex) => stepIndex === 5 ? { ...step, viewSlot: 4 } : step) }
        : robot)
}), /view slot must be 0 to 3/);
assert.equal(normalized.robots[0].tcpProfiles.length, 3);
assert.deepEqual(normalized.robots[0].tcpProfiles[0], {
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1]
});
assert.equal(normalized.robots[0].activeTcpProfileIndex, 0);
const configuredTcpProject = structuredClone(fullProject);
configuredTcpProject.robots[0].tcpProfiles = [
    { position: [0, 0, 120], quaternion: [0, 0, 0, 1] },
    { position: [30, -15, 245], quaternion: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
    { position: [0, 0, 0], quaternion: [0, 0, 0, 2] }
];
configuredTcpProject.robots[0].activeTcpProfileIndex = 1;
const configuredTcp = normalizeMotionProject(configuredTcpProject).robots[0];
assert.deepEqual(configuredTcp.tcpProfiles[1].position, [30, -15, 245]);
assert.ok(Math.abs(configuredTcp.tcpProfiles[1].quaternion[2] - Math.SQRT1_2) < 1e-12);
assert.equal(configuredTcp.activeTcpProfileIndex, 1);
const clonedDelayProgram = cloneMotionProgram({
    included: true,
    selectedStepId: normalized.robots[0].steps[2].id,
    lastCycleTimeSeconds: 12.345,
    steps: normalized.robots[0].steps
});
assert.equal(clonedDelayProgram.steps[2].motion, 'DELAY');
assert.equal(clonedDelayProgram.steps[2].delaySeconds, 1.5);
assert.equal(clonedDelayProgram.steps[3].motion, 'TIME_START');
assert.equal(clonedDelayProgram.steps[4].motion, 'TIME_OUT');
assert.equal(clonedDelayProgram.lastCycleTimeSeconds, 12.345);
const legacyPointStep = structuredClone(normalized.robots[0].steps[0]);
legacyPointStep.name = 'P001';
delete legacyPointStep.pointIndex;
const migratedLegacyProgram = cloneMotionProgram({ included: true, steps: [legacyPointStep] });
assert.equal(migratedLegacyProgram.steps[0].pointIndex, 0, 'Legacy P001 must migrate to P[0].');
assert.equal(migratedLegacyProgram.steps[0].name, 'P[0]');
const reorderedSteps = [{ id: 'P1' }, { id: 'P2' }, { id: 'P3' }, { id: 'P4' }];
assert.equal(reorderMotionSteps(reorderedSteps, 'P1', 'P4', true), true);
assert.deepEqual(reorderedSteps.map((step) => step.id), ['P2', 'P3', 'P4', 'P1']);
assert.equal(reorderMotionSteps(reorderedSteps, 'P1', 'P2', false), true);
assert.deepEqual(reorderedSteps.map((step) => step.id), ['P1', 'P2', 'P3', 'P4']);
assert.equal(reorderMotionSteps(reorderedSteps, 'P2', 'P1', true), false);
assert.equal(reorderMotionSteps(reorderedSteps, 'missing', 'P1', false), false);
assert.deepEqual(normalizeMotionProject(JSON.parse(JSON.stringify(normalized))), normalized);
const legacyRepeatProject = structuredClone(fullProject);
delete legacyRepeatProject.repeatCurrentRobot;
delete legacyRepeatProject.reverseRepeatCurrentRobot;
delete legacyRepeatProject.reverseRepeat;
const normalizedLegacyRepeatProject = normalizeMotionProject(legacyRepeatProject);
assert.equal(normalizedLegacyRepeatProject.repeatCurrentRobot, true, 'Legacy repeat must apply to both scopes.');
assert.equal(normalizedLegacyRepeatProject.reverseRepeatCurrentRobot, false, 'Legacy projects must default robot reverse repeat off.');
assert.equal(normalizedLegacyRepeatProject.reverseRepeat, false, 'Legacy projects must default group reverse repeat off.');
const conflictingRepeatProject = structuredClone(fullProject);
conflictingRepeatProject.repeatCurrentRobot = true;
conflictingRepeatProject.reverseRepeatCurrentRobot = true;
conflictingRepeatProject.repeat = true;
conflictingRepeatProject.reverseRepeat = true;
const normalizedConflictingRepeatProject = normalizeMotionProject(conflictingRepeatProject);
assert.equal(normalizedConflictingRepeatProject.repeatCurrentRobot, false);
assert.equal(normalizedConflictingRepeatProject.reverseRepeatCurrentRobot, true);
assert.equal(normalizedConflictingRepeatProject.repeat, false);
assert.equal(normalizedConflictingRepeatProject.reverseRepeat, true);
const groupOnlyReverseRepeatProject = structuredClone(fullProject);
groupOnlyReverseRepeatProject.repeatCurrentRobot = true;
groupOnlyReverseRepeatProject.reverseRepeatCurrentRobot = false;
groupOnlyReverseRepeatProject.repeat = true;
groupOnlyReverseRepeatProject.reverseRepeat = true;
const normalizedGroupOnlyReverseRepeatProject = normalizeMotionProject(groupOnlyReverseRepeatProject);
assert.equal(normalizedGroupOnlyReverseRepeatProject.repeatCurrentRobot, true, 'Group reverse repeat must not disable robot repeat.');
assert.equal(normalizedGroupOnlyReverseRepeatProject.repeat, false, 'Group reverse repeat must disable group repeat.');

const duplicateModels = structuredClone(fullProject);
duplicateModels.robots = [
    { ...duplicateModels.robots[0], instanceId: 'same-id', displayName: `${models[0].name} #1` },
    { ...duplicateModels.robots[0], instanceId: 'same-id', displayName: `${models[0].name} #2` }
];
assert.throws(() => normalizeMotionProject(duplicateModels), /Duplicate robot instanceId/);

const invalidSpeed = structuredClone(fullProject);
invalidSpeed.robots[0].steps[0].speed = 101;
assert.throws(() => normalizeMotionProject(invalidSpeed), /speed is outside/);

const maximumMovlSpeed = structuredClone(fullProject);
maximumMovlSpeed.robots[0].steps[1].speed = MAX_MOVL_SPEED;
assert.equal(normalizeMotionProject(maximumMovlSpeed).robots[0].steps[1].speed, 2500);
maximumMovlSpeed.robots[0].steps[1].speed = MAX_MOVL_SPEED + 1;
assert.throws(() => normalizeMotionProject(maximumMovlSpeed), /speed is outside/);

const invalidDelay = structuredClone(fullProject);
invalidDelay.robots[0].steps[2].delaySeconds = 0;
assert.throws(() => normalizeMotionProject(invalidDelay), /delay is outside/);

const duplicateSteps = structuredClone(fullProject);
duplicateSteps.robots[0].steps[1].id = duplicateSteps.robots[0].steps[0].id;
assert.throws(() => normalizeMotionProject(duplicateSteps), /Duplicate step id/);

const duplicatePoints = structuredClone(fullProject);
duplicatePoints.robots[0].steps[1].pointIndex = duplicatePoints.robots[0].steps[0].pointIndex;
assert.throws(() => normalizeMotionProject(duplicatePoints), /Duplicate point index/);

const invalidPointLabel = structuredClone(fullProject);
invalidPointLabel.robots[0].steps[0].label = '1-invalid';
assert.throws(() => normalizeMotionProject(invalidPointLabel), /label must start with a letter/);

const invalidTcpCount = structuredClone(fullProject);
invalidTcpCount.robots[0].tcpProfiles = [];
assert.throws(() => normalizeMotionProject(invalidTcpCount), /TCP profiles must contain exactly 3 entries/);

const invalidActiveTcp = structuredClone(configuredTcpProject);
invalidActiveTcp.robots[0].activeTcpProfileIndex = 3;
assert.throws(() => normalizeMotionProject(invalidActiveTcp), /active TCP index is invalid/);

[
    'program-panel',
    'program-robot-list',
    'program-step-list',
    'program-add-delay',
    'program-add-time-start',
    'program-add-time-out',
    'program-cycle-time',
    'program-step-robot',
    'program-run-robot',
    'program-repeat-robot',
    'program-reverse-repeat-robot',
    'program-step-group',
    'program-run-group',
    'program-repeat',
    'program-reverse-repeat',
    'program-import-file'
].forEach((id) => assert.match(htmlSource, new RegExp(`id=["']${id}["']`)));
[
    'tcp-profile-manager',
    'tcp-profile-editor',
    'tcp-profile-panel',
    'tcp-launcher-label',
    'model-context-menu',
    'model-copy',
    'model-paste',
    'model-change-color',
    'model-color-picker',
    'model-delete',
    'btn-apply-tcp-profile',
    'btn-reset-tcp-profile',
    'tcp-snap-type',
    'tcp-snap-radius',
    'btn-tcp-snap',
    'tcp-snap-readout',
    'tcp-multi-center-controls',
    'btn-toggle-outline'
].forEach((id) => assert.match(htmlSource, new RegExp(`id=["']${id}["']`)));
assert.equal((htmlSource.match(/data-tcp-profile=/g) || []).length, 3, 'Viewer must expose exactly three TCP slots.');
assert.ok(mainSource.includes('function applyImportedModelColor(')
    && mainSource.includes('findImportedModelPart(partId)')
    && mainSource.includes('modelColorPicker?.addEventListener'), 'Imported model and part colors must be editable from the model tree context menu.');
const modelContextMenuSource = htmlSource.slice(
    htmlSource.indexOf('<div id="model-context-menu"'),
    htmlSource.indexOf('<footer id="stats-bar"')
);
const modelContextMenuOrder = [
    'id="model-copy"',
    'id="model-paste"',
    'id="model-change-zero-point"',
    'id="model-change-color"',
    'id="model-delete"'
].map((marker) => modelContextMenuSource.indexOf(marker));
assert.ok(
    modelContextMenuOrder.every((index) => index >= 0)
        && modelContextMenuOrder.every((index, position) => position === 0 || modelContextMenuOrder[position - 1] < index),
    'The model context menu must order Copy, Paste, zero-point, color and Delete commands.'
);
assert.match(modelContextMenuSource, /id="model-copy"[^>]*>[\s\S]*?fa-copy/, 'Model Copy must expose its copy icon.');
assert.match(modelContextMenuSource, /id="model-paste"[^>]*disabled[^>]*>[\s\S]*?fa-paste/, 'Model Paste must start disabled and expose its paste icon.');
assert.match(modelContextMenuSource, /id="model-delete"[^>]*class="model-context-danger"[^>]*>[\s\S]*?fa-trash/, 'Model Delete must use the destructive command style and trash icon.');
assert.match(
    cssSource,
    /\.program-step-context-menu\s+\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/,
    'Hidden model context commands must stay hidden even when menu controls use flex layouts.'
);
assert.ok(
    mainSource.includes('modelClipboard: null')
        && mainSource.includes("modelCopy: document.getElementById('model-copy')")
        && mainSource.includes("modelPaste: document.getElementById('model-paste')")
        && mainSource.includes("modelDelete: document.getElementById('model-delete')")
        && mainSource.includes("modelChangeColor: document.getElementById('model-change-color')"),
    'The viewer must retain a session model clipboard and bind all structural menu controls.'
);
assert.ok(
    mainSource.includes("el.modelCopy?.addEventListener('click', copyModelContextTarget)")
        && mainSource.includes("el.modelPaste?.addEventListener('click'")
        && mainSource.includes('void pasteModelClipboard();')
        && mainSource.includes("el.modelDelete?.addEventListener('click'")
        && mainSource.includes('deleteSelectedModel();'),
    'Copy, Paste and Delete menu commands must be connected to their scene operations.'
);
const modelTreeContextEventSource = mainSource.slice(
    mainSource.indexOf("el.modelTree?.addEventListener('contextmenu'"),
    mainSource.indexOf("el.modelCopy?.addEventListener('click'")
);
assert.ok(
    modelTreeContextEventSource.includes("event.target.closest('[data-model-part-id]')")
        && modelTreeContextEventSource.includes("event.target.closest('[data-model-tree-id]')")
        && modelTreeContextEventSource.indexOf('event.preventDefault();')
            < modelTreeContextEventSource.indexOf('if (isMotionActive())')
        && modelTreeContextEventSource.includes('if (!model) return;')
        && !modelTreeContextEventSource.includes('model.userData.uploaded')
        && modelTreeContextEventSource.includes('openModelContextMenu(event, model, partMatch?.part || null);'),
    'Right-click must reach every model root while preserving imported-part targeting.'
);
assert.ok(
    mainSource.includes('row.dataset.modelTreeId = treeId;')
        && mainSource.includes('row.dataset.modelPartId = part.userData.modelPartId;'),
    'The full model and part row hitboxes, including root toggles, must resolve their context-menu targets.'
);
const openModelContextMenuSource = mainSource.slice(
    mainSource.indexOf('function openModelContextMenu('),
    mainSource.indexOf('function closeModelContextMenu(')
);
assert.ok(
    openModelContextMenuSource.includes('const structuralActionsHidden = Boolean(part);')
        && openModelContextMenuSource.includes('[el.modelCopy, el.modelPaste, el.modelDelete].forEach((control) =>')
        && openModelContextMenuSource.includes('control.hidden = structuralActionsHidden;')
        && openModelContextMenuSource.includes('el.modelPaste.disabled = state.modelClipboardPastePending || !state.modelClipboard')
        && openModelContextMenuSource.includes('el.modelChangeColor.hidden = !uploaded'),
    'Imported parts must retain their color command but hide model-level Copy, Paste and Delete actions.'
);
const copyModelContextSource = mainSource.slice(
    mainSource.indexOf('function copyModelContextTarget('),
    mainSource.indexOf('function beginModelClipboardPasteMutation(')
);
assert.ok(
    copyModelContextSource.includes('target.part')
        && copyModelContextSource.includes('state.modelClipboard = snapshot;'),
    'Copy must reject imported parts and replace the session clipboard only with a model-root snapshot.'
);
const clipboardCloneSource = mainSource.slice(
    mainSource.indexOf('function cloneClipboardMaterial('),
    mainSource.indexOf('function captureClipboardTransform(')
);
assert.ok(
    mainSource.includes("import { clone as cloneObjectWithSkeletons } from 'three/addons/utils/SkeletonUtils.js';")
        && clipboardCloneSource.includes('record.object.isSkinnedMesh')
        && clipboardCloneSource.includes('clone = cloneObjectWithSkeletons(source);')
        && clipboardCloneSource.includes('clone = source.clone(true);')
        && clipboardCloneSource.includes('sourceMaterials.map(cloneClipboardMaterial)')
        && clipboardCloneSource.includes('state.collision.highlightedMaterials.get(material)')
        && clipboardCloneSource.includes('clonedMaterial.color.copy(collisionSnapshot.color)')
        && clipboardCloneSource.includes('object.userData?.simulationSnapFaceOverlay')
        && clipboardCloneSource.includes('object.userData?.collisionDebugMesh')
        && clipboardCloneSource.includes('delete clonedObject.userData.modelTreeId;')
        && clipboardCloneSource.includes('delete clonedObject.userData.modelPartId;')
        && clipboardCloneSource.includes('delete clonedObject.userData.attachmentHost;'),
    'Clipboard templates must clone stable hierarchy/material state without retaining transient visuals, scene identity or attachment references.'
);
assert.ok(
    clipboardCloneSource.includes('function assignClipboardModelTreeIds(')
        && clipboardCloneSource.includes('delete model.userData.modelTreeId;')
        && clipboardCloneSource.includes('ensureModelTreeId(model);')
        && clipboardCloneSource.includes('state.modelPartIdCounter += 1;')
        && clipboardCloneSource.includes('part.userData.modelPartId = `scene-model-part-${state.modelPartIdCounter}`;'),
    'Every pasted root and imported part must receive a fresh model-tree identity.'
);
const robotClipboardPasteSource = mainSource.slice(
    mainSource.indexOf('async function pasteRobotClipboardSnapshot('),
    mainSource.indexOf('async function pasteModelClipboard(')
);
assert.ok(
    robotClipboardPasteSource.includes('await loadArticulatedRobot(snapshot.modelDefinition')
        && robotClipboardPasteSource.includes('assignRobotInstanceMetadata(robot, snapshot.modelDefinition);')
        && robotClipboardPasteSource.includes('restoreRobotTcpProfiles(robot, snapshot.tcpProfiles, snapshot.activeTcpProfileIndex);')
        && robotClipboardPasteSource.includes('state.motionPrograms.set(robot.userData.motionInstanceId, cloneMotionProgram(snapshot.program));'),
    'Robot Paste must rebuild an independent articulated instance with fresh metadata, TCP profiles and a copied program.'
);
assert.ok(
    mainSource.includes('const MODEL_CLIPBOARD_TOOL_PASTE_OFFSET_Y = 100;')
        && mainSource.includes('MODEL_CLIPBOARD_TOOL_PASTE_OFFSET_Y * pasteNumber'),
    'Repeated Tool Paste must use a visible local offset instead of stacking collision roots at the same flange pose.'
);
const snapshotApplySource = mainSource.slice(
    mainSource.indexOf('function applySceneSnapshot('),
    mainSource.indexOf('function recordHistory(')
);
const clipboardRollbackSource = mainSource.slice(
    mainSource.indexOf('function rollbackModelClipboardPaste('),
    mainSource.indexOf('function pasteObjectClipboardSnapshot(')
);
assert.ok(
    snapshotApplySource.includes('disposeCollisionDebugForModel(model);')
        && clipboardRollbackSource.includes('disposeCollisionDebugForModel(model);')
        && clipboardRollbackSource.includes('disposeObjectResources(addedModels[0]);')
        && mainSource.includes('{ disposeRootResources: Boolean(robot) }'),
    'Undo/Redo removal and failed Paste rollback must release collision-debug references and owned robot resources.'
);
assert.ok(
    mainSource.includes("recordHistory('모델 붙여넣기', historyBefore, captureSceneSnapshot())"),
    'Model Paste must create one undoable scene-history entry.'
);
  const tcpSnapSelector = htmlSource.match(/<select id="tcp-snap-type">[\s\S]*?<\/select>/)?.[0] || '';
  assert.equal((tcpSnapSelector.match(/<option value="(?:auto|vertex|endpoint|edge-midpoint|circle-center|rectangle-center|multi-point-center)"/g) || []).length, 7, 'TCP snap type selector must expose the supported CAD snap types.');
assert.equal((htmlSource.match(/data-panel-toggle="tcp-profile-panel"/g) || []).length, 1, 'Viewer must expose one TCP panel launcher.');
assert.ok(htmlSource.indexOf('id="btn-toggle-outline"') < htmlSource.indexOf('id="btn-reset-view"'), 'The outline toggle must be placed before the view reset button.');
assert.equal((htmlSource.match(/data-tcp-preview-axis=/g) || []).length, 0, 'Viewer must not expose TCP preview rulers.');
const htmlIds = [...htmlSource.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, 'HTML ids must be unique.');
const programControlRows = [...htmlSource.matchAll(/<div[^>]*class="program-control-row(?: program-group-row)?"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((match) => [...match[1].matchAll(/<button id="([^"]+)"/g)]
        .map((button) => button[1])
        .filter((id) => id !== 'program-work-origin-robot'));
assert.deepEqual(programControlRows, [
    ['program-step-robot', 'program-run-robot', 'program-pause-robot', 'program-stop-robot', 'program-repeat-robot', 'program-reverse-repeat-robot'],
    ['program-step-group', 'program-run-group', 'program-pause-group', 'program-stop-group', 'program-repeat', 'program-reverse-repeat']
], 'Current and checked robot rows must share the Step Into, play, pause, stop, repeat and reverse-repeat layout.');
[
    'function updateMotionSessions(',
    'function preflightRobotMotion(',
    'function preflightActiveReverseRepeatSessions(',
    'function addDelayMotionStep(',
    'function addTimerMotionStep(',
    'function restoreMotionProjectData(',
    'function finalizeMotionHistoryIfIdle(',
    'function syncTcpVisualAtPose(',
    'function syncActiveTcpFrame(',
    'function selectTcpProfile(',
    'function applyTcpProfileEditor(',
    'function updateTcpProfileLive(',
    'function setModelOutlineMode(',
    'function syncModelOutlines(',
    'new THREE.EdgesGeometry(',
    'new THREE.LineSegments(',
    'function toggleTcpSnapMode(',
    'function applyTcpSnapPoint(',
    'function handleTcpSnapSelection(',
    'tcpSnapRadiusPx',
    'tcpSnapType',
    'tcpLiveProfile',
    'tcpProfiles: serializeRobotTcpProfiles(robot)',
    'activeTcpProfileIndex: robot.userData.activeTcpProfileIndex',
    'function updateCameraScaledTcpAxes()',
    'tcpFrame.add(toolAxesAtTcp)',
    'robot.userData.toolAxesAtTcp = toolAxesAtTcp',
    'maxSpeed: jointSpeeds[index]',
    'maxDeceleration: jointDecelerations[index]',
    'cartesianMotion: normalizedCartesianMotion',
    'Robot joint speeds are invalid for',
    'if (robot !== state.activeArticulatedModel) return;',
    'function resumePausedRobotMotions(',
    'function createStepIntoPlan(',
    'function stepIntoActiveRobot(',
    'function stepIntoCheckedRobots(',
    'stepIntoStepId: step.id',
    'repeat: false',
    'reverseRepeat: false',
    "controlScope: 'robot'",
    "controlScope: 'group'",
    'repeatCurrentRobot: state.motionRepeatRobot',
    'reverseRepeatCurrentRobot: state.motionReverseRepeatRobot',
    'advanceMotionCursor({',
    'getDirectionalTimerActions(step.motion, {',
    'program.selectedStepId = program.steps[nextIndex].id',
    'if (robot && resumePausedRobotMotions([robot])) return;',
    'if (resumePausedRobotMotions(robots)) return;',
    'const startAt = performance.now() + 40',
    'slerpQuaternion(',
    'sCurveProgress(linearProgress)',
    'duration: motionDuration + MOTION_SETTLING_DELAY_SECONDS * 1000',
    'return elapsed >= segment.duration',
    "if (step.motion === 'DELAY')",
    "type: 'DELAY'",
    'timerActions,',
    'duration: calculateDelayDuration(step.delaySeconds) * 1000',
    'delaySeconds: step.delaySeconds',
    'robot.userData.manifest.cartesianMotion.maxSpeed',
    "segment.type === 'TIME_START' || segment.type === 'TIME_OUT'",
    'program.lastCycleTimeSeconds.toFixed(3)',
    'program.cycleTimerStartedAt += delay',
    'session.nextSegmentStartAt += delay',
    'calculateCycleElapsedSeconds(program.cycleTimerStartedAt, markerTime)',
    'function updateCycleTimeReadout(',
    'updateCycleTimeReadout(timestamp)',
    'MAX_MOTION_TRANSITIONS_PER_FRAME',
    'session.segment = createMotionSegment(session, session.nextSegmentStartAt)',
    'completedSegment.startTime + completedSegment.duration',
    'const markerTime = segment.startTime',
    'window.showSaveFilePicker({',
    'await fileHandle.createWritable()',
    "startIn: 'documents'"
].forEach((marker) => assert.ok(mainSource.includes(marker), `Missing integration marker: ${marker}`));
assert.ok(!mainSource.includes('updateRobotCollisions'), 'Approximate robot collision checks must remain removed.');
assert.ok(!mainSource.includes('prepareRobotCollisionParts'), 'Robot links must not create box collision volumes.');
assert.ok(!mainSource.includes('collisionHelpers'), 'Collision warning boxes must remain removed.');
assert.doesNotMatch(motionCoreSource, /SIMULATION_MOTION_DURATION_SCALE|MOVJ_EASING_PEAK_SLOPE/, 'The former fixed motion-time correction must stay removed.');
assert.match(motionCoreSource, /t \* t \* t \* \(10 \+ t \* \(-15 \+ 6 \* t\)\)/, 'Motion interpolation must use the fifth-order S-curve.');
assert.ok(mainSource.includes('maxAcceleration: jointAccelerations[index]'), 'Robot manifests must expose per-axis acceleration limits.');
assert.ok(mainSource.includes('maxDeceleration: jointDecelerations[index]'), 'Robot manifests must expose per-axis deceleration limits.');
assert.ok(mainSource.includes('robot.userData.manifest.cartesianMotion'), 'MOVL must use the selected robot Cartesian limits.');
assert.match(htmlSource, /main\.js\?v=[^"'\s]+/, 'Viewer cache token must load the current simulation bundle.');
assert.ok(htmlSource.includes('id="btn-fullscreen-mode"'), 'Viewer must expose the fullscreen UI mode button.');
assert.ok(mainSource.includes('function setFullscreenUiMode(enabled)') && mainSource.includes('function handleFullscreenUiPointerMove(event)'), 'Fullscreen UI mode must hide and reveal bars from pointer proximity.');
assert.ok(mainSource.includes("revealFullscreenBar('top')") && mainSource.includes("revealFullscreenBar('bottom')"), 'Fullscreen UI mode must reveal the top and bottom bars independently.');
assert.ok(mainSource.includes('function attachPendingToolModels(robot)')
    && mainSource.includes('const mountFrame = getRobotToolMountFrame(robot)')
    && mainSource.includes('model.userData.pendingToolAttachment'),
'Tool-attached 3D models must transfer to a replacement robot flange.');
assert.ok(mainSource.includes('function mountToolModelAtActiveTcp(robot, model)')
    && mainSource.includes('if (mountFrame !== tcpFrame) mountFrame.attach(model)')
    && mainSource.includes("model.userData.attachmentFrame = 'flange'"),
'Imported tools must align to the active TCP once and remain physically attached to the flange.');
const tcpProfileSyncSource = mainSource.slice(
    mainSource.indexOf('function syncActiveTcpFrame('),
    mainSource.indexOf('function restoreRobotTcpProfiles(')
);
assert.ok(tcpProfileSyncSource.includes('tcpFrame.position.copy(profile.position)')
    && !tcpProfileSyncSource.includes('attachmentHost'),
'Changing a TCP profile must move only the TCP frame, not attached tool models.');
assert.match(mainSource, /else if \(positionEntry\) \{\s*model\.position\[axis\] = value;/, 'Numeric model editing must change only the edited position axis.');
assert.ok(mainSource.includes("const isScaleMode = state.transformControls?.mode === 'scale';") && mainSource.includes("model.scale[axis] = value;"), 'Scale mode must use the numeric X/Y/Z inputs as scale multipliers.');
assert.ok(mainSource.includes('function toggleSelectedTransformMode(mode)') && mainSource.includes('setTransformHandlesEnabled(true);'), 'Selecting a transform mode must reveal its transform handles.');
assert.ok(mainSource.includes('state.transformControls.enabled && state.transformControls.mode === mode') && mainSource.includes('setTransformHandlesEnabled(false);'), 'Selecting the active transform mode must hide its transform handles.');
assert.doesNotMatch(htmlSource, /id="btn-toggle-transform"/, 'The Model Tree panel must not contain a separate transform handle toggle.');
assert.doesNotMatch(mainSource, /const mode = \{ w: 'translate', e: 'rotate', r: 'scale' \}\[key\]/, 'Model transform W/E/R keyboard shortcuts must remain disabled.');
assert.ok(mainSource.includes('const PANEL_DRAG_EXCLUDED_SELECTOR') && mainSource.includes('panel.classList.add(\'panel-drag-anywhere\')'), 'Panels must support dragging from non-interactive areas.');
assert.ok(mainSource.includes('target.position[editedKey] = editedValue;') && mainSource.includes('positionTolerance: 0.001') && mainSource.includes('updateTcpPresentation(robot, target);'), 'Numeric Base JOG input must preserve other axes and use stable sub-0.01 mm precision.');
assert.ok(mainSource.includes('function jogTcpInBase(robot, kind, axisName, direction)') && mainSource.includes('const currentTarget = robot.userData.baseJogTarget;') && mainSource.includes('robot.userData.baseJogTarget = target;'), 'Base JOG buttons must preserve exact non-edited target axes.');
assert.ok(
    mainSource.includes("allRobotsIncluded ? '전체 해제' : '전체 선택'")
        && mainSource.includes('function toggleAllProgramRobots()')
        && mainSource.includes('robots.some((robot) => !ensureMotionProgram(robot).included)'),
    'The Program Panel select-all control must switch to deselect-all when every robot is included.'
);
assert.ok(mainSource.includes('BASE_JOG_GIZMO_MESH_THICKNESS = 1.55'), 'Base JOG axis meshes must remain visually thicker than TCP axes.');
assert.ok(mainSource.includes('TCP_AXES_SCREEN_PIXELS = 40')
    && mainSource.includes('updateCameraScaledTcpAxes();'), 'TCP axes must stay compact at every camera zoom level.');
assert.ok(mainSource.includes('el.snapMarker.dataset.snapType = snap.type;')
    && /\.simulation-snap-marker > span\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;/s.test(cssSource), 'Simulation snap markers must use compact CAD-style symbols.');
assert.ok(mainSource.includes('function updateSimulationSnapMarkerCameraScale()')
    && mainSource.includes('Math.sqrt(cameraDistance / referenceDistance)')
    && mainSource.includes('SNAP_MARKER_CAMERA_SCALE.min')
    && mainSource.includes('updateSimulationSnapMarkerCameraScale();'), 'Simulation snap symbols must shrink as the camera moves closer.');
assert.ok(mainSource.includes('BASE_JOG_GIZMO_STROKE_RADIUS = 0.014'), 'Base JOG line handles must use a cross-platform mesh stroke.');
assert.ok(mainSource.includes('BASE_JOG_GIZMO_ACTIVE_STROKE_RADIUS = 0.022'), 'The selected Base JOG axis must use a thicker active stroke.');
assert.ok(mainSource.includes('BASE_JOG_GIZMO_ACTIVE_COLOR_SCALE = 0.58'), 'The selected Base JOG axis must use a darker active color.');
assert.ok(mainSource.includes('emphasizeBaseJogTransformControls(controls)'), 'Base JOG controls must apply the emphasized handle treatment.');
assert.ok(mainSource.includes('function createPolylineCurve(points, closed)'), 'Rotation handles must preserve their source polyline without spline warping.');
assert.ok(!mainSource.includes('new THREE.CatmullRomCurve3(points'), 'Base JOG rotation strokes must not use spline interpolation.');
assert.ok(mainSource.includes('configureBaseJogActiveStroke(activeStroke, transformControls)'), 'Base JOG handles must render an active-axis stroke.');
assert.ok(mainSource.includes('function isNegativeBaseJogArrow(object)'), 'Base JOG controls must identify reverse arrowheads.');
assert.ok(mainSource.includes('negativeArrowHandles.forEach((arrowHandle) => arrowHandle.removeFromParent())'), 'Base JOG controls must show arrowheads only in positive directions.');
assert.ok(!mainSource.includes('rebaseEquipmentToFloorCenter'), '3D model import must not recenter the source geometry.');
assert.ok(mainSource.includes("importedModel.userData.sceneModelAnchor = 'source-origin'"), '3D model imports must record source-origin anchoring.');
assert.ok(mainSource.includes('importedModel.position.set(0, 0, 0)'), '3D model source origin must align with the scene Base origin.');
assert.ok(mainSource.includes('BASE_JOG_MAX_VISIBLE_LINE_SPAN = 10'), 'Base JOG controls must identify oversized guide lines.');
assert.ok(mainSource.includes("object.tag === 'helper' || scaledSpan > BASE_JOG_MAX_VISIBLE_LINE_SPAN"), 'Base JOG helper axes must be excluded from visible strokes.');
assert.ok(mainSource.includes('infiniteGuideHandles.forEach((guideHandle) => guideHandle.removeFromParent())'), 'Base JOG controls must remove infinite drag guides.');
assert.match(htmlSource, /style\.css\?v=[^"'\s]+/, 'Stylesheet cache token must load the current simulation styles.');
assert.match(cssSource, /body\.fullscreen-ui-mode #main-content\s*\{[^}]*top:\s*0[^}]*bottom:\s*0/s, 'Fullscreen UI mode must expand the 3D viewport.');
assert.doesNotMatch(htmlSource, /id="collision-alert"/);
assert.doesNotMatch(cssSource, /\.collision-alert\s*\{/);
assert.match(htmlSource, /id="import-dialog-title">3D 모델 가져오기 방식<\/h2>/);
assert.match(htmlSource, /<select id="import-placement"[^>]*>[\s\S]*?<option value="tcp">Tool<\/option>[\s\S]*?<option value="scene">3D 모델링<\/option>/);
assert.doesNotMatch(htmlSource, />배치 방식<\/span>/);
assert.match(cssSource, /\.import-dialog\s*\{[^}]*position:\s*fixed[^}]*top:\s*50%[^}]*left:\s*50%[^}]*margin:\s*0[^}]*transform:\s*translate\(-50%,\s*-50%\)/s);
assert.ok(mainSource.includes("sceneOption.textContent = uiText('3D 모델링')")
    && mainSource.includes("tcpOption.textContent = uiText('Tool')"), 'Import placement labels must remain Tool and 3D Model.');
assert.match(
    mainSource,
    /if \(robot === state\.activeArticulatedModel\) syncJointControls\(robot\);\r?\n\s*updateTcpPresentation\(robot\);/,
    'Every animated robot must update its TCP visual, while only the active robot updates JOG controls.'
);
assert.match(cssSource, /\.program-panel\s*\{/);
assert.match(cssSource, /\.program-panel-content\s*\{[^}]*overflow-y:\s*auto/s);
assert.doesNotMatch(cssSource, /\.program-robot-row\.collision/);
assert.match(cssSource, /\.program-step-row\.delay/);
assert.match(cssSource, /\.program-step-row\.timer/);
assert.match(cssSource, /\.program-cycle-time\s*\{/);
assert.match(cssSource, /\.program-step-list\s*\{[^}]*grid-auto-rows:\s*42px[^}]*align-content:\s*start/s, 'Program rows must not stretch when the panel is resized.');
assert.match(cssSource, /\.program-step-row\s*\{[^}]*height:\s*42px[^}]*min-height:\s*42px[^}]*max-height:\s*42px/s, 'Every program command row must keep a fixed height.');
assert.ok(mainSource.includes("const row = event.target.closest('[data-program-step-id]')"), 'Program command selection must use the full row hit box.');
assert.ok(mainSource.includes('program.selectedStepId = row.dataset.programStepId'), 'Clicking a program row must select that command.');
assert.ok(
    mainSource.includes("el.olpPointTable?.addEventListener('contextmenu', handleOlpPointContextMenu)")
        && mainSource.includes("el.olpPointTable?.addEventListener('keydown', handleOlpPointTableActivate)")
        && !mainSource.includes("el.olpPointTable?.addEventListener('click', handleOlpPointTableActivate)"),
    'OLP point actions must open from right-click or keyboard activation, never from left-click.'
);
assert.match(htmlSource, /id="program-step-list"[^>]*data-panel-drag-ignore/, 'The program command list must never initiate panel dragging.');
assert.ok(mainSource.includes('function insertMotionStepAfterSelected(program, step)'), 'New commands must be inserted relative to the selected row.');
assert.ok(
    mainSource.includes("addEventListener('dragstart', handleProgramStepDragStart)")
        && mainSource.includes("addEventListener('dragover', handleProgramStepDragOver)")
        && mainSource.includes("addEventListener('drop', handleProgramStepDrop)")
        && mainSource.includes('reorderMotionSteps(program?.steps, sourceStepId, target.stepId, target.placeAfter)'),
    'Program commands must support drag-and-drop reordering.'
);
assert.match(cssSource, /\.program-step-drag-handle\s*\{[^}]*cursor:\s*grab/s, 'Program rows must expose a visible drag handle.');
assert.match(cssSource, /\.program-step-row\.drag-over-before::before/s, 'Program rows must show the drag insertion position.');
assert.ok(
    mainSource.includes("['MOVJ', 'MovJ']")
        && mainSource.includes("['MOVL', 'MovL']")
        && mainSource.includes("['DELAY', 'Delay']")
        && mainSource.includes("['TIME_START', 'T.Start']")
        && mainSource.includes("['TIME_OUT', 'T.Out']"),
    'Program rows must use the requested command capitalization.'
);
assert.doesNotMatch(htmlSource, /id="program-step-(?:up|down)"/, 'Drag reordering must replace the Program Panel up/down buttons.');
assert.ok(!mainSource.includes('btnProgramUp:') && !mainSource.includes('btnProgramDown:'), 'Removed Program Panel arrows must not retain handlers.');
assert.match(mainSource, /pointIndexInput\.type = 'number';[\s\S]*?pointIndexInput\.dataset\.programStepPointIndex = step\.id;/, 'Only the numeric value inside P[n] may be edited.');
assert.ok(mainSource.includes("recordHistory('프로그램 포인트 번호 변경'")
    && mainSource.includes("recordHistory('프로그램 포인트 라벨 변경'"), 'Program point number and label changes must be undoable.');
assert.match(cssSource, /\.program-step-select\s*\{[^}]*flex:\s*0 0 48px[^}]*min-width:\s*48px/s, 'Program point references must use the compact width.');
assert.match(cssSource, /\.program-point-index\s*\{[^}]*gap:\s*0[^}]*padding:\s*0/s, 'P[n] references must not add internal padding.');
assert.match(cssSource, /\.program-step-label\s*\{[^}]*flex:\s*0 1 82px[^}]*width:\s*82px/s, 'Program point labels must fit the default panel width.');
assert.ok(!mainSource.includes('program-step-pose') && !cssSource.includes('.program-step-pose'), 'Program rows must not display TCP coordinates.');
assert.match(cssSource, /\.program-step-speed\s*\{[^}]*width:\s*42px/s, 'Program speed inputs must use the compact width.');
assert.ok(htmlSource.includes('id="btn-position-export"') && htmlSource.includes('id="btn-snap-move"'), 'The simulation must expose position export and Mode D snap movement.');
assert.ok(htmlSource.includes('id="program-step-context-menu"')
    && htmlSource.includes('id="program-show-position-value"')
    && htmlSource.includes('id="position-value-dialog"'), 'Movement points must expose the position-value context dialog.');
assert.equal((htmlSource.match(/data-position-arm=/g) || []).length, 4, 'The position dialog must expose four arm parameters.');
assert.equal((htmlSource.match(/data-position-external=/g) || []).length, 6, 'The position dialog must expose six external axes.');
assert.ok(mainSource.includes("import { buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs")
    && mainSource.includes('function moveRobotTcpToSimulationSnap(snap)')
    && mainSource.includes('position: robot.worldToLocal(snap.worldPoint.clone())')
    && mainSource.includes('positionTolerance: 0.001'), 'Simulation snap movement must reuse Mode D candidates and solve the selected point in robot Base coordinates.');
assert.ok(mainSource.includes('formatPositionPointRecordLine({')
    && mainSource.includes("async function saveStandalonePFile(content, suggestedName = 'P.pts')")
    && mainSource.includes('saveAs(blob, suggestedName)'), 'Position export must use the verified record formatter and a browser-compatible fallback download.');
assert.match(htmlSource, /id="btn-import-3d"[^>]*>[\s\S]*?<span>3D<\/span>[\s\S]*?fa-upload/, 'The 3D import button must show a 3D upload tray icon.');
assert.match(htmlSource, /program-file-row[\s\S]*?id="program-import"[\s\S]*?id="program-export"[\s\S]*?id="btn-position-export"/, 'Program files must provide load, save, and point export controls in order.');
assert.ok(
    htmlSource.indexOf('id="btn-position-export"') > htmlSource.indexOf('id="program-export"'),
    'Position export must not remain in the top toolbar.'
);
assert.match(htmlSource, /id="btn-download-cad"[^>]*>[\s\S]*?<span>CAD<\/span>[\s\S]*?fa-download/, 'CAD download must use a labeled download tray icon.');
assert.match(htmlSource, /jog-mode-tabs[\s\S]*?id="btn-jog-joint-mode"[\s\S]*?id="btn-jog-base-mode"[\s\S]*?id="btn-snap-move"/, 'JOG must group Joint, Base, and Snap Move controls.');
assert.match(htmlSource, /id="program-update-step"[^>]*>[\s\S]*?program-point-overwrite-mark[\s\S]*?fa-rotate/, 'Position overwrite must use the P refresh icon.');
assert.ok(mainSource.includes('const available = !isMotionActive();') && !mainSource.includes('if (!getSimulationSnapModels().length)'), 'Snap Move must be activatable without a selected robot or imported 3D model.');
assert.ok(mainSource.includes('const baseSeedOffset = polarDelta * jointDirection;') && mainSource.includes('const baseSeedOffsets = ['), 'IK must add J1-oriented seeds for targets that require base rotation.');
assert.ok(mainSource.includes('const IK_MAX_ITERATIONS = 320;')
    && mainSource.includes('const IK_MIN_DAMPING = 0.00001;')
    && mainSource.includes('function calculateIkDamping(')
    && mainSource.includes('normal[index][index] += damping * damping;'), 'IK must reduce damping near precise singular targets instead of rejecting them.');
assert.ok(mainSource.includes('const singularityEscapeSeeds = joints.length >= 6')
    && mainSource.includes('[[1, 5], [2, -5]]')
    && mainSource.includes('[[3, 12], [5, -12]]'), 'IK must seed both arm and wrist configurations so it can enter and leave singular poses.');
assert.ok(!mainSource.includes('near a singularity') && !mainSource.includes('특이점에 가깝습니다'), 'Reachable singular poses must not be reported as errors.');
assert.ok(mainSource.includes('function showProgramPointOverwriteFeedback(step)') && mainSource.includes("icon?.classList.replace('fa-rotate', 'fa-check')"), 'Point overwrite must provide a successful completion indicator.');
assert.ok(mainSource.includes('function clearJogModeSelectionForSnap()') && mainSource.includes('clearJogModeSelectionForSnap();'), 'Snap Move must behave as a mutually exclusive JOG mode.');
assert.ok(mainSource.includes('}, 700);'), 'Point overwrite completion feedback must clear quickly.');
assert.match(htmlSource, /data-position-value="a"[^>]*><small>deg<\/small><\/label>\s*<label><span>B<\/span><input[^>]*data-position-value="b"[^>]*><small>deg<\/small><\/label>\s*<label><span>C<\/span><input[^>]*data-position-value="c"/, 'Point rotation values must be ordered A/B/C.');
assert.ok(mainSource.includes('a: rotation.rz') && mainSource.includes('c: rotation.rx') && mainSource.includes('quaternionFromPointRotation(robot, values.c, values.b, values.a)'), 'Point rotation editing must map A/B/C to Rz/Ry/Rx.');
assert.match(mainSource, /coordinates:\s*\[\s*pose\.position\.x,\s*pose\.position\.y,\s*pose\.position\.z,\s*rotation\.rz,\s*rotation\.ry,\s*rotation\.rx/s, 'Point export must use X/Y/Z/A/B/C order.');
assert.match(htmlSource, /data-base-rotation-row="z"[\s\S]*?data-base-rotation-row="y"[\s\S]*?data-base-rotation-row="x"/, 'Base JOG rotations must be ordered RZ, RY, RX.');
assert.ok(mainSource.includes('const SIX_AXIS_POSITION_HOME_QUATERNION')
    && mainSource.includes("new THREE.Euler(-Math.PI, -Math.PI / 2, 0, 'ZYX')")
    && mainSource.includes("setFromQuaternion(positionRotation, 'ZYX')")
    && /THREE\.MathUtils\.degToRad\(rx\),\s*THREE\.MathUtils\.degToRad\(ry\),\s*THREE\.MathUtils\.degToRad\(rz\),\s*'ZYX'/s.test(mainSource), 'Six-axis position values must use 3-2-1 (RZ-RY-RX) Euler angles.');
assert.ok(!mainSource.includes('usesNegativeJ5RotationBranch'), '3-2-1 Euler conversion must determine the J5 branch without a manual sign override.');
assert.ok(
    mainSource.includes("insertBefore(programButton, tcpButton || virtualButton || divider)"),
    'The Program launcher must be inserted before the existing TCP/Virtual launcher group.'
);
const preflightSource = mainSource.slice(
    mainSource.indexOf('function preflightRobotMotion('),
    mainSource.indexOf('function createMotionSession(')
);
assert.ok(preflightSource.includes("if (step.motion === 'DELAY')") && preflightSource.includes('return;'), 'DELAY preflight must not run robot IK.');
assert.ok(preflightSource.includes('const validateTimerAction = (action, step) =>')
    && preflightSource.includes("if (action === 'TIME_START')")
    && preflightSource.includes("if (action === 'TIME_OUT')")
    && preflightSource.includes('getDirectionalTimerActions(step.motion, {')
    && preflightSource.includes('timerActions.forEach((action) => validateTimerAction(action, step))')
    && preflightSource.includes('TIME START must run before TIME OUT'), 'Directional TIME OUT must require an active TIME START marker.');
assert.ok(
    preflightSource.includes('{ reverseRepeat = false, timerOnly = false }')
        && preflightSource.includes('if (timerOnly) return;')
        && preflightSource.includes('if (originalAngles) restoreRobotJointAngles(robot, originalAngles);'),
    'Timer-only live validation must skip kinematics and avoid touching the current robot pose.'
);
assert.ok(
    mainSource.includes('plans.forEach(({ robot, steps, reverseRepeat }) => preflightRobotMotion(robot, steps, { reverseRepeat }));'),
    'Starting a reverse-repeat program must retain full timer and kinematics preflight.'
);
assert.ok(cssSource.includes('width: min(340px, calc(100% - 32px))'), 'Program Panel compact width must remain 340px.');
assert.match(cssSource, /\.program-panel\s*\{[^}]*top:\s*0[^}]*left:\s*320px[^}]*transform:\s*none/s, 'Program Panel must initially appear beside the model tree.');
assert.ok(htmlSource.includes('id="program-repeat" class="program-repeat-toggle"'), 'Repeat must be an icon toggle button.');
assert.ok(htmlSource.includes('id="program-repeat-robot" class="program-repeat-toggle"'), 'Current robot repeat must be an icon toggle button.');
assert.ok(htmlSource.includes('id="program-reverse-repeat" class="program-repeat-toggle"'), 'Reverse repeat must be an icon toggle button.');
assert.ok(htmlSource.includes('id="program-reverse-repeat-robot" class="program-repeat-toggle"'), 'Current robot reverse repeat must be an icon toggle button.');
assert.equal((htmlSource.match(/data-program-repeat(?=[\s>])/g) || []).length, 2, 'Both playback rows must expose a repeat control.');
assert.equal((htmlSource.match(/data-program-reverse-repeat(?=[\s>])/g) || []).length, 2, 'Both playback rows must expose a reverse-repeat control.');
assert.match(htmlSource, /id="program-repeat-robot"[^>]*data-program-repeat-scope="robot"/);
assert.match(htmlSource, /id="program-repeat"[^>]*data-program-repeat-scope="group"/);
assert.match(htmlSource, /id="program-reverse-repeat-robot"[^>]*data-program-repeat-scope="robot"/);
assert.match(htmlSource, /id="program-reverse-repeat"[^>]*data-program-repeat-scope="group"/);
assert.ok(
    mainSource.includes("button.setAttribute('aria-label', uiText(reverse")
        && mainSource.includes("robotScope ? '현재 로봇 역순 반복' : '체크 로봇 역순 반복'")
        && mainSource.includes("robotScope ? '현재 로봇 반복 실행' : '체크 로봇 반복 실행'"),
    'Repeat controls must refresh localized accessible names when the language changes.'
);
assert.ok(!htmlSource.includes('<input id="program-repeat"'), 'Repeat must not use a checkbox.');
assert.ok(
    mainSource.includes('state[repeatStateKey] = reverse ? false : enabled;')
        && mainSource.includes('state[reverseStateKey] = reverse ? enabled : false;')
        && mainSource.includes('session.reverseRepeat = state[reverseStateKey];'),
    'Repeat and reverse repeat must remain mutually exclusive, including active sessions.'
);
const repeatToggleSource = mainSource.slice(
    mainSource.indexOf('function preflightActiveReverseRepeatSessions('),
    mainSource.indexOf('function syncMotionRepeatControl(')
);
assert.ok(
    repeatToggleSource.includes('.filter((session) => !session.stepIntoStepId && session.controlScope === scope)')
        && repeatToggleSource.includes('preflightRobotMotion(session.robot, session.steps, {')
        && repeatToggleSource.includes('reverseRepeat: true,')
        && repeatToggleSource.includes('timerOnly: true'),
    'Enabling reverse repeat during playback must timer-preflight every matching non-StepInto session.'
);
assert.ok(
    repeatToggleSource.includes('if (reverse && enabled)')
        && repeatToggleSource.includes('catch (error)')
        && repeatToggleSource.includes("setMotionProgramStatus('모션 경로 검증에 실패했습니다.', 'error')")
        && repeatToggleSource.indexOf('preflightActiveReverseRepeatSessions(scope);')
            < repeatToggleSource.indexOf('state[repeatStateKey] = reverse ? false : enabled;')
        && repeatToggleSource.indexOf('return;', repeatToggleSource.indexOf('catch (error)'))
            < repeatToggleSource.indexOf('state[repeatStateKey] = reverse ? false : enabled;'),
    'A failed live reverse-repeat preflight must return before changing toggle or session state.'
);
assert.ok(!htmlSource.includes('id="program-run-step"'), 'The old selected-row run control must be replaced by Step Into.');
assert.ok(!htmlSource.includes('fa-play"></i> 동시 시작'), 'Group play must use the compact icon-only button.');
assert.ok(
    mainSource.includes("button:not([data-panel-action]), input")
        && mainSource.includes("querySelectorAll('[data-panel-action]')"),
    'Panel window controls must remain available while motion editing is locked.'
);
assert.ok(!htmlSource.includes('id="program-panel-resize"'), 'Panel resizing must not require a header button.');
assert.ok(mainSource.includes('function makePanelEdgeResizable('), 'Panels must support classic edge resizing.');
assert.ok(mainSource.includes('[el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.viewPresetsPanel, el.interferenceZonePanel, el.programPanel, el.viewWindow].forEach(makePanelEdgeResizable)'), 'Model, JOG, Virtual Controller, Saved Views, Interference, View Window and Program panels must all use edge resizing.');
assert.ok(mainSource.includes("'model-browser-panel': { width: 260, height: 220 }")
    && mainSource.includes("'jog-panel': { width: 250, height: 300 }")
    && mainSource.includes("'virtual-controller-panel': { width: 250, height: 230 }")
    && mainSource.includes("'program-panel': { width: 300, height: 320 }"), 'Resizable panels must preserve usable minimum sizes.');
assert.ok(mainSource.includes("dataset.userResized === 'true'"), 'Resized panels must be constrained after viewport changes.');
assert.match(cssSource, /\.panel-edge-resizable:is\(\[data-resize-edge="e"\], \[data-resize-edge="w"\]\)[^{]*\{[^}]*cursor:\s*ew-resize/s);
assert.match(cssSource, /\.panel-edge-resizable:is\(\[data-resize-edge="n"\], \[data-resize-edge="s"\]\)[^{]*\{[^}]*cursor:\s*ns-resize/s);

console.log(`Motion program core OK: ${models.length} robots (${scaraCount} SCARA, ${sixAxisCount} six-axis), MOVJ/MOVL/DELAY timing, forward/reverse-repeat cursors, directional cycle timers, four-robot numerical stress, JSON round trip and schema checks`);
