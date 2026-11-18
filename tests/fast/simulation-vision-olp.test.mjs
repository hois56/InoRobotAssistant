import test from 'node:test';
import assert from 'node:assert/strict';
import { OlpRuntime } from '../../2_3DSimulation/olp-runtime.mjs';
import { OlpSocketService } from '../../2_3DSimulation/olp-socket-service.mjs';
import {
    VisionController, buildVisionSamplePrograms, createDefaultVisionConfig, createVisionCameraModel, projectWorldPoint
} from '../../2_3DSimulation/vision-core.mjs';

const DEG = Math.PI / 180;
// Tool rotation in the OLP convention: R = Rz(A)·Ry(B)·Rx(C).
function toolRotation([, , , a, b, c]) {
    [a, b, c] = [a, b, c].map(value => value * DEG);
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    return [ca * cb, ca * sb * sc - sa * cc, ca * sb * cc + sa * sc, sa * cb, sa * sb * sc + ca * cc, sa * sb * cc - ca * sc, -sb, cb * sc, cb * cc];
}
const rotate = (x, y, deg) => [x * Math.cos(deg * DEG) - y * Math.sin(deg * DEG), x * Math.sin(deg * DEG) + y * Math.cos(deg * DEG)];

function createCell(configure = () => { }) {
    const config = createDefaultVisionConfig();
    Object.assign(config.camera, { x: 500, y: 0, z: 800, noisePx: 0, processingMs: 0 });
    Object.assign(config.calibration, { centerX: 500, centerY: 0, z: 30, markOffsetX: 25, markOffsetY: 15 });
    configure(config);
    const model = createVisionCameraModel(config.camera);
    const world = { pose: [500, 0, 30, 0, 0, 180], object: { x: 500, y: 0, z: 30, theta: 0 }, moves: [], log: [] };
    const capture = async kind => {
        if (kind === 'mark') {
            const r = toolRotation(world.pose), [ox, oy] = [config.calibration.markOffsetX, config.calibration.markOffsetY];
            const mark = [world.pose[0] + r[0] * ox + r[1] * oy, world.pose[1] + r[3] * ox + r[4] * oy, world.pose[2] + r[6] * ox + r[7] * oy];
            const pixel = projectWorldPoint(model, mark);
            return { found: Boolean(pixel?.inImage), u: pixel?.u, v: pixel?.v };
        }
        const o = world.object, [ax, ay] = rotate(20, 0, o.theta);
        const center = projectWorldPoint(model, [o.x, o.y, o.z]), axis = projectWorldPoint(model, [o.x + ax, o.y + ay, o.z]);
        return { found: true, u: center.u, v: center.v, axisU: axis.u, axisV: axis.v, score: 100 };
    };
    const vision = new VisionController({ config, capture });
    return { config, world, vision };
}

function runProgram(cell, text, { prelude = '', socket = null, io = null } = {}) {
    const program = text.replace('Start;\n', `Start;\n${prelude}`);
    const runtime = new OlpRuntime({ programPath: 'main.pro', programFiles: ['main.pro'], programs: [{ path: 'main.pro', text: program }] }, {
        socket,
        move: async (motion, expression, speed, project, run) => {
            const pose = run.readPositionExpression(expression);
            cell.world.pose = pose.slice(0, 6).map(Number);
            cell.world.moves.push({ motion, expression, pose: cell.world.pose });
        },
        getCurrentPosition: async () => [...cell.world.pose],
        delay: () => new Promise(resolve => setTimeout(resolve, 1)),
        log: message => cell.world.log.push(message),
        readAddress: io?.read,
        writeAddress: io?.write
    });
    return runtime.run().then(() => runtime);
}

function socketFor(cell) {
    const { config, vision } = cell;
    return new OlpSocketService({
        pollMilliseconds: 1,
        resolvePeer: ({ host, port }) => host === config.ip && port === config.link.port
            ? { label: 'VISION', receive: (text, reply) => vision.handleText(text).then(reply) }
            : null
    });
}

const PRELUDE = '    P[200] = (500,0,30,0,0,180);\n    P[100] = (540,0,10,0,0,180);\n    P[101] = (540,0,60,0,0,180);\n';

