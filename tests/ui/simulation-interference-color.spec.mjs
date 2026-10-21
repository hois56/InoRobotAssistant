import { test, expect } from '@playwright/test';

for (const method of ['diagonal', 'fourPointsHeight']) {
  test(`outside ${method} monitoring box stays blue with Out[0] ON and clears after leaving`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__interferenceColor={state,THREE,getInterferenceZoneProbes,getInterferenceZoneWorkObjectReference,getRobotToolMountFrame,evaluateInterferenceZones,updateInterferenceZoneVisuals};' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__interferenceColor);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__interferenceColor.state.models.some(model => model.userData.tcpFrame));
    const states = await page.evaluate(method => {
      const a = window.__interferenceColor, robot = a.state.activeArticulatedModel;
      const zone = a.state.interferenceZones[0];
      Object.assign(zone, { activate: true, monitoringObjectId: 0, outSignal: 0, triggerAlarmAndStop: true });
      const object = a.state.endMonitoringObjects[0];
      object.type = 'cuboid';
      Object.assign(object.cuboid, { method, p1: [-150, -100, 0], p2: [150, 100, 100],
        points: [[-176.777, -35.355, 0], [-35.355, -176.777, 0], [176.777, 35.355, 0], [35.355, 176.777, 0]], height: 100 });
      const box = a.getInterferenceZoneProbes(zone, robot)[0];
      const extents = [0, 1, 2].map(index => box.halfSizes.reduce((sum, half, i) => sum + half * Math.abs(box.axes[i].getComponent(index)), 0));
      const axis = extents.indexOf(Math.min(...extents));
      zone.geometry.p1 = box.center.toArray().map(value => value - 50);
      zone.geometry.p2 = box.center.toArray().map(value => value + 50);
      zone.geometry.p1[axis] = box.center.getComponent(axis) - extents[axis] - 60;
      zone.geometry.p2[axis] = box.center.getComponent(axis) - extents[axis] - 10;
      a.updateInterferenceZoneVisuals();
      const snapshot = () => ({ status: a.state.interferenceRuntime[0].status,
        alarm: a.state.interferenceRuntime[0].alarmLatched, output: a.state.simulationIo.outputs[0],
        zoneColor: a.state.interferenceVisuals[0].fill.material.color.getHex(),
        objectColor: a.state.endMonitoringVisuals[0].materials[0].color.getHex() });
      a.evaluateInterferenceZones(); a.evaluateInterferenceZones();
      const outside = snapshot();
      const frame = a.getRobotToolMountFrame(robot), original = frame.position.clone();
      const reference = a.getInterferenceZoneWorkObjectReference(zone, robot);
      const shift = new a.THREE.Vector3().setComponent(axis, -extents[axis] - 35)
        .applyQuaternion(reference.quaternion)
        .applyQuaternion(frame.parent.getWorldQuaternion(new a.THREE.Quaternion()).invert());
      frame.position.add(shift);
      a.evaluateInterferenceZones();
      const inside = snapshot();
      frame.position.copy(original);
      a.evaluateInterferenceZones(); a.evaluateInterferenceZones();
      return { outside, inside, returned: snapshot() };
    }, method);
    const clear = { status: 'active', alarm: false, output: true, zoneColor: 0x2563eb, objectColor: 0x14b8a6 };
    expect(states.outside).toEqual(clear);
    expect(states.inside).toEqual({ status: 'stopped', alarm: true, output: false, zoneColor: 0xef4444, objectColor: 0xef4444 });
    expect(states.returned).toEqual(clear);
    expect(errors).toEqual([]);
  });
}
