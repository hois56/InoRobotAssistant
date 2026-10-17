import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
test('controller kind defaults and virtual IP edits', () => {
  const handlers = {};
  const state = { virtualController: { wanted: false, controllerKind: 'virtual', ipAddress: '127.0.0.1' } };
  const el = { virtualControllerKind: { value: 'real', addEventListener: (_, fn) => handlers.kind = fn },
    virtualControllerIp: { value: '', addEventListener: (_, fn) => handlers.ip = fn } };
  const start = source.indexOf("    el.virtualControllerKind?.addEventListener('change'");
  const end = source.indexOf("    el.btnVirtualControllerConnect?.addEventListener", start);
  vm.runInNewContext(source.slice(start, end), { state, el, refreshVirtualControllerUi() {} });
  handlers.kind();
  assert.equal(state.virtualController.ipAddress, '192.168.0.1');
  el.virtualControllerKind.value = 'virtual'; handlers.kind();
  assert.equal(state.virtualController.ipAddress, '127.0.0.1');
  el.virtualControllerIp.value = '192.168.1.20'; handlers.ip();
  assert.equal(state.virtualController.ipAddress, '192.168.1.20');
});
