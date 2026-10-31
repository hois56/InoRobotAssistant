import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('bridge output scheduling preserves feedback without blocking an entire scan', () => {
  const output = execFileSync('dotnet', ['run', '--project', 'tests/dotnet/BridgeOutputScheduling/BridgeOutputScheduling.csproj', '--configuration', 'Release'], { encoding: 'utf8', timeout: 120000 });
  assert.match(output, /Output scheduling checks passed/);
});
