import { engine, numbers } from './wasm/engine.mjs';

export const DEFAULT_FEED_VARIATION = Object.freeze({ positionRange: 20, rotationRange: 15 });

export function normalizeConveyorFeedVariation(value) {
    const result = {};
    for (const [key, max, label] of [['positionRange', 1000000, '좌우 위치 편차는 0~1000000mm'], ['rotationRange', 180, '회전 편차는 0~180°']]) {
        const number = Number(value[key] ?? DEFAULT_FEED_VARIATION[key]);
        if (value[key] === '' || !Number.isFinite(number) || number < 0 || number > max) throw new Error(`${label}로 입력하세요.`);
        result[key] = number;
    }
    return result;
}

// Reserve the largest footprint within the yaw range so rotated objects retain the minimum clear gap.
export function conveyorFeedEnvelope(size, rotationRange) {
    return [engine.feed_extent(size[0], size[1], rotationRange), engine.feed_extent(size[1], size[0], rotationRange), size[2]];
}

export function sampleConveyorFeedRotation(size, span, rotationRange, random = Math.random) {
    return engine.feed_rotation(size[0], size[1], span[0], span[1], rotationRange, random());
}

// Feed spacing is the minimum clear distance between successive workpieces, in belt-local mm.
export function planConveyorFeed(progress, distance, pitch) {
    if (!Number.isFinite(pitch) || pitch <= 0) throw new Error('Invalid conveyor feed pitch.');
    if (!Number.isFinite(distance) || distance <= 0) return { offsets: [], progress };
    const count = engine.feed_offsets(progress, distance, pitch);
    const result = numbers(1 + count);
    return { offsets: Array.from(result.subarray(1)), progress: result[0] };
}
