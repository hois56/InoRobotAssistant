import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createSeededRandom, planJointPath, planJointWaypointGraph } from '../../2_3DSimulation/path-planning-core.mjs';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const functions = names => names.map(name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');
const bounds = [{ min: 0, max: 10 }, { min: 0, max: 10 }];
const safe = q => !(q[0] > 4 && q[0] < 6 && q[1] > 2 && q[1] < 8);
const edge = (a, b) => Array.from({ length: 201 }, (_, i) => a.map((v, j) => v + (b[j] - v) * i / 200)).every(safe);

test('RRT detours retain the selected start and target for either tree direction', async () => {
  for (let seed = 0; seed < 20; seed++) {
    const result = await planJointPath({ start: [1, 5], goal: [9, 5], bounds,
      isStateSafe: safe, edgeIsSafe: edge, random: createSeededRandom(seed), stepSize: 0.12,
      maxTimeMs: 2000, maxNodes: 2000, onYield() {} });
    assert.equal(result.success, true, `seed ${seed}`);
    assert.deepEqual(result.path[0], [1, 5], `seed ${seed}: start`);
    assert.deepEqual(result.path.at(-1), [9, 5], `seed ${seed}: target`);
    assert.ok(result.path.slice(1).every((q, i) => edge(result.path[i], q)));
  }
});

test('RRT validates the complete bridge between its two trees', async () => {
  const checked = new Set();
  let direct = true;
  const result = await planJointPath({ start: [0, 0], goal: [10, 0], bounds,
    sampleStates: [[2, 2]], stepSize: 0.16, onYield() {},
    edgeIsSafe(a, b) {
      if (direct) { direct = false; return false; }
      checked.add(JSON.stringify([a, b]));
      checked.add(JSON.stringify([b, a]));
      return true;
    } });
  assert.equal(result.success, true);
  result.path.slice(1).forEach((q, i) => assert.ok(checked.has(JSON.stringify([result.path[i], q])), 'unchecked bridge'));
});

test('a trapped RRT yields so the UI can cancel even when no nodes are added', async () => {
  let cancelled = false, yields = 0;
  const result = await planJointPath({ start: [0, 0], goal: [10, 0], bounds,
    edgeIsSafe: () => false, maxTimeMs: 35, yieldEvery: 8,
    shouldCancel: () => cancelled, onYield() { yields++; cancelled = true; } });
  assert.ok(yields > 0);
  assert.equal(result.reason, 'cancelled');
});

test('the waypoint graph checks the useful route before unrelated dense links', async () => {
  let checks = 0;
  const result = await planJointWaypointGraph({ start: [1, 5], goal: [9, 5], bounds,
    candidates: [[1, 1], [9, 1], ...Array.from({ length: 50 }, (_, i) => [0.1 + i / 100, 9])],
    neighbors: 60, maxNeighbors: 60, maxTimeMs: 2000, onYield() {},
    edgeIsSafe: (a, b) => { checks++; return edge(a, b); } });
  assert.equal(result.success, true);
  assert.ok(checks < 60, `${checks} edge checks for a simple detour`);
});

test('planning a robot is not blocked by cached collisions elsewhere in the scene', () => {
  const robot = { userData: {} }, other = { userData: {} }, obstacle = { userData: {} };
  const c = vm.createContext({ state: { collision: { system: {
    prepare() {}, checkAll: () => [{ objectA: other, objectB: obstacle }]
  } } }, getCollisionModels: () => [robot, other, obstacle],
    asCollisionResults: hits => hits, applyPlanningJointAngles() {}, isSimulationCollisionPair() {}, shouldCheckSceneCollisionMeshes() {} });
  vm.runInContext(functions(['createAutoPathCollisionEvaluator']), c);
  assert.equal(c.createAutoPathCollisionEvaluator(robot, [0]).isSafe([0]), true);
});

function cartesianFixture() {
  const robot = { userData: { joints: Array.from({ length: 4 }, (_, i) => ({ angle: 0,
    definition: { min: -1000, max: 1000, type: i < 3 ? 'prismatic' : 'revolute' } })) } };
  const apply = (_, angles) => robot.userData.joints.forEach((joint, i) => { joint.angle = angles[i]; });
  const pose = angles => ({ position: new THREE.Vector3(...angles.slice(0, 3)),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(angles[3] || 0)) });
  const context = vm.createContext({ THREE, performance, planJointWaypointGraph,
    requestAnimationFrame: cb => cb(), MOTION_MOVL_SAMPLE_DISTANCE: 12, MOTION_MOVL_SAMPLE_ANGLE: 2.5,
    applyPlanningJointAngles: apply, getCurrentTcpPoseBase: () => pose(robot.userData.joints.map(j => j.angle)),
    getAutoPathPointPoseAtJoints: (_, angles) => pose(angles),
    interpolateLinearPosition: (a, b, t) => a.map((v, i) => v + (b[i] - v) * t),
    slerpQuaternion: (a, b, t) => new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b), t).toArray(),
    solveRobotIK(_, target) { target.position.toArray().forEach((v, i) => { robot.userData.joints[i].angle = v; }); return { success: true }; },
    solveAutoPathGoalCandidates: (_, target) => [{ angles: [...target.position.toArray(), 0] }],
    buildAutoPathCartesianWaypointPoses: () => [[0, 60, 0, 0], [100, 60, 0, 0]].map(pose) });
  vm.runInContext(functions(['autoPathJointBounds', 'autoPathJointDistance', 'autoPathJointEdgeChecker',
    'solveAutoPathLinear', 'createAutoPathCartesianEdgeChecker', 'solveAutoPathCartesianWaypointRoute',
    'solveAutoPathClearanceRoute']), context);
  return { robot, context, pose };
}

