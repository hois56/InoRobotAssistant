import test from 'node:test';
import assert from 'node:assert/strict';
import {
    VisionController, buildVisionCalibration, buildVisionResultWords, computeVisionOffset, createDefaultVisionConfig,
    createVisionCameraModel, decodeVisionValue, describeVisionFov, encodeVisionValue, formatVisionText,
    generateCalibrationPlan, normalizeVisionConfig, parseVisionCommand, pixelToRobot, projectWorldPoint,
    randomWorkPose, createSeededRandom, robotToPixel, buildLabVisionCalibration, buildVisionLinkConfig, buildVisionSamplePrograms, VISION_RESULT_LAYOUT, VISION_STATUS_BITS
} from '../../2_3DSimulation/vision-core.mjs';

const DEG = Math.PI / 180;
test('K12 calibration export preserves correction and homography direction without changing source data', () => {
    const config = createDefaultVisionConfig(); config.calibration.controllerCoordinate = 7;
    config.calibration.result = buildVisionCalibration({ translation: [
        { u: 0, v: 0, x: 40, y: -20 }, { u: 100, v: 0, x: 160, y: -20 },
        { u: 0, v: 100, x: 40, y: 60 }, { u: 100, v: 100, x: 160, y: 60 }
    ] });
    config.calibration.result.correction = { x: 3.5, y: -2.25 };
    const original = JSON.stringify(config), exported = buildLabVisionCalibration(config);
    assert.equal(JSON.stringify(config), original);
    assert.equal(exported.CoorCfgList.length, 1);
    assert.equal(exported.CoorCfgList[0].CoorId, 7);
    const native = exported.CoorCfgList[0].CaliMatrix;
    const position = pixelToRobot(config.calibration.result, 12.5, 34.25);
    assert.ok(Math.abs(native[0] * position.x + native[1] * position.y + native[2] - 12.5) < 1e-9);
    assert.ok(Math.abs(native[3] * position.x + native[4] * position.y + native[5] - 34.25) < 1e-9);
    assert.throws(() => buildLabVisionCalibration(createDefaultVisionConfig()), /calibration/);
});
test('Lab calibration can capture raw pixels before calibration or master registration', async () => {
    const config = createDefaultVisionConfig(); config.output.terminator = 'lf';
    const seen = [];
    const controller = new VisionController({ config, capture: async kind => {
        seen.push(kind); return { found: true, u: 150.125, v: 270.5, axisU: 160.125, axisV: 280.5, score: 100 };
    } });
    assert.equal(await controller.handleText('CALRAW'), '150.125,270.500\n');
    assert.equal(await controller.handleText('PIXEL'), 'CVXYA,150.125,270.500,45.000\n');
    assert.deepEqual(seen, ['mark', 'object']);
    assert.equal(controller.config.calibration.result, null);
    assert.equal(controller.config.detection.master, null);
    assert.equal((await controller.trigger()).ok, false);
});

test('raw pixel replies reject missing marks and unusable object axes', async () => {
    const config = createDefaultVisionConfig(); config.output.terminator = 'crlf';
    const controller = new VisionController({ config, capture: async () => ({ found: false }) });
    assert.equal(await controller.handleText('CALRAW'), 'NG\r\n');
    controller.capture = async () => ({ found: true, u: 5, v: 8, axisU: 5, axisV: 8, score: 100 });
    assert.equal(await controller.handleText('PIXEL'), 'NG\r\n');
});
const rotate = (x, y, deg) => [x * Math.cos(deg * DEG) - y * Math.sin(deg * DEG), x * Math.sin(deg * DEG) + y * Math.cos(deg * DEG)];

// Robot BASE frame placed in the world: 90° about Z at (100, 50, 0).
const BASE = { x: 100, y: 50, rz: 90 };
const robotToWorld = (x, y, z) => {
    const [wx, wy] = rotate(x, y, BASE.rz);
    return [wx + BASE.x, wy + BASE.y, z];
};

