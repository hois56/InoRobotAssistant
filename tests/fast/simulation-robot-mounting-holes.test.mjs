import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROBOT_MOUNTING_HOLES } from '../../2_3DSimulation/robot-mounting-holes.mjs';

test('every articulated robot model has mounting-hole snap points', () => {
  const catalog = JSON.parse(readFileSync('2_3DSimulation/models/models.json', 'utf8'));
  for (const model of catalog.filter(item => item.type === 'articulated-stl')) {
    assert.ok(ROBOT_MOUNTING_HOLES[model.folder]?.length, `${model.folder} has no mounting-hole points`);
  }
});

test('robot mounting-hole centers correspond to circular openings in each base STL', () => {
  for (const [folder, holes] of Object.entries(ROBOT_MOUNTING_HOLES)) {
    const stl = readFileSync(`2_3DSimulation/models/${folder}/P0.stl`);
    const count = stl.readUInt32LE(80);
    for (const [x, y, z, radius] of holes) {
      const vertices = new Set();
      for (let i = 0; i < count; i++) for (let j = 0; j < 3; j++) {
        const offset = 84 + i * 50 + 12 + j * 12;
        const px = stl.readFloatLE(offset), py = stl.readFloatLE(offset + 4), pz = stl.readFloatLE(offset + 8);
        if (Math.abs(pz - z) < 0.05 && Math.abs(Math.hypot(px - x, py - y) - radius) < 0.3) {
          vertices.add(`${px.toFixed(2)},${py.toFixed(2)}`);
        }
      }
      assert.ok(vertices.size >= 7, `${folder}: missing opening at ${x}, ${y}, ${z} (${vertices.size} vertices)`);
    }
  }
});
