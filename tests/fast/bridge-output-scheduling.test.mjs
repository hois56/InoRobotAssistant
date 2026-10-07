import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('bridge position frames do not burst-read all outputs', () => {
  const source = readFileSync('2_3DSimulation/VirtualControllerBridge/NativeRobotClient.cs', 'utf8');
  const frame = source.slice(source.indexOf('public RobotState? ReadState'), source.indexOf('public InterferenceZoneReadResult'));
  assert.doesNotMatch(frame, /for\s*\(int index = 0; index <= 16/);
});

test('bridge output scheduling preserves feedback without blocking an entire scan', () => {
  const output = execFileSync('dotnet', ['run', '--project', 'tests/dotnet/BridgeOutputScheduling/BridgeOutputScheduling.csproj', '--configuration', 'Release'], { encoding: 'utf8', timeout: 120000 });
  assert.match(output, /Output scheduling checks passed/);
});