function createWorld(cameraOverrides = {}, { markOffset = [25, 15] } = {}) {
    const config = createDefaultVisionConfig();
    Object.assign(config.camera, { x: 100, y: 550, z: 800, noisePx: 0 }, cameraOverrides);
    Object.assign(config.calibration, { centerX: 500, centerY: 0, z: 30, pitchX: 60, pitchY: 60, markOffsetX: markOffset[0], markOffsetY: markOffset[1] });
    const model = createVisionCameraModel(config.camera);
    const world = { robot: { x: 500, y: 0, z: 30, r: 0 }, object: { x: 505, y: -3, z: 30, theta: 10, length: 30 } };
    const capture = async kind => {
        if (kind === 'mark') {
            const [mx, my] = rotate(markOffset[0], markOffset[1], world.robot.r);
            const pixel = projectWorldPoint(model, robotToWorld(world.robot.x + mx, world.robot.y + my, world.robot.z));
            return pixel?.inImage ? { found: true, u: pixel.u, v: pixel.v } : { found: false };
        }
        const o = world.object;
        const [ax, ay] = rotate(o.length, 0, o.theta);
        const center = projectWorldPoint(model, robotToWorld(o.x, o.y, o.z));
        const axis = projectWorldPoint(model, robotToWorld(o.x + ax, o.y + ay, o.z));
        return { found: true, u: center.u, v: center.v, axisU: axis.u, axisV: axis.v, score: 100 };
    };
    return { config, model, world, capture };
}

async function calibrateWithPlan(world, controller) {
    let reply = await controller.handleText('CALSTART');
    const replies = [reply];
    for (let guard = 0; guard < 20; guard++) {
        const [status, x, y, r] = reply.split(',').map(Number);
        if (status <= 0) break;
        Object.assign(world.robot, { x, y, r });
        reply = await controller.handleText(`CALPOS,${x},${y},${r}`);
        replies.push(reply);
    }
    return replies;
}

test('camera FOV, working distance and resolution follow the lens model', () => {
    const fov = describeVisionFov({ x: 0, y: 0, z: 800, resolutionWidth: 1280, resolutionHeight: 1024, pixelSizeUm: 4.8, focalLengthMm: 8 }, 0);
    assert.ok(Math.abs(fov.workingDistance - 800) < 1e-9);
    assert.ok(Math.abs(fov.width - 614.4) < 1e-6);
    assert.ok(Math.abs(fov.height - 491.52) < 1e-6);
    assert.ok(Math.abs(fov.mmPerPixel - 0.48) < 1e-9);
    // Image +u follows world +X and +v follows world -Y for the default down-looking camera.
    const model = fov.model;
    const right = projectWorldPoint(model, [10, 0, 0]), up = projectWorldPoint(model, [0, 10, 0]);
    assert.ok(right.u > model.cx && Math.abs(right.v - model.cy) < 1e-9);
    assert.ok(up.v < model.cy && Math.abs(up.u - model.cx) < 1e-9);
    assert.equal(projectWorldPoint(model, [0, 0, 900]), null);
});

test('calibration plan has a 3×3 grid followed by rotation points', () => {
    const plan = generateCalibrationPlan({ centerX: 400, centerY: 10, pitchX: 50, pitchY: 40, rotationAngle: 15, rotationCount: 3, order: 'raster', z: 20, r: 5 });
    assert.equal(plan.length, 12);
    assert.deepEqual(plan.slice(0, 9).map(step => [step.x, step.y]), [
        [450, 50], [450, 10], [450, -30], [400, 50], [400, 10], [400, -30], [350, 50], [350, 10], [350, -30]]);
    assert.deepEqual(plan.slice(9).map(step => [step.kind, step.x, step.y, step.r]), [
        ['rotation', 400, 10, -10], ['rotation', 400, 10, 5], ['rotation', 400, 10, 20]]);
    const snake = generateCalibrationPlan({ order: 'snake', rotationCount: 0 });
    assert.equal(snake.length, 9);
    assert.ok(snake[3].y < snake[4].y, 'second row runs in reverse order');
});

