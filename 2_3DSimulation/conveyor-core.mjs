export function normalizeConveyorSettings(value = {}) {
    const speed = Number(value.conveyorSpeed);
    return {
        conveyorAxis: ['X', '-X', 'Y', '-Y'].includes(value.conveyorAxis) ? value.conveyorAxis : 'X',
        conveyorSpeed: Number.isFinite(speed) && speed > 0 ? Math.min(speed, 5000) : 100
    };
}

// Positions and bounds are expressed in the conveyor's local frame, in mm.
export function advanceConveyorObject(belt, object, axis, speed, seconds, tolerance = 2) {
    if (!belt || !object || !(seconds > 0) || !(speed > 0)) return 0;
    const coordinate = axis.endsWith('Y') ? 'y' : 'x';
    const across = coordinate === 'x' ? 'y' : 'x';
    if (Math.abs(object.min.z - belt.max.z) > tolerance
        || object.min[across] < belt.min[across] - tolerance
        || object.max[across] > belt.max[across] + tolerance
        || object.min[coordinate] < belt.min[coordinate] - tolerance
        || object.max[coordinate] > belt.max[coordinate] + tolerance) return 0;
    const negative = axis.startsWith('-');
    const available = negative ? object.min[coordinate] - belt.min[coordinate] : belt.max[coordinate] - object.max[coordinate];
    return (negative ? -1 : 1) * Math.max(0, Math.min(available, speed * seconds));
}

export function conveyorElapsedSeconds(previous, timestamp) {
    const elapsed = (timestamp - previous) / 1000;
    // A background tab or an inactive render loop must never cause a jump.
    return previous === null || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 0.25 ? 0 : elapsed;
}
