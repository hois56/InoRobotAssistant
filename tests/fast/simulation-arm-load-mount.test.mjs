import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { RAPID_MOVE_DEFAULTS } from '../../2_3DSimulation/motion-program-core.mjs';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const catalog = JSON.parse(readFileSync(new URL('../../2_3DSimulation/models/models.json', import.meta.url), 'utf8'));
const names = ['createRobotManifest', 'loadArticulatedRobot', 'getScaraMountingSurfaceCenterX',
  'normalizeArmLoadJointIndex', 'getAllowedArmLoadJointIndices', 'getRobotArmLoadJointIndex',
  'getRobotJointMountFrame', 'mountArmLoadModelAtJoint', 'setJointAngle'];
const functions = names.map(name => {
  const body = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0];
  assert.ok(body, `Missing runtime function: ${name}`);
  return body;
}).join('\n');
const constants = ['REVOLUTE_DIRECTION_NEGATIVE', 'REVOLUTE_DIRECTION_POSITIVE',
  'CONTROLLER_PRISMATIC_DIRECTION', 'ROBOT_BODY_COLOR', 'SCARA_TOOL_AXES', 'SIX_AXIS_TOOL_AXES',
  'SCARA_TUBE_CAD_Z_OFFSETS', 'SCARA_J4_ARM_LOAD_MOUNT_OFFSET'];
const constantSource = constants.map(name => {
  const declaration = source.match(new RegExp(`const ${name} = [^]*?;\\r?\\n`))?.[0];
  assert.ok(declaration, `Missing runtime constant: ${name}`);
  return declaration;
}).join('\n');

const mountModels = [
  { name: 'R4-56', folder: 'IR-R4-56', minVertices: 15, holes: [
    { index: 2, mesh: 'P3.stl', center: [31.49983253, 0, 656.68655502], xs: [31.49983253], ys: [-6.5, 6.5], radius: 1.65, zTolerance: 0.04 },
    { index: 3, mesh: 'P4.stl', center: [274.999832, -1, 650.05397691], sideEdgeDatum: true }
  ] },
  { name: 'R4H-54', folder: 'IR-R4H-54', minVertices: 15, holes: [
    { index: 2, mesh: 'P3.stl', center: [31.49983253, 0, 656.68655502], xs: [31.49983253], ys: [-6.5, 6.5], radius: 1.65, zTolerance: 0.04 },
    { index: 3, mesh: 'P4.stl', center: [283.999832, 0, 654.86201514], sideEdgeDatum: true }
  ] },
  { name: 'R7H-70', folder: 'IR-R7H-70', minVertices: 20, holes: [
    { index: 2, mesh: 'P3.stl', center: [86, -0.00419855, 779.5], xs: [56, 116], ys: [-14.00419855, 13.99580145], radius: 2.1 },
    { index: 3, mesh: 'P4.stl', center: [267, -0.00419855, 769.5], xs: [258, 276], ys: [-46.00419855, 45.99580145], radius: 1.65 }
  ] },
  { name: 'R7H-90', folder: 'IR-R7H-90', minVertices: 20, holes: [
    { index: 2, mesh: 'P3.stl', center: [86, 0, 889.5], xs: [56, 116], ys: [-14, 14], radius: 2.1 },
    { index: 3, mesh: 'P4.stl', center: [347, 0, 879.5], xs: [338, 356], ys: [-46, 46], radius: 1.65 }
  ] },
  { name: 'R10H-120', folder: 'IR-R10H-120', minVertices: 8, excludedCenter: [233, 0, 1043], holes: [
    { index: 2, mesh: 'P3.stl', center: [82.5, 0, 1054], xs: [82.5], ys: [-12.5, 12.5], radius: 1.75 },
    { index: 3, mesh: 'P4.stl', center: [517, 0, 1049.5], xs: [508, 526], ys: [-46, 46], radius: 1.65 }
  ] }
];