test('socket sample programs calibrate, register the master and pick with rotation compensation', async () => {
    const cell = createCell();
    const samples = buildVisionSamplePrograms(cell.config);
    const socket = socketFor(cell);
    let runtime = await runProgram(cell, samples.socketCalibration, { prelude: PRELUDE, socket });
    assert.equal(runtime.lastError ?? null, null);
    const calibration = cell.vision.config.calibration.result;
    assert.ok(calibration, cell.world.log.join('\n'));
    assert.ok(calibration.rms < 1e-3, `rms ${calibration.rms}`);
    assert.equal(calibration.translationCount, 9);
    assert.equal(calibration.rotation.count, 3);
    assert.ok(cell.world.log.some(line => /Calibration done/.test(line)));

    runtime = await runProgram(cell, samples.socketMaster, { prelude: PRELUDE, socket });
    const master = cell.vision.config.detection.master;
    assert.ok(Math.abs(master.x - 500) < 1e-3 && Math.abs(master.y) < 1e-3 && Math.abs(master.theta) < 1e-3, JSON.stringify(master));
    assert.equal(cell.vision.config.detection.rotationCenter, 'pick');

    // Move the object; the pick point 40 mm from its center must follow it.
    Object.assign(cell.world.object, { x: 506, y: -4, theta: 12 });
    cell.world.moves.length = 0;
    runtime = await runProgram(cell, samples.socketPick, { prelude: PRELUDE, socket });
    const pick = cell.world.moves.find(move => /P\[100\]/.test(move.expression));
    assert.ok(pick, cell.world.log.join('\n'));
    const [rx, ry] = rotate(40, 0, 12);
    assert.ok(Math.abs(pick.pose[0] - (506 + rx)) < 1e-3, `x ${pick.pose[0]}`);
    assert.ok(Math.abs(pick.pose[1] - (-4 + ry)) < 1e-3, `y ${pick.pose[1]}`);
    assert.ok(Math.abs(pick.pose[3] - 12) < 1e-3, `a ${pick.pose[3]}`);
    assert.ok(Math.abs(pick.pose[2] - 10) < 1e-9);
});

test('socket NG replies stop the pick program before moving', async () => {
    const cell = createCell();
    const socket = socketFor(cell);
    const samples = buildVisionSamplePrograms(cell.config);
    await runProgram(cell, samples.socketPick, { prelude: PRELUDE, socket });
    assert.equal(cell.world.moves.length, 0);
    assert.ok(cell.world.log.some(line => /Vision NG/.test(line)));
});

test('fieldbus sample programs exchange 32-bit REAL values through the robot IO image', async () => {
    const cell = createCell(config => Object.assign(config.output, { resultWord: 100, commandWord: 100 }));
    const words = { IN: new Uint16Array(160), OUT: new Uint16Array(160) };
    const io = {
        read: address => {
            const prefix = address.prefix;
            if (prefix === 'IN' || prefix === 'OUT') return (words[prefix][Math.floor((address.index - 512) / 16) + 32] >> ((address.index - 512) % 16)) & 1;
            return words[prefix.startsWith('IN') ? 'IN' : 'OUT'][address.index];
        },
        write: (address, value) => {
            const prefix = address.prefix;
            if (prefix === 'OUT') {
                const word = Math.floor((address.index - 512) / 16) + 32, mask = 1 << ((address.index - 512) % 16);
                words.OUT[word] = Number(value) ? words.OUT[word] | mask : words.OUT[word] & ~mask;
            } else if (prefix === 'OUTW') words.OUT[address.index] = Number(value) & 0xffff;
        }
    };
    // The vision scans the robot outputs and writes its result block like the OLP link.
    const scan = setInterval(() => {
        cell.vision.handleControlWords(words.OUT.slice(100, 108));
        words.IN.set(cell.vision.resultWords(), 100);
    }, 1);
    try {
        const samples = buildVisionSamplePrograms(cell.config);
        assert.match(samples.fieldbusPick, /OUT\[1600\],ON/);
        assert.match(samples.fieldbusPick, /InW\[102\]\.Float/);
        await runProgram(cell, samples.fieldbusCalibration, { prelude: PRELUDE, io });
        const calibration = cell.vision.config.calibration.result;
        assert.ok(calibration?.rms < 1e-3, cell.world.log.join('\n'));
        await cell.vision.registerMaster({ x: 540, y: 0 });
        Object.assign(cell.world.object, { x: 497, y: 3, theta: -8 });
        cell.world.moves.length = 0;
        await runProgram(cell, samples.fieldbusPick, { prelude: PRELUDE, io });
        const pick = cell.world.moves.find(move => /P\[100\]/.test(move.expression));
        const [rx, ry] = rotate(40, 0, -8);
        assert.ok(Math.abs(pick.pose[0] - (497 + rx)) < 1e-3 && Math.abs(pick.pose[1] - (3 + ry)) < 1e-3, JSON.stringify(pick.pose));
        assert.ok(Math.abs(pick.pose[3] + 8) < 1e-3);
    } finally {
        clearInterval(scan);
    }
});

test('generator-compatible value layout writes scaled integers without handshake', () => {
    const cell = createCell(config => Object.assign(config.output, { layout: 'values', dataType: 'int32', scale: 10000, resultWord: 54, commandWord: -1 }));
    const samples = buildVisionSamplePrograms(cell.config);
    assert.match(samples.fieldbusPick, /InW\[54\]\.Int\/10000,InW\[56\]\.Int\/10000,0,InW\[58\]\.Int\/10000/);
    assert.equal(samples.fieldbusCalibration, '');
});
