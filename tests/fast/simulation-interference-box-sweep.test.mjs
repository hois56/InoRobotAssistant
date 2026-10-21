import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createDefaultInterferenceZone, getInterferenceZoneBounds, pointInsideBounds,
  segmentIntersectsInterferenceRegion, INTERFERENCE_SAFETY_DISTANCE_MAX } from '../../2_3DSimulation/interference-zone-core.mjs';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['serializeInterferenceProbe', 'sweptProbeInInterferenceRegion', 'sweptBoxIntersectsBounds',
  'probeInInterferenceRegion', 'probeIntersectsBounds', 'probeInsideBounds', 'obbIntersectsBounds', 'boxContainedInBounds'];
const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');
const context = vm.createContext({ THREE, getInterferenceZoneBounds, pointInsideBounds,
  segmentIntersectsInterferenceRegion, INTERFERENCE_SAFETY_DISTANCE_MAX });
vm.runInContext(functions, context);

function probe(x = 0, y = 0, z = 150, rotation = 0) {
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotation);
  return { kind: 'box', center: new THREE.Vector3(x, y, z), halfSizes: [150, 100, 50],
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
      .map(axis => axis.applyQuaternion(quaternion)), radius: Math.hypot(150, 100, 50) };
}
function zone() {
  const result = createDefaultInterferenceZone();
  result.geometry.p1 = [-100, -100, -100];
  result.geometry.p2 = [100, 100, 0];
  return result;
}
function sweep(start, end, area = zone()) {
  return context.sweptProbeInInterferenceRegion(context.serializeInterferenceProbe(start), end, area);
}

test('stationary box above the zone never reports interference from its enclosing sphere', () => {
  const box = probe();
  assert.equal(context.probeInInterferenceRegion(box, zone()), false);
  assert.equal(sweep(box, box), false);
});

test('box moving parallel above a zone stays clear, including a rotated box', () => {
  for (const rotation of [0, Math.PI / 4]) {
    assert.equal(sweep(probe(-300, 0, 150, rotation), probe(300, 0, 150, rotation)), false);
  }
});

test('box sweep still detects a thin zone crossed between clear endpoints', () => {
  const start = probe(-300, 0, -50), end = probe(300, 0, -50);
  assert.equal(context.probeInInterferenceRegion(start, zone()), false);
  assert.equal(context.probeInInterferenceRegion(end, zone()), false);
  assert.equal(sweep(start, end), true);
});

test('rotated box sweep rejects empty bounding-box corners', () => {
  const area = zone();
  area.geometry.p1 = [160, 160, -80];
  area.geometry.p2 = [170, 170, -20];
  assert.equal(sweep(probe(0, 0, -50, Math.PI / 4), probe(5, 0, -50, Math.PI / 4), area), false);
});

test('outside monitoring remains clear when a translating box stays contained', () => {
  const area = zone();
  area.insideOutside = 'outside';
  area.geometry.p1 = [-500, -500, -500];
  area.geometry.p2 = [500, 500, 500];
  assert.equal(sweep(probe(-50, 0, 0), probe(50, 0, 0), area), false);
});

test('box sweep includes configured safety distance and boundary contact', () => {
  const area = zone();
  area.safetyDistance = 100;
  assert.equal(sweep(probe(-300), probe(300), area), true);
});

test('stationary sweep agrees with current box intersection for different 3D orientations', () => {
  for (let index = 0; index < 60; index += 1) {
    const box = probe((index % 5 - 2) * 120, (index % 7 - 3) * 80, (index % 3 - 1) * 140);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(index * 0.37, index * 0.21, index * 0.13));
    box.axes.forEach(axis => axis.applyQuaternion(rotation));
    assert.equal(sweep(box, box), context.probeInInterferenceRegion(box, zone()), `orientation ${index}`);
  }
});
