import { test, expect } from '@playwright/test';

for (const source of ['offline', 'bridge', 'trace']) {
  test(`네 패드 다중 점 TCP 계산 후에도 중심과 Tool 형상이 일치한다 (${source})`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nwindow.__tcpMultiPoint = { state, THREE, setJointAngle, syncActiveTcpFrame, refreshTcpProfileUi, getCurrentTcpPoseBase, getTcpRotationDegrees, ensureVirtualControllerCore, registerVirtualControllerSession, handleVirtualControllerMessage, applyVirtualControllerFrameForController, handleTcpSnapSelection, getTcpSnapCenter, applyTcpMultiPointCenter, applyTcpProfileEditor };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__tcpMultiPoint?.state.workspaceRecovery.ready);
    await page.locator('#model-select').selectOption('robot:IR-R7H-90');
    await page.waitForFunction(() => window.__tcpMultiPoint.state.activeArticulatedModel?.userData.tcpFrame);
    const result = await page.evaluate(async source => {
      const a = window.__tcpMultiPoint, T = a.THREE, robot = a.state.activeArticulatedModel;
      robot.userData.activeTcpProfileIndex = 2;
      robot.userData.tcpProfiles[2].position.set(48.5, 77.5, 149.2);
      a.syncActiveTcpFrame(robot);
      a.refreshTcpProfileUi(robot);
      const joints = [20, -40, 100, 0, 30, 0];
      joints.forEach((angle, index) => a.setJointAngle(robot.userData.joints[index], angle, false));
      const tool = new T.Group();
      tool.userData = { uploaded: true, placement: 'tcp', attachmentHost: robot };
      robot.userData.flangeFrame.add(tool);
      a.state.models.push(tool);
      const pads = [[-30, -40], [30, -40], [30, 40], [-30, 40]].map(([x, y]) => {
        const pad = new T.Mesh(new T.CircleGeometry(12, 32), new T.MeshBasicMaterial());
        pad.position.set(48.5 + x, 77.5 + y, 149.7);
        tool.add(pad);
        return pad;
      });
      const pose = a.getCurrentTcpPoseBase(robot), rotation = a.getTcpRotationDegrees(robot, pose);
      const tcp = [...pose.position.toArray(), rotation.rz, 0, 0];
      const controller = a.state.virtualController;
      if (source !== 'offline') {
        await a.ensureVirtualControllerCore(controller);
        a.registerVirtualControllerSession(controller);
        controller.targetRobotId = robot.userData.motionInstanceId;
        controller.source = source; controller.wanted = true; controller.status = 'streaming';
        controller.sourceConnectedAt = performance.now(); controller.streamWatchdogTimer = 1;
      }
      const feedback = () => {
        if (source === 'offline') return;
        const data = source === 'bridge' ? { joints, tcp } : { joints,
          ...Object.fromEntries(['x', 'y', 'z', 'a', 'b', 'c'].map((axis, index) => [`pos_${axis}`, tcp[index]])) };
        a.handleVirtualControllerMessage(JSON.stringify({ type: source === 'bridge' ? 'robotState' : 'traceData', data }), controller);
        a.applyVirtualControllerFrameForController(performance.now(), controller);
      };
      const points = () => pads.map(pad => pad.getWorldPosition(new T.Vector3()));
      const center = () => points().reduce((sum, point) => sum.add(point), new T.Vector3()).multiplyScalar(0.25);
      feedback();
      const initial = points(), originalCenter = center();
      a.state.tcpSnapMode = true; a.state.tcpSnapType = 'multi-point-center'; a.state.tcpSnapPoints = [];
      initial.forEach(worldPoint => a.handleTcpSnapSelection({ type: 'circle-center', worldPoint }));
      const selectedCenter = a.getTcpSnapCenter().clone();
      a.applyTcpMultiPointCenter();
      const calculated = robot.userData.tcpLiveProfile.position.toArray();
      const error = () => ({ tcp: robot.userData.tcpFrame.getWorldPosition(new T.Vector3()).distanceTo(center()),
        selected: robot.userData.tcpFrame.getWorldPosition(new T.Vector3()).distanceTo(originalCenter),
        shape: Math.max(...points().map((point, index) => point.distanceTo(initial[index]))) });
      const beforeFeedback = error();
      feedback(); const afterFeedback = error();
      a.applyTcpProfileEditor();
      feedback(); feedback();
      return { heights: initial.map(point => point.z), selectedCenterError: selectedCenter.distanceTo(originalCenter),
        calculated, beforeFeedback, afterFeedback, afterApply: error(),
        saved: robot.userData.tcpProfiles[2].position.toArray(), joints: robot.userData.joints.map(joint => joint.angle) };
    }, source);
    expect(Math.max(...result.heights) - Math.min(...result.heights)).toBeLessThan(1e-7);
    expect(result.selectedCenterError).toBeLessThan(1e-7);
    expect(result.calculated).toEqual([48.5, 77.5, 149.7]);
    for (const stage of ['beforeFeedback', 'afterFeedback', 'afterApply']) {
      expect(result[stage].tcp, `${stage}: ${JSON.stringify(result)}`).toBeLessThan(0.001);
      expect(result[stage].selected).toBeLessThan(0.001);
      expect(result[stage].shape).toBeLessThan(1e-7);
    }
    expect(result.saved).toEqual(result.calculated);
    expect(result.joints).toEqual([20, -40, 100, 0, 30, 0]);
    expect(errors).toEqual([]);
  });
}
