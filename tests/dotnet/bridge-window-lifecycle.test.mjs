import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('bridge minimizes to the tray and supports restoring and closing while hidden', () => {
  const output = execFileSync('dotnet', [
    'run', '--project', 'tests/dotnet/BridgeWindowLifecycle/BridgeWindowLifecycle.csproj', '--configuration', 'Release'
  ], { encoding: 'utf8', timeout: 120000, windowsHide: true });
  assert.match(output, /Bridge window lifecycle checks passed/);
});
