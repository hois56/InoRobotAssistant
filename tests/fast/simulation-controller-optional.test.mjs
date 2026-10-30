import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeIoFunctionMapping, cloneIoFunctionMappings } from '../../2_3DSimulation/io-function-mapping-core.mjs';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['scheduleOptionalInterferenceReadTimeout', 'canReadInterferenceZoneFromController', 'readInterferenceZoneFromController',
  'readInterferenceToolFromController', 'applyInterferenceZoneControllerResult', 'applyInterferenceToolControllerResult'];
const code = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join('\n');

function fixture(kind = 'virtual') {
  const controller = { controllerKind: kind, source: 'bridge', wanted: true, status: 'streaming',
    socket: { readyState: 1 }, pendingInterferenceReads: new Set(), pendingInterferenceToolReads: new Set() };
  const messages = [], commands = [], timers = [];
  const context = vm.createContext({ state: { virtualController: { wanted: false } }, WebSocket: { OPEN: 1 },
    INTERFERENCE_ZONE_COUNT: 16, END_MONITORING_OBJECT_COUNT: 16,
    refreshVirtualControllerUi() {}, setStatus(...args) { messages.push(args); },
    sendVirtualControllerCommand(command, target) { commands.push({ command, target }); return true; },
    setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {} });
  vm.runInContext(code, context);
  return { controller, context, commands, messages, timers };
}

for (const kind of ['virtual', 'real']) test(`${kind} controller can request zones and tools for its own session`, () => {
  const f = fixture(kind);
  assert.equal(f.context.canReadInterferenceZoneFromController(f.controller), true);
  f.context.readInterferenceZoneFromController(2, f.controller);
  f.context.readInterferenceToolFromController(3, f.controller);
  assert.deepEqual(f.commands.map(item => item.command.type), ['readInterferenceZone', 'readInterferenceTool']);
  assert.ok(f.commands.every(item => item.target === f.controller));
  assert.equal(f.messages.length, 0);
});

test('unsupported optional virtual reads clear pending requests without reporting a failure or changing connection state', () => {
  const f = fixture();
  f.controller.pendingInterferenceReads.add(2); f.controller.pendingInterferenceToolReads.add(3);
  f.context.applyInterferenceZoneControllerResult({ success: false, zoneNumber: 2, message: 'unsupported' }, f.controller);
  f.context.applyInterferenceToolControllerResult({ success: false, toolNumber: 3, message: 'unsupported' }, f.controller);
  assert.equal(f.controller.pendingInterferenceReads.size + f.controller.pendingInterferenceToolReads.size, 0);
  assert.equal(f.messages.length, 0);
  assert.equal(f.controller.status, 'streaming');
});

test('optional virtual requests without a reply become available again', () => {
  const f = fixture();
  f.context.readInterferenceZoneFromController(2, f.controller);
  f.context.readInterferenceToolFromController(3, f.controller);
  assert.equal(f.controller.pendingInterferenceReads.size + f.controller.pendingInterferenceToolReads.size, 2);
  f.timers.forEach(callback => callback());
  assert.equal(f.controller.pendingInterferenceReads.size + f.controller.pendingInterferenceToolReads.size, 0);
  assert.equal(f.controller.status, 'streaming');
});

test('object reset mappings preserve IN/OUT, target and OFF trigger when saved and restored', () => {
  for (const direction of ['IN', 'OUT']) {
    const mapping = normalizeIoFunctionMapping({ action: 'OBJECT_RESET', direction, address: 512,
      triggerValue: 0, gripObjectRef: 'equipment:product' });
    assert.equal(mapping.action, 'OBJECT_RESET'); assert.equal(mapping.direction, direction);
    assert.equal(mapping.gripObjectRef, 'equipment:product'); assert.equal(mapping.triggerValue, 0);
    assert.deepEqual(cloneIoFunctionMappings([mapping]), [mapping]);
  }
});
