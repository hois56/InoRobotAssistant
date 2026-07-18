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

const [catalogText, mainSource, motionCoreSource, htmlSource, cssSource, gs60SourceText, ...viewerLocaleTexts] = await Promise.all([
    readFile(new URL('../2_3DSimulation/models/models.json', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/motion-program-core.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8'),
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
    'function preflightRobotMotion(',
    'function addDelayMotionStep(',
    'function addTimerMotionStep(',
    'function restoreMotionProjectData(',
    'function finalizeMotionHistoryIfIdle(',
    'function syncTcpVisualAtPose(',
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
    "controlScope: 'robot'",
    "controlScope: 'group'",
    'repeatCurrentRobot: state.motionRepeatRobot',
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
    "type: step.motion",
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
    'localStorage.setItem(MOTION_PROJECT_STORAGE_KEY',
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
assert.ok(htmlSource.includes('main.js?v=20260719-singularity-1'), 'Viewer cache token must load the current simulation bundle.');
assert.ok(htmlSource.includes('id="btn-fullscreen-mode"'), 'Viewer must expose the fullscreen UI mode button.');
assert.ok(mainSource.includes('function setFullscreenUiMode(enabled)') && mainSource.includes('function handleFullscreenUiPointerMove(event)'), 'Fullscreen UI mode must hide and reveal bars from pointer proximity.');
assert.ok(mainSource.includes("revealFullscreenBar('top')") && mainSource.includes("revealFullscreenBar('bottom')"), 'Fullscreen UI mode must reveal the top and bottom bars independently.');
assert.ok(mainSource.includes('function attachPendingToolModels(robot)') && mainSource.includes('model.userData.pendingToolAttachment'), 'Tool-attached 3D models must transfer to a replacement robot TCP.');
assert.match(mainSource, /else if \(positionEntry\) \{\s*model\.position\[axis\] = value;/, 'Numeric model editing must change only the edited position axis.');
assert.ok(mainSource.includes("const isScaleMode = state.transformControls?.mode === 'scale';") && mainSource.includes("model.scale[axis] = value;"), 'Scale mode must use the numeric X/Y/Z inputs as scale multipliers.');
assert.ok(mainSource.includes('function toggleSelectedTransformMode(mode)') && mainSource.includes('setTransformHandlesEnabled(true);'), 'Selecting a transform mode must reveal its transform handles.');
assert.ok(mainSource.includes('state.transformControls.enabled && state.transformControls.mode === mode') && mainSource.includes('setTransformHandlesEnabled(false);'), 'Selecting the active transform mode must hide its transform handles.');
assert.match(htmlSource, /model-browser-header[\s\S]*?id="btn-toggle-transform"/, 'The transform handle toggle must be placed in the Model Tree panel.');
assert.doesNotMatch(htmlSource, /viewer-control-dock[\s\S]*?id="btn-toggle-transform"/, 'The transform handle toggle must not remain in the bottom viewer dock.');
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
assert.ok(htmlSource.includes('style.css?v=20260719-euler-321-11'), 'Stylesheet cache token must load the current simulation styles.');
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
    && mainSource.includes("suggestedName: 'Point_export.txt'")
    && mainSource.includes("saveAs(blob, 'Point_export.txt')"), 'Position export must use the verified record formatter and Point_export.txt fallback download.');
assert.match(htmlSource, /id="btn-import-3d"[^>]*>[\s\S]*?<span>3D<\/span>[\s\S]*?fa-upload/, 'The 3D import button must show a 3D upload tray icon.');
assert.match(htmlSource, /program-file-row[\s\S]*?id="program-export"[\s\S]*?id="program-import"[\s\S]*?id="btn-position-export"/, 'Program files must provide save, load, and point export controls in order.');
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
    && mainSource.includes("THREE.MathUtils.degToRad(rz),\n        'ZYX'"), 'Six-axis position values must use 3-2-1 (RZ-RY-RX) Euler angles.');
assert.ok(!mainSource.includes('usesNegativeJ5RotationBranch'), '3-2-1 Euler conversion must determine the J5 branch without a manual sign override.');
assert.ok(
    mainSource.includes("insertBefore(programButton, virtualButton || divider)"),
    'The Program launcher must be inserted immediately before the Virtual launcher.'
);
const preflightSource = mainSource.slice(
    mainSource.indexOf('function preflightRobotMotion('),
    mainSource.indexOf('function createMotionSession(')
);
assert.ok(preflightSource.includes("if (step.motion === 'DELAY')") && preflightSource.includes('return;'), 'DELAY preflight must not run robot IK.');
assert.ok(preflightSource.includes("if (step.motion === 'TIME_START')")
    && preflightSource.includes("if (step.motion === 'TIME_OUT')")
    && preflightSource.includes('TIME START must run before TIME OUT'), 'TIME OUT must require an active TIME START marker.');
assert.ok(cssSource.includes('width: min(340px, calc(100% - 32px))'), 'Program Panel compact width must remain 340px.');
assert.match(cssSource, /\.program-panel\s*\{[^}]*top:\s*0[^}]*left:\s*320px[^}]*transform:\s*none/s, 'Program Panel must initially appear beside the model tree.');
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
assert.ok(mainSource.includes('[el.modelBrowserPanel, el.jogPanel, el.virtualControllerPanel, el.programPanel].forEach(makePanelEdgeResizable)'), 'Model, JOG, Virtual Controller and Program panels must all use edge resizing.');
assert.ok(mainSource.includes("'model-browser-panel': { width: 260, height: 220 }")
    && mainSource.includes("'jog-panel': { width: 250, height: 300 }")
    && mainSource.includes("'virtual-controller-panel': { width: 250, height: 230 }")
    && mainSource.includes("'program-panel': { width: 300, height: 320 }"), 'Resizable panels must preserve usable minimum sizes.');
assert.ok(mainSource.includes("dataset.userResized === 'true'"), 'Resized panels must be constrained after viewport changes.');
assert.match(cssSource, /\.panel-edge-resizable:is\(\[data-resize-edge="e"\], \[data-resize-edge="w"\]\)[^{]*\{[^}]*cursor:\s*ew-resize/s);
assert.match(cssSource, /\.panel-edge-resizable:is\(\[data-resize-edge="n"\], \[data-resize-edge="s"\]\)[^{]*\{[^}]*cursor:\s*ns-resize/s);

console.log(`Motion program core OK: ${models.length} robots (${scaraCount} SCARA, ${sixAxisCount} six-axis), MOVJ/MOVL/DELAY timing, cycle timers, four-robot numerical stress, JSON round trip and schema checks`);
