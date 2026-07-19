import assert from 'node:assert/strict';
import {
  projectedRingAngle,
  wrapRotationDelta
} from '../3_ToolSelector/continuous-transform-rotation.mjs';

const center = { x: 0.15, y: -0.2 };
const basisU = { x: 0.42, y: 0.08 };
const basisV = { x: -0.12, y: 0.24 };

function pointAt(angle) {
  return {
    x: center.x + basisU.x * Math.cos(angle) + basisV.x * Math.sin(angle),
    y: center.y + basisU.y * Math.cos(angle) + basisV.y * Math.sin(angle)
  };
}

function accumulateAngles(angles) {
  let previous = projectedRingAngle(pointAt(angles[0]), center, basisU, basisV);
  let accumulated = 0;
  for (const expected of angles.slice(1)) {
    const current = projectedRingAngle(pointAt(expected), center, basisU, basisV);
    accumulated += wrapRotationDelta(current - previous);
    previous = current;
  }
  return accumulated;
}

const forward = Array.from({ length: 49 }, (_, index) => index * Math.PI / 12);
const backward = Array.from({ length: 49 }, (_, index) => -index * Math.PI / 12);
assert.ok(Math.abs(accumulateAngles(forward) - Math.PI * 4) < 1e-10);
assert.ok(Math.abs(accumulateAngles(backward) + Math.PI * 4) < 1e-10);

const boundaryAngles = [170, 175, 179, 181, 185, 190].map((degrees) => degrees * Math.PI / 180);
let previous = projectedRingAngle(pointAt(boundaryAngles[0]), center, basisU, basisV);
for (const expected of boundaryAngles.slice(1)) {
  const current = projectedRingAngle(pointAt(expected), center, basisU, basisV);
  assert.ok(wrapRotationDelta(current - previous) > 0, 'rotation reversed at the 180 degree boundary');
  previous = current;
}

assert.equal(
  projectedRingAngle({ x: 0.5, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }),
  null,
  'an edge-on ring should use the stock linear drag fallback'
);

console.log('Continuous TransformControls rotation validation passed.');
