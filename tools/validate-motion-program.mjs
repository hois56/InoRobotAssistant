import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    MOTION_PROJECT_SCHEMA_VERSION,
    MOVJ_EASING_PEAK_SLOPE,
    MAX_MOVL_SPEED,
    DEFAULT_DELAY_SECONDS,
    MIN_DELAY_SECONDS,
    MAX_DELAY_SECONDS,
    smoothstep,
    interpolateLinearPosition,
    slerpQuaternion,
    calculateMovjDuration,
    calculateMovlDuration,
    calculateDelayDuration,
    calculateCycleElapsedSeconds,
    cloneMotionProgram,
    normalizeMotionProject
} from '../2_3DSimulation/motion-program-core.mjs';
import {
    aabbOverlapDepth,
    hasMeaningfulAabbOverlap
} from '../2_3DSimulation/collision-core.mjs';

const closeTo = (actual, expected, epsilon = 1e-9) => {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

closeTo(smoothstep(0), 0);
closeTo(smoothstep(0.5), 0.5);
closeTo(smoothstep(1), 1);
assert.ok(smoothstep(0.25) < smoothstep(0.5));

const makeAabb = (min, max) => ({
    min: { x: min[0], y: min[1], z: min[2] },
    max: { x: max[0], y: max[1], z: max[2] }
});
const unitAabb = makeAabb([0, 0, 0], [10, 10, 10]);
assert.deepEqual(aabbOverlapDepth(unitAabb, makeAabb([8, 7, 6], [18, 17, 16])), { x: 2, y: 3, z: 4 });
assert.equal(hasMeaningfulAabbOverlap(unitAabb, makeAabb([8, 8, 8], [18, 18, 18])), true);
assert.equal(hasMeaningfulAabbOverlap(unitAabb, makeAabb([10, 0, 0], [20, 10, 10])), false, 'Touching faces are not a collision.');
assert.equal(hasMeaningfulAabbOverlap(unitAabb, makeAabb([11, 0, 0], [21, 10, 10])), false, 'Separated boxes are not a collision.');
assert.equal(hasMeaningfulAabbOverlap(unitAabb, makeAabb([9.5, 0, 0], [19.5, 10, 10])), false, 'Sub-millimetre AABB noise is ignored.');

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

const revolute = { definition: { type: 'revolute', maxSpeed: 360 } };
const prismatic = { definition: { type: 'prismatic', maxSpeed: 1000 } };
closeTo(calculateMovjDuration([0], [180], [revolute], 100), 0.75);
closeTo(calculateMovjDuration([0], [250], [prismatic], 50), 0.75);
closeTo(calculateMovjDuration([0, 0], [90, 250], [revolute, prismatic], 100), 0.375);
closeTo(calculateMovjDuration([0], [180], [{ definition: { type: 'revolute' } }], 100), 1.5);
closeTo(MOVJ_EASING_PEAK_SLOPE, 1.5);
closeTo(calculateMovlDuration(100, 0, 100), 1);
closeTo(calculateMovlDuration(0, 180, 1000), 2);
closeTo(calculateMovlDuration(0, 0, 100), 0.1);
closeTo(MAX_MOVL_SPEED, 1500);
closeTo(calculateMovlDuration(1500, 0, MAX_MOVL_SPEED), 1);
closeTo(calculateMovlDuration(1500, 0, 2000), 1);
closeTo(calculateDelayDuration(2.5), 2.5);
closeTo(calculateDelayDuration(MIN_DELAY_SECONDS), MIN_DELAY_SECONDS);
closeTo(calculateDelayDuration(MAX_DELAY_SECONDS), MAX_DELAY_SECONDS);
closeTo(calculateDelayDuration(undefined), DEFAULT_DELAY_SECONDS);
closeTo(calculateCycleElapsedSeconds(1000, 2345), 1.345);
closeTo(calculateCycleElapsedSeconds(2345, 1000), 0);
assert.equal(calculateCycleElapsedSeconds(null, 1000), null);

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
        const progress = smoothstep(Math.min(1, frame / (duration * 1000)));
        const position = interpolateLinearPosition([0, robotIndex, 0], [100, robotIndex, 50], progress);
        assert.ok(position.every(Number.isFinite));
    });
}

