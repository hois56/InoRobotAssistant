import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAPID_MODEL_DATA } from '../2_3DSimulation/rapid-model-data.mjs';

const root = path.resolve(import.meta.dirname, '..');
export function auditSimulationMotion() {
    const definitions = JSON.parse(fs.readFileSync(path.join(root, '2_3DSimulation/models/models.json'), 'utf8'));
    const firmware = JSON.parse(fs.readFileSync(path.join(root, '2_3DSimulation/urdf/firmware-spc25.json'), 'utf8'));
    return definitions.filter(d => d.type === 'articulated-stl').map(definition => {
        const catalog = RAPID_MODEL_DATA.models[definition.folder];
        const sourceId = catalog.defaultVariantId;
        const actual = { speed: definition.jointSpeeds, acceleration: definition.jointAccelerations,
            deceleration: definition.jointDecelerations, cartesian: definition.cartesianMotion };
        if (!sourceId) return { folder: definition.folder, status: 'source-selection-required', sourceId: null,
            sourceVariants: catalog.variantIds, actual,
            rapidPlanner: 'catalog-based estimate until an exact controller variant is selected' };
        const record = firmware.models[sourceId], variant = RAPID_MODEL_DATA.variants[sourceId];
        const convert = values => values.slice(0, record.axisCount).map((v, i) =>
            definition.robotType === 'scara' && i === 2 ? v * definition.structure[3] / 360 : v);
        const expected = { speed: convert(record.playback.stJoint.dMaxVel),
            acceleration: convert(record.playback.stJoint.dMaxAcc), deceleration: convert(record.playback.stJoint.dStopDec),
            cartesian: Object.fromEntries(Object.entries({ maxSpeed: 'dMaxVel', maxAcceleration: 'dMaxAcc',
                maxRotationSpeed: 'dMaxRVel', maxRotationAcceleration: 'dMaxRAcc', stopDeceleration: 'dStopDec',
                rotationStopDeceleration: 'dRStopDec' }).map(([key, field]) => [key, record.playback.stCartesian[field]])) };
        const mismatches = [];
        const compare = (label, a, b) => {
            if (Array.isArray(a) && Array.isArray(b)) a.forEach((v, i) => compare(`${label}[${i}]`, v, b[i]));
            else if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-5) mismatches.push({ field: label, actual: a, expected: b });
        };
        for (const key of ['speed', 'acceleration', 'deceleration']) compare(key, actual[key], expected[key]);
        for (const key of Object.keys(expected.cartesian)) compare(`cartesian.${key}`, actual.cartesian[key], expected.cartesian[key]);
        compare('rapid.velocity', variant.velocityDegPerSec, record.rapidDefaults.defaultJointVel.slice(0, record.axisCount));
        compare('rapid.accelerationDefaults', variant.accelerationDegPerSec2, record.rapidDefaults.defaultJointAcc.slice(0, record.axisCount));
        return { folder: definition.folder, sourceId, status: mismatches.length ? 'mismatch' : 'matched', actual, expected,
            rapidAccelerationDefaultsControllerUnits: variant.accelerationDegPerSec2,
            rapidPlanner: 'firmware dynamics estimate: stBest defaults, torque/posture/load and instruction percentages', mismatches };
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const models = auditSimulationMotion();
    const output = path.join(root, '2_3DSimulation/urdf/simulation-motion-audit.json');
    fs.writeFileSync(output, JSON.stringify({ models }, null, 2) + '\n');
    console.log(JSON.stringify({ models: models.length, matched: models.filter(m => m.status === 'matched').length,
        requireSourceSelection: models.filter(m => m.status === 'source-selection-required').length,
        mismatches: models.filter(m => m.status === 'mismatch').map(m => ({ folder: m.folder, mismatches: m.mismatches })) }, null, 2));
    if (models.some(m => m.status === 'mismatch')) process.exitCode = 1;
}