test('9-point and rotation calibration map pixels to robot coordinates with an off-axis mark', async () => {
    const { config, world, capture } = createWorld();
    const controller = new VisionController({ config, capture });
    const replies = await calibrateWithPlan(world, controller);
    assert.equal(replies.length, 13);
    assert.match(replies.at(-1), /^0,/);
    const cal = controller.config.calibration.result;
    assert.ok(cal.rms < 1e-6, `rms ${cal.rms}`);
    assert.ok(Math.abs(cal.rotation.radius - Math.hypot(25, 15)) < 1e-6);
    assert.ok(Math.abs(cal.rotation.markOffset.x - 25) < 1e-6 && Math.abs(cal.rotation.markOffset.y - 15) < 1e-6);
    assert.ok(cal.rotation.angleErrorMax < 1e-6);
    // Any point on the calibration plane maps back to its robot coordinates.
    const model = createVisionCameraModel(config.camera);
    for (const [x, y] of [[480, 20], [530, -40], [470, -10]]) {
        const pixel = projectWorldPoint(model, robotToWorld(x, y, 30));
        const robot = pixelToRobot(cal, pixel.u, pixel.v);
        assert.ok(Math.abs(robot.x - x) < 1e-6 && Math.abs(robot.y - y) < 1e-6, `${x},${y} → ${robot.x},${robot.y}`);
        const back = robotToPixel(cal, x, y);
        assert.ok(Math.abs(back.u - pixel.u) < 1e-6 && Math.abs(back.v - pixel.v) < 1e-6);
    }
});

test('tilted cameras need the homography model', () => {
    const { model } = createWorld({ rx: 12, ry: -6 });
    const points = [];
    for (const x of [440, 500, 560]) for (const y of [-60, 0, 60]) {
        const p = projectWorldPoint(model, robotToWorld(x, y, 30));
        points.push({ index: points.length + 1, u: p.u, v: p.v, x, y, r: 0 });
    }
    const affine = buildVisionCalibration({ translation: points, method: 'affine' });
    const homography = buildVisionCalibration({ translation: points, method: 'homography' });
    assert.ok(affine.rms > 0.05, `affine rms ${affine.rms}`);
    assert.ok(homography.rms < 1e-6, `homography rms ${homography.rms}`);
    assert.throws(() => buildVisionCalibration({ translation: points.slice(0, 2) }), /Not enough/);
});

test('offsets compensate rotation about the robot pick point', () => {
    const master = { x: 500, y: 0, theta: 0 };
    const current = { x: 505, y: -3, theta: 10 };
    assert.deepEqual(Object.values(computeVisionOffset({ master, current: master })).map(v => +v.toFixed(9)), [0, 0, 0]);
    const centerOffset = computeVisionOffset({ master, current });
    assert.ok(Math.abs(centerOffset.dx - 5) < 1e-9 && Math.abs(centerOffset.dy + 3) < 1e-9 && Math.abs(centerOffset.dtheta - 10) < 1e-9);
    // Pick point 40 mm in front of the object center: it must follow the object.
    const pick = { x: 540, y: 0 };
    const offset = computeVisionOffset({ master, current, rotationCenter: pick });
    const [rx, ry] = rotate(40, 0, 10);
    assert.ok(Math.abs(pick.x + offset.dx - (current.x + rx)) < 1e-9);
    assert.ok(Math.abs(pick.y + offset.dy - (current.y + ry)) < 1e-9);
    // Two-fold symmetric parts never need more than ±90°.
    assert.ok(Math.abs(computeVisionOffset({ master, current: { ...master, theta: 170 }, symmetry: 2 }).dtheta + 10) < 1e-9);
});

