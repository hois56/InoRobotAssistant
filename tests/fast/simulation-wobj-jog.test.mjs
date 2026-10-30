import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['getRobotControllerBaseFrame', 'getJogReadoutPose', 'getBasePoseFromJogReadout', 'getTcpRotationDegrees',
  'quaternionFromTcpRotationDegrees', 'normalizeDegrees', 'updateJogWorkObjectUi', 'updateTcpPresentation',
  'getCartesianJogFrame', 'getCartesianJogReadout', 'getBasePoseFromCartesianJog',
  'beginBaseJogNumericHistory', 'finishBaseJogNumericHistory',
  'applyBaseJogNumericTarget', 'jogTcpInBase', 'runJogRobotBatch', 'applyJogPoseDelta', 'getBaseJogRotationAxes'];
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
  const context = vm.createContext({ THREE, WOBJ_WORLD_INDEX: 0, state: { jogCartesianFrame: 'wobj' },
    SIX_AXIS_POSITION_HOME_QUATERNION: new THREE.Quaternion(), robot,
    el: { tcpReadouts: inputs, baseJogView: { querySelectorAll: () => titles }, baseMoveStep: { value: '10' }, baseRotateStep: { value: '5' } },
    document: { activeElement: null, getElementById: () => label },
    uiText: value => value, resolveWorkObjectIndex: value => Number(value) || 0,
    getWorkObjectWorldPose: () => workObject, getJogTargetRobot: () => robot, getJogTargetRobots: () => [robot],
    getCurrentTcpPoseBase: target => target.userData.baseJogTarget,
    syncTcpVisualAtPose() {}, captureSceneSnapshot: () => ({}), commitPendingHistory() {},
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

test('직교 베이스 선택은 활성 Wobj의 원점과 회전에 영향을 받지 않는다', () => {
  const { context, robot, pose, inputs, target } = fixture();
  context.state.jogCartesianFrame = 'base';
  context.updateTcpPresentation(robot, pose);
  assert.equal(inputs.x.value, '100.00');
  assert.equal(inputs.y.value, '220.00');
  assert.equal(context.jogTcpInBase(robot, 'move', 'x', 1), true);
  assert.ok(target().position.distanceTo(new THREE.Vector3(110, 220, 35)) < 1e-8);
  assert.equal(robot.userData.activeWorkObjectIndex, 1);
});

test('Tool 이동과 회전은 현재 TCP의 축을 따르고 TCP 원점을 유지한다', () => {
  const { context, robot, pose, target } = fixture();
  context.state.jogCartesianFrame = 'tool';
  pose.quaternion.setFromEuler(new THREE.Euler(0.3, -0.4, 0.7, 'ZYX'));
  const before = pose.quaternion.clone();
  const expectedPosition = pose.position.clone().add(new THREE.Vector3(10, 0, 0).applyQuaternion(before));
  assert.equal(context.jogTcpInBase(robot, 'move', 'x', 1), true);
  assert.ok(target().position.distanceTo(expectedPosition) < 1e-8);
  const origin = target().position.clone();
  const expectedRotation = before.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 36));
  assert.equal(context.jogTcpInBase(robot, 'rotate', 'x', 1), true);
  assert.ok(target().quaternion.angleTo(expectedRotation) < 1e-7);
  assert.ok(target().position.distanceTo(origin) < 1e-8);
});

test('Tool 숫자 입력은 편집 시작 TCP를 기준으로 하여 연속 입력을 누적하지 않는다', () => {
  const { context, robot, pose, inputs, target } = fixture();
  context.state.jogCartesianFrame = 'tool';
  pose.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  context.beginBaseJogNumericHistory();
  context.updateTcpPresentation(robot, pose);
  inputs.x.value = '1';
  context.applyBaseJogNumericTarget({ currentTarget: inputs.x });
  inputs.x.value = '10';
  context.applyBaseJogNumericTarget({ currentTarget: inputs.x });
  assert.ok(target().position.distanceTo(new THREE.Vector3(100, 230, 35)) < 1e-8);
  context.document.activeElement = inputs.x;
  context.finishBaseJogNumericHistory();
  assert.equal(context.state.jogToolNumericFrame.robot, robot, '휠 동작 사이에는 편집 기준을 유지한다');
  context.document.activeElement = null;
  context.finishBaseJogNumericHistory();
  assert.equal(context.state.jogToolNumericFrame, null);
  assert.equal(inputs.x.value, '0.00');
});

