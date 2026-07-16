import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    MOTION_PROJECT_SCHEMA_VERSION,
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

const revolute = { definition: { type: 'revolute' } };
const prismatic = { definition: { type: 'prismatic' } };
closeTo(calculateMovjDuration([0], [180], [revolute], 100), 1);
closeTo(calculateMovjDuration([0], [250], [prismatic], 50), 1);
closeTo(calculateMovjDuration([0, 0], [90, 250], [revolute, prismatic], 100), 0.5);
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
assert.deepEqual(normalizeMotionProject(JSON.parse(JSON.stringify(normalized))), normalized);

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
    'program-robot-list',
    'program-step-list',
    'program-run-robot',
    'program-run-group',
    'program-import-file'
].forEach((id) => assert.match(htmlSource, new RegExp(`id=["']${id}["']`)));
const htmlIds = [...htmlSource.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, 'HTML ids must be unique.');
[
    'function updateMotionSessions(',
    'function updateRobotCollisions(',
    'function preflightRobotMotion(',
    'function restoreMotionProjectData(',
    'function finalizeMotionHistoryIfIdle(',
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
assert.match(cssSource, /\.program-panel\s*\{/);
assert.match(cssSource, /\.program-robot-row\.collision/);
assert.ok(cssSource.includes('width: min(340px, calc(100% - 32px))'), 'Program Panel compact width must remain 340px.');
assert.ok(htmlSource.includes('id="program-repeat" class="program-repeat-toggle"'), 'Repeat must be an icon toggle button.');
assert.ok(!htmlSource.includes('<input id="program-repeat"'), 'Repeat must not use a checkbox.');
assert.ok(!htmlSource.includes('fa-play"></i> 동시 시작'), 'Group play must use the compact icon-only button.');
assert.ok(
    mainSource.includes("button:not([data-panel-action]), input")
        && mainSource.includes("querySelectorAll('[data-panel-action]')"),
    'Panel window controls must remain available while motion editing is locked.'
);

console.log(`Motion program core OK: ${models.length} robots (${scaraCount} SCARA, ${sixAxisCount} six-axis), MOVJ/MOVL timing, linear/quaternion interpolation, four-robot numerical stress, JSON round trip, collision policy and schema checks`);
