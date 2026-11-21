import assert from 'node:assert/strict';
import test from 'node:test';
import '../../shared/site-engine.js';
import { buildStepSnapCandidates } from '../../3_ToolSelector/snap-geometry.mjs';

const engine = globalThis.InoSite;

// The Rust topology must reproduce the JavaScript reference exactly, including
// candidate order, so compare both paths on the same inputs.
function bothPaths(mesh, options = {}) {
    let called = 0;
    const counted = { ...engine, snapTopology: (...args) => { called += 1; return engine.snapTopology(...args); } };
    globalThis.InoSite = counted;
    const native = buildStepSnapCandidates(mesh, options);
    globalThis.InoSite = undefined;
    const reference = buildStepSnapCandidates(mesh, options);
    globalThis.InoSite = engine;
    return { native, reference, called };
}

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
        return state / 2 ** 32;
    };
}

// Tessellated cylinders whose cap rims repeat the side vertices, as STEP exports do per face.
function cylinders(count, segments, rings, { noise = 0, seed = 1, brep = true } = {}) {
    const next = random(seed);
    const positions = [], index = [], faces = [];
    let triangle = 0;
    for (let c = 0; c < count; c++) {
        const cx = (c % 6) * 30.25, cy = Math.floor(c / 6) * -31.5, radius = 6 + (c % 4) * 1.75;
        const base = positions.length / 3;
        for (let ring = 0; ring <= rings; ring++) for (let s = 0; s < segments; s++) {
            const angle = s / segments * Math.PI * 2;
            positions.push(cx + radius * Math.cos(angle) + (next() - 0.5) * noise,
                cy + radius * Math.sin(angle) + (next() - 0.5) * noise, ring * 17 / rings);
        }
        const sideFirst = triangle;
        for (let ring = 0; ring < rings; ring++) for (let s = 0; s < segments; s++) {
            const p = base + ring * segments + s, q = base + ring * segments + (s + 1) % segments;
            index.push(p, q, p + segments, q, q + segments, p + segments);
            triangle += 2;
        }
        faces.push({ first: sideFirst, last: triangle - 1 });
        for (const ring of [0, rings]) {
            const centre = positions.length / 3;
            positions.push(cx, cy, ring * 17 / rings);
            const rim = positions.length / 3;
            for (let s = 0; s < segments; s++) {
                const k = (base + ring * segments + s) * 3;
                positions.push(positions[k], positions[k + 1], positions[k + 2]);
            }
            const capFirst = triangle;
            for (let s = 0; s < segments; s++) { index.push(centre, rim + s, rim + (s + 1) % segments); triangle++; }
            faces.push({ first: capFirst, last: triangle - 1 });
        }
    }
    const mesh = { attributes: { position: { array: new Float32Array(positions) } }, index: { array: new Uint32Array(index) } };
    if (brep) mesh.brep_faces = faces;
    return mesh;
}

// A box with an inset pocket: sharp creases, rectangles, open edges and a degenerate sliver.
function pocketBox() {
    const positions = [
        0, 0, 0, 40, 0, 0, 40, 30, 0, 0, 30, 0, 0, 0, 12, 40, 0, 12, 40, 30, 12, 0, 30, 12,
        10, 8, 12, 30, 8, 12, 30, 22, 12, 10, 22, 12, 20, 15, 12, 20, 15, 12.0000000001
    ];
    const index = [0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
        4, 5, 9, 4, 9, 8, 5, 6, 10, 5, 10, 9, 6, 7, 11, 6, 11, 10, 7, 4, 8, 7, 8, 11, 8, 9, 12, 12, 13, 8, 0, 0, 1];
    return { attributes: { position: { array: positions } }, index: { array: index } };
}

test('Rust snap topology matches the JavaScript reference for B-rep faces, creases and selections', () => {
    const cases = [
        ['B-rep cylinders', cylinders(14, 40, 6), { includeCircleQuadrants: true }],
        ['noisy B-rep cylinders', cylinders(9, 33, 4, { noise: 2e-4, seed: 7 }), { includeCircleQuadrants: true }],
        ['crease cylinders without faces', cylinders(10, 36, 5, { brep: false, seed: 3 }), {}],
        ['noisy creases', cylinders(6, 24, 3, { brep: false, noise: 0.4, seed: 11 }), { sharpAngleDegrees: 35 }],
        ['pocket box', pocketBox(), {}],
        ['pocket box, coarse weld', pocketBox(), { weldTolerance: 0.5 }],
        ['selected face ranges', cylinders(8, 32, 4), { triangleRanges: [{ first: 40, last: 300 }, { first: 260, last: 420 }], includeCircleQuadrants: true }],
        ['selected crease ranges', cylinders(5, 20, 3, { brep: false }), { triangleRanges: [{ first: 0, last: 119 }, { first: 5000, last: 7000 }] }],
        ['feature chains', cylinders(4, 28, 3), { featureChainsOnly: true }]
    ];
    for (const [name, mesh, options] of cases) {
        const { native, reference, called } = bothPaths(mesh, options);
        assert.equal(called, 1, name + ' should use the Rust engine');
        assert.deepEqual(native, reference, name);
    }
    const { native } = bothPaths(cylinders(3, 24, 2), { includeCircleQuadrants: true });
    assert.ok(native.candidates.some(candidate => candidate.type === 'face-center'));
    assert.ok(native.candidates.filter(candidate => candidate.type === 'circle-center').length >= 3);
});

test('unusual inputs fall back to the JavaScript path with the same result', () => {
    const mesh = cylinders(2, 16, 2);
    mesh.brep_faces[1] = { first: '3', last: 10 };
    let { native, reference, called } = bothPaths(mesh);
    assert.equal(called, 0);
    assert.deepEqual(native, reference);

    // Fractional face bounds select nothing in either path.
    const fractional = cylinders(2, 16, 2);
    fractional.brep_faces[0] = { first: 0.5, last: 20 };
    ({ native, reference, called } = bothPaths(fractional));
    assert.equal(called, 0);
    assert.deepEqual(native, reference);

    const broken = pocketBox();
    broken.index.array = [...broken.index.array, 0, 1, 99];
    globalThis.InoSite = engine;
    assert.throws(() => buildStepSnapCandidates(broken), TypeError);
});
