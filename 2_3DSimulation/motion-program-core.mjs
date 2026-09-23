import { normalizeWorkObjects } from './workobject-core.mjs';

export const MOTION_PROJECT_SCHEMA_VERSION = 1;
export const DEFAULT_MOVJ_SPEED = 100;
export const DEFAULT_MOVL_SPEED = 1500;
export const MAX_MOVL_SPEED = 2500;
export const DEFAULT_DELAY_SECONDS = 1;
export const MIN_DELAY_SECONDS = 0.1;
export const MAX_DELAY_SECONDS = 3600;
export const MOVJ_REVOLUTE_RATE = 180;
export const MOVJ_PRISMATIC_RATE = 500;
export const MOVL_ROTATION_RATE = 90;
export const S_CURVE_PEAK_VELOCITY = 15 / 8;
export const S_CURVE_PEAK_ACCELERATION = 10 / Math.sqrt(3);
export const MOTION_SETTLING_DELAY_SECONDS = 0.02;
// Simulation-only acceleration tuning; robot catalog values remain unchanged.
export const RAPID_MOVE_ACCELERATION_BOOST = 1.1;
export const RAPID_MOVE_DEFAULTS = Object.freeze({
    minAccelerationScale: 0.95,
    maxAccelerationScale: 1,
    maxStepSeconds: 0.05
});
const RAPID_MOVE_PATH_SAMPLE_COUNT = 65;
export const MIN_POINT_INDEX = 0;
export const MAX_POINT_INDEX = 9999;
export const MIN_WAIT_LINE_NUMBER = 1;
export const MAX_WAIT_LINE_NUMBER = 9999;
export const MAX_POINT_LABEL_LENGTH = 19;
export const POINT_LABEL_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,18}$/;

export function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export function sCurveProgress(value) {
    const t = clamp(Number(value) || 0, 0, 1);
    return t * t * t * (10 + t * (-15 + 6 * t));
}

export function interpolateLinearPosition(start, target, progress) {
    const t = clamp(Number(progress) || 0, 0, 1);
    if (!Array.isArray(start) || !Array.isArray(target) || start.length !== 3 || target.length !== 3) {
        throw new Error('Linear interpolation requires two three-dimensional positions.');
    }
    return start.map((value, index) => Number(value) + (Number(target[index]) - Number(value)) * t);
}

export function slerpQuaternion(start, target, progress) {
    const t = clamp(Number(progress) || 0, 0, 1);
    if (!Array.isArray(start) || !Array.isArray(target) || start.length !== 4 || target.length !== 4) {
        throw new Error('Quaternion interpolation requires two four-dimensional quaternions.');
    }
    const normalize = (values) => {
        const length = Math.hypot(...values);
        if (!Number.isFinite(length) || length < 1e-12) throw new Error('Quaternion length must be non-zero.');
        return values.map((value) => Number(value) / length);
    };
    const left = normalize(start);
    let right = normalize(target);
    let cosine = left.reduce((sum, value, index) => sum + value * right[index], 0);
    if (cosine < 0) {
        right = right.map((value) => -value);
        cosine = -cosine;
    }
    if (cosine > 0.9995) {
        return normalize(left.map((value, index) => value + (right[index] - value) * t));
    }
    const angle = Math.acos(clamp(cosine, -1, 1));
    const sine = Math.sin(angle);
    const leftWeight = Math.sin((1 - t) * angle) / sine;
    const rightWeight = Math.sin(t * angle) / sine;
    return normalize(left.map((value, index) => value * leftWeight + right[index] * rightWeight));
}

export function calculateMovjDuration(startAngles, targetAngles, joints, speedPercent) {
    const speedScale = clamp(Number(speedPercent) || DEFAULT_MOVJ_SPEED, 1, 100) / 100;
    const durations = targetAngles.map((target, index) => {
        const start = Number(startAngles[index]) || 0;
        const distance = Math.abs(Number(target) - start);
        const configuredRate = Number(joints[index]?.definition?.maxSpeed);
        const configuredAcceleration = Number(joints[index]?.definition?.maxAcceleration);
        const configuredDeceleration = Number(joints[index]?.definition?.maxDeceleration);
        const fallbackRate = joints[index]?.definition?.type === 'prismatic'
            ? MOVJ_PRISMATIC_RATE
            : MOVJ_REVOLUTE_RATE;
        const rate = Number.isFinite(configuredRate) && configuredRate > 0
            ? configuredRate
            : fallbackRate;
        const speedLimitedDuration = distance * S_CURVE_PEAK_VELOCITY / (rate * speedScale);
        const accelerationLimit = [configuredAcceleration, configuredDeceleration]
            .filter((value) => Number.isFinite(value) && value > 0)
            .reduce((minimum, value) => Math.min(minimum, value), Infinity);
        const accelerationLimitedDuration = Number.isFinite(accelerationLimit)
            ? Math.sqrt(distance * S_CURVE_PEAK_ACCELERATION / accelerationLimit)
            : 0;
        return Math.max(speedLimitedDuration, accelerationLimitedDuration);
    });
    return Math.max(0.1, ...durations);
}

function rapidMoveJointRate(joint) {
    const configuredRate = Number(joint?.definition?.maxSpeed);
    if (Number.isFinite(configuredRate) && configuredRate > 0) return configuredRate;
    return joint?.definition?.type === 'prismatic'
        ? MOVJ_PRISMATIC_RATE
        : MOVJ_REVOLUTE_RATE;
}