test('직교 좌표계 선택은 티칭에 사용하는 활성 Wobj 좌표를 바꾸지 않는다', () => {
  const { context, robot, pose } = fixture();
  for (const frame of ['base', 'tool', 'wobj']) {
    context.state.jogCartesianFrame = frame;
    const taught = context.getJogReadoutPose(robot, pose);
    assert.ok(taught.position.distanceTo(new THREE.Vector3(20, 0, 5)) < 1e-8);
  }
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

test('JOG 위치·회전 제목은 BASE와 Wobj를 전환해도 현재 언어로 표시한다', () => {
  const expected = {
    ko: ['TCP 위치 /', 'TCP 회전 /', '베이스'],
    en: ['TCP Position /', 'TCP Rotation /', 'Base'],
    'zh-CN': ['TCP 位置 /', 'TCP 旋转 /', '基座'],
    vi: ['Vị trí TCP /', 'Góc xoay TCP /', 'Đế'],
    tr: ['TCP Konumu /', 'TCP Dönüşü /', 'Taban'],
    ru: ['Позиция TCP /', 'Вращение TCP /', 'База']
  };
  const { context, robot, titles } = fixture();
  for (const [locale, [position, rotation, base]] of Object.entries(expected)) {
    const dictionary = JSON.parse(readFileSync(new URL(`../../Language/${locale}/robot-3d-viewer.json`, import.meta.url), 'utf8')).legacy;
    context.uiText = key => dictionary[key] ?? key;
    for (const index of [0, 2, 0]) {
      robot.userData.activeWorkObjectIndex = index;
      context.updateTcpPresentation(robot);
      const coordinate = index ? 'Wobj[2]' : base;
      assert.equal(titles[0].firstChild.textContent, `${position} ${coordinate}`, `${locale}: position`);
      assert.equal(titles[1].firstChild.textContent, `${rotation} ${coordinate}`, `${locale}: rotation`);
    }
  }
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

test('동시 좌표 입력은 기준 Wobj의 공간 방향으로 통일하고 로봇 간 위치 차이를 유지한다', () => {
  const { context, robot, pose, inputs } = fixture();
  const second = new THREE.Group();
  second.position.set(500, 300, 0);
  second.rotation.z = Math.PI / 2;
  second.userData = { activeWorkObjectIndex: 0, joints: [], tcpFrame: new THREE.Group(),
    toolHomeQuaternion: new THREE.Quaternion(),
    baseJogTarget: { position: new THREE.Vector3(50, 80, 10), quaternion: new THREE.Quaternion() } };
  context.getJogTargetRobots = () => [robot, second];
  context.updateTcpPresentation(robot, pose);
  inputs.x.value = '30';
  context.applyBaseJogNumericTarget({ currentTarget: inputs.x });
  assert.ok(robot.userData.baseJogTarget.position.distanceTo(new THREE.Vector3(100, 230, 35)) < 1e-8);
  assert.ok(second.userData.baseJogTarget.position.distanceTo(new THREE.Vector3(60, 80, 10)) < 1e-8);
  const firstBefore = robot.userData.baseJogTarget.quaternion.clone();
  const secondBefore = second.userData.baseJogTarget.quaternion.clone();
  context.updateTcpPresentation(robot);
  inputs.rz.value = '-80';
  context.applyBaseJogNumericTarget({ currentTarget: inputs.rz });
  assert.ok(Math.abs(robot.userData.baseJogTarget.quaternion.angleTo(firstBefore) - Math.PI / 18) < 1e-7);
  assert.ok(Math.abs(second.userData.baseJogTarget.quaternion.angleTo(secondBefore) - Math.PI / 18) < 1e-7);
});

for (const yaw of [Math.PI / 2, Math.PI]) {
  test(`방향이 다른 로봇도 동시 BASE 버튼을 누르면 같은 공간 방향으로 이동한다 (${yaw})`, () => {
    const { context, robot } = fixture();
    robot.userData.activeWorkObjectIndex = 0;
    const second = new THREE.Group();
    second.position.set(700, 300, 50);
    second.rotation.z = yaw;
    second.userData = { activeWorkObjectIndex: 0, joints: [], tcpFrame: new THREE.Group(),
      toolHomeQuaternion: new THREE.Quaternion(),
      baseJogTarget: { position: new THREE.Vector3(50, 80, 10), quaternion: new THREE.Quaternion() } };
    context.getJogTargetRobots = () => [robot, second];
    const before = [robot, second].map(target => target.localToWorld(target.userData.baseJogTarget.position.clone()));
    assert.equal(context.jogTcpInBase(robot, 'move', 'x', 1), true);
    [robot, second].forEach((target, index) => {
      const delta = target.localToWorld(target.userData.baseJogTarget.position.clone()).sub(before[index]);
      assert.ok(delta.distanceTo(new THREE.Vector3(10, 0, 0)) < 1e-8, `공간 이동량: ${delta.toArray()}`);
    });
  });
}

test('서로 다른 Wobj와 회전된 BASE에서도 좌표 입력과 핸들의 공간 이동·회전이 일치한다', () => {
  const { context, robot, inputs } = fixture();
  const second = new THREE.Group();
  second.position.set(-500, 300, 90);
  second.rotation.set(0.3, -0.6, Math.PI);
  const frame = new THREE.Group();
  frame.position.set(15, -20, 100);
  frame.rotation.set(-0.1, 0.2, 0.4);
  second.add(frame);
  second.userData = { activeWorkObjectIndex: 0, joints: [], tcpFrame: new THREE.Group(),
    controllerBaseFrame: frame, toolHomeQuaternion: new THREE.Quaternion(),
    baseJogTarget: { position: new THREE.Vector3(50, 80, 10),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.5, -0.7)) } };
  context.getJogTargetRobots = () => [robot, second];
  const world = target => {
    const base = context.getRobotControllerBaseFrame(target);
    base.updateWorldMatrix(true, false);
    return { position: base.localToWorld(target.userData.baseJogTarget.position.clone()),
      quaternion: base.getWorldQuaternion(new THREE.Quaternion()).multiply(target.userData.baseJogTarget.quaternion) };
  };
  let before = [robot, second].map(world);
  context.updateTcpPresentation(robot);
  inputs.x.value = '30';
  context.applyBaseJogNumericTarget({ currentTarget: inputs.x });
  [robot, second].map(world).forEach((pose, index) => {
    assert.ok(pose.position.clone().sub(before[index].position).distanceTo(new THREE.Vector3(0, 10, 0)) < 1e-8);
  });
  before = [robot, second].map(world);
  const desired = { position: robot.userData.baseJogTarget.position.clone().add(new THREE.Vector3(3, -2, 1)),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.1)
      .multiply(robot.userData.baseJogTarget.quaternion) };
  assert.equal(context.applyJogPoseDelta(robot, desired), true);
  [robot, second].map(world).forEach((pose, index) => {
    assert.ok(pose.position.clone().sub(before[index].position).distanceTo(new THREE.Vector3(3, -2, 1)) < 1e-8);
    const delta = pose.quaternion.clone().multiply(before[index].quaternion.clone().invert());
    assert.ok(delta.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.1)) < 1e-7);
  });
});