function stlGeometry(folder, mesh) {
  const bytes = readFileSync(new URL(`../../2_3DSimulation/models/${folder}/${mesh}`, import.meta.url));
  const count = bytes.readUInt32LE(80);
  const positions = new Float32Array(count * 9);
  for (let triangle = 0; triangle < count; triangle++) {
    for (let vertex = 0; vertex < 3; vertex++) {
      const offset = 84 + triangle * 50 + 12 + vertex * 12;
      for (let axis = 0; axis < 3; axis++) positions[triangle * 9 + vertex * 3 + axis] = bytes.readFloatLE(offset + axis * 4);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
}

async function fixture(folder = 'IR-R7H-90') {
  const definition = { ...catalog.find(model => model.folder === folder), smoothNormalsAngle: undefined };
  const context = vm.createContext({ THREE, performance, RAPID_MOVE_DEFAULTS,
    ROBOT_LOGO_FACES: {}, ROBOT_LOGO_PROJECTIONS: {}, createRobotLogoIndex: () => null,
    WOBJ_WORLD_INDEX: 0, TCP_PROFILE_COUNT: 1, TCP_AXES_LOCAL_SIZE: 100, TCP_AXES_SCREEN_PIXELS: 80,
    loadSTL: async url => ({ geometry: stlGeometry(folder, url.split('/').at(-1)) }),
    createSTLMesh: geometry => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
    createScaraTubeMesh: () => new THREE.Group(), updateScaraTube() {},
    normalizeWorkObjects: () => [], ensureRobotWorkObjects() {},
    createDefaultTcpProfile: () => ({}), applyAxesHelperColors() {},
    normalizeArmLoadProperties: value => value || {}, state: { collision: {} } });
  vm.runInContext(`${constantSource}\n${functions}`, context);
  const robot = await context.loadArticulatedRobot(definition);
  robot.updateMatrixWorld(true);
  return { context, robot };
}

function nearVector(actual, expected, message) {
  assert.ok(actual.distanceTo(expected) < 1e-6,
    `${message}: ${actual.toArray()} != ${expected.toArray()}`);
}

function getSideEdgeDatum(geometry, center) {
  const vertices = geometry.getAttribute('position');
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -center[0]);
  const edge = new THREE.Line3();
  const intersection = new THREE.Vector3();
  const tops = [null, null];
  const consider = point => {
    if (Math.abs(point.y) < 1e-9) return;
    const side = point.y < 0 ? 0 : 1;
    if (!tops[side] || point.z > tops[side].z) tops[side] = point.clone();
  };
  for (let triangle = 0; triangle < vertices.count; triangle += 3) {
    for (let index = 0; index < 3; index++) {
      edge.start.fromBufferAttribute(vertices, triangle + index);
      edge.end.fromBufferAttribute(vertices, triangle + (index + 1) % 3);
      if (plane.intersectLine(edge, intersection)) consider(intersection);
      if (Math.abs(plane.distanceToPoint(edge.end)) < 1e-9) consider(edge.end);
    }
  }
  assert.ok(tops.every(Boolean), 'The original P4 section must have upper edges on both sides');
  const amount = (center[1] - tops[0].y) / (tops[1].y - tops[0].y);
  assert.ok(amount > 0 && amount < 1, 'The datum must lie between the two upper support edges');
  return tops[0].clone().lerp(tops[1], amount);
}

for (const model of mountModels) {
const mountHoles = model.holes;
test(`${model.name} 암 로드의 영점은 확인한 STL 장착 기준을 사용한다`, async () => {
  const { context, robot } = await fixture(model.folder);
  for (const mount of mountHoles) {
    const mesh = robot.userData.joints[mount.index].group.children.find(child => child.isMesh);
    const vertices = mesh.geometry.getAttribute('position');
    if (mount.sideEdgeDatum) {
      nearVector(getSideEdgeDatum(mesh.geometry, mount.center), new THREE.Vector3(...mount.center),
        `${model.name} datum joining the two upper edges of the original P4 section`);
    }
    for (const x of mount.xs || []) for (const y of mount.ys) {
      const ring = new Set();
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        const px = vertices.getX(vertex), py = vertices.getY(vertex), pz = vertices.getZ(vertex);
        if (Math.abs(pz - mount.center[2]) < (mount.zTolerance ?? 0.01)
          && Math.abs(Math.hypot(px - x, py - y) - mount.radius) < 0.02) {
          ring.add(`${px.toFixed(3)},${py.toFixed(3)}`);
        }
      }
      assert.ok(ring.size >= model.minVertices, `${model.name}/${mount.mesh}: missing mounting hole at ${x},${y}`);
    }
    const load = new THREE.Group();
    assert.equal(context.mountArmLoadModelAtJoint(robot, load, mount.index), true);
    robot.updateMatrixWorld(true);
    nearVector(load.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(...mount.center),
      `J${mount.index + 1} zero must use the confirmed mounting datum`);
    if (model.excludedCenter) {
      assert.ok(load.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...model.excludedCenter)) > 50,
        'R10H-120 must not use the excluded extension-arm mounting holes');
    }
    assert.deepEqual(load.position.toArray(), [0, 0, 0]);
  }
});

