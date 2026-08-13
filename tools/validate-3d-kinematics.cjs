const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const modelsRoot = path.join(root, '2_3DSimulation', 'models');
const catalogPath = path.join(modelsRoot, 'models.json');
const viewerSourcePath = path.join(root, '2_3DSimulation', 'main.js');
const viewerHtmlPath = path.join(root, '2_3DSimulation', 'index.html');
const REVOLUTE_DIRECTION_NEGATIVE = -1;
const REVOLUTE_DIRECTION_POSITIVE = 1;
const PRISMATIC_DIRECTION = 1;
const AXIS_TOLERANCE_MM = 0.05;
const CRITICAL_MANUAL_LIMITS = {
    'IR-R7H-90': { 2: [-135, 80] },
    'IR-R10H-120': { 5: [-120, 120] },
    'IR-R20H-120': { 2: [-160, 70], 3: [-76, 200] }
};
const FLOOR_MOUNT_HEIGHTS = {
    'IR-S4-40Z15': 150,
    'IR-S7-50Z20': 155,
    'IR-S7-60Z20': 155,
    'IR-S7-70Z20': 155,
    'IR-S10-60Z20': 155.5,
    'IR-S10-70Z20': 155.5,
    'IR-S10-80Z20': 155.5,
    'IR-S25-80Z42': 357.5,
    'IR-S25-100Z42': 357.5,
    'IR-S25-120Z42': 357.5,
    'IR-S35-80Z42': 332.5,
    'IR-S35-100Z42': 332.5,
    'IR-S35-120Z42': 329.5,
    'IR-S60-120Z40': 381,
    'IR-GS60-120Z40': 381
};
const SCARA_TUBE_CAD_Z_OFFSETS = {
    'IR-S4-40Z15': -2,
    'IR-S7-50Z20': -1,
    'IR-S7-60Z20': 1,
    'IR-S7-70Z20': -1,
    'IR-S10-60Z20': -1,
    'IR-S10-70Z20': -1,
    'IR-S10-80Z20': -1,
    'IR-S25-80Z42': 0,
    'IR-S25-100Z42': -5.002,
    'IR-S25-120Z42': -52.5,
    'IR-S35-80Z42': 0,
    'IR-S35-100Z42': 0,
    'IR-S35-120Z42': 0,
    'IR-S60-120Z40': -45.372,
    'IR-GS60-120Z40': -5.628
};
const SCARA_TUBE_CAD_MIN_Z = {
    'IR-S4-40Z15': 198.3551,
    'IR-S7-50Z20': 201.3551,
    'IR-S7-60Z20': 203.3551,
    'IR-S7-70Z20': 201.3544,
    'IR-S10-60Z20': 201.3551,
    'IR-S10-70Z20': 201.3551,
    'IR-S10-80Z20': 201.3549,
    'IR-S25-80Z42': 684.771,
    'IR-S25-100Z42': 698.7703,
    'IR-S25-120Z42': 666.7723,
    'IR-S35-80Z42': 684.771,
    'IR-S35-100Z42': 684.7704,
    'IR-S35-120Z42': 666.7723,
    'IR-S60-120Z40': 699.2,
    'IR-GS60-120Z40': 719.0722
};

function fail(message) {
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

function readBounds(filePath) {
    const buffer = fs.readFileSync(filePath);
    const bounds = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity]
    };
    let vertexCount = 0;
    const include = (x, y, z) => {
        [x, y, z].forEach((value, index) => {
            assert(Number.isFinite(value), `Invalid STL vertex: ${filePath}`);
            bounds.min[index] = Math.min(bounds.min[index], value);
            bounds.max[index] = Math.max(bounds.max[index], value);
        });
        vertexCount += 1;
    };

    const triangleCount = buffer.length >= 84 ? buffer.readUInt32LE(80) : 0;
    const isBinary = buffer.length >= 84 && 84 + triangleCount * 50 === buffer.length;
    if (isBinary) {
        for (let triangle = 0; triangle < triangleCount; triangle += 1) {
            const triangleOffset = 84 + triangle * 50;
            for (let vertex = 0; vertex < 3; vertex += 1) {
                const offset = triangleOffset + 12 + vertex * 12;
                include(
                    buffer.readFloatLE(offset),
                    buffer.readFloatLE(offset + 4),
                    buffer.readFloatLE(offset + 8)
                );
            }
        }
    } else {
        const text = buffer.toString('utf8');
        const pattern = /\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
        for (const match of text.matchAll(pattern)) {
            include(Number(match[1]), Number(match[2]), Number(match[3]));
        }
    }

    assert(vertexCount > 0, `STL contains no vertices: ${filePath}`);
    return bounds;
}