function rapidMovePostureScale(postureLoad, profile) {
    const load = clamp(Number(postureLoad) || 0.5, 0, 1);
    return profile.minAccelerationScale
        + (profile.maxAccelerationScale - profile.minAccelerationScale) * (1 - load);
}

function interpolateRapidMovePathSample(samples, progress) {
    if (!Array.isArray(samples) || samples.length === 0) return 0;
    if (samples.length === 1) return samples[0];
    const position = clamp(Number(progress) || 0, 0, 1) * (samples.length - 1);
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = position - left;
    return samples[left] + (samples[right] - samples[left]) * fraction;
}

function buildRapidMoveVelocityEnvelope(
    postureLoads,
    maxProgressVelocity,
    maxProgressAcceleration,
    maxProgressDeceleration,
    profile
) {
    // Build a forward/backward speed envelope over one shared normalized path.
    // This keeps every joint synchronized while allowing the path to use the
    // fastest speed that can still accelerate and brake before each posture.
    const sampleCount = postureLoads.length;
    const step = 1 / Math.max(1, sampleCount - 1);
    const accelerationLimits = postureLoads.map((load) => (
        maxProgressAcceleration * rapidMovePostureScale(load, profile)
    ));
    const decelerationLimits = postureLoads.map((load) => (
        maxProgressDeceleration * rapidMovePostureScale(load, profile)
    ));
    const velocitySquared = Array(sampleCount).fill(maxProgressVelocity ** 2);
    velocitySquared[0] = 0;
    for (let index = 1; index < sampleCount; index += 1) {
        velocitySquared[index] = Math.min(
            velocitySquared[index],
            velocitySquared[index - 1] + 2 * accelerationLimits[index - 1] * step
        );
    }
    velocitySquared[sampleCount - 1] = 0;
    for (let index = sampleCount - 2; index >= 0; index -= 1) {
        velocitySquared[index] = Math.min(
            velocitySquared[index],
            velocitySquared[index + 1] + 2 * decelerationLimits[index] * step
        );
    }
    return velocitySquared.map((value) => Math.sqrt(Math.max(0, value)));
}

/**
 * Return a normalized gravity-load proxy for a six-axis posture.
 *
 * The controller's Rapidmove implementation is proprietary. The simulator
 * therefore uses the horizontal projection of the upper-arm and forearm as a
 * deterministic proxy: a horizontally extended arm needs more torque to
 * hold against gravity than an upright arm. The result is intentionally a
 * load score, not a torque measurement.
 */
export function getRapidMovePostureLoad(angles, structure, robotType = 'six-axis') {
    if (robotType !== 'six-axis' || !Array.isArray(angles) || angles.length < 3) return 0.5;
    const upperArm = Math.max(0, Number(structure?.[1]) || 0);
    const forearm = Math.max(0, (Number(structure?.[3]) || 0) + (Number(structure?.[4]) || 0));
    const totalLength = upperArm + forearm;
    if (totalLength <= 0) return 0.5;
    const j2 = Number(angles[1]) * Math.PI / 180;
    const j3 = Number(angles[2]) * Math.PI / 180;
    const upperHorizontal = Math.abs(Math.cos(j2));
    const forearmHorizontal = Math.abs(Math.cos(j2 + j3));
    const projectedLoad = (upperArm * upperHorizontal + forearm * forearmHorizontal) / totalLength;
    return clamp(0.25 + 0.75 * projectedLoad, 0, 1);
}

export function createRapidMoveState(startAngles, targetAngles, joints, speedPercent, options = {}) {
    const {
        structure = null,
        robotType = 'six-axis',
        ...profileOptions
    } = options && typeof options === 'object' ? options : {};
    const distances = targetAngles.map((target, index) => Math.abs(
        Number(target) - (Number(startAngles[index]) || 0)
    ));
    const movingIndexes = distances
        .map((distance, index) => distance > 1e-9 ? index : -1)
        .filter((index) => index >= 0);
    const enabled = profileOptions.enabled === true && movingIndexes.length > 0;
    if (!enabled) {
        return {
            enabled: false,
            progress: 0,
            velocity: 0,
            completed: movingIndexes.length === 0,
            maxProgressVelocity: 0,
            maxProgressAcceleration: 0,
            maxProgressDeceleration: 0,
            distances,
            profile: { ...RAPID_MOVE_DEFAULTS, ...profileOptions }
        };
    }

    const speedScale = clamp(Number(speedPercent) || DEFAULT_MOVJ_SPEED, 1, 100) / 100;
    const maxProgressVelocity = Math.min(...movingIndexes.map((index) => (
        rapidMoveJointRate(joints[index]) * speedScale / distances[index]
    )));
    const accelerationValues = movingIndexes.map((index) => {
        const acceleration = Number(joints[index]?.definition?.maxAcceleration);
        return Number.isFinite(acceleration) && acceleration > 0
            ? acceleration * RAPID_MOVE_ACCELERATION_BOOST / distances[index]
            : Infinity;
    });
    const decelerationValues = movingIndexes.map((index) => {
        const deceleration = Number(joints[index]?.definition?.maxDeceleration);
        return Number.isFinite(deceleration) && deceleration > 0
            ? deceleration * RAPID_MOVE_ACCELERATION_BOOST / distances[index]
            : Infinity;
    });
    const profile = {
        ...RAPID_MOVE_DEFAULTS,
        ...profileOptions,
        minAccelerationScale: clamp(
            Number(profileOptions.minAccelerationScale) || RAPID_MOVE_DEFAULTS.minAccelerationScale,
            0.1,
            1
        ),
        maxAccelerationScale: clamp(
            Number(profileOptions.maxAccelerationScale) || RAPID_MOVE_DEFAULTS.maxAccelerationScale,
            0.1,
            1
        )
    };
    if (profile.maxAccelerationScale < profile.minAccelerationScale) {
        profile.maxAccelerationScale = profile.minAccelerationScale;
    }
    const pathPostureLoads = Array.from(
        { length: RAPID_MOVE_PATH_SAMPLE_COUNT },
        (_, sampleIndex) => {
            const progress = sampleIndex / (RAPID_MOVE_PATH_SAMPLE_COUNT - 1);
            const postureAngles = startAngles.map((start, index) => (
                Number(start) + (Number(targetAngles[index]) - Number(start)) * progress
            ));
            return getRapidMovePostureLoad(postureAngles, structure, robotType);
        }
    );
    const pathVelocityEnvelope = buildRapidMoveVelocityEnvelope(
        pathPostureLoads,
        maxProgressVelocity,
        Math.min(...accelerationValues),
        Math.min(...decelerationValues),
        profile
    );
    return {
        enabled: Number.isFinite(maxProgressVelocity)
            && Number.isFinite(Math.min(...accelerationValues))
            && Number.isFinite(Math.min(...decelerationValues)),
        progress: 0,
        velocity: 0,
        completed: false,
        maxProgressVelocity,
        maxProgressAcceleration: Math.min(...accelerationValues),
        maxProgressDeceleration: Math.min(...decelerationValues),
        distances,
        profile,
        pathPostureLoads,
        pathVelocityEnvelope
    };
}

