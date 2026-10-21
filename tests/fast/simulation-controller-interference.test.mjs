import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { END_MONITORING_MTPC_TOOL_IDS, normalizeEndMonitoringObjects } from '../../2_3DSimulation/end-monitoring-core.mjs';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const functions = ['getInterferenceToolObjectType', 'applyInterferenceToolControllerResult']
  .map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join('\n');

function fixture() {
  const controller = { pendingInterferenceToolReads: new Set([5]) };
  const state = { virtualController: controller, endMonitoringObjects: normalizeEndMonitoringObjects() };
  state.endMonitoringObjects[5].remarks = 'existing tool';
  const context = vm.createContext({
    state, END_MONITORING_OBJECT_COUNT: 16, END_MONITORING_MTPC_TOOL_IDS, normalizeEndMonitoringObjects,
    refreshVirtualControllerUi() {}, captureSceneSnapshot() {}, resetAllInterferenceZoneRuntime() {},
    refreshInterferenceZoneMonitoringObjectOptions() {}, renderInterferenceZonePanel() {},
    updateEndMonitoringVisuals() {}, recordHistory() {}, setStatus() {}
  });
  vm.runInContext(functions, context);
  return { state, controller, apply: tool => context.applyInterferenceToolControllerResult({
    success: true, toolNumber: 5, tool
  }) };
}

test('controller sphere type 2 imports its center and radius as a sphere', () => {
  const f = fixture();
  f.apply({ type: 2, zPos: 125, ballR: 45 });
  const object = f.state.endMonitoringObjects[5];
  assert.equal(object.type, 'sphere');
  assert.deepEqual(object.sphere, { centerZ: 125, radius: 45 });
  assert.equal(object.id, 5);
  assert.equal(object.remarks, 'existing tool');
  assert.equal(f.controller.pendingInterferenceToolReads.size, 0);
});

for (const [setType, method, values, expected] of [
  [0, 'diagonal', { diagonal: [-10, -20, -30, 40, 50, 60] }, { p1: [-10, -20, -30], p2: [40, 50, 60] }],
  [1, 'datumOffset', { pointL: [10, 20, 30, -40, 50, 60] }, { datum: [10, 20, 30], offset: [-40, 50, 60] }],
  [2, 'fourPointsHeight', { pointH: [0, 0, 10, 20, 0, 10, 20, 30, 10, 0, 30, 10, 40] },
    { points: [[0, 0, 10], [20, 0, 10], [20, 30, 10], [0, 30, 10]], height: 40 }]
]) {
  test(`controller rectangular type 1 imports ${method} geometry as a cuboid`, () => {
    const f = fixture();
    f.apply({ type: 1, setType, ...values });
    const object = f.state.endMonitoringObjects[5];
    assert.equal(object.type, 'cuboid');
    assert.equal(object.cuboid.method, method);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(object.cuboid[key], value);
  });
}

test('controller TCP type 0 preserves the selected TCP points', () => {
  const f = fixture();
  f.apply({ type: 0, isUse: [0, 1, 0, 1] });
  assert.equal(f.state.endMonitoringObjects[5].type, 'mtcp');
  assert.deepEqual(f.state.endMonitoringObjects[5].mtcpToolIds, ['tcp0', 'tcp2']);
});

test('unsupported controller type leaves the existing monitoring object unchanged', () => {
  const f = fixture();
  const before = structuredClone(f.state.endMonitoringObjects);
  f.apply({ type: 3 });
  assert.deepEqual(f.state.endMonitoringObjects, before);
});
