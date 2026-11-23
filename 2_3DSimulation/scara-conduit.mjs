// Measured in the authored STL frame. X values are relative to the J2 axis.
// The cable end lies inside the gland so the end cap stays hidden as it turns.
const angledGland = (seam, cableX, cableZ, inletX, inletZ, cableFaces) => ({
    seam, radius: 48, cableEnd: [cableX, cableZ], inlet: [inletX, inletZ], cableFaces
});
const straightGland = (seam, radius, cableZ, inletZ) => ({
    seam, radius, cableEnd: [0, cableZ], inlet: [0, inletZ]
});

export const SCARA_CONDUIT_FITTINGS = Object.freeze({
    'IR-S4-40Z15': angledGland(272.8, -23, 310.41, -24, 312),
    'IR-S7-50Z20': angledGland(281.5, -8.59, 304.70, -24, 320),
    'IR-S7-60Z20': angledGland(281.5, -15.93, 312.04, -24, 320),
    'IR-S7-70Z20': angledGland(281.5, -15.95, 312.06, -24, 320),
    'IR-S10-60Z20': angledGland(281, -15.75, 311.54, -24, 319.5),
    'IR-S10-70Z20': angledGland(281.02, -15.75, 311.54, -24, 319.5, [0, 300]),
    'IR-S10-80Z20': angledGland(281.02, -15.76, 311.54, -24, 319.5, [13612, 15496]),
    'IR-S25-80Z42': straightGland(424, 30, 429.27, 444),
    'IR-S25-100Z42': straightGland(424, 30, 432.67, 444),
    'IR-S25-120Z42': straightGland(424, 30, 454, 444),
    'IR-S35-80Z42': straightGland(449, 30, 454.27, 469),
    'IR-S35-100Z42': straightGland(449, 30, 454.27, 469),
    'IR-S35-120Z42': straightGland(452, 30, 429.50, 472),
    'IR-S60-120Z40': straightGland(411.5, 31, 391.97, 433),
    'IR-GS60-120Z40': straightGland(411.5, 31, 372.10, 433)
});

export function splitScaraGlandGeometry(THREE, geometry, centerX, fitting, separateCable = false) {
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const bodyIndices = [];
    const movingIndices = [];
    const cableIndices = [];
    const groups = geometry.groups.length ? geometry.groups : [{
        start: 0, count: index?.count ?? position.count, materialIndex: 0
    }];
    const fixedGroups = [];
    const inside = vertex => Math.hypot(position.getX(vertex) - centerX, position.getY(vertex)) <= fitting.radius;

    for (const { start, count, materialIndex } of groups) {
        const bodyStart = bodyIndices.length;
        for (let offset = start; offset < start + count; offset += 3) {
            const a = index ? index.getX(offset) : offset;
            const b = index ? index.getX(offset + 1) : offset + 1;
            const c = index ? index.getX(offset + 2) : offset + 2;
            if (separateCable && a >= fitting.cableFaces[0] * 3 && a < fitting.cableFaces[1] * 3) {
                cableIndices.push(a, b, c);
                continue;
            }
            const zA = position.getZ(a);
            const zB = position.getZ(b);
            const zC = position.getZ(c);
            const aboveSeam = Math.min(zA, zB, zC) >= fitting.seam - 0.1
                && Math.max(zA, zB, zC) > fitting.seam + 0.1;
            const moving = aboveSeam && (separateCable || (inside(a) && inside(b) && inside(c)));
            (moving ? movingIndices : bodyIndices).push(a, b, c);
        }
        fixedGroups.push({ start: bodyStart, count: bodyIndices.length - bodyStart, materialIndex });
    }

    const compact = (vertices) => {
        const result = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            const array = new attribute.array.constructor(vertices.length * attribute.itemSize);
            vertices.forEach((vertex, i) => {
                const start = vertex * attribute.itemSize;
                array.set(attribute.array.subarray(start, start + attribute.itemSize), i * attribute.itemSize);
            });
            result.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize));
        }
        return result;
    };
    const fixed = compact(bodyIndices);
    if (!separateCable && geometry.groups.length) {
        fixed.userData = { ...geometry.userData };
        fixed.setIndex(bodyIndices.map((_, i) => i));
        fixed.groups = fixedGroups;
    }
    return {
        fixed,
        moving: compact(movingIndices),
        cable: separateCable ? compact(cableIndices) : null
    };
}

export function createScaraSpanMapping(sourceSpan, targetSpan, heightOffset) {
    // Preserve both ends and spread compression/extension through the flexible middle.
    const fixedLead = Math.min(45, sourceSpan * 0.12, targetSpan * 0.24);
    const movingLead = Math.min(40, sourceSpan * 0.18, targetSpan * 0.24);
    const sourceMiddle = sourceSpan - fixedLead - movingLead;
    const targetMiddle = targetSpan - fixedLead - movingLead;
    const ratio = targetMiddle / sourceMiddle;
    const shoulder = Math.min(0.12, ratio * 0.25);
    const speed = (ratio - shoulder) / (1 - shoulder);
    const shoulderDistance = shoulder * (1 + speed) * 0.5;

    const mapped = { distance: 0, scale: 1, height: 0, slope: 0 };
    return (u) => {
        const t = (u - fixedLead) / sourceMiddle;
        if (t <= 0 || t >= 1) {
            mapped.distance = t <= 0 ? u : u + targetSpan - sourceSpan;
            mapped.scale = 1;
            mapped.height = t <= 0 ? 0 : heightOffset;
            mapped.slope = 0;
            return mapped;
        }

        const fromEnd = t > 0.5;
        const near = fromEnd ? 1 - t : t;
        let distance = shoulderDistance + speed * (near - shoulder);
        let scale = speed;
        if (near < shoulder) {
            const x = near / shoulder;
            distance = shoulder * (x + (speed - 1) * x ** 3 * (1 - x / 2));
            scale = 1 + (speed - 1) * x * x * (3 - 2 * x);
        }
        mapped.distance = fixedLead + (fromEnd ? targetMiddle - sourceMiddle * distance : sourceMiddle * distance);
        mapped.scale = scale;
        mapped.height = heightOffset * t * t * (3 - 2 * t);
        mapped.slope = heightOffset * 6 * t * (1 - t) / sourceMiddle;
        return mapped;
    };
}
