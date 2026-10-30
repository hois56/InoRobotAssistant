import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { RAPID_MOVE_DEFAULTS } from '../../2_3DSimulation/motion-program-core.mjs';

const evidence = JSON.parse(readFileSync(new URL('../fixtures/simulation-arm-load-catalog.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../../2_3DSimulation/models/models.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const manifestFunction = source.match(/function createRobotManifest\([^]*?\n\}/)?.[0];
assert.ok(manifestFunction, 'Missing production createRobotManifest');
const constants = [
  'REVOLUTE_DIRECTION_NEGATIVE', 'REVOLUTE_DIRECTION_POSITIVE',
  'CONTROLLER_PRISMATIC_DIRECTION', 'ROBOT_BODY_COLOR', 'SCARA_TOOL_AXES',
  'SIX_AXIS_TOOL_AXES', 'SCARA_TUBE_CAD_Z_OFFSETS', 'SCARA_J4_ARM_LOAD_MOUNT_OFFSET'
].map(name => {
  const declaration = source.match(new RegExp(`const ${name} = [^]*?;\\r?\\n`))?.[0];
  assert.ok(declaration, `Missing production constant ${name}`);
  return declaration;
}).join('\n');
const context = vm.createContext({ RAPID_MOVE_DEFAULTS });
vm.runInContext(`${constants}\n${manifestFunction}`, context);
const meshes = new Map();

function loadStl(folder, mesh) {
  const key = `${folder}/${mesh}`;
  if (meshes.has(key)) return meshes.get(key);
  const bytes = readFileSync(new URL(`../../2_3DSimulation/models/${key}`, import.meta.url));
  const count = bytes.readUInt32LE(80);
  assert.equal(bytes.length, 84 + count * 50, `${key}: complete binary STL required`);
  const triangles = Array.from({ length: count }, (_, triangle) => Array.from({ length: 3 }, (_, vertex) => {
    const offset = 84 + triangle * 50 + 12 + vertex * 12;
    return [0, 1, 2].map(axis => bytes.readFloatLE(offset + axis * 4));
  }));
  meshes.set(key, triangles);
  return triangles;
}

function near(actual, expected, tolerance, message) {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) <= tolerance,
    `${message}, axis ${axis}: ${value} != ${expected[axis]}`));
}

