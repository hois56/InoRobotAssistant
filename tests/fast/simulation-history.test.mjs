import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeProgramSpeedOverride } from '../../2_3DSimulation/motion-program-core.mjs';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const context = vm.createContext({ normalizeProgramSpeedOverride });
vm.runInContext(source.match(/function sceneSnapshotsEqual\([^]*?\n\}/)[0], context);

test('모델이 움직이지 않아도 Tool 동작 등록·편집·삭제는 실행 취소 기록에 포함한다', () => {
  const empty = { models: [], joints: [], equipmentDefinitions: [] };
  const registered = { ...empty, equipmentDefinitions: [{ id: 'vacuum', type: 'VACUUM', name: '진공', vacuumMode: 'WHOLE' }] };
  const renamed = { ...registered, equipmentDefinitions: [{ ...registered.equipmentDefinitions[0], name: '패드 진공' }] };
  assert.equal(context.sceneSnapshotsEqual(empty, empty), true);
  assert.equal(context.sceneSnapshotsEqual(empty, registered), false);
  assert.equal(context.sceneSnapshotsEqual(registered, renamed), false);
  assert.equal(context.sceneSnapshotsEqual(registered, empty), false);
  assert.equal(context.sceneSnapshotsEqual(registered, structuredClone(registered)), true);
});
