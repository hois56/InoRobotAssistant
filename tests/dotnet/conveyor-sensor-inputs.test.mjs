import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('conveyor bridge preserves IN0 sensor levels and events and rejects reserved addresses', () => {
    const output = execFileSync('dotnet', ['run', '--project', 'tests/dotnet/ConveyorSensorInputs/ConveyorSensorInputs.csproj', '--configuration', 'Release'], { encoding: 'utf8', timeout: 120000 });
    assert.match(output, /Conveyor sensor input checks passed/);
});
