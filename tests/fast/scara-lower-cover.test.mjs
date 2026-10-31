import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SCARA_LOWER_COVERS } from '../../2_3DSimulation/scara-lower-cover-faces.mjs';
import { SCARA_LOWER_COVER_COLOR } from '../../2_3DSimulation/robot-joint-accent.mjs';
import { ROBOT_LOGO_FACES, ROBOT_LOGO_PROJECTIONS } from '../../2_3DSimulation/robot-logo-material-core.mjs';

test('every SCARA model has the requested body and J2 lower-cover colors', () => {
    const catalog = JSON.parse(readFileSync(new URL('../../2_3DSimulation/models/models.json', import.meta.url)));
    const models = catalog.filter(model => model.robotType === 'scara');
    assert.equal(SCARA_LOWER_COVER_COLOR, 0xb6b6bb);
    assert.deepEqual(Object.keys(SCARA_LOWER_COVERS).sort(), models.map(model => model.folder).sort());
    for (const model of models) assert.equal(model.bodyColor, '#d8d7df');
});

for (const [folder, mask] of Object.entries(SCARA_LOWER_COVERS)) {
    test(`${folder} lower-cover faces match the authored mesh and exclude the logo`, () => {
        const file = `${folder}/P2.stl`;
        const stl = readFileSync(new URL(`../../2_3DSimulation/models/${file}`, import.meta.url));
        assert.equal(createHash('sha256').update(stl).digest('hex'), mask.sha256);
        assert.equal(stl.readUInt32LE(80), mask.triangleCount);
        assert.equal(mask.axis, 2);
        const faces = new Set();
        let previousEnd = 0;
        for (const [start, count] of mask.ranges) {
            assert.ok(start >= previousEnd && count > 0 && start + count <= mask.triangleCount);
            for (let i = start; i < start + count; i++) {
                faces.add(i);
                assert.ok(Math.min(...[0, 1, 2].map(j => stl.readFloatLE(104 + i * 50 + j * 12))) <= mask.endZ);
            }
            previousEnd = start + count;
        }
        for (const [start, count] of ROBOT_LOGO_FACES[file]?.ranges || []) {
            for (let i = start; i < start + count; i++) assert.equal(faces.has(i), false);
        }
        const projection = ROBOT_LOGO_PROJECTIONS[folder];
        if (projection) assert.ok(mask.endZ < Math.min(projection.negative[1], projection.positive[1]));
    });
}
