// Virtual vision core: camera model, calibration and correction math.
// Units are mm and degrees. Robot coordinates are the robot BASE (Wobj 0)
// frame reported by the robot program; camera poses are world coordinates.
// The module is DOM/three.js free so it can run under node:test.

export const VISION_SCHEMA_VERSION = 1;
export const VISION_STATUS_BITS = Object.freeze({
    ready: 0, busy: 1, done: 2, ok: 3, ng: 4, calibrated: 5, master: 6, error: 7, calibrating: 8
});
export const VISION_CONTROL_BITS = Object.freeze({
    trigger: 0, calStart: 1, calPoint: 2, master: 3, reset: 4
});
export const VISION_RESULT_CODES = Object.freeze({
    none: 0, ok: 1, notFound: 2, outOfRange: 3, notCalibrated: 4, noMaster: 5, error: 9
});
// Standard data block word offsets. Values are 2-word (32-bit) entries.
export const VISION_RESULT_LAYOUT = Object.freeze({ status: 0, code: 1, value1: 2, value2: 4, value3: 6, value4: 8, counter: 10, length: 12 });
export const VISION_COMMAND_LAYOUT = Object.freeze({ control: 0, job: 1, x: 2, y: 4, r: 6, length: 8 });
export const VISION_TERMINATORS = Object.freeze({ none: '', cr: '\r', lf: '\n', crlf: '\r\n', lab: 'V' });
export const VISION_PROTOCOLS = Object.freeze(['socket', 'eip']);
// Default TCP ports per protocol. The Inovance virtual controller connects its
// MC client to port 5000 and serves Modbus TCP on 502.
export const VISION_DEFAULT_PORTS = Object.freeze({ socket: 5000, modbus: 502, eip: 44818, mc: 5000 });

const DEG = Math.PI / 180;
const finite = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};
const clamp = (value, fallback, min, max) => Math.min(max, Math.max(min, finite(value, fallback)));
const integer = (value, fallback, min, max) => Math.trunc(clamp(value, fallback, min, max));
const oneOf = (value, options, fallback) => options.includes(value) ? value : fallback;
const isIpv4 = value => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(value || '').trim());

export function normalizeAngleDeg(angle, period = 360) {
    const span = Math.abs(finite(period, 360)) || 360;
    let value = ((finite(angle, 0) + span / 2) % span + span) % span - span / 2;
    if (Math.abs(value - span / 2) < 1e-12) value = -span / 2;
    return value;
}

export function createDefaultVisionConfig() {
    return {
        schemaVersion: VISION_SCHEMA_VERSION,
        enabled: false,
        name: 'VISION 1',
        ip: '127.0.0.11',
        robotId: '',
        camera: {
            x: 500, y: 0, z: 800, rx: 0, ry: 0, rz: 0, direction: 'down',
            resolutionWidth: 1280, resolutionHeight: 1024,
            pixelSizeUm: 4.8, focalLengthMm: 8, workPlaneZ: 0,
            noisePx: 0.05, showFrustum: true, monochrome: false, processingMs: 120,
            // Scene model that carries the camera; mountLocal is the lens pose in
            // the mounted part/model frame (column-major 4x4).
            mountId: '', mountPartIndex: -1, mountLocal: null, builtIn: false, moveModel: true
        },
        calibration: {
            method: 'affine', controllerCoordinate: 0, centerX: 500, centerY: 0, z: 100, r: 0,
            pitchX: 60, pitchY: 60, rotationAngle: 20, rotationCount: 3, order: 'snake',
            markOffsetX: 25, markOffsetY: 15, markSize: 14, showMark: true,
            result: null
        },
        detection: {
            targetId: '', symmetry: 1, rotationCenter: 'object', pickX: 0, pickY: 0,
            limitX: 50, limitY: 50, limitTheta: 180, minScore: 60, master: null
        },
        output: {
            template: '{dx},{dy},{dt}', ngTemplate: 'NG', decimals: 3, terminator: 'none',
            triggerCommands: 'Shot,T1,TRG', dataType: 'float32', scale: 10000,
            wordOrder: 'low-high', layout: 'standard', resultWord: 100, commandWord: 100
        },
        link: {
            active: true, target: 'external', olpMode: 'socket', olpChannel: 2,
            protocol: 'socket', role: 'server', port: 5000,
            targetIp: '127.0.0.1', targetPort: 5000, pollMs: 20,
            // Inovance controller aliases: INW[32+i] = register 34787+i (write),
            // OUTW[32+i] = register 2035+i (FC04). MC: INW[32] = D0, OUTW[32] = D1000.
            modbusUnitId: 1, modbusInputBase: 34787, modbusOutputBase: 2035, modbusOutputFunction: 4,
            mcFrame: 'binary', mcDevice: 'D', mcInputBase: 0, mcOutputBase: 1000,
            eipMode: 'implicit', eipInputInstance: 100, eipOutputInstance: 101, eipConfigInstance: 1,
            eipAssemblySize: 256, eipRpiMs: 10, eipUdpPort: 2222
        },
        generator: {
            shape: 'box', sizeX: 60, sizeY: 40, sizeZ: 20, color: '#d97706',
            nominalX: 500, nominalY: 0, nominalZ: 0, nominalRz: 0,
            rangeX: 50, rangeY: 50, rangeRz: 180, seed: 0, referenceMatrix: null,
            autoSupply: false, supplyDelayMs: 600, triggerBit: -1, captureOnSpawn: false
        }
    };
}

function normalizeCalibrationResult(result) {
    if (!result || typeof result !== 'object') return null;
    const matrix = Array.isArray(result.matrix) ? result.matrix.map(Number) : [];
    if (matrix.length !== 9 || !matrix.every(Number.isFinite)) return null;
    return {
        ...result,
        method: result.method === 'homography' ? 'homography' : 'affine',
        matrix,
        correction: {
            x: finite(result.correction?.x, 0),
            y: finite(result.correction?.y, 0)
        }
    };
}

function normalizeMaster(master) {
    if (!master || typeof master !== 'object') return null;
    const value = { x: Number(master.x), y: Number(master.y), theta: Number(master.theta) };
    if (![value.x, value.y, value.theta].every(Number.isFinite)) return null;
    const truth = master.truth && [master.truth.x, master.truth.y, master.truth.theta].every(Number.isFinite)
        ? { x: Number(master.truth.x), y: Number(master.truth.y), theta: Number(master.truth.theta) }
        : null;
    return { ...value, u: finite(master.u, 0), v: finite(master.v, 0), time: finite(master.time, 0), truth };
}

