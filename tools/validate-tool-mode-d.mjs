import assert from 'node:assert/strict';
import {
  combineStepParts,
  createCoordinateFrame,
  integrateStepMesh,
  pointInFrame
} from '../3_ToolSelector/mass-properties.mjs';

function createBoxMesh(x, y, z, offset = [0, 0, 0]) {
  const [ox, oy, oz] = offset;
  const points = [
    [0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0],
    [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]
  ].map(([px, py, pz]) => [px + ox, py + oy, pz + oz]);
  const triangles = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5
  ];
  return {
    attributes: { position: { array: points.flat() } },
    index: { array: triangles }
  };
}

function nearlyEqual(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const dimensions = [100, 200, 300];
const density = 7.85e-6;
const geometry = integrateStepMesh(createBoxMesh(...dimensions));
nearlyEqual(geometry.volumeMm3, 6_000_000, 1e-6, 'box volume');
geometry.centroidMm.forEach((value, axis) => nearlyEqual(value, dimensions[axis] / 2, 1e-9, `box centroid ${axis}`));

const identityFrame = createCoordinateFrame([0, 0, 0], [1, 0, 0], [0, 1, 0]);
const result = combineStepParts([{ geometry, densityKgPerMm3: density, enabled: true }], identityFrame);
const mass = dimensions.reduce((product, value) => product * value, density);
nearlyEqual(result.massKg, mass, 1e-12, 'box mass');

const expectedCenter = [
  mass * (dimensions[1] ** 2 + dimensions[2] ** 2) / 12 * 1e-6,
  mass * (dimensions[0] ** 2 + dimensions[2] ** 2) / 12 * 1e-6,
  mass * (dimensions[0] ** 2 + dimensions[1] ** 2) / 12 * 1e-6
];
expectedCenter.forEach((value, axis) => nearlyEqual(result.inertiaCenterKgM2[axis][axis], value, 1e-10, `center inertia ${axis}`));

const expectedOrigin = expectedCenter.map((value, axis) => {
  const otherAxes = [0, 1, 2].filter((candidate) => candidate !== axis);
  return value + mass * otherAxes.reduce((sum, otherAxis) => sum + (dimensions[otherAxis] / 2) ** 2, 0) * 1e-6;
});
expectedOrigin.forEach((value, axis) => nearlyEqual(result.inertiaOriginKgM2[axis][axis], value, 1e-10, `origin inertia ${axis}`));

const translatedGeometry = integrateStepMesh(createBoxMesh(...dimensions, [400, -150, 20]));
const translated = combineStepParts([{ geometry: translatedGeometry, densityKgPerMm3: density }], identityFrame);
nearlyEqual(translated.massKg, mass, 1e-10, 'translated mass invariance');
expectedCenter.forEach((value, axis) => nearlyEqual(translated.inertiaCenterKgM2[axis][axis], value, 1e-9, `translated center inertia ${axis}`));

const rotatedFrame = createCoordinateFrame([0, 0, 0], [0, 1, 0], [-1, 0, 0]);
const rotated = combineStepParts([{ geometry, densityKgPerMm3: density }], rotatedFrame);
nearlyEqual(rotated.inertiaCenterKgM2[0][0], expectedCenter[1], 1e-10, 'rotated Ixx');
nearlyEqual(rotated.inertiaCenterKgM2[1][1], expectedCenter[0], 1e-10, 'rotated Iyy');
nearlyEqual(rotated.inertiaCenterKgM2[2][2], expectedCenter[2], 1e-10, 'rotated Izz');

const toolPoint = pointInFrame([10, 20, 30], createCoordinateFrame([10, 10, 10], [1, 0, 0], [0, 1, 0]));
assert.deepEqual(toolPoint, [0, 10, 20]);

console.log('Tool Mode D mass-property validation passed.');