export function advanceRapidMoveState(
    state,
    deltaSeconds,
    startAngles,
    targetAngles,
    structure,
    robotType = 'six-axis',
    accelerationScale = 1
) {
    if (!state?.enabled || state.completed) return {
        progress: state?.completed ? 1 : 0,
        postureLoad: null,
        accelerationScale: 1,
        completed: Boolean(state?.completed)
    };
    const delta = clamp(
        Number(deltaSeconds) || 0,
        0,
        Number(state.profile.maxStepSeconds) || RAPID_MOVE_DEFAULTS.maxStepSeconds
    );
    if (delta <= 0) return {
        progress: state.progress,
        postureLoad: getRapidMovePostureLoad(startAngles, structure, robotType),
        accelerationScale: 1,
        completed: false
    };

    const currentAngles = startAngles.map((start, index) => (
        Number(start) + (Number(targetAngles[index]) - Number(start)) * state.progress
    ));
    const sampledPostureLoad = interpolateRapidMovePathSample(state.pathPostureLoads, state.progress);
    const postureLoad = state.pathPostureLoads?.length
        ? sampledPostureLoad
        : getRapidMovePostureLoad(currentAngles, structure, robotType);
    const postureScale = rapidMovePostureScale(postureLoad, state.profile);
    const scale = Math.max(0.1, Number(accelerationScale) || 1) * postureScale;
    const acceleration = state.maxProgressAcceleration * scale;
    const deceleration = state.maxProgressDeceleration * scale;
    const envelopeStep = state.pathVelocityEnvelope?.length > 1
        ? 1 / (state.pathVelocityEnvelope.length - 1)
        : 0;
    const envelopeProgress = envelopeStep > 0
        ? Math.max(state.progress, envelopeStep)
        : state.progress;
    const targetVelocity = Math.min(
        state.maxProgressVelocity,
        interpolateRapidMovePathSample(state.pathVelocityEnvelope, envelopeProgress)
    );
    const previousVelocity = state.velocity;
    state.velocity = targetVelocity < state.velocity
        ? Math.max(targetVelocity, state.velocity - deceleration * delta)
        : Math.min(targetVelocity, state.velocity + acceleration * delta);
    state.progress = Math.min(1, state.progress + (previousVelocity + state.velocity) * delta / 2);
    if (state.progress >= 1 - 1e-9) {
        state.progress = 1;
        state.velocity = 0;
        state.completed = true;
    }
    return {
        progress: state.progress,
        postureLoad,
        accelerationScale: scale,
        completed: state.completed
    };
}

export function calculateMovlDuration(
    distanceMillimeters,
    rotationDegrees,
    speedMillimetersPerSecond,
    cartesianMotion = {}
) {
    const configuredMaxSpeed = Number(cartesianMotion.maxSpeed);
    const maximumSpeed = Number.isFinite(configuredMaxSpeed) && configuredMaxSpeed > 0
        ? Math.min(configuredMaxSpeed, MAX_MOVL_SPEED)
        : MAX_MOVL_SPEED;
    const speed = clamp(Number(speedMillimetersPerSecond) || DEFAULT_MOVL_SPEED, 1, maximumSpeed);
    const distance = Math.max(0, Number(distanceMillimeters) || 0);
    const rotation = Math.max(0, Number(rotationDegrees) || 0);
    const linearAccelerationLimit = [
        Number(cartesianMotion.maxAcceleration),
        Number(cartesianMotion.stopDeceleration)
    ].filter((value) => Number.isFinite(value) && value > 0)
        .reduce((minimum, value) => Math.min(minimum, value), Infinity);
    const configuredRotationSpeed = Number(cartesianMotion.maxRotationSpeed);
    const rotationSpeed = Number.isFinite(configuredRotationSpeed) && configuredRotationSpeed > 0
        ? configuredRotationSpeed
        : MOVL_ROTATION_RATE;
    const rotationAccelerationLimit = [
        Number(cartesianMotion.maxRotationAcceleration),
        Number(cartesianMotion.rotationStopDeceleration)
    ].filter((value) => Number.isFinite(value) && value > 0)
        .reduce((minimum, value) => Math.min(minimum, value), Infinity);
    return Math.max(
        0.1,
        distance * S_CURVE_PEAK_VELOCITY / speed,
        Number.isFinite(linearAccelerationLimit)
            ? Math.sqrt(distance * S_CURVE_PEAK_ACCELERATION / linearAccelerationLimit)
            : 0,
        rotation * S_CURVE_PEAK_VELOCITY / rotationSpeed,
        Number.isFinite(rotationAccelerationLimit)
            ? Math.sqrt(rotation * S_CURVE_PEAK_ACCELERATION / rotationAccelerationLimit)
            : 0
    );
}