export function normalizeVisionConfig(raw = {}) {
    const defaults = createDefaultVisionConfig();
    const source = raw && typeof raw === 'object' ? raw : {};
    const camera = { ...defaults.camera, ...(source.camera || {}) };
    const calibration = { ...defaults.calibration, ...(source.calibration || {}) };
    const detection = { ...defaults.detection, ...(source.detection || {}) };
    const output = { ...defaults.output, ...(source.output || {}) };
    const link = { ...defaults.link, ...(source.link || {}) };
    const generator = { ...defaults.generator, ...(source.generator || {}) };
    return {
        schemaVersion: VISION_SCHEMA_VERSION,
        enabled: source.enabled === true,
        name: String(source.name ?? defaults.name).slice(0, 40) || defaults.name,
        ip: isIpv4(source.ip) ? String(source.ip).trim() : defaults.ip,
        robotId: String(source.robotId || ''),
        camera: {
            x: clamp(camera.x, defaults.camera.x, -100000, 100000),
            y: clamp(camera.y, defaults.camera.y, -100000, 100000),
            z: clamp(camera.z, defaults.camera.z, -100000, 100000),
            rx: normalizeAngleDeg(camera.rx),
            ry: normalizeAngleDeg(camera.ry),
            rz: normalizeAngleDeg(camera.rz),
            direction: oneOf(camera.direction, ['down', 'up'], 'down'),
            resolutionWidth: integer(camera.resolutionWidth, 1280, 64, 8192),
            resolutionHeight: integer(camera.resolutionHeight, 1024, 64, 8192),
            pixelSizeUm: clamp(camera.pixelSizeUm, 4.8, 0.5, 50),
            focalLengthMm: clamp(camera.focalLengthMm, 8, 1, 300),
            workPlaneZ: clamp(camera.workPlaneZ, 0, -100000, 100000),
            noisePx: clamp(camera.noisePx, 0.05, 0, 10),
            showFrustum: camera.showFrustum !== false,
            monochrome: false,
            processingMs: integer(camera.processingMs, 120, 0, 5000),
            mountId: String(camera.mountId || ''),
            mountPartIndex: integer(camera.mountPartIndex, -1, -1, 65535),
            mountLocal: Array.isArray(camera.mountLocal) && camera.mountLocal.length === 16 && camera.mountLocal.every(value => Number.isFinite(Number(value)))
                ? camera.mountLocal.map(Number) : null,
            builtIn: camera.builtIn === true,
            moveModel: true
        },
        calibration: {
            method: oneOf(calibration.method, ['affine', 'homography'], 'affine'),
            controllerCoordinate: integer(calibration.controllerCoordinate, 0, 0, 15),
            centerX: clamp(calibration.centerX, defaults.calibration.centerX, -100000, 100000),
            centerY: clamp(calibration.centerY, defaults.calibration.centerY, -100000, 100000),
            z: clamp(calibration.z, defaults.calibration.z, -100000, 100000),
            r: normalizeAngleDeg(calibration.r),
            pitchX: clamp(calibration.pitchX, 60, 0.1, 10000),
            pitchY: clamp(calibration.pitchY, 60, 0.1, 10000),
            rotationAngle: clamp(calibration.rotationAngle, 20, 1, 90),
            rotationCount: integer(calibration.rotationCount, 3, 0, 11),
            order: oneOf(calibration.order, ['raster', 'snake'], 'snake'),
            markOffsetX: clamp(calibration.markOffsetX, 25, -1000, 1000),
            markOffsetY: clamp(calibration.markOffsetY, 15, -1000, 1000),
            markSize: clamp(calibration.markSize, 14, 1, 200),
            showMark: calibration.showMark !== false,
            result: normalizeCalibrationResult(calibration.result)
        },
        detection: {
            targetId: String(detection.targetId || ''),
            symmetry: oneOf(Number(detection.symmetry), [1, 2, 4], 1),
            rotationCenter: oneOf(detection.rotationCenter, ['object', 'pick'], 'object'),
            pickX: clamp(detection.pickX, 0, -100000, 100000),
            pickY: clamp(detection.pickY, 0, -100000, 100000),
            limitX: clamp(detection.limitX, 50, 0, 100000),
            limitY: clamp(detection.limitY, 50, 0, 100000),
            limitTheta: clamp(detection.limitTheta, 180, 0, 180),
            minScore: clamp(detection.minScore, 60, 0, 100),
            master: normalizeMaster(detection.master)
        },
        output: {
            template: String(output.template ?? defaults.output.template).slice(0, 200),
            ngTemplate: String(output.ngTemplate ?? defaults.output.ngTemplate).slice(0, 200),
            decimals: integer(output.decimals, 3, 0, 6),
            terminator: oneOf(output.terminator, Object.keys(VISION_TERMINATORS), 'none'),
            triggerCommands: String(output.triggerCommands ?? defaults.output.triggerCommands).slice(0, 200),
            dataType: oneOf(output.dataType, ['float32', 'int32'], 'float32'),
            scale: clamp(output.scale, 10000, 1, 1000000),
            wordOrder: oneOf(output.wordOrder, ['low-high', 'high-low'], 'low-high'),
            layout: oneOf(output.layout, ['standard', 'values'], 'standard'),
            resultWord: integer(output.resultWord, 100, 0, 65535),
            commandWord: integer(output.commandWord, 100, -1, 65535)
        },
        link: {
            active: true,
            target: 'external',
            olpMode: oneOf(link.olpMode, ['socket', 'io'], 'socket'),
            olpChannel: integer(link.olpChannel, 2, 0, 63),
            protocol: oneOf(link.protocol, VISION_PROTOCOLS, 'socket'),
            role: oneOf(link.role, ['server', 'client'], 'server'),
            port: integer(link.port, 5000, 1, 65535),
            targetIp: isIpv4(link.targetIp) ? String(link.targetIp).trim() : defaults.link.targetIp,
            targetPort: integer(link.targetPort, 5000, 1, 65535),
            pollMs: integer(link.pollMs, 20, 5, 5000),
            modbusUnitId: integer(link.modbusUnitId, 1, 0, 255),
            modbusInputBase: integer(link.modbusInputBase, 34787, 0, 65535),
            modbusOutputBase: integer(link.modbusOutputBase, 2035, 0, 65535),
            modbusOutputFunction: oneOf(Number(link.modbusOutputFunction), [3, 4], 4),
            mcFrame: oneOf(link.mcFrame, ['binary', 'ascii'], 'binary'),
            mcDevice: oneOf(String(link.mcDevice || '').toUpperCase(), ['D', 'W', 'R'], 'D'),
            mcInputBase: integer(link.mcInputBase, 0, 0, 65535),
            mcOutputBase: integer(link.mcOutputBase, 1000, 0, 65535),
            eipMode: oneOf(link.eipMode, ['implicit', 'explicit'], 'implicit'),
            eipInputInstance: integer(link.eipInputInstance, 100, 1, 255),
            eipOutputInstance: integer(link.eipOutputInstance, 101, 1, 255),
            eipConfigInstance: integer(link.eipConfigInstance, 1, 0, 255),
            eipAssemblySize: integer(link.eipAssemblySize, 256, 2, 496) & ~1,
            eipRpiMs: integer(link.eipRpiMs, 10, 1, 1000),
            eipUdpPort: integer(link.eipUdpPort, 2222, 1, 65535)
        },
        generator: {
            shape: oneOf(generator.shape, ['box', 'cylinder'], 'box'),
            sizeX: clamp(generator.sizeX, 60, 1, 5000),
            sizeY: clamp(generator.sizeY, 40, 1, 5000),
            sizeZ: clamp(generator.sizeZ, 20, 1, 5000),
            color: /^#[0-9a-f]{6}$/i.test(String(generator.color)) ? String(generator.color) : defaults.generator.color,
            nominalX: clamp(generator.nominalX, 500, -100000, 100000),
            nominalY: clamp(generator.nominalY, 0, -100000, 100000),
            nominalZ: clamp(generator.nominalZ, 0, -100000, 100000),
            nominalRz: normalizeAngleDeg(generator.nominalRz),
            rangeX: clamp(generator.rangeX, 50, 0, 10000),
            rangeY: clamp(generator.rangeY, 50, 0, 10000),
            rangeRz: clamp(generator.rangeRz, 180, 0, 180),
            referenceMatrix: Array.isArray(generator.referenceMatrix) && generator.referenceMatrix.length === 16 && generator.referenceMatrix.every(value => Number.isFinite(Number(value)))
                ? generator.referenceMatrix.map(Number) : null,
            seed: integer(generator.seed, 0, 0, 2147483647),
            autoSupply: generator.autoSupply === true,
            supplyDelayMs: integer(generator.supplyDelayMs, 600, 0, 60000),
            triggerBit: integer(generator.triggerBit, -1, -1, 65535),
            captureOnSpawn: generator.captureOnSpawn === true
        }
    };
}

// ---------------------------------------------------------------- camera ----

