import { test, expect } from '@playwright/test';

async function setup(page, model) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__programJog = { state, setJointAngle, captureCurrentTcpTarget, captureRobotMotionStep, ensureMotionProgram, createMotionSegment, advanceMotionSegment, finishRobotMotionSession, getCurrentTcpPoseBase, animateOlpJointMove };' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__programJog);
  await page.locator('#model-select').selectOption(`robot:${model}`);
  await page.waitForFunction(() => window.__programJog.state.models.some(m => m.userData.tcpFrame));
  await page.locator('#btn-jog-base-mode').click();
  await page.locator('#base-move-step').focus();
  await page.locator('#base-move-step').fill('1');
  await expect(page.locator('#base-move-step')).toHaveValue('1');
  await page.evaluate(() => {
    const a = window.__programJog, robot = a.state.models.find(m => m.userData.tcpFrame);
    const initial = robot.userData.joints.length === 4 ? [20, -50, -40, 10] : [20, -35, 60, 15, 35, 20];
    initial.forEach((angle, i) => a.setJointAngle(robot.userData.joints[i], angle, false));
    a.captureCurrentTcpTarget(robot);
  });
}

async function pose(page) {
  return page.evaluate(() => {
    const a = window.__programJog, robot = a.state.models.find(m => m.userData.tcpFrame);
    const current = a.getCurrentTcpPoseBase(robot);
    return { position: current.position.toArray(), rotation: current.quaternion.toArray(), cached: robot.userData.baseJogTarget.position.toArray() };
  });
}

for (const model of ['IR-S7-60Z20', 'IR-R10H-120']) {
  for (const completed of [false, true]) {
    test(`${model} 프로그램 ${completed ? '이동 완료' : '이동 중 정지'} 후 현재 위치에서 JOG를 이어간다`, async ({ page }) => {
      await setup(page, model);
      await page.evaluate(completed => {
        const a = window.__programJog, robot = a.state.models.find(m => m.userData.tcpFrame);
        const initial = robot.userData.joints.map(joint => joint.angle);
        a.setJointAngle(robot.userData.joints[0], initial[0] + 15, false);
        const step = a.captureRobotMotionStep(robot);
        const program = a.ensureMotionProgram(robot); program.steps = [step];
        initial.forEach((angle, i) => a.setJointAngle(robot.userData.joints[i], angle, false));
        a.captureCurrentTcpTarget(robot);
        const session = { robot, steps: [step], cursor: 0, direction: 1, repeat: false, reverseRepeat: false, reachedStepIds: new Set() };
        session.segment = a.createMotionSegment(session, 0);
        let done = false;
        for (let tick = 0; tick <= (completed ? 3000 : 12) && !done; tick++) done = a.advanceMotionSegment(session, tick * 16);
        if (completed) {
          if (!done) throw new Error('프로그램 이동이 완료되지 않았습니다.');
          // Program and JOG robot selection can differ while running several robots.
          a.state.activeArticulatedModel = null;
          a.finishRobotMotionSession(session, 'completed');
        }
      }, completed);
      const before = await pose(page);
      await page.locator('[data-base-jog="move"][data-axis="z"][data-direction="1"]').click();
      const after = await pose(page);
      for (let axis = 0; axis < 3; axis++) expect(after.position[axis] - before.position[axis]).toBeCloseTo(axis === 2 ? 1 : 0, 2);
    });
  }
}

test('OLP 이동을 취소한 뒤 좌표 입력 JOG는 정지한 위치의 다른 축을 유지한다', async ({ page }) => {
  await setup(page, 'IR-S7-60Z20');
  await page.evaluate(async () => {
    const a = window.__programJog, robot = a.state.models.find(m => m.userData.tcpFrame);
    const angles = robot.userData.joints.map(joint => joint.angle); angles[0] += 30;
    const runtime = { cancelled: false };
    try {
      await a.animateOlpJointMove(robot, angles, 50, { runtime, onProgress: ({ progress }) => { if (progress > 0.1) runtime.cancelled = true; } });
      throw new Error('이동 취소가 재현되지 않았습니다.');
    } catch (error) { if (error.message !== 'OLP stopped') throw error; }
  });
  const before = await pose(page);
  await page.locator('#tcp-z').focus();
  await page.locator('#tcp-z').fill(String(before.position[2] + 1));
  await page.locator('#tcp-z').press('Tab');
  const after = await pose(page);
  for (let axis = 0; axis < 3; axis++) expect(after.position[axis] - before.position[axis]).toBeCloseTo(axis === 2 ? 1 : 0, 2);
});