function axisDistanceToBounds(pivot, axis, bounds) {
    let squaredDistance = 0;
    for (let dimension = 0; dimension < 3; dimension += 1) {
        if (axis[dimension] !== 0) continue;
        const value = pivot[dimension];
        const gap = value < bounds.min[dimension]
            ? bounds.min[dimension] - value
            : value > bounds.max[dimension]
                ? value - bounds.max[dimension]
                : 0;
        squaredDistance += gap * gap;
    }
    return Math.sqrt(squaredDistance);
}

function mapScaraTubeLongitudinal(
    longitudinal,
    sourcePlanLength,
    targetPlanLength,
    j1RigidEndLength
) {
    const flexibleStart = j1RigidEndLength;
    if (longitudinal <= flexibleStart) return { distance: longitudinal, scale: 1 };
    const sourceFlexibleLength = Math.max(sourcePlanLength - flexibleStart, 1e-6);
    const targetFlexibleLength = Math.max(
        targetPlanLength - flexibleStart,
        1e-6
    );
    const normalized = (longitudinal - flexibleStart) / sourceFlexibleLength;
    const targetFlexibleScale = targetFlexibleLength / sourceFlexibleLength;
    const transitionFraction = Math.min(0.12, targetFlexibleScale * 0.25);
    const flowingScale = (targetFlexibleScale - transitionFraction * 0.5)
        / (1 - transitionFraction * 0.5);
    const transitionIntegral = (value) => value ** 6
        - 3 * value ** 5
        + 2.5 * value ** 4;
    const transitionScale = (value) => value ** 3
        * (value * (value * 6 - 15) + 10);
    const transitionArea = transitionFraction * (1 + flowingScale) * 0.5;
    let normalizedDistance;
    let localScale;
    if (normalized < transitionFraction) {
        const transition = normalized / transitionFraction;
        normalizedDistance = normalized
            + (flowingScale - 1) * transitionFraction * transitionIntegral(transition);
        localScale = 1 + (flowingScale - 1) * transitionScale(transition);
    } else {
        normalizedDistance = transitionArea
            + flowingScale * (normalized - transitionFraction);
        localScale = flowingScale;
    }
    return {
        distance: flexibleStart + sourceFlexibleLength * normalizedDistance,
        scale: Math.max(localScale, 1e-6)
    };
}

function mapScaraTubePoint(point, fixedEnd, sourceMovingX, movingEnd, j1RigidEndLength) {
    const sourceDeltaX = sourceMovingX - fixedEnd[0];
    const sourceDeltaY = -fixedEnd[1];
    const sourcePlanLength = Math.max(Math.hypot(sourceDeltaX, sourceDeltaY), 1);
    const sourceDirection = [sourceDeltaX / sourcePlanLength, sourceDeltaY / sourcePlanLength];
    const sourceNormal = [-sourceDirection[1], sourceDirection[0]];
    const targetDelta = [movingEnd[0] - fixedEnd[0], movingEnd[1] - fixedEnd[1]];
    const targetPlanLength = Math.hypot(...targetDelta);
    const targetDirection = [targetDelta[0] / targetPlanLength, targetDelta[1] / targetPlanLength];
    const targetNormal = [-targetDirection[1], targetDirection[0]];
    const sourceOffset = [point[0] - fixedEnd[0], point[1] - fixedEnd[1]];
    const longitudinal = sourceOffset[0] * sourceDirection[0] + sourceOffset[1] * sourceDirection[1];
    const lateral = sourceOffset[0] * sourceNormal[0] + sourceOffset[1] * sourceNormal[1];
    const mappedLongitudinal = mapScaraTubeLongitudinal(
        longitudinal,
        sourcePlanLength,
        targetPlanLength,
        j1RigidEndLength
    ).distance;
    return [
        fixedEnd[0] + targetDirection[0] * mappedLongitudinal + targetNormal[0] * lateral,
        fixedEnd[1] + targetDirection[1] * mappedLongitudinal + targetNormal[1] * lateral,
        point[2]
    ];
}

