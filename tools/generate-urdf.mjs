import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIMULATION_DIR = path.join(ROOT, '2_3DSimulation');
const MODELS_DIR = path.join(SIMULATION_DIR, 'models');
const DYNAMICS_DIR = path.join(SIMULATION_DIR, '새 폴더');
const OUTPUT_DIR = path.join(SIMULATION_DIR, 'urdf');

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
                speed: finiteNumber(speed[2]) * screwLead / 360
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

function sourceCogToMeters(cog) {
    return numberArray(cog).map((value) => Math.abs(value) > 10 ? value * MM_TO_M : value);
}

function sourceInertiaToMetersSquared(values) {
    return numberArray(values, 6).map((value) => Math.abs(value) > 10 ? value * 1e-6 : value);
}

function isPositiveDefinite(matrix) {
    const [a, b, c, d, e, f] = matrix;
    if (![a, b, c, d, e, f].every(Number.isFinite) || a <= 0 || d <= 0 || f <= 0) return false;
    const minor2 = a * d - b * b;
    const determinant = a * (d * f - e * e) - b * (b * f - c * e) + c * (b * e - c * d);
    return minor2 > 1e-12 && determinant > 1e-15;
}

function boundingBoxInertial(mass, bounds, pivot) {
    const fallbackSize = [50, 50, 50];
    const min = bounds?.min || fallbackSize.map((value) => -value / 2);
    const max = bounds?.max || fallbackSize.map((value) => value / 2);
    const size = min.map((value, axis) => Math.max(Math.abs(max[axis] - value), 1));
    const center = bounds?.center || [0, 0, 0];
    return {
        origin: center.map((value, axis) => value * MM_TO_M - pivot[axis] * MM_TO_M),
        inertia: [
            mass * (size[1] * size[1] + size[2] * size[2]) * MM_TO_M * MM_TO_M / 12,
            0,
            0,
            mass * (size[0] * size[0] + size[2] * size[2]) * MM_TO_M * MM_TO_M / 12,
            0,
            mass * (size[0] * size[0] + size[1] * size[1]) * MM_TO_M * MM_TO_M / 12
        ],
        source: 'bounding-box-fallback'
    };
}

function createInertialData(dynamicLink, meshBounds, pivot) {
    const mass = finiteNumber(dynamicLink?.mass);
    if (mass <= 0) return null;
    const sourceInertia = sourceInertiaToMetersSquared(dynamicLink?.inertia);
    const sourceMatrix = [sourceInertia[0], sourceInertia[3], sourceInertia[4], sourceInertia[1], sourceInertia[5], sourceInertia[2]];
    // The controller JSON stores each link COG in that link's dynamic frame;
    // unlike the STL bounds fallback, it must not be shifted by the joint pivot.
    const sourceOrigin = sourceCogToMeters(dynamicLink?.cog);
    if (isPositiveDefinite(sourceMatrix)) {
        return { mass, origin: sourceOrigin, inertia: sourceMatrix, source: 'controller-json' };
    }
    return { ...boundingBoxInertial(mass, meshBounds, pivot), mass };
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
    return `\n    <!-- inertial source: ${inertial.source} -->\n    <inertial>\n      <origin xyz="${vectorText(inertial.origin)}" rpy="0 0 0"/>\n      <mass value="${formatNumber(inertial.mass)}"/>\n      <inertia ixx="${formatNumber(ixx)}" ixy="${formatNumber(ixy)}" ixz="${formatNumber(ixz)}" iyy="${formatNumber(iyy)}" iyz="${formatNumber(iyz)}" izz="${formatNumber(izz)}"/>\n    </inertial>`;
}

function createJointXml(joint, index, previousPivot, dynamicLink, robotType) {
    const origin = difference(joint.pivot, previousPivot).map((value) => value * MM_TO_M);
    const axis = joint.axis.map((value) => value * joint.direction);
    const isPrismatic = joint.type === 'prismatic';
    const lower = finiteNumber(joint.limits?.[0]) * (isPrismatic ? MM_TO_M : DEG_TO_RAD);
    const upper = finiteNumber(joint.limits?.[1]) * (isPrismatic ? MM_TO_M : DEG_TO_RAD);
    const velocity = finiteNumber(joint.speed) * (isPrismatic ? MM_TO_M : DEG_TO_RAD);
    const effort = isPrismatic ? 0 : Math.max(0, finiteNumber(dynamicLink?.ratedTrq));
    const effortComment = isPrismatic ? ' <!-- source ratedTrq is torque; prismatic force was not supplied -->' : '';
    return `\n  <joint name="${xmlEscape(joint.name)}" type="${isPrismatic ? 'prismatic' : 'revolute'}">\n    <parent link="${index === 0 ? 'base_link' : `link_${index}`}"/>\n    <child link="link_${index + 1}"/>\n    <origin xyz="${vectorText(origin)}" rpy="0 0 0"/>\n    <axis xyz="${vectorText(axis)}"/>\n    <limit lower="${formatNumber(lower)}" upper="${formatNumber(upper)}" effort="${formatNumber(effort)}" velocity="${formatNumber(velocity)}"/>${effortComment}\n  </joint>`;
}