test(`${model.name} 장착 영점은 관절 회전과 로봇 배치를 따라가고 J3 부하는 J4 회전에 영향받지 않는다`, async () => {
  const { context, robot } = await fixture(model.folder);
  const loads = mountHoles.map(mount => {
    const load = new THREE.Group();
    context.mountArmLoadModelAtJoint(robot, load, mount.index);
    return load;
  });
  const assertAttached = () => {
    robot.updateMatrixWorld(true);
    mountHoles.forEach((mount, index) => {
      const link = robot.userData.joints[mount.index].group.children.find(child => child.isMesh);
      const expected = link.localToWorld(new THREE.Vector3(...mount.center));
      nearVector(loads[index].getWorldPosition(new THREE.Vector3()), expected, `J${mount.index + 1} attached center`);
    });
  };
  [25, -35, 50, 70, -40, 110].forEach((angle, index) => {
    context.setJointAngle(robot.userData.joints[index], angle, false, true);
    assertAttached();
  });
  const elbowIndex = mountHoles.findIndex(mount => mount.index === 2);
  const forearmIndex = mountHoles.findIndex(mount => mount.index === 3);
  const elbowPosition = loads[elbowIndex].getWorldPosition(new THREE.Vector3());
  const forearmPosition = forearmIndex >= 0 ? loads[forearmIndex].getWorldPosition(new THREE.Vector3()) : null;
  context.setJointAngle(robot.userData.joints[3], -45, false, true);
  assertAttached();
  nearVector(loads[elbowIndex].getWorldPosition(new THREE.Vector3()), elbowPosition, 'J4 must not move the J3 load');
  if (forearmIndex >= 0) {
    assert.ok(loads[forearmIndex].getWorldPosition(new THREE.Vector3()).distanceTo(forearmPosition) > 1,
      'J4 rotation must move the forearm mounting center');
  }
  robot.position.set(300, -200, 40);
  robot.rotation.set(0.2, -0.3, 0.5);
  assertAttached();
});
}

test('R11-90의 J3와 J4 영점은 실제 팔꿈치 구멍과 전완 상단 기준을 따른다', async () => {
  const sixAxis = await fixture('IR-R11-90');
  for (const [index, center] of [[2, [82.5, 0, 949.010009765625]],
    [3, [405, -0.000003814697265625, 941.2727147600292]]]) {
    const load = new THREE.Group();
    assert.equal(sixAxis.context.mountArmLoadModelAtJoint(sixAxis.robot, load, index), true);
    sixAxis.robot.updateMatrixWorld(true);
    nearVector(load.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(...center), `R11 J${index + 1} origin`);
    const mesh = sixAxis.robot.userData.joints[index].group.children.find(child => child.isMesh);
    if (index === 3) nearVector(getSideEdgeDatum(mesh.geometry, center), new THREE.Vector3(...center), 'R11 P4 upper datum');
  }
});

