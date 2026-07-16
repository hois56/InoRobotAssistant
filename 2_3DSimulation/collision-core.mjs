export const COLLISION_FALLBACK_OVERLAP_MM = 1;

export function aabbOverlapDepth(left, right) {
    if (!left?.min || !left?.max || !right?.min || !right?.max) {
        throw new TypeError('Both AABBs must provide min and max coordinates.');
    }
    return {
        x: Math.min(left.max.x, right.max.x) - Math.max(left.min.x, right.min.x),
        y: Math.min(left.max.y, right.max.y) - Math.max(left.min.y, right.min.y),
        z: Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z)
    };
}

export function hasMeaningfulAabbOverlap(left, right, minimumOverlap = COLLISION_FALLBACK_OVERLAP_MM) {
    const minimum = Number.isFinite(Number(minimumOverlap)) ? Math.max(0, Number(minimumOverlap)) : 0;
    const depth = aabbOverlapDepth(left, right);
    return depth.x >= minimum && depth.y >= minimum && depth.z >= minimum;
}
