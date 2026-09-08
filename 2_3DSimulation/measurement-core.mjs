const MEASUREMENT_EPSILON = 1e-9;

function readPoint(point) {
    const values = ['x', 'y', 'z'].map((axis) => Number(point?.[axis]));
    if (!values.every(Number.isFinite)) return null;
    return { x: values[0], y: values[1], z: values[2] };
}

function clonePoint(point) {
    return { x: point.x, y: point.y, z: point.z };
}

export function calculateMeasurementResult(firstPoint, secondPoint) {
    const first = readPoint(firstPoint);
    const second = readPoint(secondPoint);
    if (!first || !second) return null;

    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const dz = second.z - first.z;
    const diagonal = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(diagonal)) return null;

    return {
        first: clonePoint(first),
        second: clonePoint(second),
        dx,
        dy,
        dz,
        diagonal,
        orthogonalX: Math.abs(dx),
        orthogonalY: Math.abs(dy),
        orthogonalZ: Math.abs(dz),
        isSamePoint: diagonal <= MEASUREMENT_EPSILON
    };
}

export function isValidTargetDistance(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function calculatePlacementTarget(firstPoint, secondPoint, targetDistance) {
    const measurement = calculateMeasurementResult(firstPoint, secondPoint);
    if (!measurement || !isValidTargetDistance(targetDistance)
        || measurement.diagonal <= MEASUREMENT_EPSILON) return null;

    const unitDirection = {
        x: measurement.dx / measurement.diagonal,
        y: measurement.dy / measurement.diagonal,
        z: measurement.dz / measurement.diagonal
    };
    const targetPoint = {
        x: measurement.first.x + unitDirection.x * targetDistance,
        y: measurement.first.y + unitDirection.y * targetDistance,
        z: measurement.first.z + unitDirection.z * targetDistance
    };
    return {
        currentDistance: measurement.diagonal,
        unitDirection,
        targetPoint,
        translation: {
            x: targetPoint.x - measurement.first.x,
            y: targetPoint.y - measurement.first.y,
            z: targetPoint.z - measurement.first.z
        }
    };
}
