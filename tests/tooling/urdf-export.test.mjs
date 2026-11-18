import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createNativeDynamicsKernel, assembleNativeDynamicsModel } from '../../2_3DSimulation/native-dynamics-kernel.mjs';
import { validPrincipalMoments, firmwareInertial } from '../../tools/urdf-physics.mjs';
import { nativeSixFlangePositionMm, nativeSixFlangeRotation } from '../../2_3DSimulation/robot-rapid-kinematics.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const selected = [
    'IR-R4H-54S5-C1H-INT_01741031', 'IR-R7H-70S5-C2H-INT_01741199',
    'IR-R7H-90S5-C2H-INT_01741200', 'IR-R10H-120S5-C2H-INT_01741201'
];
const readUrdf = name => fs.readFileSync(path.join(root, '2_3DSimulation/urdf', `${name}.urdf`), 'utf8');
const attributes = text => Object.fromEntries([...text.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]));

test('four selected URDFs contain physically realizable inertia diagonals', () => {
    for (const name of selected) {
        const tensors = [...readUrdf(name).matchAll(/<inertia\s+([^>]+)\/>/g)];
        assert.equal(tensors.length, 6, name);
        for (const [index, match] of tensors.entries()) {
            const values = attributes(match[1]);
            const d = ['ixx', 'iyy', 'izz'].map(k => Number(values[k]));
            assert.ok(d.every(v => Number.isFinite(v) && v > 0), `${name}/link_${index + 1}`);
            assert.ok(2 * Math.max(...d) <= d.reduce((a, b) => a + b, 0) + 1e-11,
                `${name}/link_${index + 1}: impossible inertia ${d}`);
        }
    }
});

test('URDF effort limits use joint output torque rather than motor shaft torque', () => {
    for (const name of selected) {
        const config = JSON.parse(fs.readFileSync(path.join(root, '2_3DSimulation/새 폴더', `${name}.json`), 'utf8').replace(/^\uFEFF/, ''));
        const joints = [...readUrdf(name).matchAll(/<joint name="J(\d)"[\s\S]*?<limit\s+([^>]+)\/>/g)];
        assert.equal(joints.length, 6);
        for (const match of joints) {
            const link = config.stRobotBody.stDynamics.stLink[Number(match[1]) - 1];
            const expected = link.ratedTrq * Math.abs(link.ratio);
            assert.ok(Math.abs(Number(attributes(match[2]).effort) - expected) < 1e-9, `${name}/J${match[1]}`);
        }
    }
});

test('native J2 centre of mass is rotated into the CAD joint frame', () => {
    const text = readUrdf(selected[2]);
    const inertial = text.match(/<link name="link_2">[\s\S]*?<inertial>([\s\S]*?)<\/inertial>/)[1];
    const origin = attributes(inertial.match(/<origin\s+([^>]+)\/>/)[1]).xyz.split(' ').map(Number);
    assert.deepEqual(origin, [-0.00727, -0.0196, 0.188]);
});

test('tool0 uses the controller flange orientation at zero pose', () => {
    const definitions = JSON.parse(fs.readFileSync(path.join(root, '2_3DSimulation/models/models.json'), 'utf8'));
    for (const name of selected) {
        const joint = readUrdf(name).match(/<joint name="tool0_fixed"[\s\S]*?<origin\s+([^>]+)\/>/)[1];
        const rpy = attributes(joint).rpy.split(' ').map(Number);
        assert.ok(Math.abs(rpy[0] - Math.PI) < 1e-11, name);
        assert.ok(Math.abs(rpy[1] + Math.PI / 2) < 1e-11, name);
        assert.equal(rpy[2], 0);
        const definition = definitions.find(d => name.startsWith(d.folder));
        const toolRotation = multiply(multiply(rz(rpy[2]), ry(rpy[1])), rx(rpy[0]));
        for (const q of [[0, 0, 0, 0, 0, 0], [.3, -.4, .8, .5, -.7, .2]]) {
            const frame = bodyFrame(q, definition.structure, 5);
            const observed = multiply(frame.rotation, toolRotation).flat();
            const expected = nativeSixFlangeRotation(q);
            observed.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-11, `${name}/tool rotation`));
            const position = nativeSixFlangePositionMm(q, definition.structure);
            frame.position.forEach((v, i) => assert.ok(Math.abs(v * 1000 - position[i]) < 1e-9, `${name}/tool position`));
        }
    }
});