function rotationX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [[1, 0, 0], [0, c, -s], [0, s, c]];
}
function rotationY(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}
function rotationZ(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}
function multiply3(a, b) {
    return a.map((row, i) => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}

/** Camera model in OpenCV convention: x right, y down, z along the optical axis. */
export function createVisionCameraModel(cameraConfig) {
    const camera = normalizeVisionConfig({ camera: cameraConfig }).camera;
    const base = camera.direction === 'up'
        ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        : [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
    const world = multiply3(multiply3(rotationZ(camera.rz * DEG), rotationY(camera.ry * DEG)), rotationX(camera.rx * DEG));
    const rotation = multiply3(world, base);
    const pixel = camera.pixelSizeUm / 1000;
    const fx = camera.focalLengthMm / pixel;
    const width = camera.resolutionWidth, height = camera.resolutionHeight;
    return {
        width, height, fx, fy: fx, cx: width / 2, cy: height / 2,
        position: [camera.x, camera.y, camera.z],
        rotation,
        axes: {
            x: [rotation[0][0], rotation[1][0], rotation[2][0]],
            y: [rotation[0][1], rotation[1][1], rotation[2][1]],
            z: [rotation[0][2], rotation[1][2], rotation[2][2]]
        },
        horizontalFovDeg: 2 * Math.atan((width * pixel) / (2 * camera.focalLengthMm)) / DEG,
        verticalFovDeg: 2 * Math.atan((height * pixel) / (2 * camera.focalLengthMm)) / DEG,
        pixelSizeMm: pixel,
        focalLengthMm: camera.focalLengthMm,
        workPlaneZ: camera.workPlaneZ
    };
}

export function projectWorldPoint(model, point) {
    const d = [point[0] - model.position[0], point[1] - model.position[1], point[2] - model.position[2]];
    const dot = axis => axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2];
    const x = dot(model.axes.x), y = dot(model.axes.y), z = dot(model.axes.z);
    if (z <= 1e-6) return null;
    const u = model.fx * x / z + model.cx, v = model.fy * y / z + model.cy;
    return { u, v, depth: z, inImage: u >= 0 && u <= model.width && v >= 0 && v <= model.height };
}

export function pixelRay(model, u, v) {
    const x = (u - model.cx) / model.fx, y = (v - model.cy) / model.fy;
    const { x: ax, y: ay, z: az } = model.axes;
    return [0, 1, 2].map(i => ax[i] * x + ay[i] * y + az[i]);
}

export function pixelToWorldPlane(model, u, v, planeZ = model.workPlaneZ) {
    const ray = pixelRay(model, u, v);
    if (Math.abs(ray[2]) < 1e-9) return null;
    const t = (planeZ - model.position[2]) / ray[2];
    if (t <= 0) return null;
    return [model.position[0] + ray[0] * t, model.position[1] + ray[1] * t, planeZ];
}

/** Field of view footprint and resolution on a horizontal plane. */
export function describeVisionFov(cameraConfig, planeZ) {
    const model = createVisionCameraModel(cameraConfig);
    const z = Number.isFinite(Number(planeZ)) ? Number(planeZ) : model.workPlaneZ;
    const corners = [[0, 0], [model.width, 0], [model.width, model.height], [0, model.height]]
        .map(([u, v]) => pixelToWorldPlane(model, u, v, z));
    const center = pixelToWorldPlane(model, model.cx, model.cy, z);
    const distance = center ? Math.hypot(center[0] - model.position[0], center[1] - model.position[1], center[2] - model.position[2]) : null;
    const valid = corners.every(Boolean) && Boolean(center);
    const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const width = valid ? (length(corners[0], corners[1]) + length(corners[3], corners[2])) / 2 : null;
    const height = valid ? (length(corners[0], corners[3]) + length(corners[1], corners[2])) / 2 : null;
    return {
        model, planeZ: z, corners: valid ? corners : null, center,
        workingDistance: distance,
        width, height,
        mmPerPixel: valid ? width / model.width : null,
        horizontalFovDeg: model.horizontalFovDeg,
        verticalFovDeg: model.verticalFovDeg
    };
}

// ----------------------------------------------------------- linear math ----

export function solveLinearSystem(matrix, vector) {
    const n = vector.length;
    const a = matrix.map((row, i) => [...row, vector[i]]);
    for (let column = 0; column < n; column++) {
        let pivot = column;
        for (let row = column + 1; row < n; row++) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
        if (Math.abs(a[pivot][column]) < 1e-12) return null;
        [a[column], a[pivot]] = [a[pivot], a[column]];
        for (let row = 0; row < n; row++) {
            if (row === column) continue;
            const factor = a[row][column] / a[column][column];
            for (let k = column; k <= n; k++) a[row][k] -= factor * a[column][k];
        }
    }
    return a.map((row, i) => row[n] / row[i]);
}

function leastSquares(rows, targets) {
    const n = rows[0].length;
    const normal = Array.from({ length: n }, () => new Array(n).fill(0));
    const rhs = new Array(n).fill(0);
    rows.forEach((row, index) => {
        for (let i = 0; i < n; i++) {
            rhs[i] += row[i] * targets[index];
            for (let j = 0; j < n; j++) normal[i][j] += row[i] * row[j];
        }
    });
    return solveLinearSystem(normal, rhs);
}

function invert3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-15) return null;
    return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d]
        .map(value => value / det);
}

function multiplyMatrix3(a, b) {
    const out = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
    return out;
}

function normalization(points) {
    const mx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const my = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    const mean = points.reduce((sum, p) => sum + Math.hypot(p[0] - mx, p[1] - my), 0) / points.length;
    const s = mean > 1e-12 ? Math.SQRT2 / mean : 1;
    return { matrix: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1], inverse: [1 / s, 0, mx, 0, 1 / s, my, 0, 0, 1] };
}

export function applyPlanarTransform(matrix, u, v) {
    const w = matrix[6] * u + matrix[7] * v + matrix[8];
    if (Math.abs(w) < 1e-12) return null;
    return { x: (matrix[0] * u + matrix[1] * v + matrix[2]) / w, y: (matrix[3] * u + matrix[4] * v + matrix[5]) / w };
}

export function fitAffineTransform(pairs) {
    if (!Array.isArray(pairs) || pairs.length < 3) throw new Error('Affine calibration needs at least 3 points.');
    const pixel = normalization(pairs.map(p => [p.u, p.v]));
    const rows = pairs.map(p => {
        const q = applyPlanarTransform(pixel.matrix, p.u, p.v);
        return [q.x, q.y, 1];
    });
    const xs = leastSquares(rows, pairs.map(p => p.x));
    const ys = leastSquares(rows, pairs.map(p => p.y));
    if (!xs || !ys) throw new Error('Calibration points are collinear.');
    const normalized = [...xs, ...ys, 0, 0, 1];
    const matrix = multiplyMatrix3(normalized, pixel.matrix);
    const det = matrix[0] * matrix[4] - matrix[1] * matrix[3];
    if (Math.abs(det) < 1e-12) throw new Error('Calibration points are collinear.');
    return matrix;
}

export function fitHomographyTransform(pairs) {
    if (!Array.isArray(pairs) || pairs.length < 4) throw new Error('Homography calibration needs at least 4 points.');
    const pixel = normalization(pairs.map(p => [p.u, p.v]));
    const world = normalization(pairs.map(p => [p.x, p.y]));
    const rows = [], targets = [];
    for (const p of pairs) {
        const a = applyPlanarTransform(pixel.matrix, p.u, p.v);
        const b = applyPlanarTransform(world.matrix, p.x, p.y);
        rows.push([a.x, a.y, 1, 0, 0, 0, -a.x * b.x, -a.y * b.x]); targets.push(b.x);
        rows.push([0, 0, 0, a.x, a.y, 1, -a.x * b.y, -a.y * b.y]); targets.push(b.y);
    }
    const h = leastSquares(rows, targets);
    if (!h) throw new Error('Calibration points are degenerate.');
    const matrix = multiplyMatrix3(multiplyMatrix3(world.inverse, [...h, 1]), pixel.matrix);
    const scale = matrix[8];
    if (Math.abs(scale) < 1e-12) throw new Error('Calibration points are degenerate.');
    return matrix.map(value => value / scale);
}

/** Algebraic (Kasa) circle fit: returns center, radius and radial RMS. */
export function fitCircle(points) {
    if (!Array.isArray(points) || points.length < 3) throw new Error('Circle fit needs at least 3 points.');
    const mx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const my = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const rows = points.map(p => [p.x - mx, p.y - my, 1]);
    const targets = points.map(p => -((p.x - mx) ** 2 + (p.y - my) ** 2));
    const solution = leastSquares(rows, targets);
    if (!solution) throw new Error('Rotation points are collinear.');
    const [D, E, F] = solution;
    const cx = -D / 2, cy = -E / 2;
    const radiusSquared = cx * cx + cy * cy - F;
    if (!(radiusSquared > 0)) throw new Error('Rotation points do not form a circle.');
    const radius = Math.sqrt(radiusSquared);
    const center = { x: cx + mx, y: cy + my };
    const errors = points.map(p => Math.hypot(p.x - center.x, p.y - center.y) - radius);
    return { center, radius, rms: Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length) };
}

// ----------------------------------------------------------- calibration ----

export function generateCalibrationPlan(calibrationConfig) {
    const cal = normalizeVisionConfig({ calibration: calibrationConfig }).calibration;
    const steps = [];
    for (let row = 0; row < 3; row++) {
        const columns = cal.order === 'snake' && row % 2 ? [2, 1, 0] : [0, 1, 2];
        for (const column of columns) {
            steps.push({
                kind: 'translation', index: steps.length + 1,
                x: cal.centerX + (1 - row) * cal.pitchX,
                y: cal.centerY + (1 - column) * cal.pitchY,
                z: cal.z, r: cal.r
            });
        }
    }
    const count = cal.rotationCount;
    for (let i = 0; i < count; i++) {
        const angle = count === 1 ? 0 : -cal.rotationAngle + (2 * cal.rotationAngle * i) / (count - 1);
        steps.push({ kind: 'rotation', index: steps.length + 1, x: cal.centerX, y: cal.centerY, z: cal.z, r: normalizeAngleDeg(cal.r + angle) });
    }
    return steps;
}