export function calculateDelayDuration(delaySeconds) {
    return clamp(Number(delaySeconds) || DEFAULT_DELAY_SECONDS, MIN_DELAY_SECONDS, MAX_DELAY_SECONDS);
}

export function calculateCycleElapsedSeconds(startedAt, currentAt) {
    if (!Number.isFinite(startedAt) || !Number.isFinite(currentAt)) return null;
    return Math.max(0, currentAt - startedAt) / 1000;
}

export function advanceMotionCursor({
    cursor,
    direction,
    stepCount,
    repeat = false,
    reverseRepeat = false
} = {}) {
    const count = Math.max(0, Math.trunc(Number(stepCount) || 0));
    const playbackDirection = Number(direction) < 0 ? -1 : 1;
    if (count === 0) {
        return {
            cursor: 0,
            direction: reverseRepeat ? 1 : playbackDirection,
            completed: true,
            boundary: 'empty'
        };
    }

    const lastCursor = count - 1;
    const currentCursor = clamp(Math.trunc(Number(cursor) || 0), 0, lastCursor);
    if (count === 1 && (repeat || reverseRepeat)) {
        return {
            cursor: 0,
            direction: 1,
            completed: false,
            boundary: 'end'
        };
    }
    const boundary = playbackDirection > 0 ? 'end' : 'start';
    const nextCursor = currentCursor + playbackDirection;
    if (nextCursor >= 0 && nextCursor <= lastCursor) {
        return {
            cursor: nextCursor,
            direction: playbackDirection,
            completed: false,
            boundary: null
        };
    }

    if (reverseRepeat) {
        const nextDirection = -playbackDirection;
        return {
            cursor: count === 1 ? 0 : currentCursor + nextDirection,
            direction: nextDirection,
            completed: false,
            boundary
        };
    }

    if (repeat) {
        return {
            cursor: 0,
            direction: 1,
            completed: false,
            boundary
        };
    }

    return {
        cursor: currentCursor,
        direction: playbackDirection,
        completed: true,
        boundary
    };
}

export function resolveDirectionalMotionType(motion, direction) {
    if (Number(direction) >= 0) return motion;
    if (motion === 'TIME_START') return 'TIME_OUT';
    if (motion === 'TIME_OUT') return 'TIME_START';
    return motion;
}

export function resolveMotionSegmentCommand(steps, cursor, direction) {
    const targetStep = Array.isArray(steps) ? steps[cursor] : null;
    if (!targetStep) return null;
    const returning = Number(direction) < 0;
    const sourceStep = returning ? steps[cursor + 1] : null;
    const commandStep = returning
        && isMotionPointMotion(targetStep.motion)
        && isMotionPointMotion(sourceStep?.motion)
        ? sourceStep
        : targetStep;
    return {
        motion: commandStep.motion,
        speed: commandStep.speed
    };
}

export function getDirectionalGripActions(motion, playback = {}) {
    if (!isGripObjectMotion(motion)) return [];
    const direction = Number(playback.direction) < 0 ? -1 : 1;
    const action = direction < 0
        ? motion === 'GRIP_USE' ? 'GRIP_RELEASE' : 'GRIP_USE'
        : motion;
    const actions = [action];
    const advanced = advanceMotionCursor(playback);
    if (playback.reverseRepeat && advanced.boundary) {
        // Motion points do not need to be replayed at a ping-pong boundary,
        // but stateful commands must be inverted there so the next leg starts
        // with the same object state as the corresponding forward leg.
        actions.push(action === 'GRIP_USE' ? 'GRIP_RELEASE' : 'GRIP_USE');
    }
    return actions;
}

export function getDirectionalTimerActions(motion, playback = {}) {
    if (motion !== 'TIME_START' && motion !== 'TIME_OUT') return [];
    const stepCount = Math.max(0, Math.trunc(Number(playback.stepCount) || 0));
    const singleStepReverse = Boolean(playback.reverseRepeat) && stepCount <= 1;
    const direction = (singleStepReverse || Number(playback.direction) >= 0) ? 1 : -1;
    const actions = [resolveDirectionalMotionType(motion, direction)];
    const advanced = advanceMotionCursor(playback);
    if (!singleStepReverse && playback.reverseRepeat && advanced.direction !== direction) {
        actions.push(resolveDirectionalMotionType(motion, advanced.direction));
    }
    return actions;
}

