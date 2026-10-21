import { test, expect } from '@playwright/test';

for (const [kind, source] of [['real', 'bridge'], ['virtual', 'bridge'], ['real', 'trace']]) {
  test(`${kind} ${source} feedback keeps updating inside local interference without stop or disconnect commands`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__interferenceFeedback={state,ensureVirtualControllerCore,registerVirtualControllerSession,handleVirtualControllerMessage,applyVirtualControllerFrameForController,getInterferenceZoneProbes,evaluateInterferenceZones,updateInterferenceZoneVisuals,getCurrentTcpPoseBase,getJogReadoutPose};' });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__interferenceFeedback);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__interferenceFeedback.state.activeArticulatedModel?.userData.tcpFrame);
    const result = await page.evaluate(async ({ kind, source }) => {
      const a = window.__interferenceFeedback, robot = a.state.activeArticulatedModel;
      const controller = a.state.virtualController;
      await a.ensureVirtualControllerCore(controller);
      a.registerVirtualControllerSession(controller);
      const commands = [];
      const socket = { readyState: WebSocket.OPEN, send: message => commands.push(message), close: () => commands.push('close') };
      Object.assign(controller, { targetRobotId: robot.userData.motionInstanceId, controllerKind: kind, source,
        wanted: true, status: 'streaming', streamWatchdogTimer: 1, socket, sourceConnectedAt: performance.now() });
      const send = tcp => {
        a.handleVirtualControllerMessage(JSON.stringify({ type: 'robotState', data: {
          joints: [20, -30, 40, -110, 60, 200], tcp: [...tcp, 0, 0, 180]
        } }), controller);
        a.applyVirtualControllerFrameForController(performance.now(), controller);
      };
      const pose = () => a.getJogReadoutPose(robot, a.getCurrentTcpPoseBase(robot)).position.toArray();
      send([100, 200, 300]);
      const zone = a.state.interferenceZones[0];
      Object.assign(zone, { activate: true, triggerAlarmAndStop: true, targetRobotId: robot.userData.motionInstanceId });
      const point = a.getInterferenceZoneProbes(zone, robot)[0].center.toArray();
      zone.geometry.p1 = point.map(value => value - 20);
      zone.geometry.p2 = point.map(value => value + 20);
      a.updateInterferenceZoneVisuals();
      a.evaluateInterferenceZones();
      const entered = { status: a.state.interferenceRuntime[0].status,
        alarm: a.state.interferenceRuntime[0].alarmLatched, stopLatch: Boolean(robot.userData.interferenceStopLatched),
        color: a.state.interferenceVisuals[0].fill.material.color.getHex() };
      send([105, 205, 305]);
      a.evaluateInterferenceZones();
      const insidePosition = pose();
      robot.userData.interferenceStopLatched = true;
      send([106, 206, 306]);
      const oldLatchPosition = pose();
      send([400, 500, 600]);
      a.evaluateInterferenceZones(); a.evaluateInterferenceZones();
      return { entered, insidePosition, oldLatchPosition, outsidePosition: pose(),
        outsideStatus: a.state.interferenceRuntime[0].status, lastAppliedSampleId: controller.lastAppliedSampleId,
        wanted: controller.wanted, status: controller.status, sameSocket: controller.socket === socket, commands };
    }, { kind, source });
    expect(result.entered).toEqual({ status: 'danger', alarm: false, stopLatch: false, color: 0xef4444 });
    for (const [key, coordinates] of Object.entries({ insidePosition: [105, 205, 305], oldLatchPosition: [106, 206, 306], outsidePosition: [400, 500, 600] })) {
      result[key].forEach((value, index) => expect(value).toBeCloseTo(coordinates[index], 6));
    }
    expect(result.outsideStatus).toBe('active');
    expect(result.lastAppliedSampleId).toBe(4);
    expect(result.wanted).toBe(true);
    expect(result.status).toBe('streaming');
    expect(result.sameSocket).toBe(true);
    expect(result.commands).toEqual([]);
    await expect(page.locator('#tcp-x')).toHaveValue('400.00');
    expect(errors).toEqual([]);
  });
}
