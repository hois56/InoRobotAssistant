import { test, expect } from '@playwright/test';

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) {
  test(`${model} 자동 경로를 자세 유지 MOVL로 생성하고 선택한 두 포인트에 적용한다`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
window.__autoPathTest = { THREE, state, setJointAngle, captureRobotMotionStep, ensureMotionProgram,
    getCurrentTcpPoseBase, solveRobotIK, openAutoPathPanel, generateAutoPath, applyAutoPath,
    createAutoPathCollisionEvaluator, createAutoPathCartesianEdgeChecker };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__autoPathTest);
    await page.locator('#model-select').selectOption(`robot:${model}`);
    await page.waitForFunction(() => window.__autoPathTest.state.models.some(m => m.userData.tcpFrame));
    const result = await page.evaluate(async () => {
      const a = window.__autoPathTest;
      const robot = a.state.models.find(m => m.userData.tcpFrame);
      const initial = robot.userData.joints.length === 4 ? [-30, 70, -50, -40] : [20, -35, 60, 15, 35, 20];
      initial.forEach((angle, i) => a.setJointAngle(robot.userData.joints[i], angle, false));
      const start = a.captureRobotMotionStep(robot, { motion: 'MOVJ', pointIndex: 1 });
      const targetPose = a.getCurrentTcpPoseBase(robot);
      targetPose.position.add(new a.THREE.Vector3(-30, 40, 20));
      const ik = a.solveRobotIK(robot, targetPose);
      if (!ik.success) throw new Error('test target is unreachable');
      const target = a.captureRobotMotionStep(robot, { motion: 'MOVJ', pointIndex: 2 });
      const targetAngles = target.joints.slice();
      const program = a.ensureMotionProgram(robot);
      program.steps = [start, target];
      a.state.activeProgramRobot = robot;
      initial.forEach((angle, i) => a.setJointAngle(robot.userData.joints[i], angle, false));
      a.openAutoPathPanel();
      await a.generateAutoPath();
      const planned = { path: a.state.autoPath.path?.map(q => q.slice()), motion: a.state.autoPath.motion,
        status: document.querySelector('#auto-path-status').textContent };
      if (!planned.path) return { planned };
      const evaluator = a.createAutoPathCollisionEvaluator(robot, initial);
      const safeEdge = a.createAutoPathCartesianEdgeChecker(robot, evaluator, evaluator.isSafe, () => false, performance.now() + 5000);
      const safe = await safeEdge(planned.path[0], planned.path.at(-1));
      const preview = a.state.autoPath.previewGroup.children[0].geometry.attributes.position.count;
      a.applyAutoPath();
      return { planned, safe, preview, targetAngles, initial, steps: program.steps.map(s => ({ id: s.id, motion: s.motion, joints: s.joints })),
        startId: start.id, targetId: target.id };
    });
    expect(result.planned.path, result.planned.status).toBeTruthy();
    expect(result.planned.motion).toBe('MOVL');
    expect(result.planned.path[0]).toEqual(result.initial);
    expect(result.planned.path.at(-1)).toEqual(result.targetAngles);
    expect(result.safe).toBe(true);
    expect(result.preview).toBeGreaterThanOrEqual(2);
    expect(result.steps.map(s => s.id)).toEqual([result.startId, result.targetId]);
    expect(result.steps.at(-1).motion).toBe('MOVL');
    expect(errors).toEqual([]);
  });
}

