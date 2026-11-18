import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOlpProjectFromFiles, normalizeOlpPath, normalizeOlpTextForWindows, resolveOlpPoint } from '../../2_3DSimulation/olp-project-core.mjs';

test('OLP 위치를 읽을 때 원본 행과 Arm·외부축·메모 및 LP 심볼을 보존한다', async () => {
    const line = 'LP\u00a0[12] = 1e-3, -2, .5, 4, 5, 6; 1,0,1,-2; 100,200; Name="포인트"; Notes="검사";';
    const project = await buildOlpProjectFromFiles([{ name: 'P.pts', text: async () => line + '\r\n' }]);
    const point = resolveOlpPoint(project, 'Offset(LP[12], R[2])', 'P.pts');
    assert.deepEqual(point.values, [0.001, -2, 0.5, 4, 5, 6]);
    assert.deepEqual(point.armParameters, [1, 0, 1, -2]);
    assert.deepEqual(point.externalAxes, [100, 200]);
    assert.equal(point.sourceLine, line);
    assert.equal(point.name, '포인트');
    assert.equal(point.notes, '검사');
    assert.equal(point.offsetExpression, 'R[2]');
    assert.equal(resolveOlpPoint(project, 'P[12]'), null);
});

test('OLP 내보내기는 UTF-16 코드 단위와 단독 CR을 보존하고 Windows 줄바꿈을 적용한다', () => {
    const body = '모델𐐀'.repeat(4000) + '\ud800';
    assert.equal(normalizeOlpTextForWindows('\ufeff' + body + '\r\nA\nB\rC'), body + '\r\nA\r\nB\rC');
    assert.equal(normalizeOlpPath('./project\\셀//./' + body), 'project/셀/' + body);
    assert.throws(() => normalizeOlpPath('project\\..\\main.pro'), /Parent traversal/);
});
