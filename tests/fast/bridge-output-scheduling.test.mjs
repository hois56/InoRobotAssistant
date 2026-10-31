import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bridge position frames do not burst-read all outputs', () => {
  const source = readFileSync('2_3DSimulation/VirtualControllerBridge/NativeRobotClient.cs', 'utf8');
  const frame = source.slice(source.indexOf('public RobotState? ReadState'), source.indexOf('public InterferenceZoneReadResult'));
  assert.doesNotMatch(frame, /for\s*\(int index = 0; index <= 16/);
});
