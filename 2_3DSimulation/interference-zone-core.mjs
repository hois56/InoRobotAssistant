export const INTERFERENCE_ZONE_COUNT = 16;
export const INTERFERENCE_COORDINATE_MIN = -10000;
export const INTERFERENCE_COORDINATE_MAX = 10000;
export const INTERFERENCE_SAFETY_DISTANCE_MAX = 10000;

const AXES = ['x', 'y', 'z'];

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, minimum, maximum, fallback = minimum) {
    const number = finiteNumber(value, fallback);
    return Math.min(maximum, Math.max(minimum, number));
}

function normalizePoint(value, fallback = [0, 0, 0]) {
    return Array.from({ length: 3 }, (_, index) => clampNumber(
        Array.isArray(value) ? value[index] : undefined,
        INTERFERENCE_COORDINATE_MIN,
        INTERFERENCE_COORDINATE_MAX,
        fallback[index]
    ));
}

function normalizeSignal(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : -1;
}

export function createDefaultInterferenceZone(id = 0) {
    return {
        id: Number.isInteger(id) && id >= 0 ? id : 0,
        activate: false,
        remarks: '',
        targetRobotId: 'all',
        monitoringObjectId: 'currentTcp',
        inSignal: -1,
        outSignal: -1,
        insideOutside: 'inside',
        triggerAlarmAndStop: true,
        safetyDistance: 0,
        geometry: {
            method: 'diagonal',
            p1: [0, 0, 0],
            p2: [100, 100, 100],
            datum: [0, 0, 0],
            offset: [100, 100, 100]
        }
    };
}

export function normalizeInterferenceZone(input, id = 0) {
    const fallback = createDefaultInterferenceZone(id);
    const source = input && typeof input === 'object' ? input : {};
    const geometry = source.geometry && typeof source.geometry === 'object'
        ? source.geometry
        : {};
    const normalizedId = Number.isInteger(Number(source.id)) && Number(source.id) >= 0
        ? Number(source.id)
        : fallback.id;
    return {
        id: normalizedId,
        activate: source.activate === true,
        remarks: typeof source.remarks === 'string' ? source.remarks.slice(0, 120) : '',
        targetRobotId: typeof source.targetRobotId === 'string' && source.targetRobotId
            ? source.targetRobotId
            : 'all',
        monitoringObjectId: source.monitoringObjectId === 'currentTcp'
            ? 'currentTcp'
            : Number.isInteger(Number(source.monitoringObjectId)) && Number(source.monitoringObjectId) >= 0
                ? Number(source.monitoringObjectId)
                : 'currentTcp',
        inSignal: normalizeSignal(source.inSignal),
        outSignal: normalizeSignal(source.outSignal),
        insideOutside: source.insideOutside === 'outside' ? 'outside' : 'inside',
        triggerAlarmAndStop: source.triggerAlarmAndStop !== false,
        safetyDistance: clampNumber(
            source.safetyDistance,
            0,
            INTERFERENCE_SAFETY_DISTANCE_MAX,
            0
        ),
        geometry: {
            method: geometry.method === 'datumOffset' ? 'datumOffset' : 'diagonal',
            p1: normalizePoint(geometry.p1, fallback.geometry.p1),
            p2: normalizePoint(geometry.p2, fallback.geometry.p2),
            datum: normalizePoint(geometry.datum, fallback.geometry.datum),
            offset: normalizePoint(geometry.offset, fallback.geometry.offset)
        }
    };
}

export function normalizeInterferenceZones(input) {
    const source = Array.isArray(input) ? input : [];
    return Array.from({ length: INTERFERENCE_ZONE_COUNT }, (_, index) => (
        normalizeInterferenceZone(source[index], index)
    ));
}

export function cloneInterferenceZones(zones) {
    return normalizeInterferenceZones(zones).map((zone) => ({
        ...zone,
        geometry: {
            ...zone.geometry,
            p1: [...zone.geometry.p1],
            p2: [...zone.geometry.p2],
            datum: [...zone.geometry.datum],
            offset: [...zone.geometry.offset]
        }
    }));
}