function createManifest(model) {
    if (model.robotType === 'scara') {
        const [arm1, arm2] = model.structure;
        const secondArmDirection = model.kinematicVariant === 'ceiling-scara' ? -1 : 1;
        const wrist = [arm1 + secondArmDirection * arm2, 0, 0];
        return {
            tcp: wrist,
            tube: model.kinematicVariant === 'ceiling-scara'
                ? null
                : { mesh: 'TUBE.stl' },
            joints: [
                { pivot: [0, 0, 0], axis: [0, 0, 1], mesh: 'P1.stl', direction: REVOLUTE_DIRECTION_POSITIVE },
                { pivot: [arm1, 0, 0], axis: [0, 0, 1], mesh: 'P2.stl', direction: REVOLUTE_DIRECTION_POSITIVE },
                { pivot: wrist, axis: [0, 0, 1], mesh: model.j3Mesh ? 'P3.stl' : 'P4.stl', type: 'prismatic', direction: PRISMATIC_DIRECTION },
                { pivot: wrist, axis: [0, 0, 1], mesh: 'P4.stl', direction: REVOLUTE_DIRECTION_POSITIVE }
            ]
        };
    }

    const [shoulderOffset, upperArm, elbowOffset, forearm, wristLength, shoulderHeight] = model.structure;
    const elbowHeight = shoulderHeight + upperArm;
    const wristHeight = elbowHeight + elbowOffset;
    const tcp = [shoulderOffset + forearm + wristLength, 0, wristHeight];
    return {
        tcp,
        joints: [
            { pivot: [0, 0, 0], axis: [0, 0, 1], mesh: 'P1.stl', direction: REVOLUTE_DIRECTION_POSITIVE },
            { pivot: [shoulderOffset, 0, shoulderHeight], axis: [0, 1, 0], mesh: 'P2.stl', direction: REVOLUTE_DIRECTION_NEGATIVE },
            { pivot: [shoulderOffset, 0, elbowHeight], axis: [0, 1, 0], mesh: 'P3.stl', direction: REVOLUTE_DIRECTION_NEGATIVE },
            { pivot: [shoulderOffset, 0, wristHeight], axis: [1, 0, 0], mesh: 'P4.stl', direction: REVOLUTE_DIRECTION_POSITIVE },
            { pivot: [shoulderOffset + forearm, 0, wristHeight], axis: [0, 1, 0], mesh: 'P5.stl', direction: REVOLUTE_DIRECTION_NEGATIVE },
            { pivot: tcp, axis: [1, 0, 0], mesh: 'P6.stl', direction: REVOLUTE_DIRECTION_POSITIVE }
        ]
    };
}

function normalizeDegrees(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
}

function forwardScara(model, angles) {
    const [arm1, arm2] = model.structure;
    const secondArmDirection = model.kinematicVariant === 'ceiling-scara' ? -1 : 1;
    const physicalJ1 = angles[0] * Math.PI / 180;
    const physicalJ2 = angles[1] * Math.PI / 180;
    return {
        x: arm1 * Math.cos(physicalJ1) + secondArmDirection * arm2 * Math.cos(physicalJ1 + physicalJ2),
        y: arm1 * Math.sin(physicalJ1) + secondArmDirection * arm2 * Math.sin(physicalJ1 + physicalJ2),
        z: angles[2],
        rz: normalizeDegrees(angles[0] + angles[1] + angles[3])
    };
}

function equivalentAngles(angle, limits) {
    const values = [];
    for (let turns = -3; turns <= 3; turns += 1) {
        const candidate = angle + turns * 360;
        if (candidate >= limits[0] - 1e-7 && candidate <= limits[1] + 1e-7) values.push(candidate);
    }
    return values;
}