export function createEmptyMotionProgram(included = true) {
    return {
        included: Boolean(included),
        selectedStepId: null,
        workOrigin: null,
        status: 'idle',
        progress: 0,
        cycleTimerStartedAt: null,
        lastCycleTimeSeconds: null,
        steps: []
    };
}

export function isMotionPointMotion(motion) {
    return motion === 'MOVJ' || motion === 'MOVL';
}

export function isGripObjectMotion(motion) {
    return motion === 'GRIP_USE' || motion === 'GRIP_RELEASE';
}

export function isWaitMotion(motion) {
    return motion === 'WAIT';
}

export function isHomeMotion(motion) {
    return motion === 'HOME';
}

export function formatMotionPointName(pointIndex) {
    return `P[${pointIndex}]`;
}

export function isValidMotionPointLabel(label) {
    return label === '' || (
        typeof label === 'string'
        && label.length <= MAX_POINT_LABEL_LENGTH
        && POINT_LABEL_PATTERN.test(label)
    );
}

function formatPositionPointValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error('Position point values must be finite numbers.');
    return (Object.is(numeric, -0) ? 0 : numeric).toFixed(6);
}

export function formatPositionPointRecordLine({
    pointIndex,
    coordinates,
    armParameters,
    externalAxes,
    label = ''
}) {
    if (!Number.isInteger(pointIndex) || pointIndex < MIN_POINT_INDEX || pointIndex > MAX_POINT_INDEX) {
        throw new Error(`Position point index must be between ${MIN_POINT_INDEX} and ${MAX_POINT_INDEX}.`);
    }
    if (!Array.isArray(coordinates) || coordinates.length !== 6) {
        throw new Error('Position point coordinates must contain six values.');
    }
    if (!Array.isArray(armParameters) || armParameters.length !== 4) {
        throw new Error('Position point arm parameters must contain four values.');
    }
    if (!Array.isArray(externalAxes) || externalAxes.length !== 6) {
        throw new Error('Position point external axes must contain six values.');
    }
    const normalizedLabel = String(label || '').trim();
    if (!isValidMotionPointLabel(normalizedLabel)) {
        throw new Error('Position point label is invalid.');
    }
    const coordinateText = coordinates.map(formatPositionPointValue).join(', ');
    const armText = armParameters.map((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error('Position point arm parameters must be finite numbers.');
        return String(Math.trunc(numeric));
    }).join(', ');
    const externalText = externalAxes.map(formatPositionPointValue).join(', ');
    const labelText = normalizedLabel ? ` Name=${normalizedLabel};` : '';
    return `${formatMotionPointName(pointIndex)} = ${coordinateText}; ${armText};${externalText};${labelText}`;
}

function parsePointIndex(step, fallback = 0) {
    const direct = Number(step?.pointIndex);
    if (Number.isInteger(direct) && direct >= MIN_POINT_INDEX && direct <= MAX_POINT_INDEX) return direct;
    const legacyMatch = String(step?.name || '').trim().match(/^P(?:\[(\d+)\]|(\d+))$/i);
    const bracketed = Number(legacyMatch?.[1]);
    if (Number.isInteger(bracketed) && bracketed >= MIN_POINT_INDEX && bracketed <= MAX_POINT_INDEX) {
        return bracketed;
    }
    const oldOneBased = Number(legacyMatch?.[2]);
    const legacy = Number.isInteger(oldOneBased) ? Math.max(MIN_POINT_INDEX, oldOneBased - 1) : NaN;
    if (Number.isInteger(legacy) && legacy >= MIN_POINT_INDEX && legacy <= MAX_POINT_INDEX) return legacy;
    return fallback;
}

function clonePointMetadata(step, fallbackPointIndex) {
    const pointIndex = parsePointIndex(step, fallbackPointIndex);
    const label = typeof step?.label === 'string' ? step.label.trim() : '';
    return {
        pointIndex,
        name: formatMotionPointName(pointIndex),
        label: isValidMotionPointLabel(label) ? label : '',
        armParameters: Array.isArray(step?.armParameters) && step.armParameters.length === 4
            ? step.armParameters.map((value) => Number(value) || 0)
            : [0, 0, 0, 1],
        externalAxes: Array.isArray(step?.externalAxes) && step.externalAxes.length === 6
            ? step.externalAxes.map((value) => Number(value) || 0)
            : [0, 0, 0, 0, 0, 0]
    };
}

