import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ROBOT_LOGO_COLOR, ROBOT_LOGO_FACES, createRobotLogoIndex } from '../../2_3DSimulation/robot-logo-material-core.mjs';

test('every catalog robot has a colored logo treatment', async () => {
    const { ROBOT_LOGO_PROJECTIONS = {} } = await import('../../2_3DSimulation/robot-logo-material-core.mjs');
    const catalog = JSON.parse(readFileSync(new URL('../../2_3DSimulation/models/models.json', import.meta.url)));
    const missing = catalog.filter(model => model.folder && !ROBOT_LOGO_PROJECTIONS[model.folder]
        && !Object.keys(ROBOT_LOGO_FACES).some(file => file.startsWith(`${model.folder}/`)));
    assert.deepEqual(missing.map(model => model.folder), []);
    for (const [folder, projection] of Object.entries(ROBOT_LOGO_PROJECTIONS)) {
        const stl = readFileSync(new URL(`../../2_3DSimulation/models/${folder}/${projection.mesh}`, import.meta.url));
        assert.equal(createHash('sha256').update(stl).digest('hex'), projection.sha256, folder);
        for (const rect of [projection.negative, projection.positive]) {
            assert.equal(rect.length, 4);
            assert.ok(rect.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0, folder);
        }
    }
});

test('robot logo masks match the authored STL assets and the supplied INOVANCE blue', () => {
    assert.equal(ROBOT_LOGO_COLOR, 0x108ccf);
    assert.ok(ROBOT_LOGO_FACES['IR-R20H-120/P4.stl']);
    assert.ok(ROBOT_LOGO_FACES['IR-S4-40Z15/P2.stl']);
    for (const [file, mask] of Object.entries(ROBOT_LOGO_FACES)) {
        const stl = readFileSync(new URL(`../../2_3DSimulation/models/${file}`, import.meta.url));
        assert.equal(createHash('sha256').update(stl).digest('hex'), mask.sha256, file);
        assert.equal(stl.readUInt32LE(80), mask.triangleCount, file);
        let previousEnd = 0;
        for (const [start, count] of mask.ranges) {
            assert.ok(Number.isInteger(start) && Number.isInteger(count) && count > 0, file);
            assert.ok(start >= previousEnd && start + count <= mask.triangleCount, file);
            previousEnd = start + count;
        }
    }
});

test('logo material partition preserves every original vertex and triangle winding', () => {
    for (const [file, mask] of Object.entries(ROBOT_LOGO_FACES)) {
        const vertexCount = mask.triangleCount * 3;
        const { index, bodyCount } = createRobotLogoIndex(vertexCount, mask);
        const expectedLogo = new Set(mask.ranges.flatMap(([start, count]) => Array.from({ length: count }, (_, i) => start + i)));
        const seen = new Uint8Array(mask.triangleCount);
        assert.equal(index.length, vertexCount, file);
        assert.equal(vertexCount - bodyCount, expectedLogo.size * 3, file);
        for (let offset = 0; offset < index.length; offset += 3) {
            const triangle = index[offset] / 3;
            assert.equal(Number.isInteger(triangle), true, file);
            assert.equal(index[offset + 1], index[offset] + 1, file);
            assert.equal(index[offset + 2], index[offset] + 2, file);
            assert.equal(seen[triangle]++, 0, file);
            assert.equal(expectedLogo.has(triangle), offset >= bodyCount, file);
        }
        assert.ok(seen.every(value => value === 1), file);
    }
});

test('unmapped or replaced robot meshes keep their original material', () => {
    assert.equal(createRobotLogoIndex(30, undefined), null);
    const mask = ROBOT_LOGO_FACES['IR-R20H-120/P4.stl'];
    assert.equal(createRobotLogoIndex((mask.triangleCount + 1) * 3, mask), null);
});
