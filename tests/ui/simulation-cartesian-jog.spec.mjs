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

for (const mode of ['translate', 'rotate']) {
  test(`직교 핸들은 잡을 수 있는 위치에서만 강조되고 드래그된다 (${mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await setup(page);
    await page.locator('#btn-jog-base-mode').click();
    await page.locator(`#btn-base-gizmo-${mode}`).click();
    const samples = await page.evaluate(mode => {
      const { state, THREE } = window.__cartesianJog;
      const controls = state.baseJogTransformControls;
      const target = controls.object;
      const center = target.getWorldPosition(new THREE.Vector3());
      const eye = new THREE.Vector3(1, -1, 0.85).applyQuaternion(target.getWorldQuaternion(new THREE.Quaternion()));
      state.controls.target.copy(center);
      state.camera.position.copy(center).addScaledVector(eye, 1200);
      state.controls.update();
      controls.updateMatrixWorld(true);
      const canvas = state.renderer.domElement.getBoundingClientRect();
      const gizmo = controls.children.find(child => child.isTransformControlsGizmo).gizmo[mode];
      function screen(handle, local) {
        const p = handle.localToWorld(local).project(state.camera);
        return new THREE.Vector2(canvas.x + (p.x + 1) * canvas.width / 2, canvas.y + (1 - p.y) * canvas.height / 2);
      }
      if (mode === 'rotate') {
        const ring = gizmo.getObjectByName('Z');
        const { radialSegments, tubularSegments } = ring.geometry.parameters;
        // Average a cross section to get a point on the drawn arc's centerline.
        const onRing = new THREE.Vector3();
        for (let j = 0; j < radialSegments; j++) {
          const index = j * (tubularSegments + 1) + Math.round(tubularSegments / 3);
          onRing.add(new THREE.Vector3().fromBufferAttribute(ring.geometry.attributes.position, index));
        }
        onRing.divideScalar(radialSegments);
        return [
          ['Z', screen(ring, onRing.clone())], [null, screen(ring, onRing.clone().multiplyScalar(1.12))],
          [null, screen(ring, onRing.clone().negate())]
        ];
      }
      return ['X', 'Y', 'Z'].flatMap((name, index) => {
        const handle = gizmo.getObjectByName(name);
        const at = distance => screen(handle, new THREE.Vector3().setComponent(index, distance));
        const shaft = at(0.40), head = at(0.54);
        const direction = head.clone().sub(shaft).normalize();
        const beside = shaft.clone().add(new THREE.Vector2(-direction.y, direction.x).multiplyScalar(8));
        return [[name, shaft], [name, head], [null, beside], [null, at(-0.40)]];
      });
    }, mode);
    const handleColors = () => page.evaluate(() => {
      const controls = window.__cartesianJog.state.baseJogTransformControls;
      const gizmo = controls.children.find(child => child.isTransformControlsGizmo).gizmo[controls.mode];
      return gizmo.children
        .filter(handle => handle.isMesh && handle.visible && !handle.userData.baseJogActiveStroke
          && ['X', 'Y', 'Z'].includes(handle.name))
        .map(handle => [handle.name, handle.material.color.getHexString()]);
    });
    const normalColors = await handleColors();
    async function expectHover([axis, point]) {
      await page.mouse.move(point.x, point.y);
      const hovered = await page.evaluate(() => window.__cartesianJog.state.baseJogTransformControls.axis);
      expect(hovered, `hover at ${point.x}, ${point.y}`).toBe(axis);
      await expect.poll(handleColors).toEqual(
        normalColors.map(([name, color]) => [name, name === axis ? 'b45309' : color])
      );
    }
    for (const sample of samples) await expectHover(sample);
    await expectHover(samples[0]);
    await expectHover([null, { x: 10, y: 10 }]);
    // Press a visible handle before the empty click hands the gesture to camera navigation.
    for (const [axis, point] of [samples[0], samples.find(([name]) => name === null)]) {
      const before = await snapshot(page);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      const dragging = await page.evaluate(() => window.__cartesianJog.state.baseJogGizmoDragging);
      await page.mouse.move(point.x + 8, point.y - 3, { steps: 3 });
      await page.mouse.up();
      expect(dragging).toBe(axis !== null);
      const after = await snapshot(page);
      if (axis) {
        const component = mode === 'translate' ? 'position' : 'quaternion';
        expect(after[component]).not.toEqual(before[component]);
      } else {
        expect(after.position).toEqual(before.position);
        expect(after.quaternion).toEqual(before.quaternion);
      }
    }
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
