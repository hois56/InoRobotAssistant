import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultEndMonitoringObject, getEndMonitoringCuboidBounds,
  getEndMonitoringCuboidTransform } from '../../2_3DSimulation/end-monitoring-core.mjs';

function object() {
  const result = createDefaultEndMonitoringObject();
  result.type = 'cuboid';
  Object.assign(result.cuboid, { method: 'fourPointsHeight',
    points: [[-50, -100, 100], [50, -100, 100], [50, 100, 100], [-50, 100, 100]], height: 100 });
  return result;
}

for (const [direction, centerZ, minZ, maxZ] of [[-1, 50, 0, 100], [1, 150, 100, 200]]) {
  test(`four-point height follows flange Z direction ${direction}`, () => {
    const monitoring = object(), before = structuredClone(monitoring);
    const transform = getEndMonitoringCuboidTransform(monitoring, direction);
    assert.deepEqual(transform.center, [0, 0, centerZ]);
    assert.deepEqual(transform.halfSizes, [50, 100, 50]);
    assert.deepEqual(getEndMonitoringCuboidBounds(monitoring, direction), {
      min: [-50, -100, minZ], max: [50, 100, maxZ]
    });
    assert.deepEqual(monitoring, before, 'robot-specific direction must not change the shared saved settings');
  });
}

test('rotated four-point rectangle keeps its XY axes and positive size in both height directions', () => {
  const monitoring = object();
  monitoring.cuboid.points = [[-200, 0, 100], [0, -200, 100], [200, 0, 100], [0, 200, 100]];
  const negative = getEndMonitoringCuboidTransform(monitoring, -1);
  const positive = getEndMonitoringCuboidTransform(monitoring, 1);
  assert.equal(negative.center[2], 50);
  assert.equal(positive.center[2], 150);
  assert.deepEqual(negative.axes, positive.axes);
  assert.deepEqual(negative.halfSizes, positive.halfSizes);
});

test('diagonal and datum-offset methods keep their authored Z coordinates', () => {
  for (const method of ['diagonal', 'datumOffset']) {
    const monitoring = object();
    monitoring.cuboid.method = method;
    assert.deepEqual(getEndMonitoringCuboidTransform(monitoring, -1), getEndMonitoringCuboidTransform(monitoring, 1));
    assert.deepEqual(getEndMonitoringCuboidBounds(monitoring, -1), getEndMonitoringCuboidBounds(monitoring, 1));
  }
});