test('Cartesian planning connects two clearance corners when no single waypoint works', async () => {
  const { robot, context: c, pose } = cartesianFixture();
  const start = [0, 0, 0, 0], goal = [100, 0, 0, 0];
  const isSafe = q => !(q[0] > 40 && q[0] < 60 && Math.abs(q[1]) < 40);
  const result = await c.solveAutoPathCartesianWaypointRoute(robot, start, goal, pose(start), pose(goal), [],
    { isSafe }, isSafe, () => false, undefined, performance.now() + 2000, true);
  assert.ok(result, 'a two-corner MOVL detour exists');
  assert.equal(result.motion, 'MOVL');
  assert.equal(result.path.length, 4);
  assert.deepEqual(Array.from(result.path[0]), start);
  assert.deepEqual(Array.from(result.path.at(-1)), goal);
});

test('MOVL planning rejects an endpoint on a discontinuous wrist branch', async () => {
  const { robot, context: c, pose } = cartesianFixture();
  const result = await c.solveAutoPathLinear(robot, [0, 0, 0, 0], pose([0, 0, 0]), pose([100, 0, 0]),
    { isSafe: () => true }, () => false, undefined, { finalAngles: [100, 0, 0, 180] });
  assert.equal(result, null, 'a final wrist teleport must not count as a reachable MOVL');
});

test('held-orientation edges exclude teaching hints with a different TCP direction', async () => {
  const { robot, context: c } = cartesianFixture();
  const check = c.createAutoPathCartesianEdgeChecker(robot, { isSafe: () => true }, () => true,
    () => false, Infinity, new THREE.Quaternion());
  assert.equal(await check([0, 0, 0, 0], [10, 0, 0, 0]), true);
  assert.equal(await check([0, 0, 0, 90], [10, 0, 0, 90]), false);
});

test('clearance routes register only their turning points, independently of sampling density', async () => {
  const { robot, context: c, pose } = cartesianFixture();
  c.getAutoPathObstacleTopInBase = () => 100;
  const start = [0, 0, 0, 0], goal = [900, 0, 0, 0];
  const result = await c.solveAutoPathClearanceRoute(robot, start, pose(start), pose(goal), [],
    { isSafe: () => true }, () => false, undefined, Infinity, () => true, goal);
  assert.equal(result.length, 4);
  assert.deepEqual(Array.from(result.at(-1)), goal);
});

test('MOVJ previews draw the sampled TCP curve and restore the robot pose', () => {
  let angle = 0;
  const robot = { userData: { joints: [{ definition: { min: -180, max: 180 } }] } };
  const state = { scene: new THREE.Scene(), autoPath: { motion: 'MOVJ' } };
  const c = vm.createContext({ THREE, state, clearAutoPathPreview() {}, requestRender() {},
    applyPlanningJointAngles: (_, q) => { angle = q[0]; },
    autoPathJointBounds: () => [{ sampleStep: 8 }],
    getCurrentTcpPoseBase: () => ({ position: new THREE.Vector3(Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180), 0) }),
    getRobotControllerBaseFrame: () => ({ matrixWorld: new THREE.Matrix4() }) });
  vm.runInContext(functions(['buildAutoPathPreview']), c);
  c.buildAutoPathPreview(robot, [[0], [180]], [35]);
  const positions = state.autoPath.previewGroup.children[0].geometry.attributes.position;
  assert.ok(positions.count > 10);
  assert.ok(Array.from({ length: positions.count }, (_, i) => positions.getY(i)).some(y => y > 0.9));
  assert.equal(angle, 35);
});

test('orientation hold keeps a clear Cartesian route as MOVL', async () => {
  const robot = { userData: { joints: [{ angle: 0 }], tcpFrame: {} } };
  const steps = [{ id: 'start', joints: [0], motion: 'MOVJ' }, { id: 'target', joints: [10], motion: 'MOVJ' }];
  const autoPath = { active: true, robot, startStepId: 'start', targetStepId: 'target' };
  const c = vm.createContext({ THREE, performance, console, state: { autoPath },
    el: { btnAutoPathGenerate: {}, btnAutoPathApply: {} }, isMotionActive: () => false,
    readAutoPathSettings: () => ({ holdOrientation: true, maxTimeMs: 1000, maxPoints: 40 }),
    clearAutoPathPreview() {}, updateMotionUiLock() {}, setAutoPathStatus() {}, refreshAutoPathUi() {},
    ensureMotionProgram: () => ({ steps }), getAutoPathPointSteps: () => steps, validateMovjTarget() {},
    autoPathJointBounds: () => [{ min: -100, max: 100 }], isMotionPointMotion: () => true,
    resolveAutoPathPointPose: () => ({ pose: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() } }),
    getCollisionModels: () => [robot], isAutoPathTargetInsideModel: () => false,
    createAutoPathCollisionEvaluator: () => ({ isSafe: () => true }), autoPathJointEdgeChecker: () => () => true,
    createAutoPathCartesianEdgeChecker: () => async () => true,
    solveAutoPathLinear: async () => [[0], [10]], appendAutoPathTarget: path => path,
    autoPathJointDistance: (a, b) => Math.abs(a[0] - b[0]), verifyAutoPathTargetApproach: async () => true,
    applyPlanningJointAngles() {}, buildAutoPathPreview() {} });
  vm.runInContext(functions(['generateAutoPath']), c);
  await c.generateAutoPath();
  assert.ok(autoPath.path);
  assert.equal(autoPath.motion, 'MOVL');
});
