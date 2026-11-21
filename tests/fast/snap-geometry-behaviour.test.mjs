import assert from 'node:assert/strict';
import test from 'node:test';
import '../../shared/site-engine.js';
import { averagePoints, buildStepSnapCandidates } from '../../3_ToolSelector/snap-geometry.mjs';

// CAD snap points used by Tool Selector Mode D and the 3D simulation. Each case
// runs through the Rust topology (pages that load shared/site-engine.js) and the
// JavaScript fallback (pages and workers without it).
const engine = globalThis.InoSite;
const paths = [['Rust', engine], ['JavaScript', undefined]];

function build(engineForPath, mesh, options) {
    let nativeCalls = 0;
    globalThis.InoSite = engineForPath && { ...engineForPath, snapTopology: (...args) => { nativeCalls += 1; return engine.snapTopology(...args); } };
    try {
        return { ...buildStepSnapCandidates(mesh, options), nativeCalls };
    } finally {
        globalThis.InoSite = engine;
    }
}

function forEachPath(callback) {
    for (const [name, engineForPath] of paths) {
        callback((mesh, options) => {
            const result = build(engineForPath, mesh, options);
            assert.equal(result.nativeCalls, engineForPath ? 1 : 0, `${name} path`);
            return result;
        }, name);
    }
}

const ofType = (result, type) => result.candidates.filter(candidate => candidate.type === type);
const hasPoint = (items, expected, tolerance = 1e-8) => items.some(({ point }) => (
    Math.hypot(point[0] - expected[0], point[1] - expected[1], point[2] - expected[2]) <= tolerance
));

const boxTriangles = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]
].flat();
function box(x, y, z, withFaces = true) {
    const mesh = {
        attributes: { position: { array: [0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, z, x, 0, z, x, y, z, 0, y, z] } },
        index: { array: boxTriangles }
    };
    if (withFaces) mesh.brep_faces = Array.from({ length: 6 }, (_, face) => ({ first: face * 2, last: face * 2 + 1, color: null }));
    return mesh;
}

function arcFan(angleDegrees, segmentCount, radialScale = () => 1, radius = 50) {
    const positions = [0, 0, 0];
    const indices = [];
    for (let segment = 0; segment <= segmentCount; segment += 1) {
        const angle = (-angleDegrees / 2 + angleDegrees * segment / segmentCount) * Math.PI / 180;
        const scaled = radius * radialScale(segment);
        positions.push(Math.cos(angle) * scaled, Math.sin(angle) * scaled, 0);
    }
    for (let segment = 0; segment < segmentCount; segment += 1) indices.push(0, segment + 1, segment + 2);
    return { attributes: { position: { array: positions } }, index: { array: indices }, brep_faces: [{ first: 0, last: segmentCount - 1 }] };
}

test('다중 점 중심은 점 2~4개의 평균이며 잘못된 입력을 거부한다', () => {
    assert.deepEqual(averagePoints([[0, 0, 0], [10, 0, 0]]), [5, 0, 0]);
    assert.deepEqual(averagePoints([[0, 0, 0], [12, 0, 0], [0, 12, 0]]), [4, 4, 0]);
    assert.deepEqual(averagePoints([[0, 0, 0], [8, 0, 0], [8, 8, 0], [0, 8, 0]]), [4, 4, 0]);
    assert.throws(() => averagePoints([[0, 0, 0]]), RangeError);
    assert.throws(() => averagePoints(Array.from({ length: 5 }, () => [0, 0, 0])), RangeError);
    assert.throws(() => averagePoints([[0, 0, 0], [Number.NaN, 0, 0]]), TypeError);
});