test('trigger replies with formatted offsets after master registration', async () => {
    const { config, world, capture } = createWorld();
    const controller = new VisionController({ config, capture });
    await calibrateWithPlan(world, controller);
    Object.assign(world.object, { x: 500, y: 0, theta: 0 });
    const master = await controller.handleText('MST');
    assert.match(master, /^1,500\.000,0\.000,0\.000$/);
    Object.assign(world.object, { x: 504.5, y: -2.25, theta: 7.5 });
    assert.equal(await controller.handleText('Shot'), '4.500,-2.250,7.500');
    controller.config.output.template = '{ok},{x},{y},{t}';
    controller.config.output.terminator = 'crlf';
    assert.equal(await controller.handleText('T1'), '1,504.500,-2.250,7.500\r\n');
    Object.assign(world.object, { x: 900 });
    assert.equal(await controller.handleText('TRG'), 'NG\r\n');
    assert.equal(await controller.handleText('HELLO'), 'ERR,UNKNOWN\r\n');
});

test('without rotation calibration absolute positions shift by the mark offset', async () => {
    const { config, world, capture } = createWorld();
    config.calibration.rotationCount = 0;
    const controller = new VisionController({ config, capture });
    await calibrateWithPlan(world, controller);
    const cal = controller.config.calibration.result;
    assert.equal(cal.rotation, null);
    Object.assign(world.object, { x: 500, y: 0, theta: 0 });
    await controller.handleText('MST');
    const measured = controller.config.detection.master;
    assert.ok(Math.abs(measured.x - (500 - 25)) < 1e-6 && Math.abs(measured.y - (0 - 15)) < 1e-6);
});

test('32-bit words match the robot .Float/.Int typed views', () => {
    const words = encodeVisionValue(-12.345, { dataType: 'float32' });
    const view = new DataView(new ArrayBuffer(4));
    view.setUint16(0, words[0], true); view.setUint16(2, words[1], true);
    assert.ok(Math.abs(view.getFloat32(0, true) + 12.345) < 1e-5);
    assert.deepEqual(encodeVisionValue(1.5, { dataType: 'int32', scale: 10000 }), [15000, 0]);
    assert.deepEqual(encodeVisionValue(-1, { dataType: 'int32', scale: 10000 }), [0xd8f0, 0xffff]);
    const swapped = encodeVisionValue(3.25, { wordOrder: 'high-low' });
    assert.equal(decodeVisionValue(swapped, { wordOrder: 'high-low' }), 3.25);
    assert.deepEqual(swapped, [...encodeVisionValue(3.25)].reverse());

    const output = normalizeVisionConfig({}).output;
    const block = buildVisionResultWords({ status: 0b1101, code: 1, value1: 1.25, value2: -2.5, value3: 3.75, value4: 100, counter: 70000 }, output);
    assert.equal(block.length, VISION_RESULT_LAYOUT.length);
    assert.equal(block[0], 0b1101);
    assert.equal(decodeVisionValue(block.slice(2, 4)), 1.25);
    assert.equal(decodeVisionValue(block.slice(4, 6)), -2.5);
    assert.equal(decodeVisionValue(block.slice(6, 8)), 3.75);
    assert.equal(block[10] + block[11] * 65536, 70000);
    assert.deepEqual(buildVisionResultWords({ value1: 1, value2: 2, value3: 3 }, { ...output, layout: 'values', dataType: 'int32' }),
        [10000, 0, 20000, 0, 30000, 0]);
});

test('text commands and templates are parsed consistently', () => {
    assert.deepEqual(parseVisionCommand('Shot\r\n'), { type: 'trigger', raw: 'Shot', job: 0 });
    assert.equal(parseVisionCommand('t1').type, 'trigger');
    assert.deepEqual(parseVisionCommand('CALPOS,500.5,-20,15'), { type: 'calPoint', raw: 'CALPOS,500.5,-20,15', x: 500.5, y: -20, r: 15 });
    assert.equal(parseVisionCommand('CAL,10,1,2,3').index, 10);
    assert.equal(parseVisionCommand('GO', 'go').type, 'trigger');
    assert.equal(parseVisionCommand('').type, 'empty');
    assert.equal(formatVisionText('{ok}|{dx}|{dt}|{unknown}', { ok: 1, dx: -0.0001, dt: 2 }, 2), '1|0.00|2.00|{unknown}');
});