function describeTransform(matrix, pairs) {
    const residuals = pairs.map(p => {
        const q = applyPlanarTransform(matrix, p.u, p.v);
        return { index: p.index, dx: q.x - p.x, dy: q.y - p.y, error: Math.hypot(q.x - p.x, q.y - p.y) };
    });
    const rms = Math.sqrt(residuals.reduce((sum, r) => sum + r.error ** 2, 0) / residuals.length);
    const max = Math.max(...residuals.map(r => r.error));
    const centerU = pairs.reduce((sum, p) => sum + p.u, 0) / pairs.length;
    const centerV = pairs.reduce((sum, p) => sum + p.v, 0) / pairs.length;
    const origin = applyPlanarTransform(matrix, centerU, centerV);
    const du = applyPlanarTransform(matrix, centerU + 1, centerV);
    const dv = applyPlanarTransform(matrix, centerU, centerV + 1);
    const ju = [du.x - origin.x, du.y - origin.y], jv = [dv.x - origin.x, dv.y - origin.y];
    const scaleU = Math.hypot(...ju), scaleV = Math.hypot(...jv);
    const cross = ju[0] * jv[1] - ju[1] * jv[0];
    return {
        residuals, rms, max,
        scaleU, scaleV,
        imageAngle: Math.atan2(ju[1], ju[0]) / DEG,
        mirrored: cross < 0,
        skew: 90 - Math.acos(Math.max(-1, Math.min(1, (ju[0] * jv[0] + ju[1] * jv[1]) / (scaleU * scaleV)))) / DEG
    };
}

/**
 * Build the pixel → robot mapping from translation pairs and, when available,
 * correct its translation using the rotation-center circle.
 *
 * Translation pairs map the mark pixel to the commanded TCP XY while the tool
 * angle stays constant. A mark that is not on the tool rotation axis leaves a
 * constant offset R(r0)·m in that mapping. Rotating about a fixed TCP moves the
 * mark on a circle whose mapped center differs from the TCP by exactly that
 * offset, so (TCP − circle center) restores true object coordinates.
 */
export function buildVisionCalibration({ translation = [], rotation = [], method = 'affine' } = {}) {
    const pairs = translation.filter(p => [p.u, p.v, p.x, p.y].every(Number.isFinite));
    if (pairs.length < (method === 'homography' ? 4 : 3)) throw new Error('Not enough translation points.');
    const matrix = method === 'homography' ? fitHomographyTransform(pairs) : fitAffineTransform(pairs);
    const summary = describeTransform(matrix, pairs);
    let correction = { x: 0, y: 0 }, rotationSummary = null;
    const samples = rotation.filter(p => [p.u, p.v, p.x, p.y, p.r].every(Number.isFinite));
    if (samples.length >= 3) {
        const mapped = samples.map(s => ({ ...applyPlanarTransform(matrix, s.u, s.v), r: s.r }));
        const circle = fitCircle(mapped);
        const robotCenter = {
            x: samples.reduce((sum, s) => sum + s.x, 0) / samples.length,
            y: samples.reduce((sum, s) => sum + s.y, 0) / samples.length
        };
        const spread = Math.max(...samples.map(s => Math.hypot(s.x - robotCenter.x, s.y - robotCenter.y)));
        correction = { x: robotCenter.x - circle.center.x, y: robotCenter.y - circle.center.y };
        const angles = mapped.map(p => Math.atan2(p.y - circle.center.y, p.x - circle.center.x) / DEG);
        const angleErrors = mapped.map((p, i) => normalizeAngleDeg((angles[i] - angles[0]) - (samples[i].r - samples[0].r)));
        const baseR = pairs.reduce((sum, p) => sum + (Number.isFinite(p.r) ? p.r : 0), 0) / pairs.length;
        const c = Math.cos(-baseR * DEG), s = Math.sin(-baseR * DEG);
        rotationSummary = {
            center: circle.center, robotCenter, radius: circle.radius, rms: circle.rms,
            robotSpread: spread,
            angleErrorMax: Math.max(...angleErrors.map(Math.abs)),
            markOffset: { x: c * correction.x - s * correction.y, y: s * correction.x + c * correction.y },
            count: samples.length
        };
    }
    return {
        method: method === 'homography' ? 'homography' : 'affine',
        matrix,
        inverse: invert3(matrix),
        correction,
        rms: summary.rms,
        max: summary.max,
        residuals: summary.residuals,
        scaleU: summary.scaleU,
        scaleV: summary.scaleV,
        imageAngle: summary.imageAngle,
        mirrored: summary.mirrored,
        skew: summary.skew,
        rotation: rotationSummary,
        translationCount: pairs.length,
        points: pairs.map(p => ({ index: p.index, u: p.u, v: p.v, x: p.x, y: p.y, r: p.r })),
        rotationPoints: samples.map(p => ({ index: p.index, u: p.u, v: p.v, x: p.x, y: p.y, r: p.r }))
    };
}

export function pixelToRobot(calibration, u, v) {
    if (!calibration?.matrix) return null;
    const point = applyPlanarTransform(calibration.matrix, u, v);
    if (!point) return null;
    return { x: point.x + (calibration.correction?.x || 0), y: point.y + (calibration.correction?.y || 0) };
}

/** K12 overlay: native CaliMatrix maps robot coordinates to pixels. */
export function buildLabVisionCalibration(config) {
    const normalized = normalizeVisionConfig(config);
    const calibration = normalized.calibration.result;
    if (!calibration?.matrix) throw new Error('Complete vision calibration before exporting.');
    const h = calibration.matrix;
    const dx = calibration.correction?.x || 0, dy = calibration.correction?.y || 0;
    const corrected = [h[0] + dx * h[6], h[1] + dx * h[7], h[2] + dx * h[8],
        h[3] + dy * h[6], h[4] + dy * h[7], h[5] + dy * h[8], h[6], h[7], h[8]];
    const nativeMatrix = invert3(corrected);
    if (!nativeMatrix?.every(Number.isFinite)) throw new Error('Invalid vision calibration matrix.');
    return {
        Format: 'InoRobotAssistant.VisionCalibration.v1',
        Source: { CameraName: normalized.name, RobotId: normalized.robotId, RobotFrame: 'BASE',
            Method: calibration.method, RMS: calibration.rms, Max: calibration.max },
        CoorCfgList: [{ CoorId: normalized.calibration.controllerCoordinate, CameraStyle: 0, WobjNo: 0,
            CaliMatrix: nativeMatrix,
            WobjParameter: { RobHold: false, UFFix: false, UFMec: '',
                UFrame: { Data: [0, 0, 0, 0, 0, 0] }, OFrame: { Data: [0, 0, 0, 0, 0, 0] } } }]
    };
}

export function robotToPixel(calibration, x, y) {
    const inverse = calibration?.inverse || (calibration?.matrix ? invert3(calibration.matrix) : null);
    if (!inverse) return null;
    const point = applyPlanarTransform(inverse, x - (calibration.correction?.x || 0), y - (calibration.correction?.y || 0));
    return point ? { u: point.x, v: point.y } : null;
}

/** Object pose in robot coordinates from its pixel center and +X axis point. */
export function measureRobotPose(calibration, observation) {
    const center = pixelToRobot(calibration, observation.u, observation.v);
    const axis = pixelToRobot(calibration, observation.axisU, observation.axisV);
    if (!center || !axis) return null;
    return { x: center.x, y: center.y, theta: Math.atan2(axis.y - center.y, axis.x - center.x) / DEG };
}

/**
 * Robot correction for P_new = P_master + (dx, dy, 0, dθ), where the tool
 * rotates dθ about its TCP. With a pick point the translation follows the
 * pick point instead of the object center (rotation-center compensation).
 */
export function computeVisionOffset({ master, current, rotationCenter = null, symmetry = 1 }) {
    const period = 360 / (Number(symmetry) || 1);
    const dtheta = normalizeAngleDeg(current.theta - master.theta, period);
    const center = rotationCenter && Number.isFinite(rotationCenter.x) && Number.isFinite(rotationCenter.y)
        ? rotationCenter
        : { x: master.x, y: master.y };
    const c = Math.cos(dtheta * DEG), s = Math.sin(dtheta * DEG);
    const rx = center.x - master.x, ry = center.y - master.y;
    const moved = { x: c * rx - s * ry + current.x, y: s * rx + c * ry + current.y };
    return { dx: moved.x - center.x, dy: moved.y - center.y, dtheta };
}

// ------------------------------------------------------------- output ----

function formatNumber(value, decimals) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    const text = number.toFixed(decimals);
    return Number(text) === 0 ? (0).toFixed(decimals) : text;
}

