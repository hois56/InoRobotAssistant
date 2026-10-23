import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSmoothTriangleNormals } from '../../2_3DSimulation/smooth-triangle-normals-core.mjs';

const foldedPair = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 0, 1, 0, 0, 0, 0, 1
]);

test('smooths adjacent triangle normals inside the angle threshold', () => {
    const normals = computeSmoothTriangleNormals(foldedPair, 120);
    assert.ok(Math.abs(normals[0]) < 1e-6);
    assert.ok(Math.abs(normals[1] + Math.SQRT1_2) < 1e-6);
    assert.ok(Math.abs(normals[2] - Math.SQRT1_2) < 1e-6);
});

test('keeps faces sharp when their angle exceeds the threshold', () => {
    const normals = computeSmoothTriangleNormals(foldedPair, 45);
    assert.deepEqual(Array.from(normals.slice(0, 3)), [0, 0, 1]);
    assert.deepEqual(Array.from(normals.slice(9, 12)), [0, -1, 0]);
});

test('rejects incomplete triangles and invalid smoothing angles', () => {
    assert.throws(() => computeSmoothTriangleNormals([0, 0, 0]), /complete XYZ triangles/);
    assert.throws(() => computeSmoothTriangleNormals([], 181), /between 0 and 180/);
});
