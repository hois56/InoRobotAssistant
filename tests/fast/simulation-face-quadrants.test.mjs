import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { buildStepSnapCandidates } from '../../3_ToolSelector/snap-geometry.mjs';

test('project generator includes R20H', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../../4_ProjectGenerator/assets.js', import.meta.url), 'utf8'), context);
  assert.match(vm.runInContext('Assets.Robots_SCARA', context), /IR-,R20H-120,S5-INT,/);
});

test('a circular face has four quadrant snaps on its circumference', () => {
  const array = [0, 0, 0], indices = [];
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    array.push(50 * Math.cos(angle), 50 * Math.sin(angle), 0);
    indices.push(0, i + 1, (i + 1) % 32 + 1);
  }
  const result = buildStepSnapCandidates({ attributes: { position: { array } }, index: { array: indices } }, { includeCircleQuadrants: true });
  const points = result.candidates.filter(c => c.type === 'quadrant');
  assert.equal(points.length, 4);
  for (const expected of [[50,0,0], [-50,0,0], [0,50,0], [0,-50,0]]) {
    assert.ok(points.some(c => Math.hypot(...c.point.map((v,i) => v - expected[i])) < 1e-5));
  }
});

test('unselected solid meshes cannot create face snaps', () => {
  const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
  const fn = source.match(/function canBuildSimulationSnapMesh\([^]*?\n\}/)?.[0];
  assert.ok(fn, 'face selection guard exists');
  const context = vm.createContext({});
  vm.runInContext(fn, context);
  const mesh = { uuid: 'solid', userData: { primitiveShapeMesh: true } };
  assert.equal(context.canBuildSimulationSnapMesh(mesh, []), false);
  assert.equal(context.canBuildSimulationSnapMesh(mesh, [{ mesh: { uuid: 'other' } }]), false);
  assert.equal(context.canBuildSimulationSnapMesh(mesh, [{ mesh }]), true);
  assert.equal(context.canBuildSimulationSnapMesh({ userData: { cad2dSnapLine: true } }, []), true);
});