test('invalid firmware numbers are rejected without guessing units or missing mass', () => {
    assert.equal(validPrincipalMoments([0.1, 0.04, 0.05]), false);
    assert.equal(validPrincipalMoments([0.001, 0.002, 0.0025]), true);
    assert.equal(validPrincipalMoments([1e-9, 1e-9, 1e-9]), true);
    assert.equal(validPrincipalMoments([-1, 2, 2]), false);
    const bounds = { min: [0, 0, 0], max: [100, 200, 300], center: [50, 100, 150] };
    const fallback = firmwareInertial({ mass: 2, inertia: [100, -1, 1], cog: [0, 0, 642] }, 0, bounds, [0, 0, 0], 0.078);
    assert.equal(fallback.source, 'bounding-box-fallback');
    assert.equal(fallback.mass, 2);
    assert.deepEqual(fallback.origin, [0.05, 0.1, 0.15]);
    assert.throws(() => firmwareInertial({ mass: 0 }, 0, bounds, [0, 0, 0], 0.078), /mass/);
    assert.throws(() => firmwareInertial({ mass: 2, inertia: [1, -1, 1] }, 0, null, [0, 0, 0], 0.078), /bounding box/);
});

const multiply = (a, b) => a.map(row => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const transform = (a, v) => a.map(row => row.reduce((s, x, i) => s + x * v[i], 0));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const identity = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const rx = t => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const ry = t => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
const rz = t => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
function bodyFrame(q, structure, index) {
    const [a, b, c, d, w, h] = structure.map(v => v * 0.001);
    const shifts = [[0, 0, 0], [a, 0, h], [0, 0, b], [0, 0, c], [d, 0, 0], [w, 0, 0]];
    const rotations = [rz(q[0]), ry(-q[1]), ry(-q[2]), rx(q[3]), ry(-q[4]), rx(q[5])];
    const localAxes = [[0, 0, 1], [0, -1, 0], [0, -1, 0], [1, 0, 0], [0, -1, 0], [1, 0, 0]];
    let rotation = identity(), position = [0, 0, 0];
    const axes = [];
    for (let i = 0; i <= index; i++) {
        const shift = transform(rotation, shifts[i]);
        position = position.map((v, j) => v + shift[j]);
        axes.push(transform(rotation, localAxes[i]));
        rotation = multiply(rotation, rotations[i]);
    }
    return { rotation, position, axes };
}

test('all sixteen firmware-based links reproduce native mass and gravity in three poses', () => {
    const firmware = JSON.parse(fs.readFileSync(path.join(root, '2_3DSimulation/urdf/firmware-spc25.json'), 'utf8'));
    const definitions = JSON.parse(fs.readFileSync(path.join(root, '2_3DSimulation/models/models.json'), 'utf8'));
    const gravity = [2.1, -3.2, 8.7]; // includes horizontal gravity to expose frame errors
    let checked = 0;
    for (const name of selected) {
        const record = firmware.models[name];
        const definition = definitions.find(d => name.startsWith(d.folder));
        const text = readUrdf(name);
        const links = [...text.matchAll(/<link name="link_(\d)">([\s\S]*?)<\/link>/g)];
        for (const match of links) {
            if (!match[2].includes('inertial source: firmware-effective-si')) continue;
            checked++;
            const index = Number(match[1]) - 1;
            const inertial = match[2].match(/<inertial>([\s\S]*?)<\/inertial>/)[1];
            const cog = attributes(inertial.match(/<origin\s+([^>]+)\/>/)[1]).xyz.split(' ').map(Number);
            const tensor = attributes(inertial.match(/<inertia\s+([^>]+)\/>/)[1]);
            const diag = ['ixx', 'iyy', 'izz'].map(k => Number(tensor[k]));
            const mass = Number(attributes(inertial.match(/<mass\s+([^>]+)\/>/)[1]).value);
            const isolated = record.links.map((link, i) => i === index ? link
                : { ...link, mass: 0, cog: [0, 0, 0], inertia: [0, 0, 0, 0, 0, 0] });
            const assembly = assembleNativeDynamicsModel({ robotType: 'six-axis', links: isolated,
                kinematicStructure: definition.structure }, { zeroLoadFallback: false });
            const native = createNativeDynamicsKernel({ ...assembly, gravityVector: gravity });
            for (const q of [[0, 0, 0, 0, 0, 0], [.3, -.4, .8, .5, -.7, .2], [-.9, .2, -.3, -.6, .4, -.8]]) {
                const frame = bodyFrame(q, definition.structure, index);
                const point = angles => {
                    const body = bodyFrame(angles, definition.structure, index);
                    const offset = transform(body.rotation, cog);
                    return body.position.map((v, i) => v + offset[i]);
                };
                const jac = Array.from({ length: 6 }, (_, j) => {
                    const a = [...q], b = [...q]; a[j] += 1e-5; b[j] -= 1e-5;
                    const pa = point(a), pb = point(b);
                    return pa.map((v, i) => (v - pb[i]) / 2e-5);
                });
                const toLocal = v => frame.rotation[0].map((_, j) => frame.rotation.reduce((s, row, i) => s + row[j] * v[i], 0));
                const angular = Array.from({ length: 6 }, (_, j) => toLocal(frame.axes[j] || [0, 0, 0]));
                const observed = native.evaluate(q);
                for (let i = 0; i < 6; i++) {
                    const predictedG = mass * dot(jac[i], gravity);
                    assert.ok(Math.abs(predictedG - observed.gravityTorqueNm[i]) < 3e-5, `${name}/${match[1]}/G${i}`);
                    for (let j = 0; j < 6; j++) {
                        const predictedM = mass * dot(jac[i], jac[j]) + angular[i].reduce((s, v, k) => s + v * diag[k] * angular[j][k], 0);
                        assert.ok(Math.abs(predictedM - observed.rigidBodyMassMatrix[i][j]) < 3e-6, `${name}/${match[1]}/M${i}${j}`);
                    }
                }
            }
        }
    }
    assert.equal(checked, 16);
});

test('CLI exports exactly the requested verified models and resolves every mesh', () => {
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'inorobot-urdf-'));
    try {
        const args = ['tools/generate-urdf.mjs', '--output-dir', destination, '--models', 'IR-R7H-70,IR-R7H-90'];
        const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        const outputs = fs.readdirSync(destination).filter(name => name.endsWith('.urdf'));
        assert.equal(outputs.length, 2);
        for (const output of outputs) {
            const text = fs.readFileSync(path.join(destination, output), 'utf8');
            for (const match of text.matchAll(/<mesh filename="([^"]+)"/g)) {
                assert.ok(fs.existsSync(path.resolve(destination, match[1])), match[1]);
            }
        }
        const report = JSON.parse(fs.readFileSync(path.join(destination, 'physics-audit.json'), 'utf8'));
        assert.equal(report.models.length, 2);
        const rejected = spawnSync(process.execPath, ['tools/generate-urdf.mjs', '--output-dir', destination, '--models', 'IR-UNKNOWN'], { cwd: root, encoding: 'utf8' });
        assert.notEqual(rejected.status, 0);
        assert.match(rejected.stderr, /No verified firmware record/);
        assert.equal(fs.readdirSync(destination).filter(name => name.endsWith('.urdf')).length, 2);
    } finally {
        fs.rmSync(destination, { recursive: true, force: true }); // exactly the mkdtemp directory above
    }
});

