// Extract CAD feature edges from triangle positions without changing the mesh.
// STL can duplicate faces, reverse winding, and leave small coordinate seams.
export function buildCleanOutlinePositions(positions, indices = null, { thresholdAngle = 40, weldTolerance = null, minimumAspectRatio = 0 } = {}) {
    if (!positions?.length) return new Float32Array();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) {
        min[i % 3] = Math.min(min[i % 3], positions[i]);
        max[i % 3] = Math.max(max[i % 3], positions[i]);
    }
    const extent = Math.max(...max.map((value, axis) => value - min[axis]));
    const tolerance = weldTolerance ?? Math.max(1e-6, Math.min(0.02, extent * 1e-5));
    const vertices = [];
    const vertexIds = new Map();
    const edges = new Map();
    const faces = new Set();
    const degenerateEdges = new Set();
    const getVertex = index => {
        const point = [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
        const key = point.map(value => Math.round(value / tolerance)).join(',');
        if (!vertexIds.has(key)) {
            vertexIds.set(key, vertices.length);
            vertices.push(point);
        }
        return vertexIds.get(key);
    };
    const edgeKey = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
    const count = indices?.length ?? positions.length / 3;
    for (let i = 0; i + 2 < count; i += 3) {
        const ids = [0, 1, 2].map(offset => getVertex(indices ? indices[i + offset] : i + offset));
        if (new Set(ids).size < 3) continue;
        const faceKey = [...ids].sort((a, b) => a - b).join(',');
        if (faces.has(faceKey)) continue;
        faces.add(faceKey);
        const [a, b, c] = ids.map(id => vertices[id]);
        const ab = b.map((value, axis) => value - a[axis]);
        const ac = c.map((value, axis) => value - a[axis]);
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const area2 = Math.hypot(...normal);
        const longest = Math.max(Math.hypot(...ab), Math.hypot(...ac), Math.hypot(...c.map((value, axis) => value - b[axis])));
        const pairs = [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]];
        if (area2 <= longest * tolerance || area2 < longest * longest * minimumAspectRatio) {
            pairs.forEach(([a, b]) => degenerateEdges.add(edgeKey(a, b)));
            continue;
        }
        const unitNormal = normal.map(value => value / area2);
        for (const [a, b] of pairs) {
            const key = edgeKey(a, b);
            if (!edges.has(key)) edges.set(key, { a, b, normals: [] });
            edges.get(key).normals.push({ normal: unitNormal, direction: a < b ? 1 : -1 });
        }
    }
    const result = [];
    const cosine = Math.cos(thresholdAngle * Math.PI / 180);
    for (const [key, { a, b, normals }] of edges) {
        let feature = normals.length === 1 && !degenerateEdges.has(key);
        for (let i = 0; !feature && i < normals.length; i++) {
            for (let j = i + 1; j < normals.length; j++) {
                const dot = normals[i].normal.reduce((sum, value, axis) => sum + value * normals[j].normal[axis], 0)
                    * -normals[i].direction * normals[j].direction;
                if (dot < cosine) { feature = true; break; }
            }
        }
        if (feature) result.push(...vertices[a], ...vertices[b]);
    }
    return new Float32Array(result);
}