function getRawBounds(zone) {
    const normalized = normalizeInterferenceZone(zone, zone?.id ?? 0);
    const source = normalized.geometry.method === 'datumOffset'
        ? {
            min: normalized.geometry.datum.map((value, index) => (
                value + Math.min(0, normalized.geometry.offset[index])
            )),
            max: normalized.geometry.datum.map((value, index) => (
                value + Math.max(0, normalized.geometry.offset[index])
            ))
        }
        : {
            min: normalized.geometry.p1.map((value, index) => (
                Math.min(value, normalized.geometry.p2[index])
            )),
            max: normalized.geometry.p1.map((value, index) => (
                Math.max(value, normalized.geometry.p2[index])
            ))
        };
    return {
        min: source.min,
        max: source.max
    };
}

export function getInterferenceZoneBounds(zone, includeSafetyDistance = true) {
    const normalized = normalizeInterferenceZone(zone, zone?.id ?? 0);
    const raw = getRawBounds(normalized);
    const safety = includeSafetyDistance ? normalized.safetyDistance : 0;
    if (normalized.insideOutside === 'outside') {
        return {
            min: raw.min.map((value) => value + safety),
            max: raw.max.map((value) => value - safety),
            rawMin: [...raw.min],
            rawMax: [...raw.max],
            safetyDistance: safety,
            mode: normalized.insideOutside
        };
    }
    return {
        min: raw.min.map((value) => value - safety),
        max: raw.max.map((value) => value + safety),
        rawMin: [...raw.min],
        rawMax: [...raw.max],
        safetyDistance: safety,
        mode: normalized.insideOutside
    };
}

export function pointInsideBounds(point, bounds) {
    if (!Array.isArray(point) || point.length < 3 || !bounds) return false;
    return AXES.every((_, index) => (
        Number(point[index]) >= bounds.min[index] - 1e-9
        && Number(point[index]) <= bounds.max[index] + 1e-9
    ));
}

export function pointInsideRawInterferenceZone(point, zone) {
    const bounds = getInterferenceZoneBounds(zone, false);
    return pointInsideBounds(point, { min: bounds.rawMin, max: bounds.rawMax });
}

export function pointInInterferenceRegion(point, zone) {
    const bounds = getInterferenceZoneBounds(zone, true);
    const insideBounds = pointInsideBounds(point, bounds);
    return bounds.mode === 'outside' ? !insideBounds : insideBounds;
}

export function segmentIntersectsBounds(start, end, bounds) {
    if (!Array.isArray(start) || !Array.isArray(end) || !bounds) return false;
    if (pointInsideBounds(start, bounds) || pointInsideBounds(end, bounds)) return true;
    let tMin = 0;
    let tMax = 1;
    for (let index = 0; index < 3; index += 1) {
        const origin = Number(start[index]);
        const delta = Number(end[index]) - origin;
        const minimum = Number(bounds.min[index]);
        const maximum = Number(bounds.max[index]);
        if (minimum > maximum) return false;
        if (Math.abs(delta) < 1e-12) {
            if (origin < minimum || origin > maximum) return false;
            continue;
        }
        const first = (minimum - origin) / delta;
        const second = (maximum - origin) / delta;
        const entry = Math.min(first, second);
        const exit = Math.max(first, second);
        tMin = Math.max(tMin, entry);
        tMax = Math.min(tMax, exit);
        if (tMin > tMax) return false;
    }
    return tMax >= 0 && tMin <= 1;
}

export function segmentIntersectsInterferenceRegion(start, end, zone) {
    const bounds = getInterferenceZoneBounds(zone, true);
    if (bounds.mode === 'outside') {
        if (bounds.min.some((value, index) => value > bounds.max[index])) return true;
        if (pointInInterferenceRegion(start, zone) || pointInInterferenceRegion(end, zone)) return true;
        return !segmentIntersectsBounds(start, end, bounds);
    }
    return segmentIntersectsBounds(start, end, bounds);
}

export function validateInterferenceZone(zone) {
    const normalized = normalizeInterferenceZone(zone, zone?.id ?? 0);
    const bounds = getInterferenceZoneBounds(normalized, false);
    const errors = [];
    if (bounds.min.some((value, index) => !(value < bounds.max[index]))) {
        errors.push('Interference zone must have a positive volume.');
    }
    if (normalized.insideOutside === 'outside'
        && normalized.safetyDistance * 2 >= Math.min(...bounds.max.map((value, index) => value - bounds.min[index]))) {
        errors.push('Safety distance is too large for an outside zone.');
    }
    return { valid: errors.length === 0, errors, zone: normalized };
}
