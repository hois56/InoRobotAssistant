import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { R4_JOINT_ACCENT, ROBOT_JOINT_ACCENT_COLOR, applyRobotJointAccent } from '../../2_3DSimulation/robot-joint-accent.mjs';
import { ROBOT_LOGO_FACES } from '../../2_3DSimulation/robot-logo-material-core.mjs';
import { ROBOT_JOINT_ACCENTS } from '../../2_3DSimulation/robot-joint-accent-faces.mjs';

test('R50 colors the forward connector flange instead of the elbow housing', () => {
    const mask = ROBOT_JOINT_ACCENTS['IR-R50-250'];
    assert.equal(mask.mesh, 'P4.stl');
    assert.equal(mask.endX, 464);
});

test('R10-110 colors the elbow-side P3 ring rather than the far P4 inlet', () => {
    const mask = ROBOT_JOINT_ACCENTS['IR-R10-110'];
    assert.equal(mask.mesh, 'P3.stl');
    assert.equal(mask.endX, 125.5);
});

test('extended R7H-90 and R10H paint the inlet beside the elbow, before the long adapter', () => {
    assert.equal(ROBOT_JOINT_ACCENTS['IR-R7H-90'].endX, 145);
    assert.equal(ROBOT_JOINT_ACCENTS['IR-R10H-120'].endX, 125.5);
    for (const [folder, limit] of [['IR-R7H-90', 150], ['IR-R10H-120', 130]]) {
        const stl = readFileSync(new URL(`../../2_3DSimulation/models/${folder}/P4.stl`, import.meta.url));
        for (const [start, count] of ROBOT_JOINT_ACCENTS[folder].ranges) {
            for (let triangle = start; triangle < start + count; triangle++) {
                const minX = Math.min(...[0, 1, 2].map(vertex => stl.readFloatLE(96 + triangle * 50 + vertex * 12)));
                assert.ok(minX < limit, `${folder}: a wrist-side face was included`);
            }
        }
    }
});

for (const [folder, mask] of Object.entries(ROBOT_JOINT_ACCENTS)) {
    test(`${folder} inlet faces match the original mesh and exclude lettering`, () => {
        const stl = readFileSync(new URL(`../../2_3DSimulation/models/${folder}/${mask.mesh || 'P4.stl'}`, import.meta.url));
        assert.equal(createHash('sha256').update(stl).digest('hex'), mask.sha256);
        assert.equal(stl.readUInt32LE(80), mask.triangleCount);
        const faces = new Set();
        let previousEnd = 0;
        for (const [start, count] of mask.ranges) {
            assert.ok(start >= previousEnd && count > 0 && start + count <= mask.triangleCount);
            for (let triangle = start; triangle < start + count; triangle++) faces.add(triangle);
            previousEnd = start + count;
        }
        for (const [start, count] of ROBOT_LOGO_FACES[`${folder}/${mask.mesh || 'P4.stl'}`]?.ranges || []) {
            for (let triangle = start; triangle < start + count; triangle++) assert.equal(faces.has(triangle), false);
        }
        const catalog = JSON.parse(readFileSync(new URL('../../2_3DSimulation/models/models.json', import.meta.url)));
        assert.equal(catalog.find(model => model.folder === folder).bodyColor, '#d8d7df');
    });
}

test('R4 accent mask matches the STL inlet cover and stays separate from lettering', () => {
    const stl = readFileSync(new URL('../../2_3DSimulation/models/IR-R4-56/P4.stl', import.meta.url));
    assert.equal(ROBOT_JOINT_ACCENT_COLOR, 0x009cde);
    assert.equal(createHash('sha256').update(stl).digest('hex'), R4_JOINT_ACCENT.sha256);
    assert.equal(stl.readUInt32LE(80), R4_JOINT_ACCENT.triangleCount);
    const accent = new Set(R4_JOINT_ACCENT.ranges.flatMap(([start, count]) => Array.from({ length: count }, (_, i) => start + i)));
    // The bottom fastener and upper tab belong to separate surfaces, even
    // though their coordinates overlap the colored band.
    for (const triangle of [5529, 5540, 7455, 7484]) assert.equal(accent.has(triangle), false, `fastener/tab ${triangle}`);
    for (const [start, count] of ROBOT_LOGO_FACES['IR-R4-56/P4.stl'].ranges) {
        for (let triangle = start; triangle < start + count; triangle++) assert.equal(accent.has(triangle), false);
    }
});

test('other models, parts and replaced meshes keep their existing appearance', () => {
    const geometry = { getAttribute: () => ({ count: 30 }) };
    assert.equal(applyRobotJointAccent(geometry, 'IR-S4-40Z15', 'P4.stl'), geometry);
    assert.equal(applyRobotJointAccent(geometry, 'IR-R4-56', 'P3.stl'), geometry);
    assert.equal(applyRobotJointAccent(geometry, 'IR-R4-56', 'P4.stl'), geometry);
});
