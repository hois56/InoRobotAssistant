import { test, expect } from '@playwright/test';

test('shared four-point monitoring height uses each robot flange Z direction in geometry and output detection', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__monitoringHeight={state,THREE,getInterferenceZoneProbes,getInterferenceZoneWorkObjectReference,getRobotToolMountFrame,getRobotToolWorldTransform,updateInterferenceZoneVisuals,recomputeInterferenceOutputs};' });
  });
  await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__monitoringHeight);
  for (const [index, model] of ['robot:IR-R7H-90', 'robot:IR-S7-60Z20'].entries()) {
    await page.locator('#model-select').selectOption(model);
    if (index) await page.locator('#btn-add-robot-model-choice').click();
    await page.waitForFunction(count => window.__monitoringHeight.state.models.filter(robot =>
      robot.userData.tcpFrame).length === count, index + 1);
  }
  const result = await page.evaluate(() => {
    const a = window.__monitoringHeight;
    const robots = a.state.models.filter(robot => robot.userData.tcpFrame);
    const zone = a.state.interferenceZones[0];
    Object.assign(zone, { activate: true, targetRobotId: 'all', monitoringObjectId: 0, outSignal: 0, triggerAlarmAndStop: false });
    const monitoring = a.state.endMonitoringObjects[0];
    monitoring.type = 'cuboid';
    Object.assign(monitoring.cuboid, { method: 'fourPointsHeight',
      points: [[-50, -100, 100], [50, -100, 100], [50, 100, 100], [-50, 100, 100]], height: 100 });
    a.updateInterferenceZoneVisuals();
    const entries = robots.map(robot => {
      const type = robot.userData.manifest.robotType;
      zone.targetRobotId = robot.userData.motionInstanceId;
      const tool = a.getRobotToolWorldTransform(robot);
      const reference = a.getInterferenceZoneWorkObjectReference(zone, robot);
      const probe = a.getInterferenceZoneProbes(zone, robot)[0];
      const localCenter = probe.center.clone().applyQuaternion(reference.quaternion).add(reference.position)
        .sub(tool.position).applyQuaternion(tool.quaternion.clone().invert());
      const frame = a.getRobotToolMountFrame(robot);
      const mesh = a.state.endMonitoringVisuals.find(entry => entry.group.parent === frame).group.children[0];
      const outputs = [50, 150].map(z => {
        const point = new a.THREE.Vector3(0, 0, z).applyQuaternion(tool.quaternion).add(tool.position)
          .sub(reference.position).applyQuaternion(reference.quaternion.clone().invert());
        zone.geometry.p1 = point.toArray().map(value => value - 1);
        zone.geometry.p2 = point.toArray().map(value => value + 1);
        a.recomputeInterferenceOutputs();
        return a.state.simulationIo.outputs[0];
      });
      return { type, visualZ: mesh.position.z, probeZ: localCenter.z, halfZ: probe.halfSizes[2], outputs };
    });
    return { entries, height: monitoring.cuboid.height, pointZ: monitoring.cuboid.points.map(point => point[2]) };
  });
  expect(result.entries).toHaveLength(2);
  for (const entry of result.entries) {
    const scara = entry.type === 'scara';
    expect(entry.visualZ).toBe(scara ? 150 : 50);
    expect(entry.probeZ).toBeCloseTo(scara ? 150 : 50, 7);
    expect(entry.halfZ).toBe(50);
    expect(entry.outputs).toEqual(scara ? [true, false] : [false, true]);
  }
  expect(result.height).toBe(100);
  expect(result.pointZ).toEqual([100, 100, 100, 100]);
  expect(errors).toEqual([]);
});