export function cloneMotionProgram(program) {
    let fallbackPointIndex = 0;
    const workOrigin = program?.workOrigin && typeof program.workOrigin === 'object'
        ? {
            mode: 'JOINT',
            joints: Array.isArray(program.workOrigin.joints)
                ? program.workOrigin.joints.map((value) => Number(value))
                : [],
            tcp: {
                position: Array.isArray(program.workOrigin.tcp?.position)
                    ? program.workOrigin.tcp.position.map((value) => Number(value))
                    : [],
                quaternion: Array.isArray(program.workOrigin.tcp?.quaternion)
                    ? program.workOrigin.tcp.quaternion.map((value) => Number(value))
                    : []
            },
            outputBit: Number.isSafeInteger(Number(program.workOrigin.outputBit)) && Number(program.workOrigin.outputBit) >= 0
                ? Number(program.workOrigin.outputBit)
                : 519
        }
        : null;
    return {
        included: Boolean(program?.included),
        selectedStepId: typeof program?.selectedStepId === 'string' ? program.selectedStepId : null,
        workOrigin,
        status: 'idle',
        progress: 0,
        cycleTimerStartedAt: null,
        lastCycleTimeSeconds: Number.isFinite(program?.lastCycleTimeSeconds)
            ? Math.max(0, Number(program.lastCycleTimeSeconds))
            : null,
        steps: (program?.steps || []).map((step) => {
            const motion = step.motion === 'TIME_START'
                ? 'TIME_START'
                : step.motion === 'TIME_OUT'
                    ? 'TIME_OUT'
                    : step.motion === 'DELAY'
                        ? 'DELAY'
                        : step.motion === 'VIEW'
                            ? 'VIEW'
                        : step.motion === 'GRIP_USE'
                            ? 'GRIP_USE'
                        : step.motion === 'GRIP_RELEASE'
                            ? 'GRIP_RELEASE'
                        : step.motion === 'WAIT'
                            ? 'WAIT'
                        : step.motion === 'HOME'
                            ? 'HOME'
                        : step.motion === 'MOVL'
                            ? 'MOVL'
                            : 'MOVJ';
            const pointMetadata = isMotionPointMotion(motion)
                ? clonePointMetadata(step, fallbackPointIndex++)
                : null;
            const viewSlot = motion === 'VIEW' && Number.isInteger(Number(step.viewSlot))
                ? Math.min(3, Math.max(0, Number(step.viewSlot)))
                : 0;
            return {
                id: String(step.id),
                name: pointMetadata?.name || (motion === 'DELAY'
                    ? 'Delay'
                    : motion === 'TIME_START'
                        ? 'Time Start'
                        : motion === 'TIME_OUT'
                        ? 'Time Out'
                            : motion === 'GRIP_USE'
                                ? 'Grip Use'
                            : motion === 'GRIP_RELEASE'
                                ? 'Grip Release'
                            : motion === 'WAIT'
                                ? 'Wait'
                            : motion === 'HOME'
                                ? 'Home'
                            : `View ${viewSlot + 1}`),
                motion,
                ...(pointMetadata || {}),
                ...(motion === 'DELAY'
                    ? { delaySeconds: Number(step.delaySeconds) }
                    : motion === 'MOVJ' || motion === 'MOVL'
                        ? { speed: Number(step.speed) }
                    : motion === 'VIEW'
                            ? { viewSlot }
                        : isGripObjectMotion(motion)
                            ? { gripObjectRef: String(step.gripObjectRef || '').trim() }
                        : motion === 'WAIT'
                            ? {
                                waitRobotInstanceId: String(step.waitRobotInstanceId || '').trim(),
                                waitLineNumber: Number.isInteger(Number(step.waitLineNumber))
                                    ? Number(step.waitLineNumber)
                                    : MIN_WAIT_LINE_NUMBER
                            }
                        : motion === 'HOME'
                            ? {}
                        : {}),
                joints: [...step.joints],
                tcp: {
                    position: [...step.tcp.position],
                    quaternion: [...step.tcp.quaternion]
                }
            };
        })
    };
}

export function reorderMotionSteps(steps, sourceStepId, targetStepId, placeAfter = false) {
    if (!Array.isArray(steps)) return false;
    const sourceIndex = steps.findIndex((step) => step.id === sourceStepId);
    const targetIndex = steps.findIndex((step) => step.id === targetStepId);
    if (sourceIndex < 0 || targetIndex < 0) return false;
    let insertionIndex = targetIndex + (placeAfter ? 1 : 0);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    if (insertionIndex === sourceIndex) return false;
    const [step] = steps.splice(sourceIndex, 1);
    steps.splice(insertionIndex, 0, step);
    return true;
}

function finiteArray(value, length, label) {
    if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
        throw new Error(`${label} must contain ${length} finite numbers.`);
    }
    return value.map(Number);
}

function requiredString(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
    return value.trim();
}

function normalizedQuaternion(value, label) {
    const quaternion = finiteArray(value, 4, label);
    const length = Math.hypot(...quaternion);
    if (length < 1e-8) throw new Error(`${label} is invalid.`);
    return quaternion.map((component) => component / length);
}

function normalizeWorkOrigin(value, jointCount, robotIndex) {
    if (value === null || value === undefined) return null;
    if (!value || typeof value !== 'object') {
        throw new Error(`Robot ${robotIndex + 1} Work Origin must be an object.`);
    }
    const mode = 'JOINT';
    const outputBit = value.outputBit === undefined ? 519 : Number(value.outputBit);
    if (!Number.isSafeInteger(outputBit) || outputBit < 0) {
        throw new Error(`Robot ${robotIndex + 1} Work Origin output bit must be a non-negative integer.`);
    }
    return {
        mode,
        joints: finiteArray(value.joints, jointCount, `Robot ${robotIndex + 1} Work Origin joints`),
        tcp: {
            position: finiteArray(value.tcp?.position, 3, `Robot ${robotIndex + 1} Work Origin TCP position`),
            quaternion: normalizedQuaternion(
                value.tcp?.quaternion,
                `Robot ${robotIndex + 1} Work Origin TCP quaternion`
            )
        },
        outputBit
    };
}

function normalizeTcpProfiles(value, robotIndex) {
    if (value === undefined) {
        return Array.from({ length: 3 }, () => ({
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1]
        }));
    }
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error(`Robot ${robotIndex + 1} TCP profiles must contain exactly 3 entries.`);
    }
    return value.map((profile, profileIndex) => ({
        position: finiteArray(
            profile?.position,
            3,
            `Robot ${robotIndex + 1} TCP ${profileIndex + 1} position`
        ),
        quaternion: normalizedQuaternion(
            profile?.quaternion,
            `Robot ${robotIndex + 1} TCP ${profileIndex + 1} quaternion`
        )
    }));
}