function buildUrdf(definition, dynamicConfig) {
    const manifest = createKinematicManifest(definition);
    const dynamicLinks = Array.isArray(dynamicConfig?.stRobotBody?.stDynamics?.stLink)
        ? dynamicConfig.stRobotBody.stDynamics.stLink
        : [];
    const robotName = dynamicConfig?.stRobotBody?.cRobotName || definition.name;
    const robotFolder = definition.folder;
    const lines = [
        '<?xml version="1.0"?>',
        `<!-- Generated from ${dynamicConfig.__sourceFile} and models.json. Coordinates are Z-up; mesh units are millimetres and converted with mesh scale 0.001. -->`,
        `<robot name="${xmlEscape(robotName)}">`,
        `  <!-- Payload limit from controller JSON: ${formatNumber(dynamicConfig.stRobotBody?.stBase?.u16LoadMass)} kg -->`,
        '  <link name="base_link">',
        visualXml({ mesh: `../models/${robotFolder}/P0.stl`, origin: [0, 0, 0], name: 'base', color: '0.31 0.35 0.41 1' }),
    ];
    const tubePath = path.join(MODELS_DIR, robotFolder, 'TUBE.stl');
    if (definition.robotType === 'scara' && fs.existsSync(tubePath) && definition.kinematicVariant !== 'ceiling-scara') {
        lines.push(visualXml({ mesh: `../models/${robotFolder}/TUBE.stl`, origin: [0, 0, 0], name: 'conduit', color: '0.16 0.17 0.18 1' }));
    }
    lines.push('  </link>');

    manifest.joints.forEach((joint, index) => {
        const pivot = joint.pivot;
        const meshPath = joint.mesh ? path.join(MODELS_DIR, robotFolder, joint.mesh) : null;
        const meshExists = meshPath ? fs.existsSync(meshPath) : false;
        const meshBounds = meshExists ? readStlBounds(meshPath) : null;
        const inertial = createInertialData(dynamicLinks[index], meshBounds, pivot);
        const meshUri = meshExists ? `../models/${robotFolder}/${joint.mesh}` : null;
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
    lines.push(`\n  <link name="tool0"/>\n  <joint name="tool0_fixed" type="fixed">\n    <parent link="link_${lastLink}"/>\n    <child link="tool0"/>\n    <origin xyz="${vectorText(tcpOffset)}" rpy="0 0 0"/>\n  </joint>`);
    lines.push('</robot>');
    return lines.filter((line) => line !== '').join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

function main() {
    const definitions = readJson(path.join(MODELS_DIR, 'models.json'));
    const dynamicFiles = fs.readdirSync(DYNAMICS_DIR)
        .filter((file) => file.toLowerCase().endsWith('.json'))
        .sort();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const generated = [];
    for (const file of dynamicFiles) {
        const dynamicConfig = readJson(path.join(DYNAMICS_DIR, file));
        dynamicConfig.__sourceFile = file;
        const robotName = dynamicConfig.stRobotBody?.cRobotName || path.basename(file, '.json');
        const definition = findModelDefinition(robotName, definitions);
        const outputFile = `${robotName}.urdf`;
        fs.writeFileSync(path.join(OUTPUT_DIR, outputFile), buildUrdf(definition, dynamicConfig), 'utf8');
        generated.push({ outputFile, model: definition.name, type: definition.robotType });
    }
    const readme = `# Generated URDF files\n\nGenerated from the 29 controller configuration JSON files in ../새 폴더 and the simulation kinematic catalog in ../models/models.json.\n\n- Meshes are referenced from ../models/<folder>/*.stl and scaled from millimetres to metres.\n- Revolute limits and velocities are converted from degrees to radians.\n- SCARA J3 is exported as a prismatic joint using its screw lead.\n- Link mass, centre of gravity, inertia, and payload metadata come from the controller JSON.\n- If a source inertia tensor is not positive-definite or a source mesh is absent, the generator uses a bounding-box inertia fallback and marks it in the URDF comment.\n- The controller JSON inertia field contains model-specific unit/ordering quirks; validate the generated inertial frames before using Gazebo or another dynamics engine for quantitative results.\n\nGenerated files: ${generated.length}\n`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'README.md'), readme, 'utf8');
    console.log(`Generated ${generated.length} URDF files in ${path.relative(ROOT, OUTPUT_DIR)}.`);
    generated.forEach(({ outputFile, model, type }) => console.log(`- ${outputFile} (${model}, ${type})`));
}

main();