test('SCARA는 J2의 실제 장착 구멍 중앙만 암 로드 기준으로 사용한다', async () => {
  const scara = await fixture('IR-S4-40Z15');
  const joint = scara.robot.userData.joints[1];
  const frame = scara.context.getRobotJointMountFrame(scara.robot, 1);
  assert.equal(frame.parent, joint.group);
  const holes = [[326.04872131, -38.39512825, 64.69999695], [326.04872131, 38.39512825, 64.69999695],
    [346, -37, 64.69999695], [346, 37, 64.69999695]];
  const mesh = joint.group.children.find(child => child.isMesh);
  const vertices = mesh.geometry.getAttribute('position');
  for (const [x, y, z] of holes) {
    const ring = new Set();
    for (let index = 0; index < vertices.count; index++) {
      const px = vertices.getX(index), py = vertices.getY(index), pz = vertices.getZ(index);
      if (Math.abs(pz - z) < 0.001 && Math.abs(Math.hypot(px - x, py - y) - 2.14998) < 0.002) {
        ring.add(`${px.toFixed(4)},${py.toFixed(4)}`);
      }
    }
    assert.ok(ring.size >= 8, `S4 J2 mounting hole at ${x},${y}`);
  }
  const center = new THREE.Vector3(...holes.reduce((sum, hole) => sum.map((value, index) => value + hole[index] / 4), [0, 0, 0]));
  const load = new THREE.Group();
  assert.equal(scara.context.mountArmLoadModelAtJoint(scara.robot, load, 1), true);
  scara.robot.updateMatrixWorld(true);
  nearVector(load.getWorldPosition(new THREE.Vector3()), mesh.localToWorld(center), 'SCARA J2 mounting-hole center');
  for (const index of [0, 2, 3]) assert.equal(scara.context.getRobotJointMountFrame(scara.robot, index), null);
  assert.equal(scara.context.getRobotJointMountFrame(scara.robot), frame);
  assert.equal(scara.context.getRobotJointMountFrame(scara.robot, null), frame);
});

async function restoreSavedArmLoad(entry, folder = 'IR-R7H-90', offsets = {}) {
  let importOptions;
  const modelOffsets = {
    'IR-R4-56': { 2: [31.49983253, 0, 66.68655502], 3: [274.999832, -1, 40.05397691] },
    'IR-R4H-54': { 2: [31.49983253, 0, 66.68655502], 3: [283.999832, 0, 44.86201514] },
    'IR-R7H-70': { 2: [36, -0.00419855, 99.5], 3: [217, -0.00419855, 49.5] },
    'IR-R7H-90': { 2: [36, 0, 99.5], 3: [297, 0, 49.5] },
    'IR-R10H-120': { 2: [57.5, 0, 94], 3: [492, 0, 49.5] },
    'IR-R11-90': { 2: [57.5, 0, 94.01000977], 3: [380, -0.00000381, 47.40537476] },
    'IR-S4-40Z15': { 1: [111.02436066, 0, 64.69999695] }
  }[folder] || {};
  const robot = new THREE.Group();
  robot.position.set(30, -20, 10);
  robot.rotation.set(0.1, -0.2, 0.35);
  const scara = folder.startsWith('IR-S') || folder.startsWith('IR-TS');
  let parent = robot;
  robot.userData = {
    motionModelFolder: folder, manifest: { robotType: scara ? 'scara' : 'six-axis' },
    joints: Array.from({ length: scara ? 4 : 6 }, (_, index) => {
      const offset = offsets[index] || modelOffsets[index];
      const armLoadMountFrame = offset ? new THREE.Group() : null;
      if (armLoadMountFrame) armLoadMountFrame.position.fromArray(offset);
      const group = new THREE.Group();
      group.position.set(100 + index, 200, 300);
      group.rotation.z = 0.17 * index;
      parent.add(group);
      if (armLoadMountFrame) group.add(armLoadMountFrame);
      parent = group;
      return { group, armLoadMountFrame, definition: { armLoadMountOffset: offset } };
    })
  };
  robot.updateMatrixWorld(true);
  const context = vm.createContext({
    THREE,
    state: { workspaceRecovery: { db: { getAsset: async () => ({
      id: 'asset-1', name: 'load.stl', blob: { type: 'model/stl' }
    }) } } },
    File: class File { constructor(parts, name, options) { Object.assign(this, { parts, name, ...options }); } },
    handle3DImport: async options => {
      importOptions = options;
      return { userData: {} };
    },
    normalizeToolAttachmentSource: value => value || null,
    normalizeGripObjectSource: value => value || null,
    applyWorkspaceChildMatrices() {}, applyModelTransparencyVisual() {},
    applyWorkspacePartState() {}, applyWorkspaceMaterialColors() {}
  });
  vm.runInContext(constantSource, context);
  for (const name of ['normalizeArmLoadJointIndex', 'getArmLoadJointIndex',
    'getAllowedArmLoadJointIndices', 'getRobotArmLoadJointIndex', 'getRobotJointMountFrame',
    'getRobotJointMountOffset', 'normalizeToolAttachmentTransform', 'getRestoredArmLoadTransform',
    'restoreWorkspaceImportedModel']) {
    const body = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0];
    assert.ok(body, `Missing runtime function: ${name}`);
    vm.runInContext(body, context);
  }
  await context.restoreWorkspaceImportedModel(entry, new Map([['robot-1', robot]]));
  return importOptions;
}