test('SCARA Tool의 직선 이동이 넓은 장애물에 막히면 안전한 우회 궤적을 적용한다', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
window.__autoPathObstacle = { THREE, state, setJointAngle, captureRobotMotionStep, ensureMotionProgram,
    getCurrentTcpPoseBase, getRobotControllerBaseFrame, solveRobotIK, openAutoPathPanel, generateAutoPath,
    applyAutoPath, createPrimitiveShapeRoot, getRobotToolMountFrame, createAutoPathCollisionEvaluator,
    createAutoPathCartesianEdgeChecker };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__autoPathObstacle);
  await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
  await page.waitForFunction(() => window.__autoPathObstacle.state.models.some(m => m.userData.tcpFrame));
  const result = await page.evaluate(async () => {
    const a = window.__autoPathObstacle, robot = a.state.models.find(m => m.userData.tcpFrame);
    [-30, 70, -150, -40].forEach((v, i) => a.setJointAngle(robot.userData.joints[i], v, false));
    const orientation = a.getCurrentTcpPoseBase(robot).quaternion;
    const move = y => {
      const target = { position: new a.THREE.Vector3(420, y, 0), quaternion: orientation.clone() };
      // Preserve the model's current vertical reference while moving in XY.
      target.position.z = a.getCurrentTcpPoseBase(robot).position.z;
      if (!a.solveRobotIK(robot, target).success) throw new Error('unreachable obstacle fixture endpoint');
      return a.captureRobotMotionStep(robot, { motion: 'MOVJ', pointIndex: y < 0 ? 1 : 2 });
    };
    const start = move(-130), target = move(130);
    const base = a.getRobotControllerBaseFrame(robot);
    const tool = a.createPrimitiveShapeRoot('box', { x: 12, y: 12, z: 12 }, { name: '경로 검사 Tool' });
    a.state.scene.add(tool);
    tool.position.copy(a.getCurrentTcpPoseBase(robot).position).applyMatrix4(base.matrixWorld);
    tool.updateMatrixWorld(true);
    a.getRobotToolMountFrame(robot).attach(tool);
    tool.userData.attachmentHost = robot;
    tool.userData.placement = 'tcp';
    a.state.models.push(tool);
    const obstacle = a.createPrimitiveShapeRoot('box', { x: 100, y: 100, z: 60 }, { name: '우회 검사 장애물' });
    obstacle.position.set(420, 0, a.getCurrentTcpPoseBase(robot).position.z).applyMatrix4(base.matrixWorld);
    a.state.scene.add(obstacle);
    a.state.models.push(obstacle);
    const program = a.ensureMotionProgram(robot);
    program.steps = [start, target];
    a.state.activeProgramRobot = robot;
    start.joints.forEach((v, i) => a.setJointAngle(robot.userData.joints[i], v, false));
    const evaluator = a.createAutoPathCollisionEvaluator(robot, start.joints);
    const check = a.createAutoPathCartesianEdgeChecker(robot, evaluator, evaluator.isSafe, () => false, Infinity);
    const direct = await check(start.joints, target.joints);
    const endpointSafety = [evaluator.isSafe(start.joints), evaluator.isSafe(target.joints)];
    a.openAutoPathPanel();
    const startedAt = performance.now();
    await a.generateAutoPath();
    const path = a.state.autoPath.path?.map(q => q.slice());
    const report = { direct, endpointSafety, path, motion: a.state.autoPath.motion,
      elapsed: performance.now() - startedAt, status: document.querySelector('#auto-path-status').textContent };
    if (path) {
      report.safe = true;
      for (let i = 1; i < path.length; i++) report.safe &&= await check(path[i - 1], path[i]);
      a.applyAutoPath();
      report.count = program.steps.length;
      report.ids = [program.steps[0].id, program.steps.at(-1).id];
      report.expectedIds = [start.id, target.id];
    }
    return report;
  });
  expect(result.endpointSafety).toEqual([true, true]);
  expect(result.direct).toBe(false);
  expect(result.path, result.status).toBeTruthy();
  expect(result.path.length).toBeGreaterThan(2);
  expect(result.path.length).toBeLessThanOrEqual(42);
  expect(result.motion).toBe('MOVL');
  expect(result.safe).toBe(true);
  expect(result.count).toBe(result.path.length);
  expect(result.ids).toEqual(result.expectedIds);
  expect(result.elapsed).toBeLessThan(10000);
});
