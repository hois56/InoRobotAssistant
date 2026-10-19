import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');

function fixture() {
  const robots = [0, 1, 2].map(index => {
    const robot = new THREE.Group();
    robot.userData = { motionInstanceId: `robot-${index}`, tcpFrame: new THREE.Group(),
      baseJogTarget: { position: new THREE.Vector3(index * 100, 0, 0), quaternion: new THREE.Quaternion() },
      joints: [{ definition: { name: 'J1', type: 'revolute', min: -90, max: 90 }, angle: index * 20 }],
      manifest: { ikRotationAxes: index === 1 ? ['z'] : ['x', 'y', 'z'] } };
    return robot;
  });
  const state = { models: robots, selectedModel: robots[0], activeArticulatedModel: robots[0], jogSelectedRobotIds: null };
  const calls = [], statuses = [];
  const context = vm.createContext({ THREE, state,
    getArticulatedRobots: () => state.models,
    getCurrentTcpPoseBase: robot => robot.userData.baseJogTarget,
    getJointJogDisplaySpec: joint => ({ unit: '°', toDisplay: value => value, fromDisplay: value => value }),
    setJointAngle: (joint, value) => { joint.angle = value; },
    captureCurrentTcpTarget() {}, syncJointControls() {}, updateTcpPresentation() {}, syncBaseJogGizmoFromRobot() {},
    queueCollaborationRobotState: robot => calls.push(robot.userData.motionInstanceId),
    setBaseJogStatus: (...args) => statuses.push(args), clearJogCollisionLock() {} });
  const names = ['getJogTargetRobot', 'getJogTargetRobots', 'getBaseJogRotationAxes', 'getSharedJogRotationAxes',
    'runJogRobotBatch', 'applyJointJogValue'];
  for (const name of names) {
    const fn = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(fn, `${name} 구현이 있어야 합니다.`);
    vm.runInContext(fn[0], context);
  }
  return { robots, state, calls, statuses, context };
}

test('기본 JOG는 기존 단일 선택을 유지하고 체크한 로봇만 동시 대상으로 삼는다', () => {
  const { robots, state, context } = fixture();
  assert.deepEqual([...context.getJogTargetRobots()], [robots[0]]);
  state.jogSelectedRobotIds = new Set(['robot-1', 'robot-2', 'deleted']);
  assert.deepEqual([...context.getJogTargetRobots()], [robots[1], robots[2]]);
  assert.equal(context.getJogTargetRobot(), robots[1]);
  state.jogSelectedRobotIds.clear();
  assert.deepEqual([...context.getJogTargetRobots()], []);
});

test('혼합 모델의 BASE 회전축은 모든 선택 로봇이 지원하는 축만 허용한다', () => {
  const { state, context } = fixture();
  state.jogSelectedRobotIds = new Set(['robot-0', 'robot-1']);
  assert.deepEqual([...context.getSharedJogRotationAxes()], ['z']);
});

test('관절 동시 JOG는 각 로봇의 기존 자세 차이를 유지하고 미선택 로봇은 움직이지 않는다', () => {
  const { robots, state, context } = fixture();
  state.jogSelectedRobotIds = new Set(['robot-0', 'robot-1']);
  assert.equal(context.applyJointJogValue(robots[0], robots[0].userData.joints[0], 15), true);
  assert.deepEqual(robots.map(robot => robot.userData.joints[0].angle), [15, 35, 40]);
});

test('한 로봇이 한계에 도달하면 관절 동시 JOG 전체를 되돌린다', () => {
  const { robots, state, context } = fixture();
  state.jogSelectedRobotIds = new Set(['robot-0', 'robot-1']);
  robots[1].userData.joints[0].angle = 89;
  assert.equal(context.applyJointJogValue(robots[0], robots[0].userData.joints[0], 5), false);
  assert.deepEqual(robots.map(robot => robot.userData.joints[0].angle), [0, 89, 40]);
});

test('두 번째 로봇의 IK 실패는 앞서 움직인 로봇의 관절과 TCP 목표까지 복원한다', () => {
  const { robots, context } = fixture();
  const before = robots.map(robot => robot.userData.baseJogTarget.position.clone());
  const ok = context.runJogRobotBatch(robots.slice(0, 2), robot => {
    robot.userData.joints[0].angle = 70;
    robot.userData.baseJogTarget.position.x += 10;
    return robot === robots[0];
  });
  assert.equal(ok, false);
  assert.deepEqual(robots.map(robot => robot.userData.joints[0].angle), [0, 20, 40]);
  robots.forEach((robot, index) => assert.ok(robot.userData.baseJogTarget.position.distanceTo(before[index]) < 1e-8));
});

test('동시 JOG는 로봇이 2대 이상일 때만 표시하고 1대로 줄면 단일 JOG를 복원한다', () => {
  const { robots, state, context } = fixture();
  let hidden;
  context.el = {
    jogRobotSelection: { classList: { toggle: (_, value) => { hidden = value; } } },
    jogRobotList: { replaceChildren() {} }
  };
  context.document = {
    createElement: () => ({ dataset: {}, append() {} }), createTextNode: value => value
  };
  context.displayNameForModelTree = robot => robot.userData.motionInstanceId;
  context.uiText = value => value;
  const render = source.match(/function renderJogRobotSelection\([^]*?\n\}/)[0];
  vm.runInContext(render, context);
  context.renderJogRobotSelection();
  assert.equal(hidden, false);
  state.jogSelectedRobotIds = new Set();
  state.models = [robots[0]];
  context.renderJogRobotSelection();
  assert.equal(hidden, true);
  assert.equal(state.jogSelectedRobotIds, null);
  assert.deepEqual([...context.getJogTargetRobots()], [robots[0]]);
  state.models = [];
  context.renderJogRobotSelection();
  assert.equal(hidden, true);
});