const savedLoadTransform = position => ({
  position,
  quaternion: [0.1025978352, -0.2051956704, 0.3077935056, 0.9233805169],
  scale: [1.2, 0.8, 1.1]
});

for (const saved of [
  { name: 'J3', attachmentJointIndex: 2, position: [52, -8, 130], expected: [16, -8, 30.5] },
  { name: 'J4', attachmentJointIndex: 3, position: [315, 9, 70], expected: [18, 9, 20.5] },
  { name: '축 이름으로 저장된 J3', attachmentAxis: 'J3', position: [52, -8, 130], expected: [16, -8, 30.5] }
]) {
  test(`구형 R7H-90 ${saved.name} 암 로드 복원은 기존 부착 위치를 보존한다`, async () => {
    const entry = {
      assetId: 'asset-1', placement: 'arm-load', hostRobotInstanceId: 'robot-1',
      ...(saved.attachmentJointIndex !== undefined ? { attachmentJointIndex: saved.attachmentJointIndex }
        : { attachmentAxis: saved.attachmentAxis }),
      transform: savedLoadTransform(saved.position)
    };
    const originalEntry = structuredClone(entry);
    const options = await restoreSavedArmLoad(entry);
    nearVector(new THREE.Vector3().fromArray(options.transform.position), new THREE.Vector3(...saved.expected), 'restored local position');
    assert.deepEqual(Array.from(options.transform.quaternion), entry.transform.quaternion);
    assert.deepEqual(Array.from(options.transform.scale), entry.transform.scale);
    assert.equal(options.attachmentJointIndex, saved.attachmentJointIndex ?? 2);
    assert.deepEqual(entry, originalEntry, 'restoring a legacy file must not rewrite its saved data');
  });
}

for (const saved of [
  { name: 'J3 무표시', index: 2, position: [80, -4, 110], expected: [22.5, -4, 16] },
  { name: 'J3 기존 mount-frame 표시', index: 2, reference: 'mount-frame', position: [80, -4, 110], expected: [22.5, -4, 16] },
  { name: 'J4 무표시', index: 3, position: [510, 9, 70], expected: [18, 9, 20.5] },
  { name: 'J4 기존 mount-frame 표시', index: 3, reference: 'mount-frame', position: [510, 9, 70], expected: [18, 9, 20.5] },
  { name: '축 이름으로 저장된 J3', axis: 'J3', position: [80, -4, 110], expected: [22.5, -4, 16] },
  { name: '축 정보 없는 기본 J4', position: [510, 9, 70], expected: [18, 9, 20.5] }
]) {
  test(`구형 R10H-120 ${saved.name} 복원은 관절 원점 기준 위치를 보존한다`, async () => {
    const entry = {
      assetId: 'asset-1', placement: 'arm-load', hostRobotInstanceId: 'robot-1',
      attachmentJointIndex: saved.index, attachmentAxis: saved.axis,
      armLoadMountReference: saved.reference, transform: savedLoadTransform(saved.position)
    };
    const originalEntry = structuredClone(entry);
    const options = await restoreSavedArmLoad(entry, 'IR-R10H-120');
    nearVector(new THREE.Vector3().fromArray(options.transform.position), new THREE.Vector3(...saved.expected), 'restored local position');
    assert.deepEqual(Array.from(options.transform.quaternion), entry.transform.quaternion);
    assert.deepEqual(Array.from(options.transform.scale), entry.transform.scale);
    assert.equal(options.attachmentJointIndex, saved.index ?? (saved.axis === 'J3' ? 2 : 3));
    assert.deepEqual(entry, originalEntry);
  });
}

