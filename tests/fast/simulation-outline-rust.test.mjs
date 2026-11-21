import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    buildCleanOutlinePositions, buildCleanOutlinePositionsInJs, buildRobotLogoOutlineBounds, nativeOutlinePositions
} from '../../2_3DSimulation/outline-geometry-core.mjs';
import { ROBOT_LOGO_FACES, createRobotLogoIndex } from '../../2_3DSimulation/robot-logo-material-core.mjs';

// The Rust outline must reproduce the JavaScript reference bit for bit, in the same order.
function same(name, positions, indices, options) {
    const native = nativeOutlinePositions(positions, indices, options);
    assert.ok(native, name + ' should use the engine');
    const reference = buildCleanOutlinePositionsInJs(positions, indices, options);
    assert.equal(native.length, reference.length, name);
    assert.ok(Buffer.from(native.buffer).equals(Buffer.from(reference.buffer)), name);
    return native;
}

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
        return state / 2 ** 32;
    };
}

// A noisy, partly duplicated cylinder with caps: smooth sides, sharp rims,
// seams, reversed duplicates, slivers and a non-manifold fin.
function cylinder({ segments = 48, rings = 6, noise = 0, seed = 1 } = {}) {
    const next = random(seed);
    const positions = [];
    const index = [];
    for (let ring = 0; ring <= rings; ring++) for (let s = 0; s < segments; s++) {
        const angle = s / segments * Math.PI * 2;
        positions.push(20 * Math.cos(angle) + (next() - 0.5) * noise, 20 * Math.sin(angle) + (next() - 0.5) * noise, ring * 40 / rings);
    }
    for (let ring = 0; ring < rings; ring++) for (let s = 0; s < segments; s++) {
        const p = ring * segments + s, q = ring * segments + (s + 1) % segments;
        index.push(p, q, p + segments, q, q + segments, p + segments);
    }
    for (const ring of [0, rings]) {
        const centre = positions.length / 3;
        positions.push(0, 0, ring * 40 / rings);
        for (let s = 0; s < segments; s++) index.push(centre, ring * segments + s, ring * segments + (s + 1) % segments);
    }
    index.push(...index.slice(0, 9).reverse()); // reversed duplicates
    const sliver = positions.length / 3;
    positions.push(0, 0, 50, 10, 0, 50, 20, 0, 50.000001); // nearly collinear
    index.push(sliver, sliver + 1, sliver + 2, 0, 1, sliver); // and a fin on a side edge
    return { positions: new Float32Array(positions), index: new Uint32Array(index) };
}

function unindexed({ positions, index }) {
    return Float32Array.from({ length: index.length * 3 }, (_, i) => positions[index[Math.floor(i / 3)] * 3 + i % 3]);
}

test('Rust outlines match the JavaScript reference for robots, cylinders and every option', () => {
    for (const [file, mask] of Object.entries(ROBOT_LOGO_FACES)) {
        const stl = readFileSync(new URL(`../../2_3DSimulation/models/${file}`, import.meta.url));
        const positions = Float32Array.from({ length: mask.triangleCount * 9 }, (_, i) =>
            stl.readFloatLE(84 + Math.floor(i / 9) * 50 + 12 + i % 9 * 4));
        const { index, bodyCount } = createRobotLogoIndex(positions.length / 3, mask);
        const excludedIndexRanges = [{ start: bodyCount, count: Infinity }];
        const excludedBounds = buildRobotLogoOutlineBounds(positions, index, { faceRanges: [{ start: bodyCount, count: index.length - bodyCount }] });
        same(file, positions, index, { thresholdAngle: 55, minimumAspectRatio: 0.01, pruneDanglingEdges: true, excludedIndexRanges, excludedBounds });
        same(file + ' plain', positions, null, { thresholdAngle: 40 });
    }

    const smooth = cylinder();
    const noisy = cylinder({ noise: 0.05, seed: 9, segments: 64, rings: 9 });
    const cases = [
        ['indexed', smooth.positions, smooth.index, {}],
        ['16-bit indices', smooth.positions, Uint16Array.from(smooth.index), { thresholdAngle: 10 }],
        ['plain arrays', Array.from(noisy.positions), Array.from(noisy.index), { thresholdAngle: 25 }],
        ['unindexed', unindexed(noisy), null, { minimumAspectRatio: 0.01 }],
        ['coarse weld', noisy.positions, noisy.index, { weldTolerance: 0.3, pruneDanglingEdges: true }],
        ['aspect and pruning', noisy.positions, noisy.index, { thresholdAngle: 5, minimumAspectRatio: 0.2, pruneDanglingEdges: true }],
        ['ranges', smooth.positions, smooth.index, { excludedIndexRanges: [{ start: 30, count: 300 }, { start: 900, count: Infinity }, { start: 12.5, count: 3 }] }],
        ['bounds', noisy.positions, noisy.index, { excludedBounds: [
            { min: [-5, -Infinity, 10], max: [5, Infinity, 30] },
            { min: [-30, -30, -1], max: [30, 0, 2] },
            { min: [0, 0, 0], max: [0, 0, 0] }
        ] }],
        ['everything', noisy.positions, noisy.index, { thresholdAngle: 33, minimumAspectRatio: 0.05, pruneDanglingEdges: true,
            excludedIndexRanges: [{ start: 60, count: 120 }], excludedBounds: [{ min: [-25, -3, 5], max: [25, 3, 35] }] }],
        ['index count not a multiple of three', smooth.positions, smooth.index.subarray(0, 100), {}],
        ['empty index', smooth.positions, [], {}]
    ];
    for (const [name, positions, indices, options] of cases) same(name, positions, indices, options);
    assert.ok(same('outline exists', smooth.positions, smooth.index, {}).length > 0);
});

test('input the engine does not model falls back to the same JavaScript result', () => {
    const { positions, index } = cylinder({ segments: 12, rings: 2 });
    const withNaN = positions.slice();
    withNaN[7] = NaN;
    const fallbacks = [
        ['NaN coordinate', withNaN, index, {}],
        ['index outside the positions', positions, [...index, 0, 1, 9999], {}],
        ['fractional index', positions, [...index.slice(0, 6), 1.5, 2, 3], {}],
        ['text range', positions, index, { excludedIndexRanges: [{ start: '3', count: 3 }] }],
        ['short bound', positions, index, { excludedBounds: [{ min: [0, 0], max: [1, 1, 1] }] }],
        ['zero weld tolerance', positions, index, { weldTolerance: 0 }],
        ['partial vertex', [...positions, 1], null, {}]
    ];
    for (const [name, values, indices, options] of fallbacks) {
        assert.equal(nativeOutlinePositions(values, indices, options), null, name);
        assert.deepEqual(buildCleanOutlinePositions(values, indices, options), buildCleanOutlinePositionsInJs(values, indices, options), name);
    }
    assert.deepEqual(buildCleanOutlinePositions([]), new Float32Array());
});
