export const MOTION_PROJECT_SCHEMA_VERSION = 1;
export const DEFAULT_MOVJ_SPEED = 100;
export const DEFAULT_MOVL_SPEED = 100;
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
export const MIN_POINT_INDEX = 0;
export const MAX_POINT_INDEX = 9999;
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

export function createEmptyMotionProgram(included = true) {
    return {
        included: Boolean(included),
        selectedStepId: null,
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
    return {
        included: Boolean(program?.included),
        selectedStepId: typeof program?.selectedStepId === 'string' ? program.selectedStepId : null,
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
                        : step.motion === 'MOVL'
                            ? 'MOVL'
                            : 'MOVJ';
            const pointMetadata = isMotionPointMotion(motion)
                ? clonePointMetadata(step, fallbackPointIndex++)
                : null;
            return {
                id: String(step.id),
                name: pointMetadata?.name || (motion === 'DELAY'
                    ? 'Delay'
                    : motion === 'TIME_START'
                        ? 'Time Start'
                        : 'Time Out'),
                motion,
                ...(pointMetadata || {}),
                ...(motion === 'DELAY'
                    ? { delaySeconds: Number(step.delaySeconds) }
                    : motion === 'MOVJ' || motion === 'MOVL'
                        ? { speed: Number(step.speed) }
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
                : step?.motion === 'MOVL'
                    ? 'MOVL'
                    : step?.motion === 'MOVJ'
                        ? 'MOVJ'
                        : null;
    if (!motion) throw new Error(`Step ${index + 1} has an unsupported motion type.`);
    const delaySeconds = motion === 'DELAY' ? Number(step.delaySeconds) : null;
    const speed = motion === 'MOVJ' || motion === 'MOVL' ? Number(step.speed) : null;
    if (motion === 'DELAY') {
        if (!Number.isFinite(delaySeconds) || delaySeconds < MIN_DELAY_SECONDS || delaySeconds > MAX_DELAY_SECONDS) {
            throw new Error(`Step ${index + 1} delay is outside the supported seconds range.`);
        }
    } else if (motion === 'MOVJ' || motion === 'MOVL') {
        const maximumSpeed = motion === 'MOVJ' ? 100 : MAX_MOVL_SPEED;
        if (!Number.isFinite(speed) || speed < 1 || speed > maximumSpeed) {
            throw new Error(`Step ${index + 1} speed is outside the ${motion} range.`);
        }
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
                : 'Time Out'),
        motion,
        ...(pointMetadata || {}),
        ...(motion === 'DELAY'
            ? { delaySeconds }
            : motion === 'MOVJ' || motion === 'MOVL'
                ? { speed }
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
            robotType,
            jointCount,
            included: robot.included !== false,
            baseTransform: {
                position: finiteArray(robot.baseTransform?.position, 3, `Robot ${index + 1} base position`),
                quaternion: normalizedQuaternion(robot.baseTransform?.quaternion, `Robot ${index + 1} base quaternion`),
                scale: baseScale
            },
            tcpProfiles,
            activeTcpProfileIndex,
            steps
        };
    });
    return {
        schemaVersion: MOTION_PROJECT_SCHEMA_VERSION,
        repeatCurrentRobot: input.repeatCurrentRobot === undefined
            ? Boolean(input.repeat)
            : Boolean(input.repeatCurrentRobot),
        repeat: Boolean(input.repeat),
        robots
    };
}