test('SCARA J3 uses one angle-to-distance conversion and a nonzero screw force', () => {
    const source = JSON.parse(fs.readFileSync(path.join(root, '2_3DSimulation/urdf/firmware-spc25.json'), 'utf8'));
    const name = 'IR-S7-60Z20S3-C2LH-INT_01741021';
    const text = readUrdf(name);
    const joint = text.match(/<joint name="J3"[\s\S]*?<limit\s+([^>]+)\/>/)[1];
    const limits = attributes(joint), record = source.models[name];
    const lead = record.kinematicStructure[3] * .001;
    assert.ok(Math.abs(Number(limits.velocity) - record.playback.stJoint.dMaxVel[2] * lead / 360) < 1e-10);
    assert.ok(Math.abs(Number(limits.effort) - record.links[2].ratedTrq * record.links[2].ratio * 2 * Math.PI / lead) < 1e-9);
});

test('all firmware variants export complete joint chains, positive inertia and resolvable meshes', () => {
    const firmware = JSON.parse(fs.readFileSync(path.join(root, '2_3DSimulation/urdf/firmware-spc25.json'), 'utf8'));
    assert.equal(Object.keys(firmware.models).length, 38);
    assert.equal(new Set(Object.values(firmware.models).map(r => r.folder)).size, 31);
    let count = 0;
    for (const [name, record] of Object.entries(firmware.models)) {
        const text = readUrdf(name);
        assert.equal([...text.matchAll(/<joint name="J\d"/g)].length, record.axisCount, name);
        const links = [...text.matchAll(/<link name="link_(\d)">([\s\S]*?)<\/link>/g)];
        assert.equal(links.length, record.axisCount);
        for (const [i, match] of links.entries()) {
            const mass = Number(attributes(match[2].match(/<mass\s+([^>]+)\/>/)[1]).value);
            assert.ok(Math.abs(mass - record.links[i].mass) < 1e-11);
            const tensor = attributes(match[2].match(/<inertia\s+([^>]+)\/>/)[1]);
            assert.ok(validPrincipalMoments(['ixx', 'iyy', 'izz'].map(k => Number(tensor[k]))), `${name}/${i}`);
        }
        for (const match of text.matchAll(/<mesh filename="([^"]+)"/g)) {
            assert.ok(fs.existsSync(path.resolve(root, '2_3DSimulation/urdf', match[1]))); count++;
        }
        for (const match of text.matchAll(/<joint name="J\d"[\s\S]*?<limit\s+([^>]+)\/>/g)) {
            const limit = attributes(match[1]);
            assert.ok(Number(limit.effort) > 0 && Number(limit.velocity) > 0, name);
            assert.ok(Number(limit.lower) < Number(limit.upper), name);
        }
    }
    assert.ok(count > 400);
});