export function formatVisionText(template, values = {}, decimals = 3) {
    return String(template ?? '').replace(/\{([a-z0-9]+)\}/gi, (match, key) => {
        const name = key.toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(values, name)) return match;
        const value = values[name];
        if (typeof value === 'string') return value;
        if (['ok', 'count', 'code', 'index', 'status'].includes(name)) return String(Math.trunc(Number(value) || 0));
        return formatNumber(value, decimals);
    });
}

export function parseVisionCommand(text, triggerCommands = 'Shot,T1,TRG') {
    const raw = String(text ?? '').replace(/[\r\n\0]+/g, ' ').trim();
    const tokens = raw.split(/\s*[,;]\s*|\s+/).filter(token => token !== '');
    const keyword = String(tokens[0] || '').toUpperCase();
    const numbers = tokens.slice(1).map(token => Number.parseFloat(token));
    const triggers = String(triggerCommands || '').split(/[,;\s]+/).filter(Boolean).map(value => value.toUpperCase());
    if (!keyword) return { type: 'empty', raw };
    if (keyword === 'CALRAW' || keyword === 'PIXEL') return { type: 'rawPixels', raw, mark: keyword === 'CALRAW' };
    if (triggers.includes(keyword)) return { type: 'trigger', raw, job: Number.isFinite(numbers[0]) ? numbers[0] : 0 };
    const pose = offset => ({ x: numbers[offset], y: numbers[offset + 1], r: numbers[offset + 2] });
    if (keyword === 'CALSTART' || keyword === 'CS') return { type: 'calStart', raw };
    if (keyword === 'CALPOS' || keyword === 'CP') return { type: 'calPoint', raw, ...pose(0) };
    if (keyword === 'CAL') return { type: 'calIndexed', raw, index: Math.trunc(numbers[0]), ...pose(1) };
    if (keyword === 'CALEND' || keyword === 'CE') return { type: 'calCompute', raw };
    if (keyword === 'MASTER' || keyword === 'MST') return { type: 'master', raw, ...pose(0) };
    if (keyword === 'RESET' || keyword === 'RST') return { type: 'reset', raw };
    return { type: 'unknown', raw, keyword };
}

/** Encode a value to two 16-bit words (32-bit float or scaled int). */
export function encodeVisionValue(value, { dataType = 'float32', scale = 10000, wordOrder = 'low-high' } = {}) {
    const view = new DataView(new ArrayBuffer(4));
    const number = Number(value) || 0;
    if (dataType === 'int32') view.setInt32(0, Math.max(-2147483648, Math.min(2147483647, Math.round(number * scale))), true);
    else view.setFloat32(0, number, true);
    const low = view.getUint16(0, true), high = view.getUint16(2, true);
    return wordOrder === 'high-low' ? [high, low] : [low, high];
}

export function decodeVisionValue(words, { dataType = 'float32', scale = 10000, wordOrder = 'low-high' } = {}) {
    const [first = 0, second = 0] = words || [];
    const [low, high] = wordOrder === 'high-low' ? [second, first] : [first, second];
    const view = new DataView(new ArrayBuffer(4));
    view.setUint16(0, low & 0xffff, true);
    view.setUint16(2, high & 0xffff, true);
    return dataType === 'int32' ? view.getInt32(0, true) / scale : view.getFloat32(0, true);
}

function encodeInt32(value, wordOrder) {
    const view = new DataView(new ArrayBuffer(4));
    view.setInt32(0, Math.trunc(Number(value) || 0), true);
    const low = view.getUint16(0, true), high = view.getUint16(2, true);
    return wordOrder === 'high-low' ? [high, low] : [low, high];
}

export function buildVisionResultWords(state, output) {
    const format = { dataType: output.dataType, scale: output.scale, wordOrder: output.wordOrder };
    const values = [state.value1, state.value2, state.value3, state.value4].map(value => encodeVisionValue(value, format));
    if (output.layout === 'values') return [...values[0], ...values[1], ...values[2]];
    const words = new Array(VISION_RESULT_LAYOUT.length).fill(0);
    words[VISION_RESULT_LAYOUT.status] = state.status & 0xffff;
    words[VISION_RESULT_LAYOUT.code] = state.code & 0xffff;
    [VISION_RESULT_LAYOUT.value1, VISION_RESULT_LAYOUT.value2, VISION_RESULT_LAYOUT.value3, VISION_RESULT_LAYOUT.value4]
        .forEach((offset, index) => { words[offset] = values[index][0]; words[offset + 1] = values[index][1]; });
    const counter = encodeInt32(state.counter, output.wordOrder);
    words[VISION_RESULT_LAYOUT.counter] = counter[0];
    words[VISION_RESULT_LAYOUT.counter + 1] = counter[1];
    return words;
}

export function readVisionCommandWords(words, output) {
    const format = { dataType: output.dataType, scale: output.scale, wordOrder: output.wordOrder };
    const at = offset => [words?.[offset] ?? 0, words?.[offset + 1] ?? 0];
    return {
        control: (words?.[VISION_COMMAND_LAYOUT.control] ?? 0) & 0xffff,
        job: (words?.[VISION_COMMAND_LAYOUT.job] ?? 0) & 0xffff,
        x: decodeVisionValue(at(VISION_COMMAND_LAYOUT.x), format),
        y: decodeVisionValue(at(VISION_COMMAND_LAYOUT.y), format),
        r: decodeVisionValue(at(VISION_COMMAND_LAYOUT.r), format)
    };
}

export const ROBOT_WORD_FIRST = 32;
export const ROBOT_WORD_LAST = 159;

export function visionBlockLengths(output) {
    return {
        result: output.layout === 'values' ? 6 : VISION_RESULT_LAYOUT.length,
        command: output.commandWord >= 0 ? VISION_COMMAND_LAYOUT.length : 0
    };
}

/** Address errors for the fieldbus image (robot INW/OUTW 32..159). */
export function validateVisionAddresses(config) {
    const { output } = normalizeVisionConfig(config);
    const lengths = visionBlockLengths(output);
    const errors = [];
    const check = (start, length, label) => {
        if (start < ROBOT_WORD_FIRST || start + length - 1 > ROBOT_WORD_LAST) {
            errors.push(`${label}[${start}..${start + length - 1}] must stay within ${ROBOT_WORD_FIRST}..${ROBOT_WORD_LAST}`);
        }
    };
    check(output.resultWord, lengths.result, 'INW');
    if (lengths.command) check(output.commandWord, lengths.command, 'OUTW');
    return errors;
}

/**
 * Endpoint description for the local protocol server. Addresses follow the
 * robot image: results land in INW[resultWord], commands come from
 * OUTW[commandWord]; each protocol maps word 32 to its own base address.
 */
export function buildVisionLinkConfig(config) {
    const { ip, link, output } = normalizeVisionConfig(config);
    const lengths = visionBlockLengths(output);
    const resultIndex = output.resultWord - ROBOT_WORD_FIRST;
    const commandIndex = output.commandWord - ROBOT_WORD_FIRST;
    return {
        protocol: link.protocol,
        role: link.role,
        bindIp: ip,
        port: link.port,
        targetIp: link.targetIp,
        targetPort: link.targetPort,
        pollMs: link.pollMs,
        terminator: output.terminator,
        resultWords: lengths.result,
        commandWords: lengths.command,
        resultIndex,
        commandIndex,
        modbus: {
            unitId: link.modbusUnitId,
            inputBase: link.modbusInputBase,
            outputBase: link.modbusOutputBase,
            readFunction: link.modbusOutputFunction
        },
        mc: {
            frame: link.mcFrame,
            device: link.mcDevice,
            resultAddress: link.mcInputBase + resultIndex,
            commandAddress: link.mcOutputBase + commandIndex
        },
        eip: {
            mode: link.eipMode,
            inputInstance: link.eipInputInstance,
            outputInstance: link.eipOutputInstance,
            configInstance: link.eipConfigInstance,
            size: link.eipAssemblySize,
            rpiMs: link.eipRpiMs,
            udpPort: link.eipUdpPort
        }
    };
}

/** Robot bit addresses inside the fieldbus image words. */
export function visionSignalAddresses(config) {
    const { output } = normalizeVisionConfig(config);
    const bitOf = (word, index) => 512 + (word - ROBOT_WORD_FIRST) * 16 + index;
    return {
        status: Object.fromEntries(Object.entries(VISION_STATUS_BITS).map(([name, index]) => [name, bitOf(output.resultWord, index)])),
        control: output.commandWord >= 0
            ? Object.fromEntries(Object.entries(VISION_CONTROL_BITS).map(([name, index]) => [name, bitOf(output.commandWord, index)]))
            : null
    };
}

/**
 * Robot-language examples generated from the current settings. They use
 * only statements supported by the controller and the browser OLP runtime.
 * P[200]: calibration start pose, P[100]: master pick pose, P[101]: approach.
 */