const [catalogText, mainSource, htmlSource, cssSource, ...viewerLocaleTexts] = await Promise.all([
    readFile(new URL('../2_3DSimulation/models/models.json', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8'),
    ...['ko', 'en', 'zh-CN', 'vi'].map((locale) => (
        readFile(new URL(`../Language/${locale}/robot-3d-viewer.json`, import.meta.url), 'utf8')
    ))
]);
const catalog = JSON.parse(catalogText);
const viewerLocaleCodes = ['ko', 'en', 'zh-CN', 'vi'];
const viewerLocales = Object.fromEntries(viewerLocaleCodes.map((locale, index) => [
    locale,
    JSON.parse(viewerLocaleTexts[index]).legacy
]));
const viewerLocaleKeySets = viewerLocaleCodes.map((locale) => Object.keys(viewerLocales[locale]).sort());
viewerLocaleKeySets.slice(1).forEach((keys, index) => {
    assert.deepEqual(keys, viewerLocaleKeySets[0], `${viewerLocaleCodes[index + 1]} viewer locale keys must match Korean.`);
});

const viewerTranslationSources = new Set([
    'Program', 'Program Panel', 'ROBOTS', 'CYCLE TIME',
    '대기', '실행 중', '일시정지', '완료', '오류', '충돌', '정지됨',
    '사이클 타임 측정 중', '사이클 타임',
    'Tool이 TCP에 부착되었습니다.', '설비를 불러왔습니다.',
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
const models = catalog.filter((entry) => entry.type === 'articulated-stl');
const scaraCount = models.filter((entry) => entry.robotType === 'scara').length;
const sixAxisCount = models.filter((entry) => entry.robotType === 'six-axis').length;
assert.equal(scaraCount, 17);
assert.equal(sixAxisCount, 12);
models.forEach((model) => {
    assert.equal(model.jointSpeeds.length, model.limits.length, `${model.name} must define one speed per joint.`);
    assert.ok(model.jointSpeeds.every((speed) => Number.isFinite(speed) && speed > 0), `${model.name} joint speeds must be positive.`);
});
assert.ok(new Set(models.map((model) => model.jointSpeeds.join(','))).size > 10, 'Joint speed profiles must vary by robot model.');
const r7h90 = models.find((model) => model.folder === 'IR-R7H-90');
const s4 = models.find((model) => model.folder === 'IR-S4-40Z15');
assert.deepEqual(r7h90.jointSpeeds, [336, 280, 390, 550, 438, 764.7]);
assert.deepEqual(s4.jointSpeeds, [705.9, 747.1, 1300, 2600]);
closeTo(calculateMovjDuration(
    [0, 0, 0, 0, 0, 0],
    [0, 280, 0, 0, 0, 0],
    r7h90.jointSpeeds.map((maxSpeed) => ({ definition: { type: 'revolute', maxSpeed } })),
    100
), 1.5);
closeTo(calculateMovjDuration(
    [0, 0, 0, 0],
    [0, 0, 150, 0],
    s4.jointSpeeds.map((maxSpeed, index) => ({ definition: { type: index === 2 ? 'prismatic' : 'revolute', maxSpeed } })),
    100
), 150 * MOVJ_EASING_PEAK_SLOPE / 1300);

const makeStep = (model, modelIndex, motion, speed) => ({
    id: `${model.folder}-${motion}`,
    name: motion === 'MOVJ' ? 'P001' : 'P002',
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
    repeat: true,
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
assert.equal(normalized.repeat, true);
assert.equal(normalized.robots[0].steps[2].motion, 'DELAY');
assert.equal(normalized.robots[0].steps[2].delaySeconds, 1.5);
assert.equal(normalized.robots[0].steps[3].motion, 'TIME_START');
assert.equal(normalized.robots[0].steps[4].motion, 'TIME_OUT');
assert.ok(!('speed' in normalized.robots[0].steps[3]) && !('delaySeconds' in normalized.robots[0].steps[4]));
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
assert.deepEqual(normalizeMotionProject(JSON.parse(JSON.stringify(normalized))), normalized);
const legacyRepeatProject = structuredClone(fullProject);
delete legacyRepeatProject.repeatCurrentRobot;
assert.equal(normalizeMotionProject(legacyRepeatProject).repeatCurrentRobot, true, 'Legacy repeat must apply to both scopes.');

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
assert.equal(normalizeMotionProject(maximumMovlSpeed).robots[0].steps[1].speed, 1500);
maximumMovlSpeed.robots[0].steps[1].speed = MAX_MOVL_SPEED + 1;
assert.throws(() => normalizeMotionProject(maximumMovlSpeed), /speed is outside/);

const invalidDelay = structuredClone(fullProject);
invalidDelay.robots[0].steps[2].delaySeconds = 0;
assert.throws(() => normalizeMotionProject(invalidDelay), /delay is outside/);

const duplicateSteps = structuredClone(fullProject);
duplicateSteps.robots[0].steps[1].id = duplicateSteps.robots[0].steps[0].id;
assert.throws(() => normalizeMotionProject(duplicateSteps), /Duplicate step id/);

[
    'program-panel',
    'collision-alert',
    'collision-alert-text',
    'program-robot-list',
    'program-step-list',
    'program-add-delay',
    'program-add-time-start',
    'program-add-time-out',
    'program-cycle-time',
    'program-step-robot',
    'program-run-robot',
    'program-repeat-robot',
    'program-step-group',
    'program-run-group',
    'program-repeat',
    'program-import-file'
].forEach((id) => assert.match(htmlSource, new RegExp(`id=["']${id}["']`)));
const htmlIds = [...htmlSource.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, 'HTML ids must be unique.');
const programControlRows = [...htmlSource.matchAll(/<div class="program-control-row(?: program-group-row)?">([\s\S]*?)<\/div>/g)]
    .map((match) => [...match[1].matchAll(/<button id="([^"]+)"/g)].map((button) => button[1]));
assert.deepEqual(programControlRows, [
    ['program-step-robot', 'program-run-robot', 'program-pause-robot', 'program-stop-robot', 'program-repeat-robot'],
    ['program-step-group', 'program-run-group', 'program-pause-group', 'program-stop-group', 'program-repeat']
], 'Current and checked robot rows must share the Step Into, play, pause, stop and repeat layout.');
[
    'function updateMotionSessions(',
    'function updateRobotCollisions(',
    'function addCollisionHighlight(',
    'function removeCollisionHighlight(',
    'function updateCollisionAlert(',
    'function preflightRobotMotion(',
    'function addDelayMotionStep(',
    'function addTimerMotionStep(',
    'function restoreMotionProjectData(',
    'function finalizeMotionHistoryIfIdle(',
    'function syncTcpVisualAtPose(',
    'tcpFrame.add(toolAxesAtTcp)',
    'robot.userData.toolAxesAtTcp = toolAxesAtTcp',
    'maxSpeed: jointSpeeds[index]',
    'Robot joint speeds are invalid for',
    'if (robot !== state.activeArticulatedModel) return;',
    'function resumePausedRobotMotions(',
    'function createStepIntoPlan(',
    'function stepIntoActiveRobot(',
    'function stepIntoCheckedRobots(',
    'stepIntoStepId: step.id',
    'repeat: false',
    "controlScope: 'robot'",
    "controlScope: 'group'",
    'repeatCurrentRobot: state.motionRepeatRobot',
    'program.selectedStepId = program.steps[nextIndex].id',
    'if (robot && resumePausedRobotMotions([robot])) return;',
    'if (resumePausedRobotMotions(robots)) return;',
    'const startAt = performance.now() + 40',
    'slerpQuaternion(',
    'smoothstep(linearProgress)',
    "if (step.motion === 'DELAY')",
    "type: 'DELAY'",
    "type: step.motion",
    'duration: calculateDelayDuration(step.delaySeconds) * 1000',
    'delaySeconds: step.delaySeconds',
    'step.motion === \'MOVJ\' ? 100 : MAX_MOVL_SPEED',
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
    'localStorage.setItem(MOTION_PROJECT_STORAGE_KEY',
    'window.showSaveFilePicker({',
    'await fileHandle.createWritable()',
    "startIn: 'documents'",
    'new OBB(',
    'localBox: box.clone()',
    'hasMeaningfulAabbOverlap(leftPart.aabb, rightPart.aabb)',
    'if (!obbCollision && !fallbackCollision) continue'
].forEach((marker) => assert.ok(mainSource.includes(marker), `Missing integration marker: ${marker}`));
const collisionSource = mainSource.slice(
    mainSource.indexOf('function updateRobotCollisions('),
    mainSource.indexOf('function applyFBXMaterial(')
);
assert.ok(!/finishRobotMotionSession|stopRobotMotions/.test(collisionSource), 'Collision warnings must not stop motion.');
assert.ok(mainSource.includes("object.name === 'CD conduit'"), 'CD conduit must be excluded from collision OBBs.');
assert.ok(mainSource.includes('const MOTION_COLLISION_INTERVAL = 100'), 'Collision interval must remain 100 ms.');
assert.ok(mainSource.includes('highlighted.color?.set(0xef4444)'), 'Colliding robot links must turn red.');
assert.ok(mainSource.includes('mesh.material = highlight.originalMaterial'), 'Collision highlighting must restore the original link material.');
assert.ok(mainSource.includes('updateCollisionAlert(collisionPairs)'), 'Collision pairs must update the viewport alert.');
assert.ok(mainSource.includes("./collision-core.mjs?v=20260717-collision-fallback1"), 'Collision fallback cache token must be current.');
assert.ok(htmlSource.includes('main.js?v=20260717-i18n-complete1'), 'Viewer cache token must load complete four-language support.');
assert.ok(htmlSource.includes('style.css?v=20260717-panel-edge-resize1'), 'Stylesheet cache token must load panel edge cursors.');
assert.match(htmlSource, /id="collision-alert"[^>]*role="alert"[^>]*aria-live="assertive"/);
assert.match(cssSource, /\.collision-alert\s*\{[^}]*position:\s*absolute[^}]*background:\s*rgba\(127,\s*29,\s*29,\s*0\.94\)/s);
assert.match(
    mainSource,
    /if \(robot === state\.activeArticulatedModel\) syncJointControls\(robot\);\r?\n\s*updateTcpPresentation\(robot\);/,
    'Every animated robot must update its TCP visual, while only the active robot updates JOG controls.'
);
assert.match(cssSource, /\.program-panel\s*\{/);
assert.match(cssSource, /\.program-panel-content\s*\{[^}]*overflow-y:\s*auto/s);
assert.match(cssSource, /\.program-robot-row\.collision/);
assert.match(cssSource, /\.program-step-row\.delay/);
assert.match(cssSource, /\.program-step-row\.timer/);
assert.match(cssSource, /\.program-cycle-time\s*\{/);
assert.ok(mainSource.includes("['TIME_START', 'T.START']") && mainSource.includes("['TIME_OUT', 'T.OUT']"), 'Program rows must expose cycle timer commands.');
const preflightSource = mainSource.slice(
    mainSource.indexOf('function preflightRobotMotion('),
    mainSource.indexOf('function createMotionSession(')
);
assert.ok(preflightSource.includes("if (step.motion === 'DELAY')") && preflightSource.includes('return;'), 'DELAY preflight must not run robot IK.');
assert.ok(preflightSource.includes("if (step.motion === 'TIME_START')")
    && preflightSource.includes("if (step.motion === 'TIME_OUT')")
    && preflightSource.includes('TIME START must run before TIME OUT'), 'TIME OUT must require an active TIME START marker.');
assert.ok(cssSource.includes('width: min(340px, calc(100% - 32px))'), 'Program Panel compact width must remain 340px.');
assert.ok(htmlSource.includes('id="program-repeat" class="program-repeat-toggle"'), 'Repeat must be an icon toggle button.');
assert.ok(htmlSource.includes('id="program-repeat-robot" class="program-repeat-toggle"'), 'Current robot repeat must be an icon toggle button.');
assert.equal((htmlSource.match(/data-program-repeat(?=[\s>])/g) || []).length, 2, 'Both playback rows must expose a repeat control.');
assert.match(htmlSource, /id="program-repeat-robot"[^>]*data-program-repeat-scope="robot"/);
assert.match(htmlSource, /id="program-repeat"[^>]*data-program-repeat-scope="group"/);
assert.ok(!htmlSource.includes('<input id="program-repeat"'), 'Repeat must not use a checkbox.');
assert.ok(!htmlSource.includes('id="program-run-step"'), 'The old selected-row run control must be replaced by Step Into.');
assert.ok(!htmlSource.includes('fa-play"></i> 동시 시작'), 'Group play must use the compact icon-only button.');
assert.ok(
    mainSource.includes("button:not([data-panel-action]), input")
        && mainSource.includes("querySelectorAll('[data-panel-action]')"),
    'Panel window controls must remain available while motion editing is locked.'
);
assert.ok(!htmlSource.includes('id="program-panel-resize"'), 'Panel resizing must not require a header button.');
assert.ok(mainSource.includes('function makePanelEdgeResizable('), 'Panels must support classic edge resizing.');
assert.ok(mainSource.includes('[el.modelBrowserPanel, el.jogPanel, el.programPanel].forEach(makePanelEdgeResizable)'), 'Model, JOG and Program panels must all use edge resizing.');
assert.ok(mainSource.includes("'model-browser-panel': { width: 260, height: 220 }")
    && mainSource.includes("'jog-panel': { width: 250, height: 300 }")
    && mainSource.includes("'program-panel': { width: 300, height: 320 }"), 'Resizable panels must preserve usable minimum sizes.');
assert.ok(mainSource.includes("dataset.userResized === 'true'"), 'Resized panels must be constrained after viewport changes.');
assert.match(cssSource, /\.panel-edge-resizable:is\(\[data-resize-edge="e"\], \[data-resize-edge="w"\]\)[^{]*\{[^}]*cursor:\s*ew-resize/s);
assert.match(cssSource, /\.panel-edge-resizable:is\(\[data-resize-edge="n"\], \[data-resize-edge="s"\]\)[^{]*\{[^}]*cursor:\s*ns-resize/s);

console.log(`Motion program core OK: ${models.length} robots (${scaraCount} SCARA, ${sixAxisCount} six-axis), MOVJ/MOVL/DELAY timing, cycle timers, four-robot numerical stress, JSON round trip, collision policy and schema checks`);