function normalizeStep(step, jointCount, index, fallbackPointIndex) {
    const motion = step?.motion === 'TIME_START'
        ? 'TIME_START'
        : step?.motion === 'TIME_OUT'
            ? 'TIME_OUT'
            : step?.motion === 'DELAY'
                ? 'DELAY'
                : step?.motion === 'VIEW'
                    ? 'VIEW'
                : step?.motion === 'GRIP_USE'
                    ? 'GRIP_USE'
                : step?.motion === 'GRIP_RELEASE'
                    ? 'GRIP_RELEASE'
                : step?.motion === 'WAIT'
                    ? 'WAIT'
                : step?.motion === 'HOME'
                    ? 'HOME'
                : step?.motion === 'MOVL'
                    ? 'MOVL'
                    : step?.motion === 'MOVJ'
                        ? 'MOVJ'
                        : null;
    if (!motion) throw new Error(`Step ${index + 1} has an unsupported motion type.`);
    const delaySeconds = motion === 'DELAY' ? Number(step.delaySeconds) : null;
    const speed = motion === 'MOVJ' || motion === 'MOVL' ? Number(step.speed) : null;
    const viewSlot = motion === 'VIEW' ? Number(step.viewSlot) : null;
    const gripObjectRef = isGripObjectMotion(motion) ? requiredString(step.gripObjectRef, `Step ${index + 1} grip object`) : null;
    const waitRobotInstanceId = motion === 'WAIT'
        ? requiredString(step.waitRobotInstanceId, `Step ${index + 1} wait target robot`)
        : null;
    const waitLineNumber = motion === 'WAIT' ? Number(step.waitLineNumber) : null;
    if (motion === 'DELAY') {
        if (!Number.isFinite(delaySeconds) || delaySeconds < MIN_DELAY_SECONDS || delaySeconds > MAX_DELAY_SECONDS) {
            throw new Error(`Step ${index + 1} delay is outside the supported seconds range.`);
        }
    } else if (motion === 'MOVJ' || motion === 'MOVL') {
        const maximumSpeed = motion === 'MOVJ' ? 100 : MAX_MOVL_SPEED;
        if (!Number.isFinite(speed) || speed < 1 || speed > maximumSpeed) {
            throw new Error(`Step ${index + 1} speed is outside the ${motion} range.`);
        }
    } else if (motion === 'VIEW' && (!Number.isInteger(viewSlot) || viewSlot < 0 || viewSlot > 3)) {
        throw new Error(`Step ${index + 1} view slot must be 0 to 3.`);
    } else if (motion === 'WAIT'
        && (!Number.isInteger(waitLineNumber)
            || waitLineNumber < MIN_WAIT_LINE_NUMBER
            || waitLineNumber > MAX_WAIT_LINE_NUMBER)) {
        throw new Error(`Step ${index + 1} wait line must be ${MIN_WAIT_LINE_NUMBER} to ${MAX_WAIT_LINE_NUMBER}.`);
    }
    const quaternion = normalizedQuaternion(step.tcp?.quaternion, `Step ${index + 1} TCP quaternion`);
    let pointMetadata = null;
    if (isMotionPointMotion(motion)) {
        const pointIndex = parsePointIndex(step, fallbackPointIndex);
        if (!Number.isInteger(pointIndex) || pointIndex < MIN_POINT_INDEX || pointIndex > MAX_POINT_INDEX) {
            throw new Error(`Step ${index + 1} point index must be ${MIN_POINT_INDEX} to ${MAX_POINT_INDEX}.`);
        }
        const label = typeof step.label === 'string' ? step.label.trim() : '';
        if (!isValidMotionPointLabel(label)) {
            throw new Error(`Step ${index + 1} label must start with a letter and use fewer than 20 letters, numbers, or underscores.`);
        }
        const armParameters = step.armParameters === undefined
            ? [0, 0, 0, 1]
            : finiteArray(step.armParameters, 4, `Step ${index + 1} arm parameters`);
        if (!armParameters.every(Number.isInteger)) {
            throw new Error(`Step ${index + 1} arm parameters must be integers.`);
        }
        pointMetadata = {
            pointIndex,
            name: formatMotionPointName(pointIndex),
            label,
            armParameters,
            externalAxes: step.externalAxes === undefined
                ? [0, 0, 0, 0, 0, 0]
                : finiteArray(step.externalAxes, 6, `Step ${index + 1} external axes`)
        };
    }
    return {
        id: requiredString(step.id, `Step ${index + 1} id`),
        name: pointMetadata?.name || (motion === 'DELAY'
            ? 'Delay'
            : motion === 'TIME_START'
                ? 'Time Start'
                : motion === 'TIME_OUT'
                ? 'Time Out'
                : motion === 'GRIP_USE'
                    ? 'Grip Use'
                : motion === 'GRIP_RELEASE'
                    ? 'Grip Release'
                : motion === 'WAIT'
                    ? 'Wait'
                : motion === 'HOME'
                    ? 'Home'
                : `View ${viewSlot + 1}`),
        motion,
        ...(pointMetadata || {}),
        ...(motion === 'DELAY'
            ? { delaySeconds }
            : motion === 'MOVJ' || motion === 'MOVL'
                ? { speed }
                : motion === 'VIEW'
                    ? { viewSlot }
                : isGripObjectMotion(motion)
                    ? { gripObjectRef }
                : motion === 'WAIT'
                    ? { waitRobotInstanceId, waitLineNumber }
                : motion === 'HOME'
                    ? {}
                : {}),
        joints: finiteArray(step.joints, jointCount, `Step ${index + 1} joints`),
        tcp: {
            position: finiteArray(step.tcp?.position, 3, `Step ${index + 1} TCP position`),
            quaternion
        }
    };
}