function solveScaraPose(model, target) {
    const [arm1, arm2] = model.structure;
    const signedArm2 = (model.kinematicVariant === 'ceiling-scara' ? -1 : 1) * arm2;
    const rawCosine = (target.x ** 2 + target.y ** 2 - arm1 ** 2 - signedArm2 ** 2) / (2 * arm1 * signedArm2);
    if (rawCosine < -1 - 1e-7 || rawCosine > 1 + 1e-7) return null;
    const elbow = Math.acos(Math.max(-1, Math.min(1, rawCosine)));
    const elbowSolutions = elbow < 1e-9 ? [0] : [elbow, -elbow];
    for (const physicalJ2 of elbowSolutions) {
        const physicalJ1 = Math.atan2(target.y, target.x)
            - Math.atan2(signedArm2 * Math.sin(physicalJ2), arm1 + signedArm2 * Math.cos(physicalJ2));
        const baseJ1 = physicalJ1 * 180 / Math.PI;
        const baseJ2 = physicalJ2 * 180 / Math.PI;
        for (const j1 of equivalentAngles(baseJ1, model.limits[0])) {
            for (const j2 of equivalentAngles(baseJ2, model.limits[1])) {
                for (const j4 of equivalentAngles(target.rz - j1 - j2, model.limits[3])) {
                    return [j1, j2, target.z, j4];
                }
            }
        }
    }
    return null;
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const viewerSource = fs.readFileSync(viewerSourcePath, 'utf8');
const viewerHtml = fs.readFileSync(viewerHtmlPath, 'utf8');
assert(/const REVOLUTE_DIRECTION_NEGATIVE\s*=\s*-1\s*;/.test(viewerSource), 'Viewer must define the negative revolute Joint direction');
assert(/const REVOLUTE_DIRECTION_POSITIVE\s*=\s*1\s*;/.test(viewerSource), 'Viewer must define the positive revolute Joint direction');
assert(/const CONTROLLER_PRISMATIC_DIRECTION\s*=\s*1\s*;/.test(viewerSource), 'Viewer prismatic Joint direction must match the controller convention');
assert(viewerSource.includes('jointDirection: REVOLUTE_DIRECTION_POSITIVE'), 'SCARA J1, J2, and J4 must use the positive direction');
assert((viewerSource.match(/direction: REVOLUTE_DIRECTION_POSITIVE/g) || []).length === 3, 'Six-axis J1, J4, and J6 must use the positive direction');
assert(/const ROBOT_BODY_COLOR\s*=\s*['"]#ece9dd['"]\s*;/.test(viewerSource), 'Robot body material must use the approved ivory color');
assert(/const AXIS_COLORS\s*=\s*Object\.freeze\(\{\s*x:\s*['"]#d32f2f['"],\s*y:\s*['"]#388e3c['"],\s*z:\s*['"]#1976d2['"]\s*\}\)/.test(viewerSource), 'Coordinate axes must use the subdued red, green, and blue palette');
assert((viewerSource.match(/applyAxesHelperColors\(/g) || []).length >= 3, 'Every coordinate AxesHelper must use the shared RGB palette');
assert((viewerSource.match(/applyTransformControlColors\(/g) || []).length >= 3, 'Every transform gizmo must use the shared RGB palette');
assert(/const SCARA_TOOL_AXES\s*=\s*\{\s*x:\s*\[1,\s*0,\s*0\],\s*y:\s*\[0,\s*1,\s*0\],\s*z:\s*\[0,\s*0,\s*1\]\s*\}/.test(viewerSource), 'SCARA Tool axes must match the Base coordinate system');
assert(/const SIX_AXIS_TOOL_AXES\s*=\s*\{\s*x:\s*\[0,\s*0,\s*1\],\s*y:\s*\[0,\s*-1,\s*0\],\s*z:\s*\[1,\s*0,\s*0\]\s*\}/.test(viewerSource), 'Six-axis Tool axes must retain the flange coordinate mapping');
assert(viewerSource.includes('toolAxes: SCARA_TOOL_AXES') && viewerSource.includes('toolAxes: SIX_AXIS_TOOL_AXES'), 'Robot manifests must use their type-specific Tool axes');
assert(viewerSource.includes("toolAxesAtTcp.name = 'Tool axes at TCP'"), 'TCP axes must be identified as the Tool coordinate system');
assert(viewerSource.includes('tcpFrame.add(toolAxesAtTcp)'), 'TCP axes must inherit the live Tool frame pose');
assert(viewerSource.includes('robot.userData.toolAxesAtTcp = toolAxesAtTcp'), 'Robot state must retain the Tool axes helper');
assert(viewerSource.includes('TCP_AXES_SCREEN_PIXELS = 40'), 'TCP axes must use a compact target size on screen');
assert(viewerSource.includes('function updateCameraScaledTcpAxes()'), 'TCP axes must respond to camera distance and zoom');
assert(/updateCameraScaledTcpAxes\(\);[\s\S]*?updateSimulationSnapMarkerCameraScale\(\);[\s\S]*?state\.renderer\.render/.test(viewerSource), 'TCP axes must be resized immediately before each render');
assert(!viewerSource.includes('Base axes at TCP') && !viewerSource.includes('baseAxesAtTcp'), 'TCP axes must not remain fixed to the Base frame');
const tcpVisualSource = viewerSource.slice(
    viewerSource.indexOf('function syncTcpVisualAtPose('),
    viewerSource.indexOf('function updateTcpPresentation(')
);
assert(tcpVisualSource.includes('axes.position.set(0, 0, 0)') && tcpVisualSource.includes('axes.quaternion.identity()'), 'TCP axes must stay aligned to their Tool-frame parent');
assert(!/#4f5968|#1d6fd6/.test(viewerSource), 'Robot links must not retain the old gray base or blue J6 colors');
assert(!/addInovanceBrandDecal|isBrandDecal|INOVANCE_LOGO_URL/.test(viewerSource), 'Robot body logo decals must remain disabled');
assert(/kinematicVariant\s*===\s*['"]ceiling-scara['"]\s*\?\s*-1\s*:\s*1/.test(viewerSource), 'Viewer must preserve the folded TS4/TS5 zero pose');
assert(viewerSource.includes("tube: kinematicVariant === 'ceiling-scara'"), 'Only floor-mounted SCARA manifests may load the CD conduit');
const tubeVisualSource = viewerSource.slice(
    viewerSource.indexOf('function getExtremeSectionCenter('),
    viewerSource.indexOf('function createDefaultTcpProfile(')
);
assert(tubeVisualSource.includes('function createScaraTubeMesh(')
    && tubeVisualSource.includes('function updateScaraTube('), 'Viewer must create and update the SCARA CD conduit between its two sockets');
assert(tubeVisualSource.includes('const geometry = sourceGeometry.clone()')
    && tubeVisualSource.includes('scaraTubeOriginalStl')
    && tubeVisualSource.includes('scaraTubeOriginalPositions')
    && tubeVisualSource.includes('scaraTubeOriginalNormals'), 'SCARA conduit must retain the complete authored TUBE.stl mesh');
assert(!tubeVisualSource.includes('new THREE.TubeGeometry(')
    && !tubeVisualSource.includes('createScaraTubeConnector(')
    && !tubeVisualSource.includes('createScaraTubeGeometry('), 'SCARA conduit must not be replaced by generated tube or connector geometry');
assert(viewerSource.includes('robot.add(tubeMesh)')
    && tubeVisualSource.includes('if (tube.parent !== robot) robot.add(tube)')
    && !viewerSource.includes('j1.group.add(robot.userData.scaraTube)')
    && !viewerSource.includes('j2.group.add(robot.userData.scaraTube)'), 'SCARA conduit must remain in the fixed P0 frame');
assert(tubeVisualSource.includes('getScaraTubeJ1SocketOffset')
    && tubeVisualSource.includes('scaraTubeFixedEnd')
    && tubeVisualSource.includes('j2.group.getWorldPosition'), 'SCARA conduit must keep its J1 end fixed and follow the moving J2 socket');
assert(viewerSource.includes('SCARA_TUBE_CAD_Z_OFFSETS')
    && viewerSource.includes("'IR-S25-120Z42': -52.5")
    && viewerSource.includes("'IR-S60-120Z40': -45.372")
    && tubeVisualSource.includes('definition.cadZOffset')
    && tubeVisualSource.includes('offset.z = Number.isFinite(Number(cadZOffset))'), 'SCARA conduit must use the per-model placement measured from the matching assembly CAD');
assert(!tubeVisualSource.includes('Math.abs(offset.z) > 5'), 'SCARA conduit must not discard deep model-specific CAD socket offsets');
assert(tubeVisualSource.includes('targetDirectionX * mappedLongitudinal')
    && tubeVisualSource.includes('targetNormalX * lateral')
    && tubeVisualSource.includes('positions[offset + 2] = originalPositions[offset + 2] + zOffset'), 'SCARA conduit must preserve its authored vertical curve in one moving plane without sideways bending');
assert(!tubeVisualSource.includes('SCARA_TUBE_CONNECTOR_ANGLE_DEGREES')
    && !tubeVisualSource.includes('scaraTubeConnectorAngleDegrees')
    && !tubeVisualSource.includes('j2RigidEndLength')
    && !tubeVisualSource.includes('scaraTubeCrossSectionWidth'), 'SCARA conduit must not impose a fixed J2 connector angle or rigid lead');
assert(tubeVisualSource.includes('function mapScaraTubeLongitudinal(')
    && tubeVisualSource.includes('transitionIntegral')
    && tubeVisualSource.includes('transitionScale')
    && tubeVisualSource.includes('flowingScale'), 'SCARA conduit must transition smoothly from the J1 socket and flow continuously through J2');
assert(/joint\.definition\.name\s*===\s*['"]J1['"]\)\s*updateScaraTube\(joint\.robot\)/.test(viewerSource), 'SCARA conduit plane must refresh after J1 motion');
assert(/mesh\.userData\.excludeFromOutline\s*=\s*true/.test(tubeVisualSource), 'SCARA CD conduit must be excluded from model outlines');
const outlineSource = viewerSource.slice(
    viewerSource.indexOf('function isOutlineMesh('),
    viewerSource.indexOf('function removeModelOutlines(')
);
assert(outlineSource.includes('!mesh.userData?.excludeFromOutline'), 'Outline selection must honor the SCARA conduit exclusion flag');
assert(tubeVisualSource.includes('if (tube.parent !== robot) robot.add(tube)')
    && !tubeVisualSource.includes('weightBuckets')
    && !tubeVisualSource.includes('scaraCosines'), 'SCARA CD conduit must use a fixed-end planar mapping instead of progressive per-vertex rotation');
for (const angle of [-132, -120, -45, 0, 45, 120, 132]) {
    const radians = angle * Math.PI / 180;
    const fixed = [-100, 0, 50];
    const sourceMovingX = 225;
    const moving = [sourceMovingX * Math.cos(radians), sourceMovingX * Math.sin(radians), 50];
    const sourceLength = sourceMovingX - fixed[0];
    const targetLength = Math.hypot(moving[0] - fixed[0], moving[1] - fixed[1]);
    const j1RigidEnd = Math.min(sourceLength * 0.12, 45, targetLength * 0.24);
    const mappedFixed = mapScaraTubePoint(fixed, fixed, sourceMovingX, moving, j1RigidEnd);
    const mappedMoving = mapScaraTubePoint([sourceMovingX, 0, 50], fixed, sourceMovingX, moving, j1RigidEnd);
    assert(Math.hypot(mappedFixed[0] - fixed[0], mappedFixed[1] - fixed[1]) < 1e-9, `SCARA conduit fixed endpoint moved at J1=${angle}`);
    assert(Math.hypot(mappedMoving[0] - moving[0], mappedMoving[1] - moving[1]) < 1e-9, `SCARA conduit moving endpoint missed J2 at J1=${angle}`);
    const flexibleStart = j1RigidEnd;
    const sampleStep = Math.max(sourceLength * 1e-5, 1e-5);
    for (const boundary of [flexibleStart]) {
        const before = mapScaraTubeLongitudinal(
            boundary - sampleStep,
            sourceLength,
            targetLength,
            j1RigidEnd
        ).distance;
        const at = mapScaraTubeLongitudinal(
            boundary,
            sourceLength,
            targetLength,
            j1RigidEnd
        ).distance;
        const after = mapScaraTubeLongitudinal(
            boundary + sampleStep,
            sourceLength,
            targetLength,
            j1RigidEnd
        ).distance;
        const incomingScale = (at - before) / sampleStep;
        const outgoingScale = (after - at) / sampleStep;
        assert(Math.abs(incomingScale - outgoingScale) < 1e-4, `SCARA conduit tangent kink remains at J1=${angle}`);
        assert(Math.abs(incomingScale - 1) < 1e-4, `SCARA conduit rigid-end tangent changed at J1=${angle}`);
    }
    let previousMappedDistance = -Infinity;
    for (let sample = 0; sample <= 100; sample += 1) {
        const mappedDistance = mapScaraTubeLongitudinal(
            sourceLength * sample / 100,
            sourceLength,
            targetLength,
            j1RigidEnd
        ).distance;
        assert(mappedDistance > previousMappedDistance, `SCARA conduit folded over itself at J1=${angle}`);
        previousMappedDistance = mappedDistance;
    }
    for (const ratio of [0.2, 0.5, 0.8]) {
        const mapped = mapScaraTubePoint([
            fixed[0] + sourceLength * ratio,
            0,
            50 + 200 * 4 * ratio * (1 - ratio)
        ], fixed, sourceMovingX, moving, j1RigidEnd);
        const planeError = Math.abs(
            (mapped[0] - fixed[0]) * (-(moving[1] - fixed[1]) / targetLength)
            + (mapped[1] - fixed[1]) * ((moving[0] - fixed[0]) / targetLength)
        );
        assert(planeError < 1e-9, `SCARA conduit centerline bent outside its plane at J1=${angle}`);
    }
    const endDistance = sourceLength * 0.05;
    const mappedNearJ2 = mapScaraTubePoint(
        [sourceMovingX - endDistance, 0, 50],
        fixed,
        sourceMovingX,
        moving,
        j1RigidEnd
    );
    const mappedEndDistance = Math.hypot(
        mappedNearJ2[0] - moving[0],
        mappedNearJ2[1] - moving[1]
    );
    const endScale = mapScaraTubeLongitudinal(
        sourceLength,
        sourceLength,
        targetLength,
        j1RigidEnd
    ).scale;
    assert(Math.abs(mappedEndDistance - endDistance * endScale) < 1e-8, `SCARA conduit did not flow continuously into J2 at J1=${angle}`);
}
assert(viewerSource.includes("if (robot.userData.manifest?.robotType === 'scara') return solveScaraIK(robot, target);"), 'SCARA must use analytic IK');
assert(viewerSource.includes('const targetFlangeQuaternion = target.quaternion.clone()')
    && viewerSource.includes('const targetFlangePosition = target.position.clone().sub('),
'SCARA analytic IK must remove the active TCP offset before solving the flange target');
assert(viewerSource.includes("Math.max(0, -(geometries[0].boundingBox?.min.z || 0))"), 'Floor-mounted SCARA bases must align to their STL mounting surface');
assert((viewerHtml.match(/data-base-rotation-row=/g) || []).length === 3, 'BASE JOG must expose three filterable rotation rows');
assert((viewerHtml.match(/id="tcp-(?:x|y|z|rx|ry|rz)" type="number"/g) || []).length === 6, 'TCP readouts must be directly editable');
const robots = catalog.filter((entry) => entry.type === 'articulated-stl');
assert(robots.length === 29, `Expected 29 articulated robots, found ${robots.length}`);
assert(new Set(robots.map((robot) => robot.name)).size === robots.length, 'Robot names must be unique');
assert(new Set(robots.map((robot) => robot.folder)).size === robots.length, 'Robot folders must be unique');

const typeCounts = { scara: 0, 'six-axis': 0 };
let jointCount = 0;
let meshCount = 0;
let tubeCount = 0;
let maximumAxisError = 0;
let scaraPoseChecks = 0;

for (const model of robots) {
    assert(Object.hasOwn(typeCounts, model.robotType), `${model.name}: unsupported robotType`);
    typeCounts[model.robotType] += 1;
    const expectedJointCount = model.robotType === 'scara' ? 4 : 6;
    assert(model.structure.length === expectedJointCount, `${model.name}: invalid structure length`);
    assert(model.limits.length === expectedJointCount, `${model.name}: invalid limits length`);
    assert(model.jointSpeeds.length === expectedJointCount, `${model.name}: invalid joint speed count`);
    model.jointSpeeds.forEach((speed, index) => {
        assert(Number.isFinite(speed) && speed > 0, `${model.name} J${index + 1}: invalid joint speed`);
    });
    assert(['standard', 'ceiling-scara'].includes(model.kinematicVariant || 'standard'), `${model.name}: invalid kinematicVariant`);
    assert(model.robotType === 'scara' || !model.kinematicVariant, `${model.name}: six-axis robot cannot use a SCARA variant`);
    model.limits.forEach(([minimum, maximum], index) => {
        assert(Number.isFinite(minimum) && Number.isFinite(maximum) && minimum < maximum, `${model.name} J${index + 1}: invalid limits`);
        assert(minimum <= 0 && maximum >= 0, `${model.name} J${index + 1}: zero pose is outside limits`);
    });
    for (const [jointNumber, expected] of Object.entries(CRITICAL_MANUAL_LIMITS[model.folder] || {})) {
        const actual = model.limits[Number(jointNumber) - 1];
        assert(actual[0] === expected[0] && actual[1] === expected[1], `${model.name} J${jointNumber}: limits differ from the manipulator manual`);
    }

    const manifest = createManifest(model);
    const folder = path.join(modelsRoot, model.folder);
    const meshNames = new Set(['P0.stl', ...manifest.joints.map((joint) => joint.mesh)]);
    for (const meshName of meshNames) {
        const meshPath = path.join(folder, meshName);
        assert(fs.existsSync(meshPath) && fs.statSync(meshPath).size > 0, `${model.name}: missing ${meshName}`);
        meshCount += 1;
    }

    if (model.robotType === 'scara') {
        const tubePath = path.join(folder, 'TUBE.stl');
        if (manifest.tube) {
            assert(fs.existsSync(tubePath) && fs.statSync(tubePath).size > 0, `${model.name}: missing TUBE.stl`);
            const tubeBounds = readBounds(tubePath);
            const tubeSpan = tubeBounds.max[0] - tubeBounds.min[0];
            assert(tubeBounds.min[0] < -1, `${model.name}: CD conduit does not reach the fixed base side`);
            assert(Math.abs(tubeBounds.max[0] - model.structure[0]) <= 35, `${model.name}: CD conduit does not reach the J1 moving side`);
            assert(tubeSpan > model.structure[0], `${model.name}: CD conduit span is too short`);
            const cadOffsetZ = SCARA_TUBE_CAD_Z_OFFSETS[model.folder];
            const cadMinimumZ = SCARA_TUBE_CAD_MIN_Z[model.folder];
            const mountingHeight = FLOOR_MOUNT_HEIGHTS[model.folder];
            assert(Number.isFinite(cadOffsetZ)
                && Number.isFinite(cadMinimumZ)
                && Number.isFinite(mountingHeight), `${model.name}: missing full-CAD conduit placement reference`);
            const mountedTubeMinimumZ = tubeBounds.min[2] + mountingHeight + cadOffsetZ;
            assert(Math.abs(mountedTubeMinimumZ - cadMinimumZ) <= 0.01,
                `${model.name}: conduit minimum Z is ${mountedTubeMinimumZ.toFixed(3)} mm, CAD requires ${cadMinimumZ.toFixed(3)} mm`);
            if (model.folder === 'IR-S10-80Z20') {
                const tubeHeight = tubeBounds.max[2] - tubeBounds.min[2];
                assert(tubeSpan >= 579 && tubeHeight >= 396.5,
                    `${model.name}: conduit still uses the shorter S10-70 body instead of the S10-80 CAD body`);
            }
            tubeCount += 1;
        } else {
            assert(!fs.existsSync(tubePath), `${model.name}: ceiling SCARA must not load a floor-model CD conduit`);
        }

        const expectedHeight = FLOOR_MOUNT_HEIGHTS[model.folder];
        const p0Bounds = readBounds(path.join(folder, 'P0.stl'));
        if (expectedHeight !== undefined) {
            const actualHeight = Math.max(0, -p0Bounds.min[2]);
            assert(Math.abs(actualHeight - expectedHeight) <= 0.01, `${model.name}: floor mounting height is ${actualHeight.toFixed(3)} mm, expected ${expectedHeight.toFixed(3)} mm`);
        }

        const home = forwardScara(model, [0, 0, 0, 0]);
        const rzOnly = forwardScara(model, [0, 0, 0, 30]);
        assert(Math.hypot(home.x - rzOnly.x, home.y - rzOnly.y, home.z - rzOnly.z) < 1e-9, `${model.name}: Rz-only motion changes XYZ`);
        const singularHomeAngles = solveScaraPose(model, home);
        assert(singularHomeAngles, `${model.name}: analytic SCARA IK rejected the fully extended singular pose`);
        const solvedSingularHome = forwardScara(model, singularHomeAngles);
        assert(Math.hypot(home.x - solvedSingularHome.x, home.y - solvedSingularHome.y) < 1e-6, `${model.name}: singular home pose was not reproduced`);

        const sampleAngles = [15, -20, (model.limits[2][0] + model.limits[2][1]) / 2, 25];
        const target = forwardScara(model, sampleAngles);
        const solvedAngles = solveScaraPose(model, target);
        assert(solvedAngles, `${model.name}: analytic SCARA IK rejected a reachable target`);
        const solved = forwardScara(model, solvedAngles);
        const poseError = Math.max(
            Math.hypot(target.x - solved.x, target.y - solved.y),
            Math.abs(target.z - solved.z),
            Math.abs(normalizeDegrees(target.rz - solved.rz))
        );
        assert(poseError < 1e-6, `${model.name}: analytic SCARA IK pose error ${poseError}`);
        scaraPoseChecks += 2;
    }

    manifest.joints.forEach((joint, index) => {
        jointCount += 1;
        const expectedDirection = model.robotType === 'scara'
            ? REVOLUTE_DIRECTION_POSITIVE
            : [
                REVOLUTE_DIRECTION_POSITIVE,
                REVOLUTE_DIRECTION_NEGATIVE,
                REVOLUTE_DIRECTION_NEGATIVE,
                REVOLUTE_DIRECTION_POSITIVE,
                REVOLUTE_DIRECTION_NEGATIVE,
                REVOLUTE_DIRECTION_POSITIVE
            ][index];
        assert(joint.direction === expectedDirection, `${model.name} J${index + 1}: incorrect Joint direction`);
        const bounds = readBounds(path.join(folder, joint.mesh));
        const error = axisDistanceToBounds(joint.pivot, joint.axis, bounds);
        maximumAxisError = Math.max(maximumAxisError, error);
        assert(error <= AXIS_TOLERANCE_MM, `${model.name} J${index + 1}: axis misses ${joint.mesh} by ${error.toFixed(3)} mm`);
    });
}

assert(typeCounts.scara === 17, `Expected 17 SCARA models, found ${typeCounts.scara}`);
assert(typeCounts['six-axis'] === 12, `Expected 12 six-axis models, found ${typeCounts['six-axis']}`);
assert(jointCount === 140, `Expected 140 joints, found ${jointCount}`);
assert(tubeCount === 15, `Expected 15 SCARA CD conduit assets, found ${tubeCount}`);
assert(robots.filter((model) => model.kinematicVariant === 'ceiling-scara').map((model) => model.folder).sort().join(',') === 'IR-TS4-35Z15,IR-TS5-55Z15', 'Ceiling SCARA variants must be TS4 and TS5');

console.log(`3D kinematics OK: ${robots.length} robots (${typeCounts.scara} SCARA, ${typeCounts['six-axis']} six-axis), ${jointCount} joints, ${meshCount} link assets, ${tubeCount} CD conduit assets, ${scaraPoseChecks} SCARA pose checks, max axis error ${maximumAxisError.toFixed(3)} mm`);
