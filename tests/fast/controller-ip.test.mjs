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
  const storage = new Map();
  const functions = ['readVirtualControllerSettings', 'saveVirtualControllerSettings']
    .map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');
  vm.runInNewContext(functions + '\n' + source.slice(start, end), {
    state, el, refreshVirtualControllerUi() {},
    VIRTUAL_CONTROLLER_SETTINGS_STORAGE_KEY: 'controller-settings',
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  });
  handlers.kind();
  assert.equal(state.virtualController.ipAddress, '192.168.0.1');
  el.virtualControllerIp.value = '192.168.0.25'; handlers.ip();
  el.virtualControllerKind.value = 'virtual'; handlers.kind();
  assert.equal(state.virtualController.ipAddress, '127.0.0.1');
  el.virtualControllerIp.value = '192.168.1.20'; handlers.ip();
  assert.equal(state.virtualController.ipAddress, '192.168.1.20');
  el.virtualControllerKind.value = 'real'; handlers.kind();
  assert.equal(state.virtualController.ipAddress, '192.168.0.25');
  el.virtualControllerKind.value = 'virtual'; handlers.kind();
  assert.equal(state.virtualController.ipAddress, '192.168.1.20');
});