test('fieldbus handshake executes a rising trigger and holds Done until it falls', async () => {
    const { config, world, capture } = createWorld();
    const controller = new VisionController({ config, capture });
    await calibrateWithPlan(world, controller);
    Object.assign(world.object, { x: 500, y: 0, theta: 0 });
    await controller.handleText('MST');
    Object.assign(world.object, { x: 501, y: 2, theta: -4 });
    const command = new Array(8).fill(0);
    command[0] = 1;
    await controller.handleControlWords(command);
    let words = controller.resultWords();
    const status = words[0];
    assert.ok(status & (1 << VISION_STATUS_BITS.done));
    assert.ok(status & (1 << VISION_STATUS_BITS.ok));
    assert.ok(status & (1 << VISION_STATUS_BITS.calibrated));
    assert.ok(Math.abs(decodeVisionValue(words.slice(2, 4)) - 1) < 1e-4);
    assert.ok(Math.abs(decodeVisionValue(words.slice(4, 6)) - 2) < 1e-4);
    assert.ok(Math.abs(decodeVisionValue(words.slice(6, 8)) + 4) < 1e-4);
    command[0] = 0;
    await controller.handleControlWords(command);
    words = controller.resultWords();
    assert.equal(words[0] & (1 << VISION_STATUS_BITS.done), 0);
    // A panel or socket trigger refreshes values but never leaves Done set.
    await controller.trigger();
    words = controller.resultWords();
    assert.equal(words[0] & (1 << VISION_STATUS_BITS.done), 0);
    assert.ok(words[0] & (1 << VISION_STATUS_BITS.ok));
});

test('random work poses stay within the configured deviation and are reproducible', () => {
    const generator = { nominalX: 400, nominalY: 20, nominalZ: 5, nominalRz: 30, rangeX: 8, rangeY: 4, rangeRz: 12 };
    const a = createSeededRandom(42), b = createSeededRandom(42);
    for (let i = 0; i < 200; i++) {
        const pose = randomWorkPose(generator, a);
        assert.deepEqual(pose, randomWorkPose(generator, b));
        assert.ok(Math.abs(pose.x - 400) <= 8 && Math.abs(pose.y - 20) <= 4 && Math.abs(pose.rz - 30) <= 12 + 1e-9);
        assert.equal(pose.z, 5);
    }
});

test('configuration normalization rejects invalid addresses and ranges', () => {
    const config = normalizeVisionConfig({ ip: '999.1.1.1', link: { protocol: 'profinet', port: 70000, mcDevice: 'x' }, output: { layout: 'bad', resultWord: -5 } });
    assert.equal(config.ip, '127.0.0.11');
    assert.equal(config.link.protocol, 'socket');
    assert.equal(config.link.port, 65535);
    assert.equal(config.link.mcDevice, 'D');
    assert.equal(config.output.layout, 'standard');
    assert.equal(config.output.resultWord, 0);
});

test('vision connections always use controllers with Socket or Ethernet/IP', () => {
    const defaults = createDefaultVisionConfig();
    assert.equal(defaults.link.target, 'external');
    for (const protocol of ['socket', 'eip', 'modbus', 'mc']) {
        for (const role of ['server', 'client']) {
            const config = normalizeVisionConfig({ link: { active: false, target: 'olp', protocol, role } });
            assert.equal(config.link.target, 'external');
            assert.equal(config.link.active, true);
            assert.equal(config.link.protocol, protocol === 'eip' ? 'eip' : 'socket');
            assert.equal(config.link.role, role);
        }
    }
});

test('legacy camera settings always move the model with its coordinates', () => {
    assert.equal(normalizeVisionConfig({ camera: { moveModel: false } }).camera.moveModel, true);
});

