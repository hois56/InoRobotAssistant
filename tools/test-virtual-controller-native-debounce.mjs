import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeClientUrl = new URL(
    '../2_3DSimulation/VirtualControllerBridge/NativeRobotClient.cs',
    import.meta.url
);
const nativeClientSource = await readFile(nativeClientUrl, 'utf8');
assert.match(nativeClientSource, /JointReadFailureDisconnectThresholdMs = 100/);

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'inorobot-native-debounce-'));
try {
    const copiedSourcePath = join(temporaryDirectory, 'NativeRobotClient.cs');
    const harnessPath = join(temporaryDirectory, 'Program.cs');
    const projectPath = join(temporaryDirectory, 'NativeDebounceHarness.csproj');
    await writeFile(copiedSourcePath, nativeClientSource, 'utf8');
    await writeFile(projectPath, `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
`.trimStart(), 'utf8');
    await writeFile(harnessPath, `
using System.Reflection;
using InoRobotVirtualControllerBridge;

static FieldInfo Field(string name) => typeof(NativeRobotClient).GetField(
    name,
    BindingFlags.Instance | BindingFlags.NonPublic)
    ?? throw new InvalidOperationException($"Missing field: {name}");

static MethodInfo Method(string name) => typeof(NativeRobotClient).GetMethod(
    name,
    BindingFlags.Instance | BindingFlags.NonPublic)
    ?? throw new InvalidOperationException($"Missing method: {name}");

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

using NativeRobotClient robot = new();
Field("<IsConnected>k__BackingField").SetValue(robot, true);
Field("_nativeSessionOpen").SetValue(robot, true);

Method("RegisterJointReadFailureUnsafe").Invoke(robot, ["return code -1"]);
Require(robot.IsConnected, "The first transient joint-read failure disconnected the session.");
Require((int)Field("_consecutiveJointReadFailures").GetValue(robot)! == 1,
    "The first failure was not counted.");

Method("ResetJointReadFailuresUnsafe").Invoke(robot, null);
Require((int)Field("_consecutiveJointReadFailures").GetValue(robot)! == 0,
    "A valid sample must reset the consecutive failure count.");
Require((long)Field("_jointReadFailureStartedAt").GetValue(robot)! == 0,
    "A valid sample must reset the failure window.");

Method("RegisterJointReadFailureUnsafe").Invoke(robot, ["return code -2"]);
Field("_jointReadFailureStartedAt").SetValue(robot, Environment.TickCount64 - 101L);
Method("RegisterJointReadFailureUnsafe").Invoke(robot, ["return code -3"]);
Require(!robot.IsConnected, "A sustained joint-read failure did not disconnect the session.");
Require(robot.LastConnectionLossDiagnostic?.Contains("return code -3", StringComparison.Ordinal) == true,
    "The sustained failure diagnostic did not preserve the native return code.");

Console.WriteLine("Native controller debounce behavior passed.");
`.trimStart(), 'utf8');

    const dotnetHome = join(temporaryDirectory, '.dotnet-home');
    const nugetPackages = join(temporaryDirectory, '.nuget-packages');
    const output = execFileSync(
        'dotnet',
        ['run', '--project', projectPath, '--configuration', 'Release'],
        {
            cwd: temporaryDirectory,
            encoding: 'utf8',
            env: {
                ...process.env,
                DOTNET_CLI_HOME: dotnetHome,
                DOTNET_CLI_TELEMETRY_OPTOUT: '1',
                DOTNET_NOLOGO: '1',
                DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
                NUGET_PACKAGES: nugetPackages
            }
        }
    );
    assert.match(output, /Native controller debounce behavior passed\./);
    console.log('Virtual controller native debounce regression test passed.');
} finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
}
