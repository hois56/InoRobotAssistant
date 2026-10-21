import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const trigger = source.match(/function triggerInterferenceZoneAlarm\([^]*?\n\}/)[0];

for (const linked of [true, false]) {
  test(`interference ${linked ? 'warns without stopping controller feedback' : 'still stops an offline simulation'}`, () => {
    const runtime = { alarmLatched: false, status: 'active' };
    const robot = { userData: { motionInstanceId: 'robot1' } };
    const stops = [], messages = [];
    const context = vm.createContext({
      Set, isVirtualControllerActiveForRobot: candidate => candidate === robot && linked,
      getInterferenceZoneRuntime: () => runtime,
      stopRobotMotions: robots => stops.push(...robots),
      getInterferenceZoneRobotLabel: () => 'robot1',
      setMotionProgramStatus: text => messages.push(text), setStatus: text => messages.push(text)
    });
    vm.runInContext(trigger, context);
    context.triggerInterferenceZoneAlarm({ id: 0 }, robot);
    assert.equal(runtime.alarmLatched, !linked);
    assert.equal(Boolean(robot.userData.interferenceStopLatched), !linked);
    assert.equal(stops.length, linked ? 0 : 1);
    assert.equal(messages.length, linked ? 0 : 2);
  });
}
