import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCurveTrajectory } from '../../2_3DSimulation/curve-trajectory-core.mjs';
import { buildStepSnapCandidates } from '../../3_ToolSelector/snap-geometry.mjs';
import { orderConnectedCurves, planarFaceTriangleRanges } from '../../2_3DSimulation/curve-trajectory-selection.mjs';
const line = (a, b) => ({ points: [a, b] });

test('ordered CAD edges preserve corners, respect spacing and reverse trimmed endpoints', () => {
    const curves = [line([0, 0, 0], [20, 0, 0]), line([20, 20, 0], [20, 0, 0])];
    const result = generateCurveTrajectory(curves, { step: 7, startOffset: 3, endOffset: 4 });
    assert.deepEqual(result.points[0], [3, 0, 0]);
    assert.deepEqual(result.points.at(-1), [20, 16, 0]);
    assert.ok(result.points.some(p => p[0] === 20 && p[1] === 0));
    assert.equal(result.length, 33);
    assert.ok(result.points.slice(1).every((p, i) => Math.hypot(...p.map((v, j) => v - result.points[i][j])) <= 7.00001));
    const reverse = generateCurveTrajectory(curves, { reverse: true, startOffset: 4, endOffset: 3 });
    assert.deepEqual(reverse.points[0], [20, 16, 0]);
    assert.deepEqual(reverse.points.at(-1), [3, 0, 0]);
});

test('closed curves remain closed and chord tolerance reduces only permitted deviation', () => {
    const points = Array.from({ length: 360 }, (_, i) => [50 * Math.cos(i * Math.PI / 180), 50 * Math.sin(i * Math.PI / 180), 12]);
    const result = generateCurveTrajectory([{ points, closed: true }], { mode: 'chord', tolerance: 0.1, step: 100 });
    assert.deepEqual(result.points[0], result.points.at(-1));
    assert.ok(result.points.length < 100 && result.points.length > 30);
    for (const [i, p] of result.points.slice(1).entries()) {
        const a = result.points[i];
        const radiusAtMidpoint = Math.hypot((a[0] + p[0]) / 2, (a[1] + p[1]) / 2);
        assert.ok(50 - radiusAtMidpoint <= 0.102);
    }
});

test('invalid, disconnected, over-trimmed and excessive paths fail instead of creating partial routes', () => {
    for (const options of [{ step: 0 }, { step: NaN }, { tolerance: -1 }, { startOffset: 10 }, { step: 0.001, maxPoints: 20 }]) {
        assert.throws(() => generateCurveTrajectory([line([0, 0, 0], [10, 0, 0])], options));
    }
    assert.throws(() => generateCurveTrajectory([line([0, 0, 0], [10, 0, 0]), line([50, 0, 0], [60, 0, 0])]));
    assert.throws(() => generateCurveTrajectory([line([0, 0, 0], [NaN, 0, 0])]));
});

test('the first edge is oriented to its connected neighbour', () => {
    const result = generateCurveTrajectory([line([10,0,0], [0,0,0]), line([10,0,0], [10,10,0])]);
    assert.deepEqual(result.points, [[0,0,0], [10,0,0], [10,10,0]]);
});

test('CAD feature extraction excludes coplanar tessellation diagonals and leaves snap results unchanged', () => {
    const mesh = { attributes: { position: { array: [0,0,0, 10,0,0, 10,10,0, 0,10,0] } }, index: { array: [0,1,2, 0,2,3] }, brep_faces: [{ first: 0, last: 1 }] };
    const before = buildStepSnapCandidates(mesh);
    const { curves } = buildStepSnapCandidates(mesh, { featureChainsOnly: true });
    assert.equal(curves.length, 4);
    assert.ok(curves.every(c => c.points.length === 2));
    assert.deepEqual(buildStepSnapCandidates(mesh), before);
});

test('face outlines join in order even when an edge was already selected', () => {
    const curves = [line([10, 0, 0], [10, 10, 0]), line([0, 0, 0], [10, 0, 0]),
        line([0, 0, 0], [0, 10, 0]), line([0, 10, 0], [10, 10, 0])];
    const result = generateCurveTrajectory(orderConnectedCurves(curves), { step: 10 });
    assert.deepEqual(result.points[0], result.points.at(-1));
    assert.equal(result.length, 40);
    assert.equal(result.points.length, 5);
});

test('an opened face outline connects through both ends of the first selected edge', () => {
    const curves = [line([0, 0, 0], [10, 0, 0]), line([10, 0, 0], [10, 10, 0]), line([0, 10, 0], [0, 0, 0])];
    const result = generateCurveTrajectory(orderConnectedCurves(curves), { step: 10 });
    assert.equal(result.length, 30);
    assert.deepEqual(result.points[0], [0, 10, 0]);
    assert.deepEqual(result.points.at(-1), [10, 10, 0]);
});

test('a planar mesh face excludes disconnected coplanar regions and adjacent angled faces', () => {
    const mesh = { attributes: { position: { array: [0,0,0, 10,0,0, 10,10,0, 0,10,0,
        0,0,10, 30,0,0, 40,0,0, 30,10,0] } }, index: { array: [0,1,2, 0,2,3, 0,4,1, 5,6,7] } };
    assert.deepEqual(planarFaceTriangleRanges(mesh, 1), [{ first: 0, last: 1 }]);
    const curves = buildStepSnapCandidates(mesh, { triangleRanges: planarFaceTriangleRanges(mesh, 0),
        featureChainsOnly: true, sharpAngleDegrees: 180 }).curves;
    assert.equal(curves.length, 4);
    assert.equal(generateCurveTrajectory(orderConnectedCurves(curves)).length, 40);
});
