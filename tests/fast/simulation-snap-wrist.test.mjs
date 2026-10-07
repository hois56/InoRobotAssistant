import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const functions = ['applySnapFaceOrientation', 'preferSnapFaceWristConfiguration', 'equivalentJointAngles']
  .map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');

function fixture({ limited = false, offsetTool = false, reachable = true } = {}) {
  const robot = new THREE.Group();
  robot.userData.manifest = { robotType: 'six-axis' };
  const joints = [];
  let parent = robot;
  for (let i = 0; i < 6; i++) {
    const group = new THREE.Group();
    group.position.set(i === 4 ? 300 : i === 5 ? 80 : 0, 0, 0);
    parent.add(group);
    joints.push({ angle: 0, group, axis: new THREE.Vector3(...(i === 4 ? [0, -1, 0] : [1, 0, 0])),
      definition: { type: 'revolute', min: limited && i === 4 ? -10 : -360, max: limited && i === 4 ? 120 : 360 } });
    parent = group;
  }
  const tcp = new THREE.Group();
  if (offsetTool) { tcp.position.set(20, 30, -70); tcp.rotation.set(0.2, 0.3, -0.4); }
  parent.add(tcp);
  robot.userData.joints = joints;
  robot.userData.tcpFrame = tcp;
  const setAngle = (joint, angle) => {
    joint.angle = THREE.MathUtils.clamp(angle, joint.definition.min, joint.definition.max);
    joint.group.quaternion.setFromAxisAngle(joint.axis, THREE.MathUtils.degToRad(joint.angle));
  };
  const pose = () => { robot.updateMatrixWorld(true); return {
    position: tcp.getWorldPosition(new THREE.Vector3()), quaternion: tcp.getWorldQuaternion(new THREE.Quaternion()) }; };
  let solvedPose;
  let history = 0;
  const context = vm.createContext({ THREE, state: { snapMoveMode: true },
    isMotionActive: () => false, getJogTargetRobot: () => robot,
    getActiveSimulationSnapFaceSelection: () => ({}), getSimulationSnapFaceNormal: () => new THREE.Vector3(0, 0, 1),
    getCurrentTcpPoseBase: pose, getRobotControllerBaseFrame: () => robot, setJointAngle: setAngle,
    solveRobotIK: () => {
      [-180, 60, 180].forEach((angle, i) => setAngle(joints[i + 3], angle));
      solvedPose = pose(); return { success: reachable };
    }, captureSceneSnapshot: () => ({}), recordHistory: () => history++,
    setStatus() {}, setBaseJogStatus() {}, syncJointControls() {}, updateTcpPresentation() {},
    syncBaseJogGizmoFromRobot() {}, queueCollaborationRobotState() {}, clearJogCollisionLock() {} });
  vm.runInContext(functions, context);
  return { context, robot, pose, solvedPose: () => solvedPose, history: () => history };
}

for (const offsetTool of [false, true]) test(`수직 면 정렬은 같은 TCP 자세에서 J4 영점 손목을 우선한다 (Tool=${offsetTool})`, () => {
  const f = fixture({ offsetTool });
  assert.equal(f.context.applySnapFaceOrientation('vertical'), true);
  assert.ok(Math.abs(f.robot.userData.joints[3].angle) < 0.001);
  assert.ok(f.pose().position.distanceTo(f.solvedPose().position) < 0.001);
  assert.ok(f.pose().quaternion.angleTo(f.solvedPose().quaternion) < 1e-7);
  assert.equal(f.history(), 1);
});

test('대체 손목 자세가 J5 한계를 벗어나면 기존 유효 해를 유지한다', () => {
  const f = fixture({ limited: true });
  assert.equal(f.context.applySnapFaceOrientation('vertical'), true);
  assert.equal(f.robot.userData.joints[3].angle, -180);
  assert.equal(f.robot.userData.joints[4].angle, 60);
});

test('수평 면 정렬의 기존 손목 선택을 유지한다', () => {
  const f = fixture();
  assert.equal(f.context.applySnapFaceOrientation('horizontal'), true);
  assert.equal(f.robot.userData.joints[3].angle, -180);
});

test('도달 불가 면 정렬은 모든 관절을 복원하고 이력을 남기지 않는다', () => {
  const f = fixture({ reachable: false });
  assert.equal(f.context.applySnapFaceOrientation('vertical'), false);
  assert.ok(f.robot.userData.joints.every(joint => joint.angle === 0));
  assert.equal(f.history(), 0);
});
