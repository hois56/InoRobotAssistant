export const EXTRUDE_CUT_DIRECTIONS = Object.freeze(['positive', 'negative']);

export function normalizeExtrudeCutDirection(value) {
    return value === 'negative' ? 'negative' : 'positive';
}

export function getExtrudeCutLayout(height, depth, direction = 'positive') {
    const safeHeight = Number(height);
    const safeDepth = Number(depth);
    if (!Number.isFinite(safeHeight) || !Number.isFinite(safeDepth)
        || safeHeight <= 0 || safeDepth <= 0 || safeDepth > safeHeight) return null;
    const normalizedDirection = normalizeExtrudeCutDirection(direction);
    const cutStartZ = normalizedDirection === 'negative' ? safeHeight - safeDepth : 0;
    const cutEndZ = cutStartZ + safeDepth;
    const remainingStartZ = normalizedDirection === 'negative' ? 0 : cutEndZ;
    const remainingEndZ = normalizedDirection === 'negative' ? cutStartZ : safeHeight;
    return {
        direction: normalizedDirection,
        cutStartZ,
        cutEndZ,
        remainingStartZ,
        remainingEndZ,
        remainingHeight: Math.max(0, remainingEndZ - remainingStartZ)
    };
}
