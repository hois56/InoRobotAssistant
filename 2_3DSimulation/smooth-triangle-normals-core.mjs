export function computeSmoothTriangleNormals(positions, maxAngleDegrees = 45) {
    if (!positions || positions.length % 9 !== 0) {
        throw new Error('Triangle positions must contain complete XYZ triangles.');
    }
    if (!Number.isFinite(maxAngleDegrees) || maxAngleDegrees < 0 || maxAngleDegrees > 180) {
        throw new Error('The normal smoothing angle must be between 0 and 180 degrees.');
    }

    const faces = [];
    const adjacentFaces = new Map();
    const vertexKey = (offset) => (
        `${positions[offset].toFixed(5)},${positions[offset + 1].toFixed(5)},${positions[offset + 2].toFixed(5)}`
    );
    for (let offset = 0; offset < positions.length; offset += 9) {
        const a = [positions[offset], positions[offset + 1], positions[offset + 2]];
        const b = [positions[offset + 3], positions[offset + 4], positions[offset + 5]];
        const c = [positions[offset + 6], positions[offset + 7], positions[offset + 8]];
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const normal = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0]
        ];
        const length = Math.hypot(...normal);
        if (length > 0) normal.forEach((value, index) => { normal[index] = value / length; });
        else normal.splice(0, 3, 0, 0, 1);
        faces.push(normal);
        for (let corner = 0; corner < 3; corner += 1) {
            const key = vertexKey(offset + corner * 3);
            if (!adjacentFaces.has(key)) adjacentFaces.set(key, []);
            adjacentFaces.get(key).push(faces.length - 1);
        }
    }

    const threshold = Math.cos(maxAngleDegrees * Math.PI / 180);
    const normals = new Float32Array(positions.length);
    for (let offset = 0; offset < positions.length; offset += 3) {
        const face = Math.floor(offset / 9);
        const adjacent = adjacentFaces.get(vertexKey(offset)) || [face];
        const normal = [0, 0, 0];
        for (const adjacentFace of adjacent) {
            const candidate = faces[adjacentFace];
            if (faces[face].reduce((dot, value, index) => dot + value * candidate[index], 0) < threshold) continue;
            candidate.forEach((value, index) => { normal[index] += value; });
        }
        const length = Math.hypot(...normal) || 1;
        normal.forEach((value, index) => { normals[offset + index] = value / length; });
    }
    return normals;
}