function mean(points) {
  return [0, 1, 2].map(axis => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
}

function verifyRim(triangles, hole, label) {
  const planeAxis = hole.axis === 'y' ? 1 : 2;
  const radialAxes = hole.axis === 'y' ? [0, 2] : [0, 1];
  const points = new Map();
  for (const triangle of triangles) for (const point of triangle) {
    if (Math.abs(point[planeAxis] - hole.center[planeAxis]) > hole.planeTolerance) continue;
    const radius = Math.hypot(...radialAxes.map(axis => point[axis] - hole.center[axis]));
    if (Math.abs(radius - hole.radius) <= hole.radialTolerance) {
      points.set(radialAxes.map(axis => point[axis].toFixed(5)).join(','), point);
    }
  }
  assert.ok(points.size >= hole.minVertices,
    `${label}: expected at least ${hole.minVertices} original rim vertices, found ${points.size}`);
  const angles = [...points.values()].map(point => Math.atan2(
    point[radialAxes[1]] - hole.center[radialAxes[1]],
    point[radialAxes[0]] - hole.center[radialAxes[0]]
  )).sort((a, b) => a - b);
  const gaps = angles.map((angle, index) => (angles[index + 1] ?? angles[0] + Math.PI * 2) - angle);
  assert.ok(Math.PI * 2 - Math.max(...gaps) > 4.5,
    `${label}: the verified samples must surround the circular rim`);
}

function sectionUpperBridge(triangles, x, yCenter) {
  const tops = [null, null];
  const consider = point => {
    if (Math.abs(point[1]) < 1e-9) return;
    const side = point[1] < 0 ? 0 : 1;
    if (!tops[side] || point[2] > tops[side][2]) tops[side] = point;
  };
  for (const triangle of triangles) for (let vertex = 0; vertex < 3; vertex++) {
    const a = triangle[vertex], b = triangle[(vertex + 1) % 3];
    if (Math.abs(a[0] - x) < 1e-9) consider(a);
    if ((a[0] < x && b[0] > x) || (a[0] > x && b[0] < x)) {
      const t = (x - a[0]) / (b[0] - a[0]);
      consider(a.map((value, axis) => value + t * (b[axis] - value)));
    }
  }
  assert.ok(tops.every(Boolean), 'P4 section must contain upper edges on both Y sides');
  const t = (yCenter - tops[0][1]) / (tops[1][1] - tops[0][1]);
  assert.ok(t > 0 && t < 1, 'Projected datum must be between the two P4 upper edges');
  return tops[0].map((value, axis) => value + t * (tops[1][axis] - value));
}

function independentDatum(triangles, mount, label) {
  const rims = mount.holes || mount.rims;
  rims.forEach((rim, index) => verifyRim(triangles, rim, `${label} rim ${index + 1}`));
  const holeCenter = mean(rims.map(rim => rim.center));
  if (!mount.sectionEvidence) return holeCenter;
  const section = mount.sectionEvidence;
  near(holeCenter.slice(0, 2), [section.sectionX, section.yCenter], 1e-7,
    `${label}: upper projection must retain the side-hole group XY`);
  for (const key of ['negativeYTop', 'positiveYTop']) {
    const support = section[key];
    const triangle = triangles[support.triangleIndex];
    assert.ok(triangle, `${label}: original support triangle ${support.triangleIndex} exists`);
    triangle.forEach((point, vertex) => near(point, support.vertices[vertex], 1e-7,
      `${label}: independent original P4 triangle evidence`));
    const point = [0, 1, 2].map(axis => triangle.reduce((sum, vertex, index) =>
      sum + vertex[axis] * support.barycentric[index], 0));
    near(point, support.point, 1e-7, `${label}: section point must be on the original P4 triangle`);
  }
  const actual = sectionUpperBridge(triangles, holeCenter[0], holeCenter[1]);
  near(actual, section.center, 1e-7, `${label}: complete original P4 section determines the upper height`);
  return actual;
}

test('new arm-load catalog evidence covers all 24 investigated models without claiming R16/R25 cover screws are mounting taps', () => {
  assert.equal(evidence.models.length, 24);
  assert.equal(evidence.models.filter(model => model.robotType === 'scara').length, 17);
  assert.equal(new Set(evidence.models.map(model => model.folder)).size, 24);
  for (const folder of evidence.userConfirmedCoverJ4) {
    const mount = evidence.models.find(model => model.folder === folder).mounts.find(mount => mount.jointIndex === 3);
    assert.equal(mount.kind, 'user-confirmed-front-cover-upper-datum');
    assert.equal(mount.threadMountingSupportClaimed, false);
    assert.equal(mount.manualThread, null);
    assert.equal(mount.rims.length, 2);
    assert.ok(!mount.holes, 'Cover reference rims must not be described as accessory tapped holes');
  }
  for (const model of evidence.models) {
    assert.ok(model.manual.path && model.manual.pdfPage, `${model.folder}: manual provenance is required`);
    assert.ok(!Object.hasOwn(model, 'offset'), 'The fixture must retain source geometry rather than a runtime offset table');
  }
});

for (const model of evidence.models) {
  for (const mount of model.mounts) {
    const label = `${model.folder} J${mount.jointIndex + 1}`;
    test(`${label} arm-load origin agrees with the original STL accessory geometry`, () => {
      const definition = catalog.find(entry => entry.folder === model.folder);
      assert.ok(definition, `${model.folder}: model must exist in the simulator catalog`);
      const datum = independentDatum(loadStl(model.folder, mount.mesh), mount, label);
      const manifest = context.createRobotManifest(definition);
      const joint = manifest.joints[mount.jointIndex];
      assert.equal(joint.mesh, mount.mesh, `${label}: datum belongs to the selected moving link`);
      assert.ok(Array.isArray(joint.armLoadMountOffset), `${label}: accessory mounting offset is missing`);
      const actual = joint.pivot.map((value, axis) => value + joint.armLoadMountOffset[axis]);
      near(actual, datum, 0.00002, `${label}: production origin must equal the independently verified STL datum`);
    });
  }
}

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const loaderFunctions = [
  'createRobotManifest', 'loadArticulatedRobot', 'getScaraMountingSurfaceCenterX',
  'normalizeArmLoadJointIndex', 'getAllowedArmLoadJointIndices', 'getRobotArmLoadJointIndex',
  'getRobotJointMountFrame', 'mountArmLoadModelAtJoint', 'setJointAngle'
].map(name => {
  const body = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0];
  assert.ok(body, `Missing production loader function ${name}`);
  return body;
}).join('\n');