export function buildVisionSamplePrograms(config) {
    const c = normalizeVisionConfig(config);
    const ch = c.link.target === 'olp' ? c.link.olpChannel : 2;
    const server = c.link.role === 'server';
    const open = server
        ? `    Close Socket,${ch};\n    Open Socket("${c.ip}",${c.link.port},${ch},Single,LB[0]);\n    If LB[0] == 0\n        Print "Vision connect failed";\n        Goto L[9];\n    EndIf;\n`
        : `    LB[0] = GetPortState(${ch});\n    If LB[0] == 0\n        Print "Vision is not connected";\n        Goto L[9];\n    EndIf;\n`;
    const close = server ? `    Close Socket,${ch};\n` : '';
    const frameEnd = VISION_TERMINATORS[c.output.terminator];
    const framed = c.link.target === 'external' && Boolean(frameEnd);
    const receiveText = label => framed
        ? `    GetAString Port[${ch}],T[30],Str[0],${JSON.stringify(frameEnd)},Goto L[${label}];\n`
        : `    Get Port[${ch}],T[30],Goto L[${label}];\n    Str[0] = GetPortbuf(0,100,${ch});\n`;
    const receive = label => `    L[${label}]:\n${receiveText(label)}    LB[1] = StrGetData(Str[0],",",LD[0]);\n`;
    const socketCalibration = `# Vision 9-point + rotation calibration (vision-led, Socket)
# P[200] : calibration start pose with the mark inside the FOV
Start;
${open}    Movj P[200],V[50],Z[0],Tool[1],Wobj[0];
    Send Port[${ch}],"CALSTART";
${receive(1)}    If LD[0] > 0
        # Reply "index,X,Y,R" : move to the requested robot position
        PR[11] = (LD[1]-P[200].X,LD[2]-P[200].Y,0,LD[3]-P[200].A,0,0);
        Movl Offset(P[200],PR[11]),V[50],Z[0],Tool[1],Wobj[0];
        Delay T[0.2];
        PR[12] = GetCurPos();
        Send Port[${ch}],"CALPOS," + PR[12].X + "," + PR[12].Y + "," + PR[12].A;
        Goto L[1];
    EndIf;
    If LD[0] == 0
        Print "Calibration done. RMS(mm) = " + LD[1];
    Else
        Print "Calibration failed";
    EndIf;
    Movj P[200],V[50],Z[0],Tool[1],Wobj[0];
    L[9]:
${close}End;
`;
    const socketMaster = `# Register the master position (Socket)
# Place the work object at its reference position before running.
# P[100] : pick pose taught on the reference object (rotation center)
Start;
${open}    Send Port[${ch}],"MST," + P[100].X + "," + P[100].Y + "," + P[100].A;
${receive(1)}    If LD[0] == 1
        Print "Master X=" + LD[1] + " Y=" + LD[2] + " A=" + LD[3];
    Else
        Print "Master registration failed";
    EndIf;
    L[9]:
${close}End;
`;
    const socketPick = `# Vision inspection and corrected pick (Socket)
# Reply "${c.output.template}" -> PR[0] = (dX, dY, 0, dA, 0, 0)
# P[100] : master pick pose, P[101] : approach pose above P[100]
Start;
${open}    Send Port[${ch}],"${String(c.output.triggerCommands).split(/[,;\s]+/).filter(Boolean)[0] || 'Shot'}";
${receive(1)}    If LB[1] < 3
        Print "Vision NG : " + Str[0];
        Goto L[9];
    EndIf;
    PR[0] = (LD[0],LD[1],0,LD[2],0,0);
    Print "Vision offset X=" + LD[0] + " Y=" + LD[1] + " A=" + LD[2];
    Movj Offset(P[101],PR[0]),V[100],Z[CP],Tool[1],Wobj[0];
    Movl Offset(P[100],PR[0]),V[30],Z[0],Tool[1],Wobj[0];
    # Turn the vacuum or gripper on here.
    Movl Offset(P[101],PR[0]),V[100],Z[CP],Tool[1],Wobj[0];
    L[9]:
${close}End;
`;
    const signals = visionSignalAddresses(c);
    const r = c.output.resultWord, cw = c.output.commandWord;
    const value = (word, prefix = 'InW') => c.output.dataType === 'float32' ? `${prefix}[${word}].Float` : `${prefix}[${word}].Int/${c.output.scale}`;
    const writeValue = (word, expression) => c.output.dataType === 'float32'
        ? `    OutW[${word}].Float = ${expression};\n`
        : `    OutW[${word}].Int = ${expression}*${c.output.scale};\n`;
    let fieldbusPick, fieldbusCalibration;
    if (c.output.layout === 'values' || !signals.control) {
        fieldbusPick = `# Vision offset words (${c.output.dataType === 'float32' ? '32-bit REAL' : `32-bit INT / ${c.output.scale}`})
# InW[${r}] = dX, InW[${r + 2}] = dY, InW[${r + 4}] = dA
Start;
    PR[0] = (${value(r)},${value(r + 2)},0,${value(r + 4)},0,0);
    Movj Offset(P[101],PR[0]),V[100],Z[CP],Tool[1],Wobj[0];
    Movl Offset(P[100],PR[0]),V[30],Z[0],Tool[1],Wobj[0];
End;
`;
        fieldbusCalibration = '';
    } else {
        const s = signals.status, k = signals.control;
        const handshake = (bit, label) => `    Set OUT[${bit}],ON;\n    Wait IN[${s.done}] == ON;\n${label}    Set OUT[${bit}],OFF;\n    Wait IN[${s.done}] == OFF;\n`;
        fieldbusPick = `# Vision trigger over fieldbus (${c.output.dataType === 'float32' ? '32-bit REAL' : `32-bit INT / ${c.output.scale}`})
# OUT[${k.trigger}] Trigger, IN[${s.done}] Done, IN[${s.ok}] OK, IN[${s.ng}] NG
# InW[${r + 2}] dX, InW[${r + 4}] dY, InW[${r + 6}] dA, InW[${r + 1}] result code
Start;
${handshake(k.trigger, `    LB[0] = IN[${s.ok}];\n    PR[0] = (${value(r + 2)},${value(r + 4)},0,${value(r + 6)},0,0);\n`)}    If LB[0] == 0
        Print "Vision NG code = " + InW[${r + 1}];
        Goto L[9];
    EndIf;
    Print "Vision offset X=" + PR[0].X + " Y=" + PR[0].Y + " A=" + PR[0].A;
    Movj Offset(P[101],PR[0]),V[100],Z[CP],Tool[1],Wobj[0];
    Movl Offset(P[100],PR[0]),V[30],Z[0],Tool[1],Wobj[0];
    L[9]:
End;
`;
        const readTarget = `    LD[0] = ${value(r + 8)};\n    PR[11] = (${value(r + 2)}-P[200].X,${value(r + 4)}-P[200].Y,0,${value(r + 6)}-P[200].A,0,0);\n`;
        fieldbusCalibration = `# Vision calibration over fieldbus (vision-led)
# OUT[${k.calStart}] CalStart, OUT[${k.calPoint}] CalPoint, IN[${s.done}] Done
# InW[${r + 2}..${r + 7}] next X/Y/R, InW[${r + 8}] next index (0 = finished)
# OutW[${cw + 2}..${cw + 7}] current X/Y/R reported by the robot
Start;
    Movj P[200],V[50],Z[0],Tool[1],Wobj[0];
${handshake(k.calStart, readTarget)}    L[1]:
    If LD[0] > 0
        Movl Offset(P[200],PR[11]),V[50],Z[0],Tool[1],Wobj[0];
        Delay T[0.2];
        PR[12] = GetCurPos();
${writeValue(cw + 2, 'PR[12].X').replace(/^/gm, '    ')}${writeValue(cw + 4, 'PR[12].Y').replace(/^/gm, '    ')}${writeValue(cw + 6, 'PR[12].A').replace(/^/gm, '    ')}${handshake(k.calPoint, readTarget).replace(/^/gm, '    ')}        Goto L[1];
    EndIf;
    Print "Calibration finished, RMS(mm) = " + ${value(r + 2)};
    Movj P[200],V[50],Z[0],Tool[1],Wobj[0];
End;
`;
    }
    // V is reserved for Lab's numeric CALRAW replies: CVXYA contains V.
    const socketLabPixel = framed && frameEnd !== 'V' ? `# K12: import AssistantVisionCalibration.json before running.
# P[100]: robot BASE reference pose providing Z and robot configuration.
Start;
${open}    Send Port[${ch}],"PIXEL";
${receiveText(9)}    CVDataToPose(Str[0],P[110],P[100]);
    P[111] = CVToRobPos(P[110],${c.calibration.controllerCoordinate});
    Print "Vision BASE X=" + P[111].X + " Y=" + P[111].Y;
    L[9]:
${close}End;
` : '';
    return { socketCalibration, socketMaster, socketPick, socketLabPixel, fieldbusPick, fieldbusCalibration };
}