test('vision uses full color and defaults to 50 mm XY and 180 degree work deviations', () => {
    for (const config of [createDefaultVisionConfig(), normalizeVisionConfig({ camera: { monochrome: true } })]) {
        assert.equal(config.camera.monochrome, false);
        assert.equal(config.generator.rangeX, 50);
        assert.equal(config.generator.rangeY, 50);
        assert.equal(config.generator.rangeRz, 180);
        assert.equal(config.detection.limitTheta, 180);
    }
});

test('the selected work-object reference matrix survives save/load and rejects malformed data', () => {
    const referenceMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 400, 50, 20, 1];
    const saved = normalizeVisionConfig({ detection: { targetId: 'imported-part' }, generator: { referenceMatrix } });
    const restored = normalizeVisionConfig(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.detection.targetId, 'imported-part');
    assert.deepEqual(restored.generator.referenceMatrix, referenceMatrix);
    assert.equal(normalizeVisionConfig({ generator: { referenceMatrix: [1, 2] } }).generator.referenceMatrix, null);
});

test('an upward camera projects objects and its FOV above the lens', () => {
    const camera = { x: 10, y: 20, z: 100, direction: 'up', workPlaneZ: 800 };
    const model = createVisionCameraModel(camera);
    assert.deepEqual(model.axes.z, [0, 0, 1]);
    const center = projectWorldPoint(model, [10, 20, 800]);
    assert.equal(center.u, model.cx);
    assert.equal(center.v, model.cy);
    assert.equal(projectWorldPoint(model, [10, 20, 0]), null);
    const fov = describeVisionFov(camera);
    assert.equal(fov.workingDistance, 700);
    assert.ok(fov.corners.every(point => point[2] === 800));
    assert.equal(normalizeVisionConfig().camera.direction, 'down');
    assert.equal(normalizeVisionConfig({ camera: { direction: 'invalid' } }).camera.direction, 'down');
    const restored = normalizeVisionConfig(JSON.parse(JSON.stringify(normalizeVisionConfig({ camera: { direction: 'up', mountPartIndex: 11 } }))));
    assert.equal(restored.camera.direction, 'up');
    assert.equal(restored.camera.mountPartIndex, 11);
});

test('an upward camera calibrates and measures master-relative offsets', async () => {
    const { config, world, capture } = createWorld({ z: -700, direction: 'up', workPlaneZ: 30 });
    const controller = new VisionController({ config, capture });
    await calibrateWithPlan(world, controller);
    assert.ok(controller.config.calibration.result.rms < 1e-6);
    assert.equal((await controller.registerMaster()).ok, true);
    Object.assign(world.object, { x: world.object.x + 8, y: world.object.y - 6, theta: world.object.theta + 12 });
    const result = await controller.trigger();
    assert.equal(result.ok, true);
    assert.ok(Math.abs(result.dx - 8) < 1e-6);
    assert.ok(Math.abs(result.dy + 6) < 1e-6);
    assert.ok(Math.abs(result.dtheta - 12) < 1e-6);
});

test('RobotLab V framing preserves raw pixel replies and endpoint configuration', async () => {
    const config = createDefaultVisionConfig(); config.output.terminator = 'lab';
    const normalized = normalizeVisionConfig(config);
    assert.equal(normalized.output.terminator, 'lab');
    assert.equal(buildVisionLinkConfig(normalized).terminator, 'lab');
    assert.equal(buildVisionSamplePrograms(normalized).socketLabPixel, '');
    normalized.output.terminator = 'lf';
    assert.match(buildVisionSamplePrograms(normalized).socketLabPixel, /Send Port.*PIXEL/);
    const controller = new VisionController({ config, capture: async () => ({ found: true, u: 12.5, v: 34.25, axisU: 22.5, axisV: 44.25, score: 100 }) });
    assert.equal(await controller.handleText('CALRAW'), '12.500,34.250V');
    assert.equal(await controller.handleText('PIXEL'), 'CVXYA,12.500,34.250,45.000V');
});
