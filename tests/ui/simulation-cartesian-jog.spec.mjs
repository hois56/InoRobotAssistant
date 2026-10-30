import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
window.__cartesianJog = { state, THREE, getJogTargetRobot, getCurrentTcpPoseBase, getCartesianJogFrame,
  setJointAngle, captureCurrentTcpTarget, setBaseJogGizmoEnabled, beginBaseJogGizmoDrag,
  applyBaseJogGizmoTarget, endBaseJogGizmoDrag, captureMotionPointCoordinates };` });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__cartesianJog);
  await page.locator('#inorobot-language-select').selectOption('ko');
  await page.locator('#model-select').selectOption('robot:IR-R10H-120');
  await page.waitForFunction(() => window.__cartesianJog.getJogTargetRobot()?.userData.tcpFrame);
  await page.evaluate(() => {
    const a = window.__cartesianJog, robot = a.getJogTargetRobot();
    [20, -40, 55, 25, 45, -10].forEach((angle, i) => a.setJointAngle(robot.userData.joints[i], angle, false));
    robot.position.set(200, -100, 40);
    robot.rotation.set(0.1, -0.2, 0.3);
    Object.assign(robot.userData.workObjects[1], { defined: true, position: [200, 100, 50], rotation: [0, 0, 90] });
    robot.userData.activeWorkObjectIndex = 1;
    a.captureCurrentTcpTarget(robot);
  });
  for (const id of ['base-move-step', 'base-rotate-step']) {
    await page.locator(`#${id}`).focus();
    await page.locator(`#${id}`).fill('0.5');
    await expect(page.locator(`#${id}`)).toHaveValue('0.5');
  }
}

async function snapshot(page) {
  return page.evaluate(() => {
    const a = window.__cartesianJog, robot = a.getJogTargetRobot();
    const pose = a.getCurrentTcpPoseBase(robot);
    return { position: pose.position.toArray(), quaternion: pose.quaternion.toArray(),
      frame: a.getCartesianJogFrame(robot, pose).quaternion.toArray(),
      target: robot.userData.baseJogTarget.position.toArray() };
  });
}

async function expectDelta(page, before, distance = 0, degrees = 0) {
  const after = await snapshot(page);
  const errors = await page.evaluate(({ before, after, distance, degrees }) => {
    const T = window.__cartesianJog.THREE;
    const frame = new T.Quaternion().fromArray(before.frame);
    const expectedPosition = new T.Vector3().fromArray(before.position)
      .add(new T.Vector3(distance, 0, 0).applyQuaternion(frame));
    const rotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), T.MathUtils.degToRad(degrees));
    const expectedRotation = frame.clone().multiply(rotation).multiply(frame.clone().invert())
      .multiply(new T.Quaternion().fromArray(before.quaternion));
    return { position: expectedPosition.distanceTo(new T.Vector3().fromArray(after.position)),
      rotation: expectedRotation.angleTo(new T.Quaternion().fromArray(after.quaternion)) };
  }, { before, after, distance, degrees });
  // Readouts round to 0.01 mm; handle IK also has a looser tolerance than button IK.
  expect(errors.position, JSON.stringify({ before, after, errors })).toBeLessThan(0.015);
  expect(errors.rotation).toBeLessThan(0.0001);
}

for (const frame of ['base', 'tool', 'wobj']) {
  test(`직교 ${frame}: 버튼·숫자·3D 핸들이 선택 좌표계의 축을 따른다`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    await expect(page.locator('#btn-jog-base-mode')).toHaveText('직교');
    await expect(page.locator('#jog-cartesian-frame option')).toHaveText(['베이스', 'Tool', 'Wobj']);
    const original = await snapshot(page);
    const taught = await page.evaluate(() => {
      const a = window.__cartesianJog, robot = a.getJogTargetRobot();
      return a.captureMotionPointCoordinates(robot, a.getCurrentTcpPoseBase(robot));
    });
    await page.locator('#jog-cartesian-frame').selectOption(frame);
    expect((await snapshot(page)).position).toEqual(original.position);
    expect(await page.evaluate(() => {
      const a = window.__cartesianJog, robot = a.getJogTargetRobot();
      return a.captureMotionPointCoordinates(robot, a.getCurrentTcpPoseBase(robot));
    })).toEqual(taught);

    let before = await snapshot(page);
    await page.locator('[data-base-jog="move"][data-axis="x"][data-direction="1"]').click();
    await expectDelta(page, before, 0.5);

    before = await snapshot(page);
    const field = page.locator('#tcp-x');
    const current = Number(await field.inputValue());
    await field.focus();
    await field.fill(String(current + 0.1));
    await field.fill(String(current + 0.4));
    await field.press('Tab');
    await expectDelta(page, before, 0.4);
    if (frame === 'tool') await expect(field).toHaveValue('0.00');

    before = await snapshot(page);
    await page.evaluate(() => {
      const a = window.__cartesianJog;
      a.setBaseJogGizmoEnabled(true);
      a.state.baseJogTransformControls.translationSnap = 1;
      a.state.baseJogTransformControls.axis = 'X';
      a.beginBaseJogGizmoDrag();
      const target = a.state.baseJogGizmoTarget;
      target.position.add(new a.THREE.Vector3(1.25, 0, 0).applyQuaternion(target.quaternion));
      a.applyBaseJogGizmoTarget(); a.endBaseJogGizmoDrag();
      a.state.baseJogTransformControls.translationSnap = null;
    });
    // BASE uses absolute grid snapping; Tool/Wobj snap the drag displacement.
    await expectDelta(page, before, frame === 'base' ? Math.round(before.position[0] + 1.25) - before.position[0] : 1);

    before = await snapshot(page);
    await page.locator('[data-base-jog="rotate"][data-axis="x"][data-direction="1"]').click();
    await expectDelta(page, before, 0, 0.5);

    await page.locator('#btn-base-gizmo-rotate').click();
    before = await snapshot(page);
    await page.evaluate(() => {
      const a = window.__cartesianJog;
      a.setBaseJogGizmoEnabled(true); a.beginBaseJogGizmoDrag();
      a.state.baseJogGizmoTarget.quaternion.multiply(new a.THREE.Quaternion()
        .setFromAxisAngle(new a.THREE.Vector3(1, 0, 0), Math.PI / 360));
      a.applyBaseJogGizmoTarget(); a.endBaseJogGizmoDrag();
    });
    await expectDelta(page, before, 0, 0.5);
    await page.screenshot({ path: testInfo.outputPath(`jog-${frame}.png`) });
    expect(errors).toEqual([]);
  });
}