for (const saved of [
  { name: 'R10H-120 J3 새 기준 재복원', folder: 'IR-R10H-120', index: 2, offset: [57.5, 0, 94], expected: [15, -6, 24] },
  { name: 'R10H-120 J4 새 기준 재복원', folder: 'IR-R10H-120', index: 3, offset: [492, 0, 49.5], expected: [15, -6, 24] },
  { name: 'R7H-90의 숫자 기준은 문자열 표시보다 우선', folder: 'IR-R7H-90', index: 2, offset: [36, 0, 99.5], expected: [15, -6, 24] },
  { name: '저장 기준과 현재 J3 기준 차이', folder: 'IR-R10H-120', index: 2, offset: [50, 0, 90], expected: [7.5, -6, 20] },
  { name: '저장 기준과 현재 J4 기준 차이', folder: 'IR-R10H-120', index: 3, offset: [480, 2, 45], expected: [3, -4, 19.5] },
  { name: '영벡터로 저장된 다른 모델의 이후 기준 변경', folder: 'IR-R7H-70', index: 3, offset: [0, 0, 0], currentOffsets: { 3: [10, 2, 3] }, expected: [5, -8, 21] },
  { name: 'SCARA J2 숫자 기준 재복원', folder: 'IR-S4-40Z15', index: 1, offset: [111.02436066, 0, 64.69999695], expected: [15, -6, 24] },
  { name: 'SCARA J2도 명시된 숫자 기준을 사용', folder: 'IR-S4-40Z15', index: 1, offset: [0, 0, 0], expected: [-96.02436066, -6, -40.69999695] },
  { name: '짧은 R10H-120 기준은 구형 기준으로 처리', folder: 'IR-R10H-120', index: 2, offset: [1, 2], reference: 'mount-frame', expected: [-42.5, -6, -70] },
  { name: '문자열을 포함한 R10H-120 기준은 구형 기준으로 처리', folder: 'IR-R10H-120', index: 2, offset: [1, '2', 3], expected: [-42.5, -6, -70] },
  { name: '비유한 R10H-120 기준은 구형 기준으로 처리', folder: 'IR-R10H-120', index: 2, offset: [1, NaN, 3], expected: [-42.5, -6, -70] },
  { name: '손상된 R7H-90 기준은 기존 mount-frame 표시 유지', folder: 'IR-R7H-90', index: 3, offset: [1, 2], reference: 'mount-frame', expected: [15, -6, 24] },
  { name: '손상된 SCARA J2 기준은 구형 관절 영점으로 처리', folder: 'IR-S4-40Z15', index: 1, offset: [1, 2], expected: [-96.02436066, -6, -40.69999695] }
]) {
  test(`${saved.name} 시 실제 부착 위치를 보존한다`, async () => {
    const entry = {
      assetId: 'asset-1', placement: 'arm-load', hostRobotInstanceId: 'robot-1',
      attachmentJointIndex: saved.index, armLoadMountReference: saved.reference,
      armLoadMountOffset: saved.offset, transform: savedLoadTransform([15, -6, 24])
    };
    const originalEntry = structuredClone(entry);
    const options = await restoreSavedArmLoad(entry, saved.folder, saved.currentOffsets);
    nearVector(new THREE.Vector3().fromArray(options.transform.position), new THREE.Vector3(...saved.expected), 'restored local position');
    assert.deepEqual(Array.from(options.transform.quaternion), entry.transform.quaternion);
    assert.deepEqual(Array.from(options.transform.scale), entry.transform.scale);
    assert.deepEqual(entry, originalEntry);
  });
}

