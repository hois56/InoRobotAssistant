import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const fn = source.match(/function isModelMotionActive\([^]*?\n\}/)[0];
test('Tool/Wobj editing ignores controller connection while keeping program motion locked', () => {
  const robot = { userData: { motionInstanceId: 'robot' } };
  let session = null;
  const context = vm.createContext({state: {olp: {}}, getMotionSession: () => session,
    getOlpRuntimeForRobot: () => null, isOlpRuntimeRunning: () => false,
    isVirtualControllerActiveForRobot: () => true});
  vm.runInContext(fn, context);
  assert.equal(context.isModelMotionActive(robot), true);
  assert.equal(context.isModelMotionActive(robot, false), false);
  for (const status of ['running', 'paused']) {
    session = {status};
    assert.equal(context.isModelMotionActive(robot, false), true);
  }
});

test('Wobj editing ignores controller connection but retains motion interlock', () => {
  const fn = source.match(/function isMotionActive\([^]*?\n\}/)[0];
  let moving = false;
  const context = vm.createContext({isRobotMotionActive: () => moving, isVirtualControllerActive: () => true});
  vm.runInContext(fn, context);
  assert.equal(context.isMotionActive(), true);
  assert.equal(context.isMotionActive(false), false);
  moving = true;
  assert.equal(context.isMotionActive(false), true);
});