export function createSeededRandom(seed) {
    let value = (Number(seed) >>> 0) || 0x9e3779b9;
    return () => {
        value = (value + 0x6d2b79f5) >>> 0;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function gaussianNoise(random) {
    const u = Math.max(1e-12, random()), v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Random work-object pose within ± ranges around the nominal pose. */
export function randomWorkPose(generator, random) {
    const g = normalizeVisionConfig({ generator }).generator;
    const spread = range => (random() * 2 - 1) * range;
    const deviation = { x: spread(g.rangeX), y: spread(g.rangeY), rz: spread(g.rangeRz) };
    return {
        x: g.nominalX + deviation.x, y: g.nominalY + deviation.y, z: g.nominalZ,
        rz: normalizeAngleDeg(g.nominalRz + deviation.rz), deviation
    };
}

// ------------------------------------------------------- vision controller --

const bit = index => 1 << index;

/**
 * Protocol-independent vision behaviour. `capture(kind)` resolves an
 * observation in sensor pixels: {found, u, v, axisU, axisV, score} for
 * kind 'object', or {found, u, v} for kind 'mark'.
 */
export class VisionController {
    constructor({ config, capture, onChange = null, onLog = null, now = () => Date.now() }) {
        this.config = normalizeVisionConfig(config);
        this.capture = capture;
        this.onChange = onChange;
        this.onLog = onLog;
        this.now = now;
        this.counter = 0;
        this.busy = false;
        this.lastResult = null;
        this.session = null;
        this.block = { status: bit(VISION_STATUS_BITS.ready), code: 0, value1: 0, value2: 0, value3: 0, value4: 0, counter: 0 };
        this.previousControl = 0;
        this.pendingControl = Promise.resolve();
        this.refreshStatus();
    }

    setConfig(config) {
        this.config = normalizeVisionConfig(config);
        this.refreshStatus();
    }

    log(message, details = {}) { this.onLog?.(message, details); }
    changed() { this.onChange?.(this); }

    refreshStatus() {
        let status = this.block.status & (bit(VISION_STATUS_BITS.done) | bit(VISION_STATUS_BITS.ok) | bit(VISION_STATUS_BITS.ng) | bit(VISION_STATUS_BITS.error));
        status |= bit(VISION_STATUS_BITS.ready);
        if (this.busy) status |= bit(VISION_STATUS_BITS.busy);
        if (this.config.calibration.result) status |= bit(VISION_STATUS_BITS.calibrated);
        if (this.config.detection.master) status |= bit(VISION_STATUS_BITS.master);
        if (this.session) status |= bit(VISION_STATUS_BITS.calibrating);
        this.block.status = status;
    }

    resultWords() {
        this.refreshStatus();
        return buildVisionResultWords(this.block, this.config.output);
    }

    // Done belongs to the fieldbus handshake only. Panel, socket and automatic
    // triggers update the values without leaving a stale Done for the robot.
    setBlock({ ok, code, values = [0, 0, 0, 0], done = this.inHandshake === true }) {
        this.counter = (this.counter + 1) >>> 0;
        let status = this.block.status & ~(bit(VISION_STATUS_BITS.ok) | bit(VISION_STATUS_BITS.ng) | bit(VISION_STATUS_BITS.error) | bit(VISION_STATUS_BITS.done));
        if (done) status |= bit(VISION_STATUS_BITS.done);
        status |= ok ? bit(VISION_STATUS_BITS.ok) : bit(VISION_STATUS_BITS.ng);
        if (code === VISION_RESULT_CODES.error) status |= bit(VISION_STATUS_BITS.error);
        Object.assign(this.block, { status, code, value1: values[0], value2: values[1], value3: values[2], value4: values[3] ?? 0, counter: this.counter });
        this.refreshStatus();
    }

    clearDone() {
        this.block.status &= ~(bit(VISION_STATUS_BITS.done) | bit(VISION_STATUS_BITS.ok) | bit(VISION_STATUS_BITS.ng) | bit(VISION_STATUS_BITS.error));
        this.refreshStatus();
    }

    async runExclusive(task) {
        if (this.busy) return { ok: false, code: VISION_RESULT_CODES.error, message: 'busy' };
        this.busy = true; this.refreshStatus(); this.changed();
        try { return await task(); }
        finally { this.busy = false; this.refreshStatus(); this.changed(); }
    }

    async rawPixels(mark = true) {
        return this.runExclusive(async () => {
            try {
                const observation = await this.capture(mark ? 'mark' : 'object');
                if (!observation?.found || ![observation.u, observation.v].every(Number.isFinite)
                    || !mark && (observation.score ?? 100) < this.config.detection.minScore) return { ok: false };
                let angle = 0;
                if (!mark) {
                    if (![observation.axisU, observation.axisV].every(Number.isFinite)) return { ok: false };
                    const du = observation.axisU - observation.u, dv = observation.axisV - observation.v;
                    if (Math.hypot(du, dv) < 1e-9) return { ok: false };
                    angle = Math.atan2(dv, du) / DEG;
                }
                return { ok: true, u: observation.u, v: observation.v, angle };
            } catch (error) {
                this.log(`Raw capture failed: ${error.message}`);
                return { ok: false };
            }
        });
    }

    async inspect() {
        const config = this.config;
        const calibration = config.calibration.result;
        const observation = await this.capture('object');
        const base = { time: this.now(), observation, ok: false, dx: 0, dy: 0, dtheta: 0, x: 0, y: 0, theta: 0, score: observation?.score || 0 };
        if (!observation?.found || (observation.score ?? 100) < config.detection.minScore) {
            return { ...base, code: VISION_RESULT_CODES.notFound, message: 'Object not found' };
        }
        if (!calibration) return { ...base, code: VISION_RESULT_CODES.notCalibrated, message: 'Calibration required' };
        const pose = measureRobotPose(calibration, observation);
        if (!pose) return { ...base, code: VISION_RESULT_CODES.error, message: 'Invalid calibration' };
        Object.assign(base, { x: pose.x, y: pose.y, theta: pose.theta });
        const master = config.detection.master;
        if (!master) return { ...base, code: VISION_RESULT_CODES.noMaster, message: 'Master position required' };
        const offset = computeVisionOffset({
            master, current: pose, symmetry: config.detection.symmetry,
            rotationCenter: config.detection.rotationCenter === 'pick' ? { x: config.detection.pickX, y: config.detection.pickY } : null
        });
        Object.assign(base, offset);
        const limits = config.detection;
        if (Math.abs(offset.dx) > limits.limitX || Math.abs(offset.dy) > limits.limitY || Math.abs(offset.dtheta) > limits.limitTheta) {
            return { ...base, code: VISION_RESULT_CODES.outOfRange, message: 'Offset limit exceeded' };
        }
        return { ...base, ok: true, code: VISION_RESULT_CODES.ok, message: 'OK' };
    }

    async trigger() {
        return this.runExclusive(async () => {
            const result = await this.inspect();
            this.setBlock({ ok: result.ok, code: result.code, values: [result.dx, result.dy, result.dtheta, result.score] });
            this.lastResult = { ...result, counter: this.counter };
            this.log(result.ok ? 'Trigger OK' : `Trigger NG: ${result.message}`, { result: this.lastResult });
            return this.lastResult;
        });
    }

    async registerMaster(pose = {}) {
        return this.runExclusive(async () => {
            const observation = await this.capture('object');
            const calibration = this.config.calibration.result;
            if (!observation?.found) {
                this.setBlock({ ok: false, code: VISION_RESULT_CODES.notFound });
                return { ok: false, code: VISION_RESULT_CODES.notFound, message: 'Object not found' };
            }
            if (!calibration) {
                this.setBlock({ ok: false, code: VISION_RESULT_CODES.notCalibrated });
                return { ok: false, code: VISION_RESULT_CODES.notCalibrated, message: 'Calibration required' };
            }
            const measured = measureRobotPose(calibration, observation);
            const master = { ...measured, u: observation.u, v: observation.v, time: this.now(), truth: observation.truth || null };
            this.config.detection.master = master;
            if (Number.isFinite(pose.x) && Number.isFinite(pose.y)) {
                Object.assign(this.config.detection, { pickX: pose.x, pickY: pose.y, rotationCenter: 'pick' });
            }
            this.setBlock({ ok: true, code: VISION_RESULT_CODES.ok, values: [master.x, master.y, master.theta, observation.score || 100] });
            this.log('Master registered', { master });
            return { ok: true, code: VISION_RESULT_CODES.ok, master };
        });
    }

    startCalibration() {
        const plan = generateCalibrationPlan(this.config.calibration);
        this.session = { plan, step: 0, translation: [], rotation: [], method: this.config.calibration.method };
        this.refreshStatus();
        this.log('Calibration started', { count: plan.length });
        return plan[0];
    }

    async captureCalibrationPoint(pose, step) {
        const observation = await this.capture('mark');
        if (!observation?.found) throw new Error(`Calibration mark not found at point ${step.index}`);
        const sample = {
            index: step.index, u: observation.u, v: observation.v,
            x: Number.isFinite(pose.x) ? pose.x : step.x,
            y: Number.isFinite(pose.y) ? pose.y : step.y,
            r: Number.isFinite(pose.r) ? pose.r : step.r
        };
        (step.kind === 'rotation' ? this.session.rotation : this.session.translation).push(sample);
        this.log(`Calibration point ${step.index}`, { sample });
        return sample;
    }

    finishCalibration() {
        const session = this.session;
        const result = buildVisionCalibration({ translation: session.translation, rotation: session.rotation, method: session.method });
        result.time = this.now();
        this.config.calibration.result = result;
        this.config.detection.master = null;
        this.session = null;
        this.refreshStatus();
        this.log('Calibration completed', { rms: result.rms, max: result.max });
        return result;
    }

    /** Vision-led calibration step. Returns the next target or completion. */
    async calibrationStep(pose = null) {
        return this.runExclusive(async () => {
            try {
                if (!pose || !this.session) {
                    const first = this.startCalibration();
                    this.setBlock({ ok: true, code: VISION_RESULT_CODES.ok, values: [first.x, first.y, first.r, first.index] });
                    return { ok: true, next: first };
                }
                const step = this.session.plan[this.session.step];
                await this.captureCalibrationPoint(pose, step);
                this.session.step += 1;
                const next = this.session.plan[this.session.step];
                if (next) {
                    this.setBlock({ ok: true, code: VISION_RESULT_CODES.ok, values: [next.x, next.y, next.r, next.index] });
                    return { ok: true, next };
                }
                const result = this.finishCalibration();
                this.setBlock({ ok: true, code: VISION_RESULT_CODES.ok, values: [result.rms, result.max, result.rotation?.radius || 0, 0] });
                return { ok: true, done: true, result };
            } catch (error) {
                this.session = null;
                this.setBlock({ ok: false, code: VISION_RESULT_CODES.error });
                this.log(`Calibration failed: ${error.message}`);
                return { ok: false, error: error.message };
            }
        });
    }

    /** Robot-led calibration point: index 1..9 translation, 10+ rotation. */
    async calibrationIndexed(index, pose) {
        return this.runExclusive(async () => {
            try {
                if (!this.session || index === 1 && this.session.translation.length + this.session.rotation.length > 0) {
                    this.session = { plan: [], step: 0, translation: [], rotation: [], method: this.config.calibration.method };
                }
                const step = { index, kind: index >= 10 ? 'rotation' : 'translation', x: pose.x, y: pose.y, r: pose.r };
                const list = step.kind === 'rotation' ? this.session.rotation : this.session.translation;
                const existing = list.findIndex(sample => sample.index === index);
                if (existing >= 0) list.splice(existing, 1);
                await this.captureCalibrationPoint(pose, step);
                this.setBlock({ ok: true, code: VISION_RESULT_CODES.ok, values: [index, 0, 0, 0] });
                return { ok: true, index };
            } catch (error) {
                this.setBlock({ ok: false, code: VISION_RESULT_CODES.error });
                return { ok: false, error: error.message };
            }
        });
    }

    async calibrationCompute() {
        return this.runExclusive(async () => {
            try {
                if (!this.session) throw new Error('No calibration points');
                const result = this.finishCalibration();
                this.setBlock({ ok: true, code: VISION_RESULT_CODES.ok, values: [result.rms, result.max, result.rotation?.radius || 0, 0] });
                return { ok: true, done: true, result };
            } catch (error) {
                this.session = null;
                this.setBlock({ ok: false, code: VISION_RESULT_CODES.error });
                return { ok: false, error: error.message };
            }
        });
    }

    reset() {
        this.session = null;
        this.clearDone();
        this.block.code = VISION_RESULT_CODES.none;
        this.changed();
    }

    terminator() { return VISION_TERMINATORS[this.config.output.terminator] || ''; }

    formatResult(result) {
        const output = this.config.output;
        const values = {
            dx: result.dx, dy: result.dy, dt: result.dtheta, x: result.x, y: result.y, t: result.theta,
            ok: result.ok ? 1 : 0, score: result.score, count: result.counter ?? this.counter, code: result.code
        };
        return formatVisionText(result.ok ? output.template : output.ngTemplate, values, output.decimals) + this.terminator();
    }

    formatNumbers(values) {
        return values.map((value, index) => index === 0 ? String(Math.trunc(value)) : formatNumber(value, this.config.output.decimals)).join(',') + this.terminator();
    }

    /** Socket text protocol. Returns the reply text (or null for no reply). */
    async handleText(text) {
        const command = parseVisionCommand(text, this.config.output.triggerCommands);
        this.log(`RX ${JSON.stringify(command.raw)}`);
        let reply;
        if (command.type === 'rawPixels') {
            const result = await this.rawPixels(command.mark);
            const number = value => formatNumber(value, this.config.output.decimals);
            reply = result.ok ? (command.mark ? `${number(result.u)},${number(result.v)}`
                : `CVXYA,${number(result.u)},${number(result.v)},${number(result.angle)}`) + this.terminator()
                : 'NG' + this.terminator();
        }
        else if (command.type === 'trigger') reply = this.formatResult(await this.trigger());
        else if (command.type === 'calStart' || command.type === 'calPoint') {
            const result = await this.calibrationStep(command.type === 'calStart' ? null : command);
            if (!result.ok) reply = this.formatNumbers([-1, 0, 0, 0]);
            else if (result.done) reply = this.formatNumbers([0, result.result.rms, result.result.max, result.result.rotation?.radius || 0]);
            else reply = this.formatNumbers([result.next.index, result.next.x, result.next.y, result.next.r]);
        } else if (command.type === 'calIndexed') {
            const result = Number.isInteger(command.index) && command.index > 0
                ? await this.calibrationIndexed(command.index, command)
                : { ok: false };
            reply = this.formatNumbers([result.ok ? 1 : -1, command.index || 0, 0, 0]);
        } else if (command.type === 'calCompute') {
            const result = await this.calibrationCompute();
            reply = result.ok
                ? this.formatNumbers([0, result.result.rms, result.result.max, result.result.rotation?.radius || 0])
                : this.formatNumbers([-1, 0, 0, 0]);
        } else if (command.type === 'master') {
            const result = await this.registerMaster(command);
            reply = result.ok
                ? this.formatNumbers([1, result.master.x, result.master.y, result.master.theta])
                : this.formatNumbers([-1, 0, 0, 0]);
        } else if (command.type === 'reset') {
            this.reset();
            reply = this.formatNumbers([1, 0, 0, 0]);
        } else if (command.type === 'empty') return null;
        else reply = `ERR,UNKNOWN${this.terminator()}`;
        this.changed();
        return reply;
    }

    /**
     * Fieldbus handshake. Rising control bits execute one command; Done stays
     * on until the robot clears the command bit.
     */
    handleControlWords(words) {
        const command = readVisionCommandWords(words, this.config.output);
        const previous = this.previousControl;
        this.previousControl = command.control;
        const rising = command.control & ~previous;
        const active = command.control & 0x1f;
        if (!active && previous & 0x1f) { this.clearDone(); this.changed(); }
        if (!rising) return this.pendingControl;
        const pose = { x: command.x, y: command.y, r: command.r };
        const has = name => rising & bit(VISION_CONTROL_BITS[name]);
        this.pendingControl = this.pendingControl.then(async () => {
            this.inHandshake = true;
            try {
                if (has('reset')) this.reset();
                if (has('calStart')) await this.calibrationStep(null);
                else if (has('calPoint')) await this.calibrationStep(pose);
                else if (has('master')) await this.registerMaster(pose);
                else if (has('trigger')) await this.trigger();
            } finally { this.inHandshake = false; }
            if (!(this.previousControl & 0x1f)) this.clearDone();
            this.changed();
        }).catch(error => this.log(`Control failed: ${error.message}`));
        return this.pendingControl;
    }
}
