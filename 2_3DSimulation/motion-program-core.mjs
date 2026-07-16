export const MOTION_PROJECT_SCHEMA_VERSION = 1;
export const DEFAULT_MOVJ_SPEED = 20;
export const DEFAULT_MOVL_SPEED = 100;
export const MAX_MOVL_SPEED = 1500;
export const DEFAULT_DELAY_SECONDS = 1;
export const MIN_DELAY_SECONDS = 0.1;
export const MAX_DELAY_SECONDS = 3600;
export const MOVJ_REVOLUTE_RATE = 180;
export const MOVJ_PRISMATIC_RATE = 500;
export const MOVJ_EASING_PEAK_SLOPE = 1.5;
export const MOVL_ROTATION_RATE = 90;

export function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export function smoothstep(value) {
    const t = clamp(Number(value) || 0, 0, 1);
    return t * t * (3 - 2 * t);
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
        const configuredRate = Number(joints[index]?.definition?.maxSpeed);
        const fallbackRate = joints[index]?.definition?.type === 'prismatic'
            ? MOVJ_PRISMATIC_RATE
            : MOVJ_REVOLUTE_RATE;
        const rate = Number.isFinite(configuredRate) && configuredRate > 0
            ? configuredRate
            : fallbackRate;
        return Math.abs(Number(target) - start) * MOVJ_EASING_PEAK_SLOPE / (rate * speedScale);
    });
    return Math.max(0.1, ...durations);
}

export function calculateMovlDuration(distanceMillimeters, rotationDegrees, speedMillimetersPerSecond) {
    const speed = clamp(Number(speedMillimetersPerSecond) || DEFAULT_MOVL_SPEED, 1, MAX_MOVL_SPEED);
    return Math.max(
        0.1,
        Math.max(0, Number(distanceMillimeters) || 0) / speed,
        Math.max(0, Number(rotationDegrees) || 0) / MOVL_ROTATION_RATE
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

export function cloneMotionProgram(program) {
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
            return {
                id: String(step.id),
                name: String(step.name),
                motion,
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

function normalizeStep(step, jointCount, index) {
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
    return {
        id: requiredString(step.id, `Step ${index + 1} id`),
        name: requiredString(step.name, `Step ${index + 1} name`),
        motion,
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
        const steps = (robot.steps || []).map((step, stepIndex) => normalizeStep(step, jointCount, stepIndex));
        const stepIds = new Set();
        steps.forEach((step) => {
            if (stepIds.has(step.id)) throw new Error(`Duplicate step id for ${instanceId}: ${step.id}`);
            stepIds.add(step.id);
        });
        const baseScale = finiteArray(robot.baseTransform?.scale, 3, `Robot ${index + 1} base scale`);
        if (baseScale.some((value) => value <= 0)) throw new Error(`Robot ${index + 1} base scale must be positive.`);
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
