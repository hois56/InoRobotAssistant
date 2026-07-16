import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    MOTION_PROJECT_SCHEMA_VERSION,
    MOVJ_EASING_PEAK_SLOPE,
    smoothstep,
    interpolateLinearPosition,
    slerpQuaternion,
    calculateMovjDuration,
    calculateMovlDuration,
    normalizeMotionProject
} from '../2_3DSimulation/motion-program-core.mjs';

const closeTo = (actual, expected, epsilon = 1e-9) => {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

closeTo(smoothstep(0), 0);
closeTo(smoothstep(0.5), 0.5);
closeTo(smoothstep(1), 1);
assert.ok(smoothstep(0.25) < smoothstep(0.5));

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

const [catalogText, mainSource, htmlSource, cssSource] = await Promise.all([
    readFile(new URL('../2_3DSimulation/models/models.json', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8')
]);
const catalog = JSON.parse(catalogText);
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
        steps: [makeStep(model, index, 'MOVJ', 20), makeStep(model, index, 'MOVL', 100)]
    }))
};

const normalized = normalizeMotionProject(fullProject);
assert.equal(normalized.robots.length, 29);
assert.equal(normalized.robots.filter((robot) => robot.included).length, 4);
assert.equal(normalized.repeatCurrentRobot, false);
assert.equal(normalized.repeat, true);
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

const duplicateSteps = structuredClone(fullProject);
duplicateSteps.robots[0].steps[1].id = duplicateSteps.robots[0].steps[0].id;
assert.throws(() => normalizeMotionProject(duplicateSteps), /Duplicate step id/);

[
    'program-panel',
    'program-panel-resize',
    'program-robot-list',
    'program-step-list',
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
    'function preflightRobotMotion(',
    'function restoreMotionProjectData(',
    'function finalizeMotionHistoryIfIdle(',
    'function syncTcpVisualAtPose(',
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
    'localStorage.setItem(MOTION_PROJECT_STORAGE_KEY',
    'window.showSaveFilePicker({',
    'await fileHandle.createWritable()',
    "startIn: 'documents'",
    'new OBB('
].forEach((marker) => assert.ok(mainSource.includes(marker), `Missing integration marker: ${marker}`));
const collisionSource = mainSource.slice(
    mainSource.indexOf('function updateRobotCollisions('),
    mainSource.indexOf('function applyFBXMaterial(')
);
assert.ok(!/finishRobotMotionSession|stopRobotMotions/.test(collisionSource), 'Collision warnings must not stop motion.');
assert.ok(mainSource.includes("object.name === 'CD conduit'"), 'CD conduit must be excluded from collision OBBs.');
assert.ok(mainSource.includes('const MOTION_COLLISION_INTERVAL = 100'), 'Collision interval must remain 100 ms.');
assert.ok(
    mainSource.includes("if (robot === state.activeArticulatedModel) syncJointControls(robot);\n    updateTcpPresentation(robot);"),
    'Every animated robot must update its TCP visual, while only the active robot updates JOG controls.'
);
assert.match(cssSource, /\.program-panel\s*\{/);
assert.match(cssSource, /\.program-panel-resize\s*\{[^}]*cursor:\s*nesw-resize/s);
assert.match(cssSource, /\.program-panel-content\s*\{[^}]*overflow-y:\s*auto/s);
assert.match(cssSource, /\.program-robot-row\.collision/);
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
assert.ok(mainSource.includes('function makeProgramPanelResizable('), 'Program Panel must support pointer and keyboard resizing.');
assert.ok(mainSource.includes('PROGRAM_PANEL_MIN_WIDTH = 300'), 'Program Panel resizing must preserve a usable minimum width.');
assert.ok(mainSource.includes("dataset.userResized === 'true'"), 'A resized Program Panel must be constrained after viewport changes.');

console.log(`Motion program core OK: ${models.length} robots (${scaraCount} SCARA, ${sixAxisCount} six-axis), model-specific joint speeds, MOVJ/MOVL timing, linear/quaternion interpolation, four-robot numerical stress, JSON round trip, collision policy and schema checks`);
