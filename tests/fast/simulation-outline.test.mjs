import { test } from 'node:test';
import assert from 'node:assert/strict';
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
