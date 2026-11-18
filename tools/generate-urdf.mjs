import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { firmwareInertial, boxInertial, nominalJointTorque, nominalScrewForce } from './urdf-physics.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIMULATION_DIR = path.join(ROOT, '2_3DSimulation');
const MODELS_DIR = path.join(SIMULATION_DIR, 'models');
const OUTPUT_DIR = path.join(SIMULATION_DIR, 'urdf');
const FIRMWARE_FILE = path.join(OUTPUT_DIR, 'firmware-spc25.json');

const MM_TO_M = 0.001;
const DEG_TO_RAD = Math.PI / 180;

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function numberArray(value, length = 3) {
    return Array.from({ length }, (_, index) => finiteNumber(value?.[index]));
}

function formatNumber(value) {
    const number = finiteNumber(value);
    if (Object.is(number, -0)) return '0';
    return number.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function xmlEscape(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function vectorText(vector) {
    return numberArray(vector).map(formatNumber).join(' ');
}

function difference(left, right) {
    return left.map((value, index) => value - right[index]);
}

function negate(vector) {
    return vector.map((value) => -value);
}

function normalizeRobotKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findModelDefinition(robotName, definitions) {
    const normalizedRobotName = normalizeRobotKey(robotName);
    const matches = definitions
        .filter((definition) => definition.name && definition.folder)
        .map((definition) => ({
            definition,
            key: normalizeRobotKey(definition.folder),
            nameKey: normalizeRobotKey(definition.name)
        }))
        .filter(({ key, nameKey }) => (
            normalizedRobotName.startsWith(key)
            || normalizedRobotName.startsWith(nameKey.replace(/int$/, ''))
        ))
        .sort((left, right) => right.key.length - left.key.length);
    if (!matches.length) throw new Error(`No models.json entry matches ${robotName}.`);
    return matches[0].definition;
}

function createKinematicManifest(definition) {
    const structure = numberArray(definition.structure, definition.robotType === 'scara' ? 4 : 6);
    const limits = Array.isArray(definition.limits) ? definition.limits : [];
    const speed = Array.isArray(definition.jointSpeeds) ? definition.jointSpeeds : [];
    const joints = [];

    if (definition.robotType === 'scara') {
        const [arm1, arm2] = structure;
        const secondArmDirection = definition.kinematicVariant === 'ceiling-scara' ? -1 : 1;
        const wrist = [arm1 + secondArmDirection * arm2, 0, 0];
        const screwLead = structure[3];
        const controllerLimits = Array.isArray(definition.j3ControllerLimits)
            ? definition.j3ControllerLimits
            : limits[2];
        joints.push(
            { name: 'J1', mesh: 'P1.stl', pivot: [0, 0, 0], axis: [0, 0, 1], direction: 1, type: 'revolute', limits: limits[0], speed: speed[0] },
            { name: 'J2', mesh: 'P2.stl', pivot: [arm1, 0, 0], axis: [0, 0, 1], direction: 1, type: 'revolute', limits: limits[1], speed: speed[1] },
            {
                name: 'J3',
                mesh: definition.j3Mesh ? 'P3.stl' : null,
                pivot: wrist,
                axis: [0, 0, 1],
                direction: 1,
                type: 'prismatic',
                limits: controllerLimits.map((value) => finiteNumber(value) * screwLead / 360),
                speed: finiteNumber(speed[2]) * screwLead / 360,
                screwLeadMeters: screwLead * MM_TO_M
            },
            { name: 'J4', mesh: 'P4.stl', pivot: wrist, axis: [0, 0, 1], direction: 1, type: 'revolute', limits: limits[3], speed: speed[3] }
        );
        return { joints, tcp: wrist, toolAxes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
    }

    const [shoulderOffset, upperArm, elbowOffset, forearm, wristLength, shoulderHeight] = structure;
    const elbowHeight = shoulderHeight + upperArm;
    const wristHeight = elbowHeight + elbowOffset + finiteNumber(definition.wristAxisZOffset);
    const tcp = [shoulderOffset + forearm + wristLength, 0, wristHeight];
    const revoluteDirection = -1;
    joints.push(
        { name: 'J1', mesh: 'P1.stl', pivot: [0, 0, 0], axis: [0, 0, 1], direction: 1, type: 'revolute', limits: limits[0], speed: speed[0] },
        { name: 'J2', mesh: 'P2.stl', pivot: [shoulderOffset, 0, shoulderHeight], axis: [0, 1, 0], direction: revoluteDirection, type: 'revolute', limits: limits[1], speed: speed[1] },
        { name: 'J3', mesh: 'P3.stl', pivot: [shoulderOffset, 0, elbowHeight], axis: [0, 1, 0], direction: revoluteDirection, type: 'revolute', limits: limits[2], speed: speed[2] },
        { name: 'J4', mesh: 'P4.stl', pivot: [shoulderOffset, 0, wristHeight], axis: [1, 0, 0], direction: 1, type: 'revolute', limits: limits[3], speed: speed[3] },
        { name: 'J5', mesh: 'P5.stl', pivot: [shoulderOffset + forearm, 0, wristHeight], axis: [0, 1, 0], direction: revoluteDirection, type: 'revolute', limits: limits[4], speed: speed[4] },
        { name: 'J6', mesh: 'P6.stl', pivot: tcp, axis: [1, 0, 0], direction: 1, type: 'revolute', limits: limits[5], speed: speed[5] }
    );
    return { joints, tcp, toolAxes: [[0, 0, 1], [0, -1, 0], [1, 0, 0]] };
}

function readStlBounds(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    const vertices = [];
    const binaryCount = buffer.length >= 84 ? buffer.readUInt32LE(80) : -1;
    const binaryLength = binaryCount >= 0 ? 84 + binaryCount * 50 : -1;
    if (binaryLength === buffer.length) {
        for (let index = 0; index < binaryCount; index += 1) {
            const offset = 84 + index * 50;
            for (let vertex = 0; vertex < 3; vertex += 1) {
                const vertexOffset = offset + 12 + vertex * 12;
                vertices.push([
                    buffer.readFloatLE(vertexOffset),
                    buffer.readFloatLE(vertexOffset + 4),
                    buffer.readFloatLE(vertexOffset + 8)
                ]);
            }
        }
    } else {
        const text = buffer.toString('utf8');
        const pattern = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/gi;
        let match;
        while ((match = pattern.exec(text))) vertices.push(match.slice(1).map(Number));
    }
    if (!vertices.length || vertices.some((vertex) => vertex.some((value) => !Number.isFinite(value)))) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    vertices.forEach((vertex) => vertex.forEach((value, axis) => {
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
    }));
    return { min, max, center: min.map((value, axis) => (value + max[axis]) / 2) };
}

function colorForLink(index) {
    return index % 2 === 0 ? '0.84 0.86 0.89 1' : '0.94 0.95 0.96 1';
}

function visualXml({ mesh, origin, name, color }) {
    if (!mesh) return '';
    return `\n    <visual name="${xmlEscape(name)}">\n      <origin xyz="${vectorText(origin)}" rpy="0 0 0"/>\n      <geometry>\n        <mesh filename="${xmlEscape(mesh)}" scale="0.001 0.001 0.001"/>\n      </geometry>\n      <material name="${xmlEscape(name)}_material">\n        <color rgba="${color}"/>\n      </material>\n    </visual>\n    <collision name="${xmlEscape(name)}_collision">\n      <origin xyz="${vectorText(origin)}" rpy="0 0 0"/>\n      <geometry>\n        <mesh filename="${xmlEscape(mesh)}" scale="0.001 0.001 0.001"/>\n      </geometry>\n    </collision>`;
}

function inertialXml(inertial) {
    if (!inertial) return '';
    const [ixx, ixy, ixz, iyy, iyz, izz] = inertial.inertia;
    const reason = inertial.reason ? `\n    <!-- ${xmlEscape(inertial.reason)} -->` : '';
    return `\n    <!-- inertial source: ${inertial.source} -->${reason}\n    <inertial>\n      <origin xyz="${vectorText(inertial.origin)}" rpy="0 0 0"/>\n      <mass value="${formatNumber(inertial.mass)}"/>\n      <inertia ixx="${formatNumber(ixx)}" ixy="${formatNumber(ixy)}" ixz="${formatNumber(ixz)}" iyy="${formatNumber(iyy)}" iyz="${formatNumber(iyz)}" izz="${formatNumber(izz)}"/>\n    </inertial>`;
}

function createJointXml(joint, index, previousPivot, dynamicLink, robotType) {
    const origin = difference(joint.pivot, previousPivot).map((value) => value * MM_TO_M);
    const axis = joint.axis.map((value) => value * joint.direction);
    const isPrismatic = joint.type === 'prismatic';
    const lower = finiteNumber(joint.limits?.[0]) * (isPrismatic ? MM_TO_M : DEG_TO_RAD);
    const upper = finiteNumber(joint.limits?.[1]) * (isPrismatic ? MM_TO_M : DEG_TO_RAD);
    const velocity = finiteNumber(joint.speed) * (isPrismatic ? MM_TO_M : DEG_TO_RAD);
    const effort = isPrismatic ? nominalScrewForce(dynamicLink, joint.screwLeadMeters) : nominalJointTorque(dynamicLink);
    const effortComment = isPrismatic ? ' <!-- ideal screw force: 2*pi*ratedTrq*abs(ratio)/lead_m; efficiency=1 -->' : '';
    return `\n  <joint name="${xmlEscape(joint.name)}" type="${isPrismatic ? 'prismatic' : 'revolute'}">\n    <parent link="${index === 0 ? 'base_link' : `link_${index}`}"/>\n    <child link="link_${index + 1}"/>\n    <origin xyz="${vectorText(origin)}" rpy="0 0 0"/>\n    <axis xyz="${vectorText(axis)}"/>\n    <limit lower="${formatNumber(lower)}" upper="${formatNumber(upper)}" effort="${formatNumber(effort)}" velocity="${formatNumber(velocity)}"/>${effortComment}\n  </joint>`;
}

export function buildUrdf(catalogDefinition, robotName, record, { meshPrefix = '../models', audit = [] } = {}) {
    const axes = catalogDefinition.robotType === 'scara' ? 4 : 6;
    if (record.links?.length !== axes) throw new Error('Firmware axis count does not match catalog');
    // Playback records are in controller degrees (including the SCARA screw).
    // The live catalog already converts J3 speed to mm/s; using that and
    // converting again was the old URDF speed error.
    const definition = { ...catalogDefinition,
        jointSpeeds: record.playback.stJoint.dMaxVel.slice(0, axes),
        limits: record.jointLimits.dNegLimit.map((v, i) => [v, record.jointLimits.dPosLimit[i]]),
        j3ControllerLimits: catalogDefinition.robotType === 'scara'
            ? [record.jointLimits.dNegLimit[2], record.jointLimits.dPosLimit[2]] : null,
    };
    if (!definition.jointSpeeds.every(v => Number.isFinite(v) && v > 0)) {
        throw new Error('Missing positive firmware playback speed');
    }
    const manifest = createKinematicManifest(definition);
    const dynamicLinks = record.links;
    const robotFolder = definition.folder;
    const meshFile = name => `${meshPrefix}/${robotFolder}/${name}`;
    for (const name of ['P0.stl', ...manifest.joints.map(joint => joint.mesh).filter(Boolean)]) {
        if (!fs.existsSync(path.join(MODELS_DIR, robotFolder, name))) throw new Error(`Missing mesh: ${robotFolder}/${name}`);
    }
    const lines = [
        '<?xml version="1.0"?>',
        `<!-- Firmware source: ${xmlEscape(record.sourcePath)}; SHA256 ${record.sourceSha256}. -->`,
        '<!-- Z-up; STL mm scaled to m. Effective firmware mass properties are SI and transformed into CAD link frames. -->',
        '<!-- Revolute effort is nominal output torque; prismatic effort is ideal screw force. See physics-audit.json for approximations. -->',
        `<robot name="${xmlEscape(robotName)}">`,
        '  <link name="base_link">',
        visualXml({ mesh: meshFile('P0.stl'), origin: [0, 0, 0], name: 'base', color: '0.31 0.35 0.41 1' }),
    ];
    const tubePath = path.join(MODELS_DIR, robotFolder, 'TUBE.stl');
    if (definition.robotType === 'scara' && fs.existsSync(tubePath) && definition.kinematicVariant !== 'ceiling-scara') {
        lines.push(visualXml({ mesh: meshFile('TUBE.stl'), origin: [0, 0, 0], name: 'conduit', color: '0.16 0.17 0.18 1' }));
    }
    lines.push('  </link>');

    manifest.joints.forEach((joint, index) => {
        const pivot = joint.pivot;
        const meshPath = joint.mesh ? path.join(MODELS_DIR, robotFolder, joint.mesh) : null;
        const meshExists = meshPath ? fs.existsSync(meshPath) : false;
        // Some SCARAs author the translating shaft only as P4. P4's bounds
        // explicitly proxy the unmeshed J3 carriage; never invent a 50mm cube.
        const boundsMesh = meshExists ? joint.mesh : definition.robotType === 'scara' && index === 2 ? 'P4.stl' : null;
        const meshBounds = boundsMesh ? readStlBounds(path.join(MODELS_DIR, robotFolder, boundsMesh)) : null;
        const inertial = definition.robotType === 'six-axis'
            ? firmwareInertial(dynamicLinks[index], index, meshBounds, pivot, definition.structure[4] * MM_TO_M)
            : { ...boxInertial(dynamicLinks[index].mass, meshBounds, pivot),
                reason: 'SCARA firmware contains planar inertia, not a full 3D tensor; uniform mesh-bounds approximation' };
        const meshUri = meshExists ? meshFile(joint.mesh) : null;
        audit.push({ link: `link_${index + 1}`, joint: joint.name, ...inertial,
            motorRatedTorqueNm: dynamicLinks[index].ratedTrq, gearRatio: dynamicLinks[index].ratio,
            nominalJointTorqueNm: nominalJointTorque(dynamicLinks[index]),
            boundsMesh: inertial.reason ? boundsMesh : null,
            ...(joint.type === 'prismatic' ? { nominalScrewForceN: nominalScrewForce(dynamicLinks[index], joint.screwLeadMeters) } : {}),
            velocitySI: joint.speed * (joint.type === 'prismatic' ? MM_TO_M : DEG_TO_RAD) });
        lines.push(`\n  <link name="link_${index + 1}">`);
        if (joint.mesh && !meshExists) lines.push(`    <!-- Mesh not found in this model folder: ${xmlEscape(joint.mesh)} -->`);
        lines.push(inertialXml(inertial));
        lines.push(visualXml({
            mesh: meshUri,
            origin: negate(pivot.map((value) => value * MM_TO_M)),
            name: `link_${index + 1}`,
            color: colorForLink(index)
        }));
        lines.push('  </link>');
    });

    let previousPivot = [0, 0, 0];
    manifest.joints.forEach((joint, index) => {
        lines.push(createJointXml(joint, index, previousPivot, dynamicLinks[index], definition.robotType));
        previousPivot = joint.pivot;
    });
    const lastLink = manifest.joints.length;
    const tcpOffset = difference(manifest.tcp, manifest.joints[lastLink - 1].pivot).map((value) => value * MM_TO_M);
    // CAD J6 rotates around local X; the controller flange uses local Z.
    // Rz(0) Ry(-pi/2) Rx(pi) matches manifest.toolAxes/native FK.
    const toolRpy = definition.robotType === 'six-axis' ? [Math.PI, -Math.PI / 2, 0]
        : [0, 0, definition.kinematicVariant === 'ceiling-scara' ? Math.PI : 0];
    lines.push(`\n  <link name="tool0"/>\n  <joint name="tool0_fixed" type="fixed">\n    <parent link="link_${lastLink}"/>\n    <child link="tool0"/>\n    <origin xyz="${vectorText(tcpOffset)}" rpy="${vectorText(toolRpy)}"/>\n  </joint>`);
    lines.push('</robot>');
    return lines.filter((line) => line !== '').join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

function main() {
    const args = process.argv.slice(2);
    let outputDir = OUTPUT_DIR;
    let requested = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--output-dir' && args[i + 1]) outputDir = path.resolve(args[++i]);
        else if (args[i] === '--models' && args[i + 1]) requested = args[++i].split(',');
        else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
    }
    const firmware = readJson(FIRMWARE_FILE);
    const definitions = readJson(path.join(MODELS_DIR, 'models.json'));
    const entries = Object.entries(firmware.models);
    let selected = entries;
    if (requested) {
        selected = [];
        for (const name of requested) {
            const matches = entries.filter(([key]) => key === name || findModelDefinition(key, definitions).folder === name);
            if (matches.length !== 1) throw new Error(`No verified firmware record for model: ${name}`);
            if (!selected.some(([key]) => key === matches[0][0])) selected.push(matches[0]);
        }
    }
    // Validate every explicit source before writing anything.
    fs.mkdirSync(outputDir, { recursive: true });
    const generated = [];
    const meshPrefix = path.relative(outputDir, MODELS_DIR).replaceAll('\\', '/') || '.';
    for (const [robotName, record] of selected) {
        const definition = findModelDefinition(robotName, definitions);
        const outputFile = `${robotName}.urdf`;
        const links = [];
        const urdf = buildUrdf(definition, robotName, record, { meshPrefix, audit: links });
        generated.push({ outputFile, model: definition.name, folder: definition.folder,
            sourceSelectionRequired: record.sourceSelectionRequired, sourcePath: record.sourcePath,
            sourceSha256: record.sourceSha256, links, urdf });
    }
    for (const { outputFile, urdf } of generated) fs.writeFileSync(path.join(outputDir, outputFile), urdf, 'utf8');
    fs.writeFileSync(path.join(outputDir, 'physics-audit.json'), JSON.stringify({
        archive: firmware.archive, archiveSha256: firmware.archiveSha256,
        torquePolicy: 'Nominal ideal ratedTrq * abs(ratio); SCARA J3 force=2*pi*torque/lead_m; efficiency=1, no peak/planning multiplier',
        models: generated.map(({ urdf, ...entry }) => entry),
    }, null, 2) + '\n', 'utf8');
    const table = generated.map(({ outputFile, links }) => `| ${outputFile.replace(/\.urdf$/, '')} | ${links.filter(link => link.reason).map(link => link.link).join(', ') || 'none'} |`).join('\n');
    const readme = `# Firmware-checked robot URDFs

Source: ${firmware.archive}. This export contains ${generated.length} exact firmware records across ${new Set(generated.map(entry => entry.folder)).size} catalog families.
R35/R50 have no INT default in this firmware: each available source variant is exported under its real name. Choose the actual controller variant; no INT identity is invented.

## Regenerate

    node tools/generate-urdf.mjs
    node tools/generate-urdf.mjs --models IR-R7H-90

Use an exact firmware model name for an ambiguous family. Optional --output-dir writes a separate export with relative mesh paths.
Extract again with Python tools/extract-urdf-firmware.py <installer.zip> (standard-library Python and the project's Node runtime). Firmware code is never executed.

## Physical data

- Exact source paths/hashes and raw records: firmware-spc25.json. Per-link decisions: physics-audit.json. Binary evidence: FIRMWARE_FINDINGS.md.
- STL mm are scaled to m; effective six-axis mass properties are SI, transformed into CAD link frames. No magnitude-based unit guessing.
- Invalid six-axis tensors and incomplete planar SCARA tensors use source mass and uniform STL bounding-box approximations, explicitly marked. SCARA without a P3 mesh uses P4 bounds as the declared J3 carriage proxy.
- Revolute effort is ratedTrq * abs(ratio); SCARA J3 effort is 2*pi*torque/lead_m with ideal efficiency. These are nominal values, not peak servo limits.
- Joint limits and speeds come from the exact firmware record. SCARA J3 degrees are converted to metres once. URDF does not encode a playback acceleration planner.
- Tool frames match the six-axis or standard/ceiling SCARA zero-flange orientation.

| Model | Approximate links |
| --- | --- |
${table}

## Isaac Sim validation still required

Import with a fixed base. Configure convex collision approximations/contact filters and joint drives/gains, then validate gravity holding and trajectory following. Detailed STL geometry remains collision input. USD conversion and Isaac Sim execution have not been performed. Rapid Move is separate runtime code and is not embedded in these URDFs.
`;
    fs.writeFileSync(path.join(outputDir, 'README.md'), readme, 'utf8');
    console.log(`Generated ${generated.length} firmware-checked URDFs in ${path.relative(ROOT, outputDir)}.`);
    generated.forEach(({ outputFile, links }) => console.log(`- ${outputFile}: ${links.filter(link => link.reason).length} approximate links`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
