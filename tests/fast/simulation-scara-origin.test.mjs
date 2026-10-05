import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['loadArticulatedRobot', 'getCurrentTcpPoseBase', 'getRobotControllerBaseFrame',
  'getRobotControllerBasePosition', 'restoreRobotControllerBaseTransform', 'getScaraMountingSurfaceCenterX'];
const functions = names.map(name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');

async function fixture(robotType = 'scara', kinematicVariant = 'standard', height = 175.5) {
  const geometry = new THREE.BoxGeometry(100, 100, height);
  geometry.translate(-60, 0, -height / 2);
  // A rear connector must not move the mounting-face centre.
  const connector = new THREE.BoxGeometry(20, 20, 20);
  connector.translate(-150, 0, -height / 2);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    ...geometry.getAttribute('position').array, ...connector.getAttribute('position').array
  ], 3));
  const manifest = { name: 'Origin fixture', robotType, kinematicVariant,
    base: { mesh: 'P0.stl' }, joints: [
      { name: 'J1', mesh: 'P1.stl', pivot: [0, 0, 0], axis: [0, 0, 1] },
      { name: 'J2', mesh: 'P2.stl', pivot: [300, 0, 0], axis: [0, 0, 1] },
      { name: 'J3', pivot: [600, 0, 0], axis: [0, 0, 1] },
      { name: 'J4', pivot: [600, 0, 0], axis: [0, 0, 1] }
    ], tcp: [600, 0, 0] };
  const context = vm.createContext({ THREE, performance, WOBJ_WORLD_INDEX: 0,
    TCP_PROFILE_COUNT: 1, TCP_AXES_LOCAL_SIZE: 100, TCP_AXES_SCREEN_PIXELS: 80,
    createRobotManifest: () => manifest,
    loadSTL: async () => ({ geometry: geometry.clone() }),
    createSTLMesh: geometry => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
    normalizeWorkObjects: () => [], ensureRobotWorkObjects() {},
    createDefaultTcpProfile: () => ({}), applyAxesHelperColors() {} });
  vm.runInContext(functions, context);
  const robot = await context.loadArticulatedRobot({ folder: 'fixture' });
  return { context, robot, height };
}

test('SCARA 하드웨어 원점은 설치면이고 TCP Z 영점은 기존 로봇 기준을 유지한다', async () => {
  for (const height of [175.5, 250, 400]) {
    const { context, robot } = await fixture('scara', 'standard', height);
    assert.equal(robot.position.z, 0, '모델 이동 원점이 설치면에 있어야 합니다.');
    robot.updateMatrixWorld(true);
    const frame = context.getRobotControllerBaseFrame(robot);
    assert.equal(frame.position.x, 60, 'J1 대신 베이스 설치면의 X 중심을 사용해야 합니다.');
    assert.ok(frame.localToWorld(new THREE.Vector3(-60, 0, -height)).length() < 1e-6);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(robot).min.z) < 1e-6);
    assert.equal(context.getCurrentTcpPoseBase(robot).position.z, 0);
    assert.equal(robot.userData.tcpFrame.getWorldPosition(new THREE.Vector3()).z, height);
    robot.position.set(10, 20, 30);
    robot.rotation.set(0.3, -0.2, 0.6);
    robot.updateMatrixWorld(true);
    assert.ok(context.getCurrentTcpPoseBase(robot).position.distanceTo(new THREE.Vector3(600, 0, 0)) < 1e-6);
    const j3 = robot.userData.joints[2];
    j3.group.position.z = -50;
    assert.ok(Math.abs(context.getCurrentTcpPoseBase(robot).position.z + 50) < 1e-6);
  }
});

test('기존 프로젝트의 BASE 배치를 복원하고 재저장해도 TCP 세계 위치를 보존한다', async () => {
  const { context, robot } = await fixture();
  const transform = { position: [40, 50, 200], quaternion: new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(0.2, -0.4, 0.7)).toArray(), scale: [1.2, 1.2, 1.2] };
  context.restoreRobotControllerBaseTransform(robot, transform);
  robot.updateMatrixWorld(true);
  const expected = new THREE.Vector3(600, 0, 0).multiplyScalar(1.2)
    .applyQuaternion(robot.quaternion).add(new THREE.Vector3(...transform.position));
  assert.ok(robot.userData.tcpFrame.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-6);
  assert.ok(context.getRobotControllerBasePosition(robot).distanceTo(new THREE.Vector3(...transform.position)) < 1e-6);
});

test('천장형 SCARA와 6축 로봇의 기존 원점을 보존한다', async () => {
  for (const [type, variant] of [['scara', 'ceiling-scara'], ['six-axis', 'standard']]) {
    const { context, robot } = await fixture(type, variant);
    assert.equal(robot.position.z, 0);
    assert.equal(context.getCurrentTcpPoseBase(robot).position.z, 0);
  }
});
