export function curveSegmentKeys(curve, tolerance = 1e-4) {
    const key = point => point.map(value => Math.round(value / tolerance)).join(',');
    const points = [...curve.points];
    if (curve.closed && key(points[0]) !== key(points.at(-1))) points.push(points[0]);
    return points.slice(1).flatMap((point, index) => {
        const a = key(points[index]), b = key(point);
        return a === b ? [] : [[a, b].sort().join(':')];
    });
}

export function orderConnectedCurves(curves) {
    const remaining = [...curves], ordered = [];
    const near = (a, b) => Math.hypot(...a.map((value, index) => value - b[index])) < 1e-4;
    while (remaining.length) {
        const chain = [remaining.shift()];
        let head = chain[0].points[0], tail = chain[0].points.at(-1);
        while (remaining.length) {
            const touches = (curve, point) => near(curve.points[0], point) || near(curve.points.at(-1), point);
            let index = remaining.findIndex(curve => touches(curve, tail));
            const prepend = index < 0;
            if (prepend) index = remaining.findIndex(curve => touches(curve, head));
            if (index < 0) break;
            const [curve] = remaining.splice(index, 1);
            const other = point => near(curve.points[0], point) ? curve.points.at(-1) : curve.points[0];
            if (prepend) { chain.unshift(curve); head = other(head); }
            else { chain.push(curve); tail = other(tail); }
        }
        ordered.push(...chain);
    }
    return ordered;
}

// Meshes without CAD face metadata still select a connected planar face,
// including all its triangles, instead of exposing tessellation diagonals.
export function planarFaceTriangleRanges(definition, triangleIndex) {
    const positions = definition.attributes.position.array;
    const indices = definition.index?.array || Array.from({ length: positions.length / 3 }, (_, index) => index);
    const point = id => Array.from(positions.slice(id * 3, id * 3 + 3));
    const subtract = (a, b) => a.map((value, index) => value - b[index]);
    const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
    const normal = (a, b, c) => {
        const u = subtract(b, a), v = subtract(c, a);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(...n);
        return length > 1e-12 ? n.map(value => value / length) : null;
    };
    const seed = Array.from(indices.slice(triangleIndex * 3, triangleIndex * 3 + 3), point);
    if (seed.length !== 3) return [];
    const seedNormal = normal(...seed);
    if (!seedNormal) return [];
    const extent = positions.reduce((max, value, index) => Math.max(max, Math.abs(value - seed[0][index % 3])), 1);
    const tolerance = Math.max(1e-5, extent * 1e-6), edges = new Map(), triangles = new Map();
    for (let i = 0; i < indices.length / 3; i++) {
        const points = Array.from(indices.slice(i * 3, i * 3 + 3), point);
        const n = normal(...points);
        if (!n || Math.abs(dot(n, seedNormal)) < 1 - 1e-6
            || points.some(p => Math.abs(dot(subtract(p, seed[0]), seedNormal)) > tolerance)) continue;
        const keys = curveSegmentKeys({ points, closed: true }, tolerance);
        triangles.set(i, keys);
        keys.forEach(key => { if (!edges.has(key)) edges.set(key, []); edges.get(key).push(i); });
    }
    const selected = new Set([triangleIndex]), queue = [triangleIndex];
    for (let i = 0; i < queue.length; i++) {
        for (const key of triangles.get(queue[i]) || []) {
            for (const neighbour of edges.get(key)) {
                if (!selected.has(neighbour)) { selected.add(neighbour); queue.push(neighbour); }
            }
        }
    }
    const ranges = [];
    for (const index of [...selected].sort((a, b) => a - b)) {
        if (ranges.at(-1)?.last === index - 1) ranges.at(-1).last = index;
        else ranges.push({ first: index, last: index });
    }
    return ranges;
}
