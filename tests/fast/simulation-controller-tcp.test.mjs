import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { parseVirtualControllerMessage } from '../../2_3DSimulation/virtual-controller-core.mjs';
import * as armParameterCore from '../../2_3DSimulation/arm-parameter-core.mjs';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['getRobotControllerBaseFrame', 'getCurrentTcpPoseBase', 'getJogReadoutPose',
  'getBasePoseFromJogReadout', 'getTcpRotationDegrees', 'quaternionFromTcpRotationDegrees',
  'normalizeDegrees', 'applyVirtualControllerFrameForController', 'calculatePointArmParameters',
  'quaternionErrorVector', 'restoreControllerToolFrame', 'applyControllerTcpPose', 'syncActiveTcpFrame', 'clearVirtualControllerIo', 'disconnectVirtualController'];
const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');

function fixture({ wobj = 0, tool = false, scara = false, trace = false } = {}) {
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
  const context = vm.createContext({ THREE, ...armParameterCore, WOBJ_WORLD_INDEX: 0,
    SIX_AXIS_POSITION_HOME_QUATERNION: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI, -Math.PI / 2, 0, 'ZYX')),
    state: { activeArticulatedModel: robot, virtualController: controller },
    el: { baseJogView: { classList: { contains: () => true } } },
    resolveWorkObjectIndex: value => Number(value) || 0, getWorkObjectWorldPose: () => workObject,
    isVirtualControllerSourceLive: () => true, getVirtualControllerTargetRobot: () => robot,
    refreshVirtualControllerUi() {}, setVirtualControllerStatus() {},
    setJointAngle: (joint, angle) => { joint.angle = angle; },
    getJointJogDisplaySpec: () => ({ fromDisplay: angle => angle * 20 / 360 }),
    ensureRobotTcpProfiles: robot => robot.userData.tcpProfiles,
    queueCollaborationRobotState() {}, syncJointControls() {}, updateTcpPresentation() {}, syncWorkOriginOutputStates() {},
    updateScaraTube() {}, syncOlpHomeStatus() {},
    syncBaseJogGizmoFromRobot() {}, markSceneCollisionDirty() {}, requestRender() {},
    sendCollaborationRobotState() {}, closeVirtualControllerSocket() {},
    clearVirtualControllerStreamWatchdog() {}, refreshViewPresetsUi() {}, removeVirtualControllerSession() {} });
  vm.runInContext(functions, context);
  function send(tcpValues = [708, -292, 215, 0, 0, 180], jointOffset = 0) {
    const joints = scara ? [20, -30, 360, 40] : [20, -30, 40, -110, 60, 200];
    joints[0] += jointOffset;
    const data = trace
      ? { joints, ...Object.fromEntries(['x', 'y', 'z', 'a', 'b', 'c'].map((key, index) => [`pos_${key}`, tcpValues[index]])) }
      : { joints, tcp: tcpValues };
    const parsed = parseVirtualControllerMessage({ type: trace ? 'traceData' : 'robotState', data });
    sample = { ...parsed, sampleId: (sample?.sampleId || 0) + 1 };
    context.applyVirtualControllerFrameForController(100, controller);
  }
  return { context, robot, flange, tcp, mountedTool, original, send, controller };
}

test('Trace TCP feedback preserves calibrated positions independently of nominal links and joints', () => {
  const f = fixture({ trace: true, wobj: 1, tool: true });
  f.send([708.321, -292.456, 215.789, 20, 30, 40]);
  const pose = f.context.getJogReadoutPose(f.robot, f.context.getCurrentTcpPoseBase(f.robot));
  assert.ok(pose.position.distanceTo(new THREE.Vector3(708.321, -292.456, 215.789)) < 1e-8);
  assert.deepEqual(f.robot.userData.joints.map(joint => joint.angle), [20, -30, 40, -110, 60, 200]);
  assert.deepEqual(Array.from(f.context.calculatePointArmParameters(f.robot)), [0, -2, 2, 1]);
});

test('TCP readout remains controller feedback when nominal forward kinematics changes', () => {
  const f = fixture({ tool: true });
  f.send();
  f.flange.parent.position.x += 0.75;
  const pose = f.context.getJogReadoutPose(f.robot, f.context.getCurrentTcpPoseBase(f.robot));
  assert.ok(pose.position.distanceTo(new THREE.Vector3(708, -292, 215)) < 1e-8);
});