for (const saved of [
  { name: '새 J3 장착 기준', folder: 'IR-R7H-90', index: 2, reference: 'mount-frame' },
  { name: '새 J4 장착 기준', folder: 'IR-R7H-90', index: 3, reference: 'mount-frame' },
  { name: 'R7H-90 TCP 부착', folder: 'IR-R7H-90', index: 3, placement: 'tcp' }
]) {
  test(`${saved.name} 저장 위치에는 구형 R7H-90 보정을 적용하지 않는다`, async () => {
    const entry = {
      assetId: 'asset-1', placement: saved.placement || 'arm-load', hostRobotInstanceId: 'robot-1',
      attachmentJointIndex: saved.index, armLoadMountReference: saved.reference,
      transform: savedLoadTransform([15, -6, 24])
    };
    const originalEntry = structuredClone(entry);
    const options = await restoreSavedArmLoad(entry, saved.folder);
    assert.deepEqual(JSON.parse(JSON.stringify(options.transform)), entry.transform);
    assert.deepEqual(entry, originalEntry);
  });
}

for (const model of [
  { folder: 'IR-R4-56', mounts: [
    { index: 2, offset: [31.49983253, 0, 66.68655502] },
    { index: 3, offset: [274.999832, -1, 40.05397691] }
  ] },
  { folder: 'IR-R4H-54', mounts: [
    { index: 2, offset: [31.49983253, 0, 66.68655502] },
    { index: 3, offset: [283.999832, 0, 44.86201514] }
  ] },
  { folder: 'IR-R7H-70', mounts: [
    { index: 2, offset: [36, -0.00419855, 99.5] },
    { index: 3, offset: [217, -0.00419855, 49.5] }
  ] }
]) for (const mount of model.mounts) {
  for (const reference of [undefined, 'mount-frame']) {
    test(`${model.folder} J${mount.index + 1} 구형 저장은 기존 실제 배치를 유지한다 (표시=${reference || '없음'})`, async () => {
      const entry = { assetId: 'asset-1', placement: 'arm-load', hostRobotInstanceId: 'robot-1',
        attachmentJointIndex: mount.index, armLoadMountReference: reference,
        transform: savedLoadTransform([320, 20, 150]) };
      const original = structuredClone(entry);
      const options = await restoreSavedArmLoad(entry, model.folder);
      options.transform.position.forEach((value, axis) => assert.ok(
        Math.abs(value - (entry.transform.position[axis] - mount.offset[axis])) < 1e-9));
      assert.deepEqual(Array.from(options.transform.quaternion), entry.transform.quaternion);
      assert.deepEqual(Array.from(options.transform.scale), entry.transform.scale);
      assert.deepEqual(entry, original);
    });
  }
  test(`${model.folder} J${mount.index + 1} 새 저장은 장착 기준을 반복 보정하지 않는다`, async () => {
    const entry = { assetId: 'asset-1', placement: 'arm-load', hostRobotInstanceId: 'robot-1',
      attachmentJointIndex: mount.index, armLoadMountReference: 'mount-frame',
      armLoadMountOffset: mount.offset, transform: savedLoadTransform([15, -6, 24]) };
    const options = await restoreSavedArmLoad(entry, model.folder);
    options.transform.position.forEach((value, axis) => assert.ok(Math.abs(value - entry.transform.position[axis]) < 1e-9));
  });
  test(`${model.folder} J${mount.index + 1} 관절 원점에서 저장한 숫자 기준도 기존 배치를 유지한다`, async () => {
    const entry = { assetId: 'asset-1', placement: 'arm-load', hostRobotInstanceId: 'robot-1',
      attachmentJointIndex: mount.index, armLoadMountReference: 'mount-frame',
      armLoadMountOffset: [0, 0, 0], transform: savedLoadTransform([320, 20, 150]) };
    const options = await restoreSavedArmLoad(entry, model.folder);
    options.transform.position.forEach((value, axis) => assert.ok(
      Math.abs(value - (entry.transform.position[axis] - mount.offset[axis])) < 1e-9));
  });
}

