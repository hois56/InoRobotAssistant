import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['getRobotControllerBaseFrame', 'getJogReadoutPose', 'getBasePoseFromJogReadout', 'getTcpRotationDegrees',
  'quaternionFromTcpRotationDegrees', 'normalizeDegrees', 'updateJogWorkObjectUi', 'updateTcpPresentation',
  'applyBaseJogNumericTarget', 'jogTcpInBase'];
const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join('\n');

function fixture() {
  const robot = new THREE.Group();
  robot.userData.activeWorkObjectIndex = 1;
  robot.userData.toolHomeQuaternion = new THREE.Quaternion();
  robot.userData.tcpFrame = new THREE.Group();
  robot.userData.joints = [];
  const workObject = { position: new THREE.Vector3(100, 200, 30),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2, 'ZYX')) };
  const pose = { position: new THREE.Vector3(100, 220, 35), quaternion: new THREE.Quaternion() };
  robot.userData.baseJogTarget = pose;
  const label = { textContent: '' };
  const inputs = Object.fromEntries(['x', 'y', 'z', 'rx', 'ry', 'rz'].map(key => [key, { value: '' }]));
  const titles = Array.from({ length: 2 }, () => {
    const text = { textContent: '' };
    return { childNodes: [text], firstChild: text };
  });
  let solvedTarget;
  const context = vm.createContext({ THREE, WOBJ_WORLD_INDEX: 0,
    SIX_AXIS_POSITION_HOME_QUATERNION: new THREE.Quaternion(), robot,
    el: { tcpReadouts: inputs, baseJogView: { querySelectorAll: () => titles }, baseMoveStep: { value: '10' } },
    document: { activeElement: null, getElementById: () => label },
    uiText: value => value, resolveWorkObjectIndex: value => Number(value) || 0,
    getWorkObjectWorldPose: () => workObject, getJogTargetRobot: () => robot,
    syncTcpVisualAtPose() {}, beginBaseJogNumericHistory() {},
    solveRobotIK: (_, target) => { solvedTarget = target; return { success: true }; },
    syncJointControls() {}, syncBaseJogGizmoFromRobot() {}, queueCollaborationRobotState() {},
    setBaseJogStatus() {}, clearJogCollisionLock() {} });
  vm.runInContext(functions, context);
  return { context, robot, pose, workObject, inputs, label, titles, target: () => solvedTarget };
}

test('Wobj 원점과 회전을 JOG 위치·회전 표시 및 하단 번호에 반영한다', () => {
  const { context, robot, pose, inputs, label, titles } = fixture();
  context.updateTcpPresentation(robot, pose);
  assert.equal(inputs.x.value, '20.00');
  assert.equal(Number(inputs.y.value), 0);
  assert.equal(inputs.z.value, '5.00');
  assert.equal(inputs.rz.value, '-90.00');
  assert.equal(label.textContent, 'Wobj 1');
  assert.ok(titles[0].firstChild.textContent.includes('Wobj[1]'));
});

test('로봇 BASE가 이동·회전되어도 Wobj 표시와 역변환을 보존한다', () => {
  const { context, robot, pose } = fixture();
  robot.position.set(40, -70, 90);
  robot.rotation.set(0.2, -0.3, 0.4);
  const displayed = context.getJogReadoutPose(robot, pose);
  const restored = context.getBasePoseFromJogReadout(robot, displayed);
  assert.ok(restored.position.distanceTo(pose.position) < 1e-8);
  assert.ok(restored.quaternion.angleTo(pose.quaternion) < 1e-7);
});

test('Wobj 0은 기존 BASE 표시와 하단 번호로 복귀한다', () => {
  const { context, robot, pose, inputs, label, titles } = fixture();
  robot.userData.activeWorkObjectIndex = 0;
  context.updateTcpPresentation(robot, pose);
  assert.equal(inputs.x.value, '100.00');
  assert.equal(inputs.y.value, '220.00');
  assert.equal(label.textContent, 'Wobj 0');
  assert.ok(titles[0].firstChild.textContent.endsWith('BASE'));
});

test('SCARA 설치면 원점과 분리된 BASE 높이를 Wobj 변환에 반영한다', () => {
  const { context, robot, pose, inputs } = fixture();
  const frame = new THREE.Group();
  frame.position.z = 175.5;
  robot.add(frame);
  robot.userData.controllerBaseFrame = frame;
  context.updateTcpPresentation(robot, pose);
  assert.equal(inputs.z.value, '180.50');
  const restored = context.getBasePoseFromJogReadout(robot, context.getJogReadoutPose(robot, pose));
  assert.ok(restored.position.distanceTo(pose.position) < 1e-8);
});

test('JOG 위치 직접 입력은 선택 Wobj에서 BASE로 변환하여 이동한다', () => {
  const { context, robot, pose, inputs, target } = fixture();
  context.updateTcpPresentation(robot, pose);
  inputs.x.value = '30';
  context.applyBaseJogNumericTarget({ currentTarget: inputs.x });
  assert.ok(target().position.distanceTo(new THREE.Vector3(100, 230, 35)) < 1e-8);
});

test('JOG 증가 버튼은 표시 중인 Wobj 축을 따라 이동한다', () => {
  const { context, robot, target } = fixture();
  assert.equal(context.jogTcpInBase(robot, 'move', 'x', 1), true);
  assert.ok(target().position.distanceTo(new THREE.Vector3(100, 230, 35)) < 1e-8);
});

test('TCP 회전 보정과 회전된 Wobj를 함께 적용해도 자세를 보존한다', () => {
  const { context, robot, pose, workObject } = fixture();
  context.SIX_AXIS_POSITION_HOME_QUATERNION.setFromEuler(new THREE.Euler(-Math.PI, -Math.PI / 2, 0, 'ZYX'));
  robot.userData.toolHomeQuaternion.setFromEuler(new THREE.Euler(0.3, -0.7, 1.2, 'ZYX'));
  pose.quaternion.setFromEuler(new THREE.Euler(-0.2, 0.4, 0.8, 'ZYX'));
  workObject.quaternion.setFromEuler(new THREE.Euler(0.1, -0.2, 0.5, 'ZYX'));
  const restored = context.getBasePoseFromJogReadout(robot, context.getJogReadoutPose(robot, pose));
  assert.ok(restored.position.distanceTo(pose.position) < 1e-8);
  assert.ok(restored.quaternion.angleTo(pose.quaternion) < 1e-7);
});

test('JOG 회전 직접 입력은 선택 Wobj 회전을 반영하여 목표 자세를 만든다', () => {
  const { context, robot, pose, inputs, target } = fixture();
  context.updateTcpPresentation(robot, pose);
  inputs.rz.value = '0';
  context.applyBaseJogNumericTarget({ currentTarget: inputs.rz });
  const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2, 'ZYX'));
  assert.ok(target().quaternion.angleTo(expected) < 1e-7);
  assert.ok(target().position.distanceTo(pose.position) < 1e-8);
});
