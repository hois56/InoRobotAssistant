import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const handler = source.match(/function handleSimulationSnapFaceSelectionClick\([^]*?\n\}/)[0];
for (const mode of ['snapMoveMode', 'sketch', 'zeroPointEdit', 'placement', 'measurement', 'tcpSnapMode', 'interferenceSnapMode']) {
  for (const shiftKey of [false, true]) test(`${mode}: snap wins over background robot and face (shift=${shiftKey})`, () => {
    const calls = [];
    const snap = { id: 'visible-snap' };
    const state = { sketch: {}, zeroPointEdit: {}, placement: {}, measurement: {}, snapFaceSelections: [{}], snapCandidatesReady: false };
    if (typeof state[mode] === 'object') state[mode] = { active: true, snapMode: true };
    else state[mode] = true;
    const context = vm.createContext({ state,
      getSimulationSnapScope: () => 'scene', getSimulationSnapFaceSelections: () => [{}],
      findSimulationSnapAtPointer: () => snap,
      pickSimulationSnapRobotAtPointer: () => { calls.push('robot'); return {}; },
      pickSimulationSnapFaceAtPointer: () => { calls.push('face'); return { key: 'new-face' }; },
      resetSimulationSnapFaceContextAndRebuild: () => calls.push('reset'),
      selectSimulationSnapFace: () => calls.push('select-face'), setStatus() {},
      showSimulationSnapMarker: () => calls.push('marker'),
      ...Object.fromEntries(['moveRobotTcpToSimulationSnap', 'handleSketchSnapSelection', 'handleZeroPointSnapSelection', 'handleMeasurementSnapSelection', 'handleTcpSnapSelection', 'handleInterferenceSnapSelection'].map(name => [name, value => { assert.equal(value, snap); calls.push('snap'); return true; }]))
    });
    vm.runInContext(handler, context);
    context.handleSimulationSnapFaceSelectionClick({ shiftKey, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(calls, ['snap', 'marker']);
  });
}

for (const shiftKey of [false, true]) test(`without a snap, a model face remains selectable (shift=${shiftKey})`, () => {
  const selection = { key: 'new-face' };
  let selected;
  const context = vm.createContext({ state: { snapFaceSelections: [], tcpSnapMode: false },
    getSimulationSnapScope: () => 'scene', getSimulationSnapFaceSelections: () => [],
    findSimulationSnapAtPointer: () => null, pickSimulationSnapRobotAtPointer: () => null,
    pickSimulationSnapFaceAtPointer: () => selection,
    selectSimulationSnapFace: (face, options) => { selected = { face, additive: !!options?.additive }; }
  });
  vm.runInContext(handler, context);
  context.handleSimulationSnapFaceSelectionClick({ shiftKey, preventDefault() {}, stopPropagation() {} });
  assert.equal(selected.face, selection);
  assert.equal(selected.additive, shiftKey);
});
