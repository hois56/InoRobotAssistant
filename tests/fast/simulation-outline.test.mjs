import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCleanOutlinePositions } from '../../2_3DSimulation/outline-geometry-core.mjs';

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
