import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCleanOutlinePositions } from '../../2_3DSimulation/outline-geometry-core.mjs';
import { ROBOT_LOGO_FACES, createRobotLogoIndex } from '../../2_3DSimulation/robot-logo-material-core.mjs';

test('평면 삼각형 분할과 반대 방향 중복면은 제거하고 실제 테두리는 유지한다', () => {
    const triangles = [0,0,0, 10,0,0, 10,10,0, 0,0,0, 0,10,0, 10,10,0];
    const original = buildCleanOutlinePositions(triangles);
    assert.equal(original.length / 6, 4);
    assert.deepEqual(buildCleanOutlinePositions([...triangles, ...triangles.slice(0, 9)]), original);
});

test('좌표 오차의 틈과 곡면 분할선은 제거하고 직각 모서리는 유지한다', () => {
    const seam = [0,0,0, 10,0,0, 10,10,0, 0.00001,0,0, 10.00001,10,0, 0,10,0];
    assert.equal(buildCleanOutlinePositions(seam).length / 6, 4);
    const folded = angle => [0,0,0, 10,0,0, 0,10,0, 10,0,0, 0,0,0, 0,-10*Math.cos(angle),10*Math.sin(angle)];
    assert.equal(buildCleanOutlinePositions(folded(Math.PI / 18)).length / 6, 4);
    assert.equal(buildCleanOutlinePositions(folded(Math.PI / 2)).length / 6, 5);
    assert.equal(buildCleanOutlinePositions(folded(Math.PI * 5 / 6)).length / 6, 5);
});

test('로봇 표면 안쪽의 끊긴 대각선은 제거하고 닫힌 모서리는 유지한다', () => {
    const stl = readFileSync(new URL('../../2_3DSimulation/models/IR-R10H-120/P2.stl', import.meta.url));
    const positions = new Float32Array(stl.readUInt32LE(80) * 9);
    for (let i = 0; i < positions.length; i++) {
        positions[i] = stl.readFloatLE(84 + Math.floor(i / 9) * 50 + 12 + (i % 9) * 4);
    }
    const options = { thresholdAngle: 55, minimumAspectRatio: 0.01 };
    const original = buildCleanOutlinePositions(positions, null, options);
    const clean = buildCleanOutlinePositions(positions, null, { ...options, pruneDanglingEdges: true });
    const stray = [-48.64356994628906, 30, 801.1436157226562, -12.078916549682617, 30, 824.4669189453125];
    const contains = lines => {
        for (let i = 0; i < lines.length; i += 6) {
            if (stray.every((value, axis) => lines[i + axis] === value)) return true;
        }
        return false;
    };
    assert.equal(contains(original), true, '기존에 보이던 내부 대각선');
    assert.equal(contains(clean), false, '내부 대각선 제거');
    assert.ok(clean.length > 0 && clean.length < original.length);

    const vertices = [0,0,0, 10,0,0, 10,10,0, 0,10,0, 0,0,10, 10,0,10, 10,10,10, 0,10,10];
    const indices = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
    assert.equal(buildCleanOutlinePositions(vertices, indices, { pruneDanglingEdges: true }).length / 6, 12);
});

test('로고 면과 맞닿은 경계와 중복면은 외곽선에서 제외한다', () => {
    const face = [0,0,0, 10,0,0, 0,10,0];
    const folded = [...face, 10,0,0, 0,0,0, 0,0,10];
    const excludedIndexRanges = [{ start: 3, count: 3 }];
    assert.equal(buildCleanOutlinePositions(folded).length / 6, 5);
    assert.equal(buildCleanOutlinePositions(folded, null, { excludedIndexRanges }).length / 6, 2);
    assert.equal(buildCleanOutlinePositions([...face, ...face], null, { excludedIndexRanges }).length, 0);
});

test('표면 로고 영역을 통과하는 외곽선은 영역 바깥 부분만 유지한다', () => {
    const vertices = [0,0,0, 10,0,0, 10,10,0, 0,10,0];
    const indices = [0,1,2, 0,3,2];
    const original = [...vertices];
    const options = { excludedBounds: [{ min: [3,-Infinity,-1], max: [7,Infinity,1] }] };
    const lines = buildCleanOutlinePositions(vertices, indices, options);
    assert.equal(lines.length / 6, 6);
    let length = 0;
    for (let i = 0; i < lines.length; i += 6) {
        length += Math.hypot(...[0,1,2].map(axis => lines[i+3+axis] - lines[i+axis]));
        const x = (lines[i] + lines[i+3]) / 2;
        assert.ok(x <= 3 || x >= 7);
    }
    assert.equal(length, 32);
    assert.deepEqual(vertices, original);
    assert.equal(buildCleanOutlinePositions(vertices, indices).length / 6, 4);
});

test('모든 로봇의 로고 글자 모서리를 제외해도 본체 외곽선과 원본 형상은 유지된다', () => {
    for (const [file, mask] of Object.entries(ROBOT_LOGO_FACES)) {
        const stl = readFileSync(new URL(`../../2_3DSimulation/models/${file}`, import.meta.url));
        const positions = Float32Array.from({ length: mask.triangleCount * 9 }, (_, i) =>
            stl.readFloatLE(84 + Math.floor(i / 9) * 50 + 12 + i % 9 * 4));
        const original = positions.slice();
        const { index, bodyCount } = createRobotLogoIndex(positions.length / 3, mask);
        const extent = Math.max(...[0,1,2].map(axis => {
            let min=Infinity,max=-Infinity;
            for(let i=axis;i<positions.length;i+=3){min=Math.min(min,positions[i]);max=Math.max(max,positions[i]);}
            return max-min;
        }));
        const tolerance = Math.max(1e-6, Math.min(0.02, extent * 1e-5));
        const vertexKey = point => point.map(value => Math.round(value / tolerance)).join(',');
        const edgeKey = (a,b) => [vertexKey(a),vertexKey(b)].sort().join('|');
        const logoEdges = new Set();
        for (let i=bodyCount;i<index.length;i+=3) {
            const points = [0,1,2].map(offset => Array.from(positions.slice(index[i+offset]*3,index[i+offset]*3+3)));
            for (const [a,b] of [[0,1],[1,2],[2,0]]) logoEdges.add(edgeKey(points[a],points[b]));
        }
        const lines = buildCleanOutlinePositions(positions, index, {
            thresholdAngle: 55, minimumAspectRatio: 0.01, pruneDanglingEdges: true,
            excludedIndexRanges: [{ start: bodyCount, count: index.length - bodyCount }]
        });
        assert.ok(lines.length > 0, `${file}: 본체 외곽선`);
        for (let i=0;i<lines.length;i+=6) {
            assert.equal(logoEdges.has(edgeKey(Array.from(lines.slice(i,i+3)),Array.from(lines.slice(i+3,i+6)))),false,file);
        }
        assert.deepEqual(positions, original, file);
    }
});