test('B-rep 면이 있는 상자는 꼭짓점·모서리·면·사각형·형상 중심을 하나씩 만든다', () => {
    forEachPath(build => {
        const result = build(box(100, 200, 300), { solidCenter: [50, 100, 150] });
        assert.equal(result.stats.faceCount, 6);
        assert.equal(result.stats.featureEdgeCount, 12);
        for (const [type, count] of Object.entries({ vertex: 8, endpoint: 8, 'edge-midpoint': 12, 'face-center': 6, 'rectangle-center': 6, 'shape-center': 1 })) {
            assert.equal(ofType(result, type).length, count, type);
        }
        assert.ok(hasPoint(ofType(result, 'vertex'), [100, 200, 300]));
        assert.ok(hasPoint(ofType(result, 'endpoint'), [100, 200, 300]));
        assert.ok(hasPoint(ofType(result, 'edge-midpoint'), [50, 0, 0]));
        assert.ok(hasPoint(ofType(result, 'face-center'), [50, 100, 300]));
        assert.ok(hasPoint(ofType(result, 'rectangle-center'), [50, 100, 300]));
        assert.ok(hasPoint(ofType(result, 'shape-center'), [50, 100, 150]));
    });
});

test('면 정보와 선택한 면 범위에 따라 면 중심과 후보 위치가 정해진다', () => {
    forEachPath(build => {
        const withoutFaces = build(box(100, 100, 100, false));
        const withFaces = build(box(100, 100, 100));
        const rightFace = build(box(100, 100, 100, false), { triangleRanges: [{ first: 6, last: 7 }] });
        assert.equal(withoutFaces.stats.faceCount, 0);
        assert.equal(withFaces.stats.faceCount, 6);
        assert.equal(ofType(withoutFaces, 'face-center').length, 0);
        assert.equal(ofType(withFaces, 'face-center').length, 6);
        assert.ok(rightFace.candidates.length > 0);
        assert.ok(rightFace.candidates.every(({ point }) => Math.abs(point[0] - 100) < 1e-6));
    });
});

test('두 직선의 연장 교차점을 가상 교차점으로 만든다', () => {
    const mesh = {
        attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 1, 0, 2, 2, 0, 3, 1, 0] } },
        index: { array: [0, 1, 2, 3, 4, 5] },
        brep_faces: [{ first: 0, last: 0, color: null }, { first: 1, last: 1, color: null }]
    };
    forEachPath(build => {
        assert.ok(hasPoint(ofType(build(mesh, { virtualExtensionRatio: 1.5 }), 'virtual-intersection'), [2, 0, 0]));
    });
});

test('원과 거칠게 분할되거나 약간 찌그러진 호에서도 중심을 찾는다', () => {
    const circle = { attributes: { position: { array: [0, 0, 0] } }, index: { array: [] }, brep_faces: [{ first: 0, last: 23 }] };
    for (let segment = 0; segment < 24; segment += 1) {
        const angle = segment / 24 * Math.PI * 2;
        circle.attributes.position.array.push(Math.cos(angle) * 50, Math.sin(angle) * 50, 0);
        circle.index.array.push(0, segment + 1, (segment + 1) % 24 + 1);
    }
    forEachPath(build => {
        const near = (result, tolerance) => ofType(result, 'circle-center').some(({ point }) => Math.hypot(...point) < tolerance);
        assert.ok(near(build(circle), 1e-6), 'full circle');
        assert.ok(near(build(arcFan(120, 4)), 1e-5), 'coarse arc');
        assert.ok(near(build(arcFan(180, 12, segment => (segment === 4 ? 1.02 : segment === 8 ? 0.985 : 1))), 1), 'imperfect arc');
    });
});

test('종류별 개수 제한을 풀면 끝점 9,000개를 모두 유지한다', () => {
    const positions = [], indices = [], faces = [];
    for (let triangle = 0; triangle < 3000; triangle += 1) {
        const x = triangle * 3, offset = positions.length / 3;
        positions.push(x, 0, 0, x + 1, 0, 0, x, 1, 0);
        indices.push(offset, offset + 1, offset + 2);
        faces.push({ first: triangle, last: triangle });
    }
    const mesh = { attributes: { position: { array: new Float32Array(positions) } }, index: { array: new Uint32Array(indices) }, brep_faces: faces };
    forEachPath(build => {
        const endpoints = ofType(build(mesh, { maxStraightLines: 1, maxVirtualPairs: 1, maxVirtualCandidates: 1, maxPerType: { endpoint: Infinity } }), 'endpoint');
        assert.equal(endpoints.length, 9000);
        assert.ok(endpoints.some(({ point }) => point[0] === 8997 && point[1] === 1));
    });
});
