import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { parseVirtualControllerMessage } from '../../2_3DSimulation/virtual-controller-core.mjs';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['getRobotControllerBaseFrame', 'getCurrentTcpPoseBase', 'getJogReadoutPose',
  'getBasePoseFromJogReadout', 'getTcpRotationDegrees', 'quaternionFromTcpRotationDegrees',
  'normalizeDegrees', 'applyVirtualControllerFrameForController', 'calculatePointArmParameters',
  'pointQuadrantIndex', 'quaternionErrorVector', 'restoreControllerToolFrame', 'applyControllerTcpPose', 'disconnectVirtualController'];
const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');

function fixture({ wobj = 0, tool = false, scara = false } = {}) {
  const robot = new THREE.Group();
  const base = new THREE.Group();
  base.position.set(0, 0, 350);
  robot.position.set(50, -80, 25);
  robot.rotation.set(0.1, -0.2, 0.3);
  robot.add(base);
  const wrist = new THREE.Group();
  wrist.position.set(708.26, -292.15, 216.31);
  wrist.rotation.set(0.2, -0.4, 0.1);
  base.add(wrist);
  const flange = new THREE.Group();
  flange.rotation.set(0, Math.PI / 2, Math.PI);
  wrist.add(flange);
  const tcp = new THREE.Group();
  if (tool) {
    tcp.position.set(30, -20, 150);
    tcp.rotation.set(0.2, 0.1, -0.3);
  }
  flange.add(tcp);
  const mountedTool = new THREE.Group();
  mountedTool.position.copy(tcp.position);
  mountedTool.quaternion.copy(tcp.quaternion);
  flange.add(mountedTool);
  const original = { position: flange.position.clone(), quaternion: flange.quaternion.clone() };
  robot.userData = { controllerBaseFrame: base, flangeFrame: flange, tcpFrame: tcp,
    toolHomeQuaternion: flange.quaternion.clone(), activeWorkObjectIndex: wobj,
    manifest: { robotType: scara ? 'scara' : 'six-axis' },
    joints: Array.from({ length: scara ? 4 : 6 }, () => ({ angle: 0 })) };
  const workObject = { position: new THREE.Vector3(130, -70, 40),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.2, 0.5, 'ZYX')) };
  const controller = { wanted: true, core: {}, status: 'streaming', source: 'bridge',
    lastAppliedSampleId: 0, lastRateUpdateAt: 0, socketGeneration: 0,
    pendingInterferenceReads: new Map(), pendingInterferenceToolReads: new Map(),
    samples: { getLatest: () => sample, clear() {} } };
  let sample;
  const context = vm.createContext({ THREE, WOBJ_WORLD_INDEX: 0,
    SIX_AXIS_POSITION_HOME_QUATERNION: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI, -Math.PI / 2, 0, 'ZYX')),
    state: { activeArticulatedModel: robot, virtualController: controller },
    el: { baseJogView: { classList: { contains: () => true } } },
    resolveWorkObjectIndex: value => Number(value) || 0, getWorkObjectWorldPose: () => workObject,
    isVirtualControllerSourceLive: () => true, getVirtualControllerTargetRobot: () => robot,
    refreshVirtualControllerUi() {}, setVirtualControllerStatus() {},
    setJointAngle: (joint, angle) => { joint.angle = angle; },
    getJointJogDisplaySpec: () => ({ fromDisplay: angle => angle * 20 / 360 }),
    queueCollaborationRobotState() {}, syncJointControls() {}, updateTcpPresentation() {}, syncWorkOriginOutputStates() {},
    updateScaraTube() {}, syncOlpHomeStatus() {},
    syncBaseJogGizmoFromRobot() {}, markSceneCollisionDirty() {}, requestRender() {},
    sendCollaborationRobotState() {}, closeVirtualControllerSocket() {},
    clearVirtualControllerStreamWatchdog() {}, refreshViewPresetsUi() {}, removeVirtualControllerSession() {} });
  vm.runInContext(functions, context);
  function send(tcpValues = [708, -292, 215, 0, 0, 180]) {
    const parsed = parseVirtualControllerMessage({ type: 'robotState',
      data: { joints: scara ? [20, -30, 360, 40] : [20, -30, 40, -110, 60, 200], tcp: tcpValues } });
    sample = { ...parsed, sampleId: (sample?.sampleId || 0) + 1 };
    context.applyVirtualControllerFrameForController(100, controller);
  }
  return { context, robot, flange, tcp, mountedTool, original, send, controller };
}

for (const wobj of [0, 1]) {
  test(`controller TCP drives endpoint and attached tool with Wobj ${wobj}, preserving joints and arm parameters`, () => {
    const f = fixture({ wobj, tool: true });
    f.send();
    const pose = f.context.getCurrentTcpPoseBase(f.robot);
    const readout = f.context.getJogReadoutPose(f.robot, pose);
    assert.ok(readout.position.distanceTo(new THREE.Vector3(708, -292, 215)) < 1e-8);
    const expectedRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0, 'ZYX'));
    assert.ok(readout.quaternion.angleTo(expectedRotation) < 1e-7);
    assert.ok(f.tcp.getWorldPosition(new THREE.Vector3()).distanceTo(f.mountedTool.getWorldPosition(new THREE.Vector3())) < 1e-8);
    assert.deepEqual(f.robot.userData.joints.map(joint => joint.angle), [20, -30, 40, -110, 60, 200]);
    assert.deepEqual(Array.from(f.context.calculatePointArmParameters(f.robot)), [0, -2, 2, 1]);
    const firstPosition = pose.position.clone();
    f.send();
    assert.ok(f.context.getCurrentTcpPoseBase(f.robot).position.distanceTo(firstPosition) < 1e-8, 'correction must not accumulate');
  });
}

test('missing TCP and disconnect restore the authored tool mount without changing the TCP profile', () => {
  const f = fixture({ tool: true });
  const profilePosition = f.tcp.position.clone();
  const profileRotation = f.tcp.quaternion.clone();
  f.send();
  assert.ok(f.flange.position.distanceTo(f.original.position) > 1);
  f.send([]);
  assert.ok(f.flange.position.distanceTo(f.original.position) < 1e-8);
  assert.ok(f.flange.quaternion.angleTo(f.original.quaternion) < 1e-7);
  f.send();
  f.context.disconnectVirtualController(f.controller);
  assert.ok(f.flange.position.distanceTo(f.original.position) < 1e-8);
  assert.ok(f.flange.quaternion.angleTo(f.original.quaternion) < 1e-7);
  assert.ok(f.tcp.position.distanceTo(profilePosition) < 1e-8);
  assert.ok(f.tcp.quaternion.angleTo(profileRotation) < 1e-7);
});

test('SCARA endpoint uses Wobj TCP while keeping motor angle conversion for the vertical joint', () => {
  const f = fixture({ scara: true, wobj: 1, tool: true });
  f.send([500, 100, 200, 40, 0, 0]);
  const pose = f.context.getJogReadoutPose(f.robot, f.context.getCurrentTcpPoseBase(f.robot));
  assert.ok(pose.position.distanceTo(new THREE.Vector3(500, 100, 200)) < 1e-8);
  assert.equal(f.robot.userData.joints[2].angle, 20);
});
