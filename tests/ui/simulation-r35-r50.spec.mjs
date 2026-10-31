import { test, expect } from '@playwright/test';
for (const [folder, zero] of [['IR-R35-185', [1134.5, 0, 1480]], ['IR-R50-250', [1400, 0, 2035]]]) {
  test(`${folder}: load, joint motion and Cartesian jog`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && r.url().includes(`/models/${folder}/`)) errors.push(`${r.status()} ${r.url()}`); });
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nwindow.__newRobots = { state, THREE, getJogTargetRobot, getCurrentTcpPoseBase, setJointAngle, captureCurrentTcpTarget, requestRender };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.locator('#model-select').selectOption(`robot:${folder}`);
    await page.waitForFunction(() => window.__newRobots?.getJogTargetRobot()?.userData.tcpFrame);
    const result = await page.evaluate(() => {
      const a = window.__newRobots, r = a.getJogTargetRobot();
      r.userData.joints.forEach(j => a.setJointAngle(j, 0, false));
      const home = a.getCurrentTcpPoseBase(r).position.toArray();
      a.setJointAngle(r.userData.joints[0], 30, false);
      const rotated = a.getCurrentTcpPoseBase(r).position.toArray();
      const links = []; r.traverse(m => { if (m.isMesh && /^(P0|J[1-6])$/.test(m.name)) links.push(m.name); });
      r.userData.joints.forEach(j => a.setJointAngle(j, 0, false));
      a.captureCurrentTcpTarget(r);
      const bounds = new a.THREE.Box3().setFromObject(r), target = bounds.getCenter(new a.THREE.Vector3());
      const size = Math.max(...bounds.getSize(new a.THREE.Vector3()).toArray());
      a.state.camera.position.copy(target).add(new a.THREE.Vector3(size * 0.7, -size * 1.7, size * 0.6));
      a.state.controls.target.copy(target); a.state.controls.update(); a.requestRender();
      return { home, rotated, links };
    });
    expect(result.links.sort()).toEqual(['J1','J2','J3','J4','J5','J6','P0']);
    result.home.forEach((v,i) => expect(v).toBeCloseTo(zero[i], 4));
    result.rotated.forEach((v,i) => expect(v).toBeCloseTo([zero[0]*Math.cos(Math.PI/6),zero[0]*Math.sin(Math.PI/6),zero[2]][i],4));
    await page.screenshot({path:test.info().outputPath(`${folder}.png`)});
    await page.locator('#base-move-step').focus();
    await page.locator('#base-move-step').fill('1');
    await expect(page.locator('#base-move-step')).toHaveValue('1');
    await page.locator('[data-base-jog="move"][data-axis="z"][data-direction="-1"]').click();
    await expect.poll(async () => page.evaluate(() => window.__newRobots.getCurrentTcpPoseBase(window.__newRobots.getJogTargetRobot()).position.z)).toBeCloseTo(zero[2]-1,1);
    expect(errors).toEqual([]);
  });
}