async function loadScara(folder) {
  const definition = { ...catalog.find(model => model.folder === folder), smoothNormalsAngle: undefined };
  const runtime = vm.createContext({
    THREE, performance, RAPID_MOVE_DEFAULTS,
    ROBOT_LOGO_FACES: {}, ROBOT_LOGO_PROJECTIONS: {}, createRobotLogoIndex: () => null,
    WOBJ_WORLD_INDEX: 0, TCP_PROFILE_COUNT: 1, TCP_AXES_LOCAL_SIZE: 100, TCP_AXES_SCREEN_PIXELS: 80,
    loadSTL: async url => ({ geometry: new THREE.BufferGeometry().setAttribute('position',
      new THREE.Float32BufferAttribute(loadStl(folder, url.split('/').at(-1)).flat(2), 3)) }),
    createSTLMesh: geometry => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
    createScaraTubeMesh: () => new THREE.Group(), updateScaraTube() {},
    normalizeWorkObjects: () => [], ensureRobotWorkObjects() {},
    createDefaultTcpProfile: () => ({}), applyAxesHelperColors() {},
    normalizeArmLoadProperties: value => value || {}, state: { collision: {} }
  });
  vm.runInContext(`${constants}\n${loaderFunctions}`, runtime);
  const robot = await runtime.loadArticulatedRobot(definition);
  robot.updateMatrixWorld(true);
  return { runtime, robot };
}

for (const folder of ['IR-S4-40Z15', 'IR-TS4-35Z15', 'IR-S60-120Z40']) {
  test(`${folder} actual loader mounts arm loads to J2 and follows J1/J2 independently of the shaft and wrist`, async () => {
    const model = evidence.models.find(model => model.folder === folder);
    const mount = model.mounts[0];
    const datum = independentDatum(loadStl(folder, mount.mesh), mount, folder);
    const { runtime, robot } = await loadScara(folder);
    const load = new THREE.Group();
    assert.equal(runtime.mountArmLoadModelAtJoint(robot, load), true, 'Default SCARA attachment must choose J2');
    const joint = robot.userData.joints[1];
    assert.equal(load.parent, joint.armLoadMountFrame);
    assert.equal(load.parent.parent, joint.group, 'Dedicated J2 frame must belong directly to the moving second arm');
    assert.equal(load.userData.attachmentJointIndex, 1);
    assert.deepEqual(load.position.toArray(), [0, 0, 0]);
    for (const disallowed of [0, 2, 3]) assert.equal(runtime.getRobotJointMountFrame(robot, disallowed), null);
    const link = joint.group.children.find(child => child.isMesh);
    const checkWorld = () => {
      robot.updateMatrixWorld(true);
      const expected = link.localToWorld(new THREE.Vector3(...datum));
      near(load.getWorldPosition(new THREE.Vector3()).toArray(), expected.toArray(), 0.00002,
        `${folder}: actual loader frame must coincide with the original P2 accessory datum`);
    };
    checkWorld();
    const initial = load.getWorldPosition(new THREE.Vector3());
    runtime.setJointAngle(robot.userData.joints[0], 30, false, true);
    runtime.setJointAngle(joint, -45, false, true);
    checkWorld();
    assert.ok(load.getWorldPosition(new THREE.Vector3()).distanceTo(initial) > 10,
      'J1/J2 rotations must move the attached arm load');
    const beforeDistalMotion = load.getWorldPosition(new THREE.Vector3()).toArray();
    const shaft = robot.userData.joints[2];
    runtime.setJointAngle(shaft, (shaft.definition.min + shaft.definition.max) / 2, false, true);
    runtime.setJointAngle(robot.userData.joints[3], 80, false, true);
    checkWorld();
    near(load.getWorldPosition(new THREE.Vector3()).toArray(), beforeDistalMotion, 1e-7,
      'J3 shaft motion and J4 wrist rotation must not move a J2-mounted arm load');
    robot.position.set(300, -200, 70);
    robot.rotation.set(0.15, -0.2, 0.35);
    checkWorld();
  });
}
