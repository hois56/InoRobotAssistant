export const TOOL_COUNT = 16;

export function normalizeToolLoad(load) {
    const vector = value => Array.from({ length: 3 }, (_, i) => Number.isFinite(Number(value?.[i])) ? Number(value[i]) : 0);
    return {
        mass: Math.max(0, Number.isFinite(Number(load?.mass)) ? Number(load.mass) : 0),
        cog: vector(load?.cog),
        inertia: vector(load?.inertia).map(value => Math.max(0, value))
    };
}

function robotNumber(value) {
    if (!Number.isFinite(value)) throw new Error('Invalid robot data.');
    return Number(value.toFixed(12)).toFixed(12).replace(/\.?0+$/, '') || '0';
}

// The simulator uses RX/RY/RZ; controller frames use A=RZ, B=RY, C=RX.
export function buildFrameProgram(prefix, position, rotation) {
    return ['X', 'Y', 'Z', 'A', 'B', 'C'].map((axis, index) =>
        `${prefix}.${axis} = ${robotNumber([...position, rotation[2], rotation[1], rotation[0]][index])};`
    ).join('\n');
}

export function buildToolProgram(index, position, rotation, load) {
    if (!Number.isInteger(index) || index < 0 || index >= TOOL_COUNT) throw new Error('Invalid Tool index.');
    const data = normalizeToolLoad(load);
    return [buildFrameProgram(`Tool[${index}].TFrame`, position, rotation), '',
        `Tool[${index}].TLoad.Mass = ${robotNumber(data.mass)};`,
        ...data.cog.map((value, i) => `Tool[${index}].TLoad.Cog[${i}] = ${robotNumber(value)};`),
        ...data.inertia.map((value, i) => `Tool[${index}].TLoad.Inertia[${i}] = ${robotNumber(value)};`)
    ].join('\n');
}

function parameterFrame(position = [0, 0, 0], rotation = [0, 0, 0]) {
    return { Data: [position[0], position[1], position[2], rotation[2], rotation[1], rotation[0]]
        .map(value => Number(robotNumber(value))) };
}

function buildParameterFile(records, { robotName = 'SelectedRobot', date = new Date() } = {}) {
    // Controller JSON writes floating-point fields with .0, except integer UFMec entries.
    const body = JSON.stringify(records, null, 2)
        .replace(/(^\s*|: )(-?\d+)(,?)$/gm, '$1$2.0$3')
        .replace(/"UFMec": \[[^\]]*\]/g, value => value.replace(/\.0/g, ''))
        .replaceAll('\n', '\r\n');
    // The controller stores the running CRC-32 before the final XOR.
    let crc = 0xffffffff;
    for (const byte of new TextEncoder().encode(body)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const checkCode = (crc >>> 0).toString(16).toUpperCase().padStart(8, '0');
    const pad = (value, length = 2) => String(value).padStart(length, '0');
    const time = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
    return ['FileInfo', '    FileType="FieldBusFunIoCfgFile"', '    Version="1.0"',
        '    SystemVersion="V4R24"', `    RobotName="${String(robotName).replace(/["\r\n]/g, '')}"`,
        `    Time="${time}"`, `    CheckCode="${checkCode}"`, 'EndFileInfo', body].join('\r\n');
}

export function buildToolParamFile(tools = [], metadata) {
    const records = Array.from({ length: TOOL_COUNT }, (_, index) => {
        const tool = index === 0 ? null : tools[index];
        const load = normalizeToolLoad(tool?.load);
        return { RobHold: true, TFrame: parameterFrame(tool?.position, tool?.rotation),
            TLoad: { mass: load.mass, cog: load.cog, orient: [0, 0, 0], inertia: load.inertia } };
    });
    return buildParameterFile(records, metadata);
}

export function buildWobjParamFile(workObjects = [], metadata) {
    const records = Array.from({ length: TOOL_COUNT }, (_, index) => {
        const workObject = index === 0 ? null : workObjects[index];
        return { RobHold: false, UFFix: true, UFMec: Array(18).fill(0),
            UFrame: parameterFrame(workObject?.position, workObject?.rotation), OFrame: parameterFrame() };
    });
    return buildParameterFile(records, metadata);
}

// Input tensors are about each model's center, expressed in flange axes.
export function combineToolLoads(parts) {
    const mass = parts.reduce((sum, part) => sum + part.mass, 0);
    if (!(mass > 0)) return normalizeToolLoad();
    const cog = [0, 1, 2].map(i => parts.reduce((sum, part) => sum + part.mass * part.cog[i], 0) / mass);
    const inertia = [0, 1, 2].map(axis => parts.reduce((sum, part) => {
        const distanceSquared = part.cog.reduce((distance, value, i) =>
            distance + (i === axis ? 0 : ((value - cog[i]) / 1000) ** 2), 0);
        return sum + part.inertia[axis][axis] + part.mass * distanceSquared;
    }, 0));
    return { mass, cog, inertia };
}
