import { engine, numbers } from './wasm/engine.mjs';

export function normalizeConveyorSettings(value = {}) {
    const speed = Number(value.conveyorSpeed);
    return {
        conveyorAxis: ['X', '-X', 'Y', '-Y'].includes(value.conveyorAxis) ? value.conveyorAxis : 'X',
        conveyorSpeed: Number.isFinite(speed) && speed > 0 ? Math.min(speed, 5000) : 100
    };
}

// Positions and bounds are expressed in the conveyor's local frame, in mm.
export function advanceConveyorObject(belt, object, axis, speed, seconds, tolerance = 2, allowExit = false) {
    if (!belt || !object || !(seconds > 0) || !(speed > 0)) return 0;
    const data = numbers(12);
    let offset = 0;
    for (const point of [belt.min, belt.max, object.min, object.max]) {
        data[offset++] = point.x;
        data[offset++] = point.y;
        data[offset++] = point.z;
    }
    return engine.conveyor_travel(Number(axis.endsWith('Y')), axis.startsWith('-'), speed, seconds, tolerance, allowExit);
}

export function conveyorElapsedSeconds(previous, timestamp, background = false) {
    return previous === null ? 0 : engine.conveyor_seconds((timestamp - previous) / 1000, background);
}