test('controller rotation is preserved at SCARA tilted Wobj and Euler singularities', () => {
  for (const scara of [false, true]) {
    const f = fixture({ wobj: 1, scara });
    f.send([500, 100, 200, 190, 90, 30]);
    const readout = f.robot.userData.controllerTcpPose?.readout;
    assert.ok(readout, 'keep the reported Cartesian pose separate from the nominal model');
    assert.deepEqual(Array.from(readout.rotation), [190, 90, 30]);
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 6, Math.PI / 2, 190 * Math.PI / 180, 'ZYX'));
    const pose = f.context.getJogReadoutPose(f.robot, f.context.getCurrentTcpPoseBase(f.robot));
    assert.ok(pose.quaternion.angleTo(expected) < 1e-7);
    f.send([500, 100, 200, -170, 90, 30]);
    assert.deepEqual(Array.from(f.robot.userData.controllerTcpPose.readout.rotation), [-170, 90, 30]);
  }
});

test('Trace requires a complete finite TCP pose and retains joint-only feedback', () => {
  for (const bad of [undefined, null, '', 'bad', Infinity]) {
    const parsed = parseVirtualControllerMessage({ type: 'traceData', data: {
      joints: [0, 0, 0, 0], pos_x: 1, pos_y: 2, pos_z: 3, pos_a: 0, pos_b: 0, pos_c: bad
    } });
    assert.equal(parsed.kind, 'state');
    assert.equal(parsed.position, null);
    assert.equal(parsed.rotation, null);
  }
});

for (const wobj of [0, 1]) {
  test(`controller TCP drives readout with Wobj ${wobj}, preserving tool mount, joints and arm parameters`, () => {
    const f = fixture({ wobj, tool: true });
    f.send();
    const pose = f.context.getCurrentTcpPoseBase(f.robot);
    const readout = f.context.getJogReadoutPose(f.robot, pose);
    assert.ok(readout.position.distanceTo(new THREE.Vector3(708, -292, 215)) < 1e-8);
    const expectedRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0, 'ZYX'));
    assert.ok(readout.quaternion.angleTo(expectedRotation) < 1e-7);
    assert.ok(f.flange.position.distanceTo(f.original.position) < 1e-8);
    assert.ok(f.flange.quaternion.angleTo(f.original.quaternion) < 1e-7);
    assert.deepEqual(f.robot.userData.joints.map(joint => joint.angle), [20, -30, 40, -110, 60, 200]);
    assert.deepEqual(Array.from(f.context.calculatePointArmParameters(f.robot)), [0, -2, 2, 1]);
    const firstPosition = pose.position.clone();
    f.send();
    assert.ok(f.context.getCurrentTcpPoseBase(f.robot).position.distanceTo(firstPosition) < 1e-8, 'correction must not accumulate');
  });
}

test('controller TCP changes never move the physical tool mounting zero', () => {
  const f = fixture({ tool: true });
  const originalTool = f.mountedTool.position.clone();
  for (const tcp of [[708, -292, 215, 0, 0, 180], [100, 200, 300, 40, 20, 10]]) {
    f.send(tcp);
    assert.ok(f.flange.position.distanceTo(f.original.position) < 1e-8);
    assert.ok(f.flange.quaternion.angleTo(f.original.quaternion) < 1e-7);
    assert.ok(f.mountedTool.position.distanceTo(originalTool) < 1e-8);
  }
});

