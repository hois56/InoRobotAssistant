import { engine, numbers } from './wasm/engine.mjs';

function validateJoints(q) {
    if (!Array.isArray(q) || q.length !== 6 || !q.every(Number.isFinite)) {
        throw new TypeError('q must contain six finite radians');
    }
}

function position(q, structure, tool) {
    validateJoints(q);
    if (!Array.isArray(structure) || structure.length < 6 || !structure.every(Number.isFinite)) {
        throw new TypeError('structure must contain six finite mm dimensions');
    }
    const buffer = numbers(15);
    buffer.set(q);
    buffer.set(structure.slice(0, 6), 6);
    if (tool) buffer.set(tool, 12);
    engine.six_position(Boolean(tool));
    return Array.from(buffer.subarray(0, 3));
}

export function nativeSixFlangePositionMm(q, structure) {
    return position(q, structure);
}

export function nativeSixFlangeRotation(q) {
    validateJoints(q);
    const buffer = numbers(9);
    buffer.set(q);
    engine.six_rotation();
    return Array.from(buffer);
}

export function nativeSixTcpPositionMm(q, structure, toolTranslationMm = [0, 0, 0]) {
    if (!Array.isArray(toolTranslationMm) || toolTranslationMm.length !== 3 || !toolTranslationMm.every(Number.isFinite)) {
        throw new TypeError('Tool translation must contain three finite mm values');
    }
    return position(q, structure, toolTranslationMm);
}
