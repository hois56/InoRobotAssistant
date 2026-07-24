export const END_MONITORING_OBJECT_COUNT = 16;
export const END_MONITORING_COORDINATE_MIN = -10000;
export const END_MONITORING_COORDINATE_MAX = 10000;
export const END_MONITORING_RADIUS_MAX = 10000;
export const END_MONITORING_HEIGHT_MAX = 10000;
export const END_MONITORING_MTPC_TOOL_IDS = Object.freeze(['tool0', 'tcp0', 'tcp1', 'tcp2']);

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, minimum, maximum, fallback = minimum) {
    return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
}

function normalizePoint(value, fallback = [0, 0, 0]) {
    return Array.from({ length: 3 }, (_, index) => clampNumber(
        Array.isArray(value) ? value[index] : undefined,
        END_MONITORING_COORDINATE_MIN,
        END_MONITORING_COORDINATE_MAX,
        fallback[index]
    ));
}

function normalizeMtcpToolIds(value) {
    if (!Array.isArray(value)) return ['tool0'];
    return END_MONITORING_MTPC_TOOL_IDS.filter((toolId) => value.includes(toolId));
}

export function createDefaultEndMonitoringObject(id = 0) {
    return {
        id: Number.isInteger(Number(id)) && Number(id) >= 0 ? Number(id) : 0,
        remarks: '',
        type: 'mtcp',
        mtcpToolIds: ['tool0'],
        sphere: {
            centerZ: 0,
            radius: 100
        },
        cuboid: {
            method: 'diagonal',
            p1: [-50, -50, 0],
            p2: [50, 50, 100],
            datum: [0, 0, 0],
            offset: [100, 100, 100],
            points: [[-50, -50, 0], [50, -50, 0], [50, 50, 0], [-50, 50, 0]],
            height: 100
        }
    };
}

export function normalizeEndMonitoringObject(input, id = 0) {
    const fallback = createDefaultEndMonitoringObject(id);
    const source = input && typeof input === 'object' ? input : {};
    const sphere = source.sphere && typeof source.sphere === 'object' ? source.sphere : {};
    const cuboid = source.cuboid && typeof source.cuboid === 'object' ? source.cuboid : {};
    const normalizedId = Number.isInteger(Number(source.id)) && Number(source.id) >= 0
        ? Number(source.id)
        : fallback.id;
    return {
        id: normalizedId,
        remarks: typeof source.remarks === 'string' ? source.remarks.slice(0, 120) : '',
        type: source.type === 'sphere' || source.type === 'cuboid' ? source.type : 'mtcp',
        mtcpToolIds: normalizeMtcpToolIds(source.mtcpToolIds),
        sphere: {
            centerZ: clampNumber(
                sphere.centerZ,
                END_MONITORING_COORDINATE_MIN,
                END_MONITORING_COORDINATE_MAX,
                fallback.sphere.centerZ
            ),
            radius: clampNumber(sphere.radius, 0, END_MONITORING_RADIUS_MAX, fallback.sphere.radius)
        },
        cuboid: {
            method: cuboid.method === 'datumOffset' || cuboid.method === 'fourPointsHeight'
                ? cuboid.method
                : 'diagonal',
            p1: normalizePoint(cuboid.p1, fallback.cuboid.p1),
            p2: normalizePoint(cuboid.p2, fallback.cuboid.p2),
            datum: normalizePoint(cuboid.datum, fallback.cuboid.datum),
            offset: normalizePoint(cuboid.offset, fallback.cuboid.offset),
            points: Array.from({ length: 4 }, (_, index) => normalizePoint(
                Array.isArray(cuboid.points) ? cuboid.points[index] : undefined,
                fallback.cuboid.points[index]
            )),
            height: clampNumber(cuboid.height, 0, END_MONITORING_HEIGHT_MAX, fallback.cuboid.height)
        }
    };
}

export function normalizeEndMonitoringObjects(input) {
    const source = Array.isArray(input) ? input : [];
    return Array.from({ length: END_MONITORING_OBJECT_COUNT }, (_, index) => (
        normalizeEndMonitoringObject(source[index], index)
    ));
}

export function cloneEndMonitoringObjects(objects) {
    return normalizeEndMonitoringObjects(objects).map((object) => ({
        ...object,
        mtcpToolIds: [...object.mtcpToolIds],
        sphere: { ...object.sphere },
        cuboid: {
            ...object.cuboid,
            p1: [...object.cuboid.p1],
            p2: [...object.cuboid.p2],
            datum: [...object.cuboid.datum],
            offset: [...object.cuboid.offset],
            points: object.cuboid.points.map((point) => [...point])
        }
    }));
}

