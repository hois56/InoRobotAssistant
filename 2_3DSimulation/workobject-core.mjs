export const WOBJ_WORLD_INDEX = 0;
export const WOBJ_USER_COUNT = 15;
export const WOBJ_FRAME_COUNT = WOBJ_USER_COUNT + 1;
export const WOBJ_MAX_INDEX = WOBJ_FRAME_COUNT - 1;
export const WOBJ_POSITION_LIMIT = 1000000;
export const WOBJ_ROTATION_LIMIT = 360000;

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, minimum, maximum, fallback = 0) {
    const number = finiteNumber(value, fallback);
    return Math.min(maximum, Math.max(minimum, number));
}

function normalizeVector(value, limit, fallback = [0, 0, 0]) {
    return Array.from({ length: 3 }, (_, index) => clampNumber(
        Array.isArray(value) ? value[index] : undefined,
        -limit,
        limit,
        fallback[index]
    ));
}

export function createDefaultWorkObject(index = 0) {
    const normalizedIndex = Number.isInteger(Number(index))
        ? Math.max(WOBJ_WORLD_INDEX, Math.min(WOBJ_MAX_INDEX, Number(index)))
        : WOBJ_WORLD_INDEX;
    const isWorld = normalizedIndex === WOBJ_WORLD_INDEX;
    return {
        index: normalizedIndex,
        name: isWorld ? 'World' : `Wobj ${normalizedIndex}`,
        defined: isWorld,
        visible: isWorld,
        editable: !isWorld,
        position: [0, 0, 0],
        rotation: [0, 0, 0]
    };
}

export function normalizeWorkObject(input, index = 0) {
    const fallback = createDefaultWorkObject(index);
    const source = input && typeof input === 'object' ? input : {};
    const normalizedIndex = Number.isInteger(Number(index))
        ? Math.max(WOBJ_WORLD_INDEX, Math.min(WOBJ_MAX_INDEX, Number(index)))
        : fallback.index;
    const isWorld = normalizedIndex === WOBJ_WORLD_INDEX;
    const position = normalizeVector(source.position, WOBJ_POSITION_LIMIT, fallback.position);
    const rotation = normalizeVector(source.rotation || source.rotationDegrees, WOBJ_ROTATION_LIMIT, fallback.rotation);
    return {
        index: normalizedIndex,
        name: isWorld
            ? 'World'
            : typeof source.name === 'string' && source.name.trim()
                ? source.name.trim().slice(0, 40)
                : fallback.name,
        defined: isWorld || source.defined === true,
        visible: isWorld
            ? true
            : source.visible === undefined ? fallback.visible : source.visible !== false,
        editable: !isWorld,
        position: isWorld ? [0, 0, 0] : position,
        rotation: isWorld ? [0, 0, 0] : rotation
    };
}

export function normalizeWorkObjects(input) {
    const source = Array.isArray(input) ? input : [];
    return Array.from({ length: WOBJ_FRAME_COUNT }, (_, index) => (
        normalizeWorkObject(source[index], index)
    ));
}

export function cloneWorkObjects(workObjects) {
    return normalizeWorkObjects(workObjects).map((workObject) => ({
        ...workObject,
        position: [...workObject.position],
        rotation: [...workObject.rotation]
    }));
}

export function resolveWorkObjectIndex(value, fallback = WOBJ_WORLD_INDEX) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric)) return fallback;
    return Math.max(WOBJ_WORLD_INDEX, Math.min(WOBJ_MAX_INDEX, numeric));
}

export function isEditableWorkObjectIndex(value) {
    const index = resolveWorkObjectIndex(value, -1);
    return index >= 1 && index <= WOBJ_MAX_INDEX;
}

export function normalizeWorkObjectReference(input, fallbackRobotId = null) {
    const source = input && typeof input === 'object' ? input : {};
    const index = resolveWorkObjectIndex(source.workObjectIndex ?? source.index, WOBJ_WORLD_INDEX);
    return {
        robotId: index === WOBJ_WORLD_INDEX
            ? null
            : typeof source.robotId === 'string' && source.robotId.trim()
                ? source.robotId.trim()
                : fallbackRobotId,
        workObjectIndex: index
    };
}