function matrixFromTransform(transform) {
  return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(transform.position),
    new THREE.Quaternion().fromArray(transform.quaternion), new THREE.Vector3().fromArray(transform.scale));
}

for (const legacy of [
  ...[0, 1, 4, 5].map(sourceIndex => ({ folder: 'IR-R7H-90', sourceIndex,
    targetIndex: 3, sourceOffset: [0, 0, 0] })),
  { folder: 'IR-S4-40Z15', sourceIndex: 0, targetIndex: 1, sourceOffset: [0, 0, 0] },
  { folder: 'IR-S4-40Z15', sourceIndex: 2, targetIndex: 1, sourceOffset: [0, 0, 0] },
  { folder: 'IR-S4-40Z15', sourceIndex: 3, targetIndex: 1, sourceOffset: [0, 0, 35] },
  { folder: 'IR-S4-40Z15', sourceIndex: 3, targetIndex: 1, sourceOffset: [0, 0, 35], numericOffset: true },
  { folder: 'IR-S4-40Z15', sourceIndex: 3, targetIndex: 1, sourceOffset: [0, 0, 0], numericOffset: true }
]) {
  test(`${legacy.folder} 구형 J${legacy.sourceIndex + 1} 부하는 J${legacy.targetIndex + 1}로 옮겨도 세계행렬을 보존한다 (숫자 기준=${Boolean(legacy.numericOffset)})`, async () => {
    const entry = { assetId: 'asset-1', placement: 'arm-load', hostRobotInstanceId: 'robot-1',
      attachmentJointIndex: legacy.sourceIndex, attachmentAxis: `J${legacy.sourceIndex + 1}`,
      armLoadMountReference: 'mount-frame', transform: savedLoadTransform([15, -6, 24]),
      ...(legacy.numericOffset ? { armLoadMountOffset: legacy.sourceOffset } : {}) };
    const original = structuredClone(entry);
    const options = await restoreSavedArmLoad(entry, legacy.folder);
    const robot = options.attachmentRobot;
    const source = robot.userData.joints[legacy.sourceIndex].group;
    const targetJoint = robot.userData.joints[legacy.targetIndex];
    const target = targetJoint.armLoadMountFrame || targetJoint.group;
    robot.updateMatrixWorld(true);
    const expected = source.matrixWorld.clone()
      .multiply(new THREE.Matrix4().makeTranslation(...legacy.sourceOffset))
      .multiply(matrixFromTransform(entry.transform));
    const actual = target.matrixWorld.clone().multiply(matrixFromTransform(options.transform));
    assert.equal(options.attachmentJointIndex, legacy.targetIndex);
    actual.elements.forEach((value, index) => assert.ok(Math.abs(value - expected.elements[index]) < 1e-6,
      `world matrix element ${index}: ${value} != ${expected.elements[index]}`));
    assert.deepEqual(entry, original, 'legacy migration must not rewrite the saved entry');

    const resaved = { ...entry, attachmentJointIndex: legacy.targetIndex,
      attachmentAxis: `J${legacy.targetIndex + 1}`, transform: options.transform,
      armLoadMountOffset: targetJoint.armLoadMountFrame?.position.toArray() || [0, 0, 0] };
    const restoredAgain = await restoreSavedArmLoad(resaved, legacy.folder);
    const restoredJoint = restoredAgain.attachmentRobot.userData.joints[legacy.targetIndex];
    const restoredFrame = restoredJoint.armLoadMountFrame || restoredJoint.group;
    restoredAgain.attachmentRobot.updateMatrixWorld(true);
    const resavedWorld = restoredFrame.matrixWorld.clone().multiply(matrixFromTransform(restoredAgain.transform));
    resavedWorld.elements.forEach((value, index) => assert.ok(Math.abs(value - expected.elements[index]) < 1e-6,
      `resaved world matrix element ${index}: ${value} != ${expected.elements[index]}`));
  });
}
