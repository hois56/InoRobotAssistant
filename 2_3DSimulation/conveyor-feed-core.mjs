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
    const range = rotationRange * Math.PI / 180;
    const extent = (a, b) => {
        const angle = Math.min(range, Math.atan2(b, a));
        return a * Math.cos(angle) + b * Math.sin(angle);
    };
    return [extent(size[0], size[1]), extent(size[1], size[0]), size[2]];
}

export function sampleConveyorFeedRotation(size, span, rotationRange, random = Math.random) {
    let angle = (random() * 2 - 1) * rotationRange * Math.PI / 180;
    // A tight belt can permit less rotation than the requested range. Zero always preserves the original fit.
    for (let i = 0; i < 24; i++, angle /= 2) {
        const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
        if (size[0] * c + size[1] * s <= span[0] + 1e-8 && size[1] * c + size[0] * s <= span[1] + 1e-8) return angle;
    }
    return 0;
}

// Feed spacing is the minimum clear distance between successive workpieces, in belt-local mm.
export function planConveyorFeed(progress, distance, pitch) {
    if (!Number.isFinite(pitch) || pitch <= 0) throw new Error('Invalid conveyor feed pitch.');
    if (!Number.isFinite(distance) || distance <= 0) return { offsets: [], progress };
    const offsets = [];
    const first = Math.max(0, pitch - progress);
    for (let offset = first; offset <= distance + 1e-8; offset += pitch) offsets.push(Math.min(offset, distance));
    const remainder = (Math.max(0, progress) + distance) % pitch;
    return { offsets, progress: remainder < 1e-8 || pitch - remainder < 1e-8 ? 0 : remainder };
}
