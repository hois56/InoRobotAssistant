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