test('missing TCP and disconnect restore the authored tool mount without changing the TCP profile', () => {
  const f = fixture({ tool: true });
  const profilePosition = f.tcp.position.clone();
  const profileRotation = f.tcp.quaternion.clone();
  f.send();
  assert.ok(f.flange.position.distanceTo(f.original.position) < 1e-8);
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

test('simulation interference stop never blocks subsequent controller positions', () => {
  const f = fixture();
  f.robot.userData.interferenceStopLatched = true;
  f.send([100, 200, 300, 0, 0, 180]);
  assert.equal(f.controller.lastAppliedSampleId, 1);
  f.send([400, 500, 600, 0, 0, 180]);
  assert.equal(f.controller.lastAppliedSampleId, 2);
  const pose = f.context.getJogReadoutPose(f.robot, f.context.getCurrentTcpPoseBase(f.robot));
  assert.ok(pose.position.distanceTo(new THREE.Vector3(400, 500, 600)) < 1e-8);
  assert.equal(f.controller.wanted, true);
  assert.equal(f.controller.status, 'streaming');
});

for (const scara of [false, true]) for (const wobj of [0, 1]) {
  test(`controller feedback keeps physical TCP and mounted Tool together at the wrist (SCARA ${scara}, Wobj ${wobj})`, () => {
    const f = fixture({ scara, wobj, tool: true });
    const profilePosition = f.tcp.position.clone(), profileQuaternion = f.tcp.quaternion.clone();
    const parent = f.flange.parent;
    f.send([453.4, -283.32, 516.23, -90, 0, 0]);
    const reported = f.context.getCurrentTcpPoseBase(f.robot);
    const base = f.robot.userData.controllerBaseFrame;
    const expectedPosition = base.localToWorld(reported.position.clone());
    const expectedQuaternion = base.getWorldQuaternion(new THREE.Quaternion()).multiply(reported.quaternion);
    assert.ok(f.tcp.getWorldPosition(new THREE.Vector3()).distanceTo(expectedPosition) < 1e-8);
    assert.ok(f.tcp.getWorldQuaternion(new THREE.Quaternion()).angleTo(expectedQuaternion) < 1e-7);
    // Physical TCP and Tool must share the same joint-driven mounting frame.
    assert.ok(f.mountedTool.getWorldPosition(new THREE.Vector3()).distanceTo(expectedPosition) < 1e-8);
    assert.ok(f.tcp.position.distanceTo(profilePosition) < 1e-8);
    assert.ok(f.tcp.quaternion.angleTo(profileQuaternion) < 1e-7);
    const toolPosition = f.mountedTool.getWorldPosition(new THREE.Vector3());
    f.send([453.4, -283.32, 516.23, -90, 0, 0]);
    assert.ok(f.mountedTool.getWorldPosition(new THREE.Vector3()).distanceTo(toolPosition) < 1e-8);
    f.context.disconnectVirtualController(f.controller);
    assert.equal(f.flange.parent, parent);
    assert.equal(parent.children.filter(child => child.name === 'Controller flange correction').length, 0);
  });
}

test('editing a local Tool preserves the physical mount through feedback and disconnect keeps the selected profile', () => {
  const f = fixture({ tool: true });
  f.send();
  const before = f.flange.matrixWorld.clone();
  f.robot.userData.activeTcpProfileIndex = 1;
  f.robot.userData.tcpProfiles = [null, { position: new THREE.Vector3(-50, 70, 200), quaternion: new THREE.Quaternion() }];
  f.context.syncActiveTcpFrame(f.robot);
  assert.ok(f.flange.matrixWorld.elements.every((value, i) => Math.abs(value - before.elements[i]) < 1e-8));
  assert.equal(f.robot.userData.controllerToolFrame.profileDirty, true);
  const expectedTcp = f.tcp.getWorldPosition(new THREE.Vector3());
  // Fresh feedback retains the controller's Tool definition and must not
  // recalibrate the mount using the newly edited local Tool.
  f.send();
  assert.equal(f.robot.userData.controllerToolFrame.profileDirty, false);
  assert.ok(f.flange.matrixWorld.elements.every((value, i) => Math.abs(value - before.elements[i]) < 1e-8));
  assert.ok(f.tcp.getWorldPosition(new THREE.Vector3()).distanceTo(expectedTcp) < 1e-8);
  f.context.disconnectVirtualController(f.controller);
  assert.deepEqual(f.tcp.position.toArray(), [-50, 70, 200]);
  assert.deepEqual(f.tcp.quaternion.toArray(), [0, 0, 0, 1]);
});

for (const scara of [false, true]) for (const trace of [false, true]) {
  test(`local TCP edits preserve controller-driven Tool motion (SCARA ${scara}, Trace ${trace})`, () => {
    const reference = fixture({ scara, trace, wobj: 1, tool: true });
    const edited = fixture({ scara, trace, wobj: 1, tool: true });
    reference.send(); edited.send();
    edited.robot.userData.activeTcpProfileIndex = 1;
    edited.robot.userData.tcpProfiles = [null, {
      position: new THREE.Vector3(30, -20, 150.5),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    }];
    edited.context.syncActiveTcpFrame(edited.robot);
    for (const [tcp, jointOffset] of [
      [[708, -292, 215, 0, 0, 180], 0],
      [[718, -282, 220, 20, 0, 180], 1],
      [[730, -270, 230, 40, 0, 180], 2]
    ]) {
      reference.send(tcp, jointOffset); edited.send(tcp, jointOffset);
      const expected = reference.mountedTool.getWorldPosition(new THREE.Vector3());
      const expectedRotation = reference.mountedTool.getWorldQuaternion(new THREE.Quaternion());
      assert.ok(edited.mountedTool.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-8);
      assert.ok(edited.mountedTool.getWorldQuaternion(new THREE.Quaternion()).angleTo(expectedRotation) < 1e-7);
      assert.deepEqual(Array.from(edited.robot.userData.controllerTcpPose.readout.position.toArray()), tcp.slice(0, 3));
    }
    assert.deepEqual(edited.tcp.position.toArray(), [30, -20, 150.5]);
  });
}

for (const scara of [false, true]) for (const trace of [false, true]) {
  test(`controller Wobj edits preserve the physical mounting during subsequent motion (SCARA ${scara}, Trace ${trace})`, () => {
    const f = fixture({ scara, trace, tool: true, wobj: 1 });
    f.send([500, 100, 200, 0, 0, 0]);
    const before = f.mountedTool.getWorldPosition(new THREE.Vector3());
    const beforeRotation = f.mountedTool.getWorldQuaternion(new THREE.Quaternion());
    const physical = f.context.getCurrentTcpPoseBase(f.robot);
    // A translated/rotated controller Wobj changes Cartesian values, never joints.
    f.send([100, -500, 50, -90, 0, 0]);
    assert.ok(f.mountedTool.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-7);
    assert.ok(f.mountedTool.getWorldQuaternion(new THREE.Quaternion()).angleTo(beforeRotation) < 1e-7);
    const readout = f.context.getJogReadoutPose(f.robot, f.context.getCurrentTcpPoseBase(f.robot));
    assert.deepEqual(readout.position.toArray(), [100, -500, 50]);
    f.send([110, -500, 50, -90, 0, 0], 1);
    // Fixture joints do not implement FK; move the wrist to represent joint motion.
    f.flange.parent.position.x += 10;
    f.send([9000, -8000, 7000, 120, 20, -30], 2);
    const expectedTool = f.flange.localToWorld(f.mountedTool.position.clone());
    assert.ok(f.mountedTool.getWorldPosition(new THREE.Vector3()).distanceTo(expectedTool) < 1e-7);
    assert.deepEqual(f.context.getJogReadoutPose(f.robot, f.context.getCurrentTcpPoseBase(f.robot)).position.toArray(), [9000, -8000, 7000]);
    const moved = f.mountedTool.getWorldPosition(new THREE.Vector3());
    assert.ok(moved.distanceTo(before) > 1);
    f.send([9000, -8000, 7000, 120, 20, -30], 2);
    assert.ok(f.mountedTool.getWorldPosition(new THREE.Vector3()).distanceTo(moved) < 1e-7);
    f.context.disconnectVirtualController(f.controller);
    f.controller.wanted = true;
    f.flange.parent.position.x -= 10;
    f.send([500, 100, 200, 0, 0, 0]);
    assert.ok(f.context.getCurrentTcpPoseBase(f.robot).position.distanceTo(physical.position) < 1e-7);
  });
}

for (const scara of [false, true]) for (const trace of [false, true]) {
  test(`controller TCP never detaches the flange from the wrist, including the first sample (SCARA ${scara}, Trace ${trace})`, () => {
    const f = fixture({ scara, trace, tool: true, wobj: 1 });
    const parent = f.flange.parent;
    const toolPosition = f.mountedTool.getWorldPosition(new THREE.Vector3());
    const toolRotation = f.mountedTool.getWorldQuaternion(new THREE.Quaternion());
    for (const [tcp, offset] of [
      [[5000, -3000, 1000, 90, 0, 0], 0],
      [[-2000, 8000, -1000, -90, 0, 0], 0],
      [[-1900, 8100, -900, -80, 0, 0], 1]
    ]) {
      f.send(tcp, offset);
      assert.equal(f.flange.parent, parent, 'the Tool must stay directly attached to the authored wrist');
      assert.ok(f.mountedTool.getWorldPosition(new THREE.Vector3()).distanceTo(toolPosition) < 1e-7);
      assert.ok(f.mountedTool.getWorldQuaternion(new THREE.Quaternion()).angleTo(toolRotation) < 1e-7);
      assert.deepEqual(f.context.getJogReadoutPose(f.robot, f.context.getCurrentTcpPoseBase(f.robot)).position.toArray(), tcp.slice(0, 3));
    }
  });
}
