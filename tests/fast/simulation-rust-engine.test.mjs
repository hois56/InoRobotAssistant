import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCadProfileRegions, sampleBulgeArc, samplePolylineVertices } from '../../2_3DSimulation/cad2d-geometry.mjs';
import { scaraInverse } from '../../2_3DSimulation/inverse-kinematics.mjs';
import { planJointPath } from '../../2_3DSimulation/path-planning-core.mjs';

test('CAD stitching keeps the source entities, holes and islands selectable', () => {
    const square = (id, lo, hi) => ({ id, closed: true, layerId: 'profile', type: 'LWPOLYLINE',
        renderPoints: [[lo, lo], [hi, lo], [hi, hi], [lo, hi], [lo, lo]] });
    const perimeter = square('frame', 0, 10).renderPoints;
    const edges = perimeter.slice(1).map((p, i) => ({ id: 'line-' + i, type: 'LINE',
        renderPoints: i % 2 ? [p, perimeter[i]] : [perimeter[i], p] }));
    const regions = buildCadProfileRegions([...edges, square('hole', 2, 8), square('island', 4, 6)]);
    assert.deepEqual(regions.map(r => r.area).sort((a, b) => a - b), [4, 64]);
    const outer = regions.find(r => r.area === 64);
    assert.deepEqual(outer.outerEntityIds, edges.map(edge => edge.id));
    assert.deepEqual(outer.holeEntityIds, ['hole']);
    const arc = sampleBulgeArc([0, 0], [2, 0], -1);
    const polyline = samplePolylineVertices([{ point: [0, 0], bulge: -1 }, { point: [2, 0] }, { point: [3, 0] }]);
    assert.deepEqual(polyline, [...arc, [3, 0]]);
    assert.ok(Math.abs(arc[(arc.length - 1) / 2][1] - 1) < 1e-12);
});

test('SCARA inverse honours the requested elbow and assigns the reachable wrist turn', () => {
    const joints = [0, 0, 0, 0].map(() => ({ angle: 0, definition: { min: -180, max: 180 } }));
    const manifest = { structure: [100, 100], tcp: [0, 0, 20] };
    for (const sign of [-1, 1]) {
        const { angles } = scaraInverse(joints, manifest, { x: 100, y: 100, z: 15 }, { x: 0, y: 0, z: 0 }, sign, NaN);
        assert.ok(Math.abs(angles[1] - sign * 90) < 1e-9);
        assert.ok(Math.abs(angles[0] + angles[1] + angles[3]) < 1e-9);
        assert.equal(angles[2], -5);
    }
    assert.match(scaraInverse(joints, manifest, { x: 300, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0, NaN).reason, /reach/);
});

test('joint searches keep independent state while scene collision checks yield', async () => {
    async function plan(y) {
        let first = true;
        return planJointPath({ start: [0, y], goal: [10, y], bounds: [{ min: 0, max: 10 }, { min: 0, max: 10 }],
            sampleStates: [[5, y + 1]], onYield() {}, async edgeIsSafe() {
                await Promise.resolve();
                if (first) { first = false; return false; }
                return true;
            } });
    }
    const results = await Promise.all([plan(1), plan(8)]);
    results.forEach(({ success, path }, i) => {
        const y = i ? 8 : 1;
        assert.equal(success, true);
        assert.deepEqual(path[0], [0, y]);
        assert.deepEqual(path.at(-1), [10, y]);
    });
});
