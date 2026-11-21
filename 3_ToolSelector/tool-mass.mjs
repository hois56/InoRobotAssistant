// The tool can also be imported independently by the geometry validators.
if (!globalThis.InoSite) await import('../shared/site-engine.js');

export function createCoordinateFrame(originMm, xDirection, yDirection) {
    const [x, y, z] = InoSite.axes(xDirection, yDirection);
    return { originMm: Array.from(originMm), x, y, z };
}
export function combineStepParts(parts, frame) { return InoSite.combineParts(parts, frame); }
export function pointInFrame(point, frame) { return InoSite.framePoint(point, frame); }

function flatten(value) {
    if (!value) return [];
    return Array.isArray(value[0]) ? value.flat() : value;
}

export function integrateStepMesh(mesh) {
    const rawPositions = flatten(mesh?.attributes?.position?.array);
    const positions = ArrayBuffer.isView(rawPositions) ? rawPositions
        : Array.from(rawPositions, value => typeof value === 'number' ? value : NaN);
    const indices = flatten(mesh?.index?.array);
    // Reject invalid indices before a plain JS array can wrap to uint32.
    if (!(indices instanceof Uint32Array || indices instanceof Uint16Array || indices instanceof Uint8Array)
        && Array.prototype.some.call(indices, n => !Number.isInteger(n) || n < 0 || n >= positions.length / 3)) {
        throw new Error('STEP mesh contains a non-finite coordinate.');
    }
    return InoSite.meshProperties(positions, indices);
}