export function getEndMonitoringCuboidBounds(object) {
    const normalized = normalizeEndMonitoringObject(object, object?.id ?? 0);
    const { cuboid } = normalized;
    let points;
    if (cuboid.method === 'datumOffset') {
        points = [cuboid.datum, cuboid.datum.map((value, index) => value + cuboid.offset[index])];
    } else if (cuboid.method === 'fourPointsHeight') {
        points = [
            ...cuboid.points,
            ...cuboid.points.map((point) => [point[0], point[1], point[2] + cuboid.height])
        ];
    } else {
        points = [cuboid.p1, cuboid.p2];
    }
    return {
        min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
        max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])))
    };
}

function subtractPoints(left, right) {
    return left.map((value, index) => value - right[index]);
}

function vectorLength(vector) {
    return Math.hypot(...vector);
}

function normalizeVector(vector) {
    const length = vectorLength(vector);
    return length > 1e-9 ? vector.map((value) => value / length) : [1, 0, 0];
}

function pointDistance(left, right) {
    return vectorLength(subtractPoints(left, right));
}

export function getEndMonitoringCuboidTransform(object) {
    const normalized = normalizeEndMonitoringObject(object, object?.id ?? 0);
    const { cuboid } = normalized;
    if (cuboid.method !== 'fourPointsHeight') {
        const bounds = getEndMonitoringCuboidBounds(normalized);
        return {
            center: bounds.min.map((value, index) => (value + bounds.max[index]) / 2),
            axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            halfSizes: bounds.max.map((value, index) => (value - bounds.min[index]) / 2)
        };
    }
    const [p1, p2, , p4] = cuboid.points;
    const axisXVector = subtractPoints(p2, p1);
    const axisYVector = subtractPoints(p4, p1);
    const axisXLength = vectorLength(axisXVector);
    const axisYLength = vectorLength(axisYVector);
    const baseCenter = p1.map((value, index) => value + (axisXVector[index] + axisYVector[index]) / 2);
    return {
        center: [baseCenter[0], baseCenter[1], baseCenter[2] + cuboid.height / 2],
        axes: [normalizeVector(axisXVector), normalizeVector(axisYVector), [0, 0, 1]],
        halfSizes: [axisXLength / 2, axisYLength / 2, cuboid.height / 2]
    };
}

function hasPositiveVolume(bounds) {
    return bounds.min.every((value, index) => value < bounds.max[index]);
}

export function validateEndMonitoringObject(object) {
    const normalized = normalizeEndMonitoringObject(object, object?.id ?? 0);
    const errors = [];
    if (normalized.type === 'mtcp' && normalized.mtcpToolIds.length === 0) {
        errors.push('Select at least one TCP.');
    }
    if (normalized.type === 'cuboid') {
        const { cuboid } = normalized;
        const bounds = getEndMonitoringCuboidBounds(normalized);
        if (cuboid.method === 'fourPointsHeight') {
            const uniquePoints = new Set(cuboid.points.map((point) => point.map((value) => value.toFixed(6)).join(',')));
            if (uniquePoints.size !== 4) errors.push('The four base points must be different.');
            const [p1, p2, p3, p4] = cuboid.points;
            const edgeX = subtractPoints(p2, p1);
            const edgeY = subtractPoints(p4, p1);
            const edgeXLength = vectorLength(edgeX);
            const edgeYLength = vectorLength(edgeY);
            const scale = Math.max(1, edgeXLength, edgeYLength);
            const expectedP3 = p1.map((value, index) => value + edgeX[index] + edgeY[index]);
            if (edgeXLength < 1e-6 || edgeYLength < 1e-6 || Math.abs(edgeX[0] * edgeY[0] + edgeX[1] * edgeY[1] + edgeX[2] * edgeY[2]) > scale * scale * 1e-5
                || pointDistance(p3, expectedP3) > scale * 1e-4
                || cuboid.points.some((point) => Math.abs(point[2] - p1[2]) > 1e-4)) {
                errors.push('Four points must be ordered rectangular base corners in the Tool0 XY plane.');
            }
            if (!(cuboid.height > 0)) errors.push('Height must be greater than 0 mm.');
        }
        if (!hasPositiveVolume(bounds)) errors.push('Monitoring cuboid must have a positive volume.');
    }
    return { valid: errors.length === 0, errors, object: normalized };
}