export function normalizeMotionProject(input) {
    if (!input || typeof input !== 'object') throw new Error('Motion project must be an object.');
    if (input.schemaVersion !== MOTION_PROJECT_SCHEMA_VERSION) {
        throw new Error(`Unsupported motion project schema: ${input.schemaVersion}`);
    }
    if (!Array.isArray(input.robots)) throw new Error('Motion project robots must be an array.');
    const instanceIds = new Set();
    const robots = input.robots.map((robot, index) => {
        const instanceId = requiredString(robot.instanceId, `Robot ${index + 1} instanceId`);
        if (instanceIds.has(instanceId)) throw new Error(`Duplicate robot instanceId: ${instanceId}`);
        instanceIds.add(instanceId);
        const jointCount = Number(robot.jointCount);
        if (!Number.isInteger(jointCount) || jointCount < 1 || jointCount > 12) {
            throw new Error(`Robot ${index + 1} has an invalid joint count.`);
        }
        const robotType = robot.robotType === 'scara'
            ? 'scara'
            : robot.robotType === 'six-axis'
                ? 'six-axis'
                : null;
        if (!robotType) throw new Error(`Robot ${index + 1} has an invalid robot type.`);
        let fallbackPointIndex = 0;
        const steps = (robot.steps || []).map((step, stepIndex) => {
            const normalized = normalizeStep(step, jointCount, stepIndex, fallbackPointIndex);
            if (isMotionPointMotion(normalized.motion)) fallbackPointIndex += 1;
            return normalized;
        });
        const stepIds = new Set();
        const pointIndices = new Set();
        steps.forEach((step) => {
            if (stepIds.has(step.id)) throw new Error(`Duplicate step id for ${instanceId}: ${step.id}`);
            stepIds.add(step.id);
            if (isMotionPointMotion(step.motion)) {
                if (pointIndices.has(step.pointIndex)) {
                    throw new Error(`Duplicate point index for ${instanceId}: P[${step.pointIndex}]`);
                }
                pointIndices.add(step.pointIndex);
            }
        });
        const baseScale = finiteArray(robot.baseTransform?.scale, 3, `Robot ${index + 1} base scale`);
        if (baseScale.some((value) => value <= 0)) throw new Error(`Robot ${index + 1} base scale must be positive.`);
        const tcpProfiles = normalizeTcpProfiles(robot.tcpProfiles, index);
        const workObjects = normalizeWorkObjects(robot.workObjects);
        const workOrigin = normalizeWorkOrigin(robot.workOrigin, jointCount, index);
        const activeTcpProfileIndex = robot.activeTcpProfileIndex === undefined
            ? 0
            : Number(robot.activeTcpProfileIndex);
        if (!Number.isInteger(activeTcpProfileIndex)
            || activeTcpProfileIndex < 0
            || activeTcpProfileIndex >= tcpProfiles.length) {
            throw new Error(`Robot ${index + 1} active TCP index is invalid.`);
        }
        return {
            instanceId,
            modelFolder: requiredString(robot.modelFolder, `Robot ${index + 1} modelFolder`),
            displayName: requiredString(robot.displayName, `Robot ${index + 1} displayName`),
            instanceNumber: Number.isInteger(Number(robot.instanceNumber))
                && Number(robot.instanceNumber) > 0
                ? Number(robot.instanceNumber)
                : null,
            robotType,
            jointCount,
            included: robot.included !== false,
            baseTransform: {
                position: finiteArray(robot.baseTransform?.position, 3, `Robot ${index + 1} base position`),
                quaternion: normalizedQuaternion(robot.baseTransform?.quaternion, `Robot ${index + 1} base quaternion`),
                scale: baseScale
            },
            externalAxes: robot.externalAxes === undefined
                ? [0, 0, 0, 0, 0, 0]
                : finiteArray(robot.externalAxes, 6, `Robot ${index + 1} external axes`),
            tcpProfiles,
            activeTcpProfileIndex,
            workObjects,
            activeWorkObjectIndex: Number.isInteger(Number(robot.activeWorkObjectIndex))
                ? Math.max(0, Math.min(workObjects.length - 1, Number(robot.activeWorkObjectIndex)))
                : 0,
            workOrigin,
            steps
        };
    });
    const reverseRepeatCurrentRobot = Boolean(input.reverseRepeatCurrentRobot);
    const reverseRepeat = Boolean(input.reverseRepeat);
    return {
        schemaVersion: MOTION_PROJECT_SCHEMA_VERSION,
        repeatCurrentRobot: reverseRepeatCurrentRobot
            ? false
            : input.repeatCurrentRobot === undefined
                ? Boolean(input.repeat)
                : Boolean(input.repeatCurrentRobot),
        reverseRepeatCurrentRobot,
        repeat: reverseRepeat ? false : Boolean(input.repeat),
        reverseRepeat,
        robots
    };
}
