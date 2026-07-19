import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { integrateStepMesh } from '../3_ToolSelector/mass-properties.mjs';
import { buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs';

const source = readFileSync(new URL('../3_ToolSelector/mode-d.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../3_ToolSelector/step-import-worker.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../3_ToolSelector/index.html', import.meta.url), 'utf8');

assert.doesNotMatch(html, /<script[^>]+occt-import-js@0\.0\.23/);
assert.match(source, /new Worker\(new URL\('\.\/step-import-worker\.js', import\.meta\.url\)\)/);
assert.match(source, /worker\.postMessage\([\s\S]*\}, \[buffer\]\)/);
assert.match(source, /worker\.terminate\(\)/);
assert.match(source, /MAX_DETAILED_SNAP_TRIANGLES\s*=\s*200000/);
assert.match(source, /createCenterOnlySnapData/);
assert.match(source, /buildMemoryAwareSnapData/);
assert.match(source, /if \(snapData\.stats\.simplified\) simplifiedSnapPartCount \+= 1/);

assert.match(worker, /importScripts\(OCCT_IMPORT_SCRIPT_URL\)/);
assert.match(worker, /occt\.ReadStepFile\(new Uint8Array\(buffer\), options \|\| null\)/);
assert.match(worker, /toTypedArray\(mesh\?\.attributes\?\.position\?\.array, Float32Array\)/);
assert.match(worker, /toTypedArray\(mesh\?\.index\?\.array, Uint32Array\)/);
assert.match(worker, /self\.postMessage\(\{ type: 'complete', result: compactResult \}, transferables\)/);

const positions = new Float32Array([
  0, 0, 0, 10, 0, 0, 10, 20, 0, 0, 20, 0,
  0, 0, 30, 10, 0, 30, 10, 20, 30, 0, 20, 30
]);
const indices = new Uint32Array([
  0, 2, 1, 0, 3, 2,
  4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4,
  3, 7, 6, 3, 6, 2,
  0, 4, 7, 0, 7, 3,
  1, 2, 6, 1, 6, 5
]);
const typedMesh = {
  attributes: { position: { array: positions } },
  index: { array: indices },
  brep_faces: Array.from({ length: 6 }, (_, index) => ({ first: index * 2, last: index * 2 + 1 }))
};

const properties = integrateStepMesh(typedMesh);
assert.ok(Math.abs(properties.volumeMm3 - 6000) <= 1e-8);
assert.deepEqual(properties.centroidMm, [5, 10, 15]);
const snapData = buildStepSnapCandidates(typedMesh, { solidCenter: properties.centroidMm });
assert.equal(snapData.stats.triangleCount, 12);
assert.ok(snapData.candidates.some((candidate) => candidate.type === 'shape-center'));

console.log('Tool Mode D STEP import validation passed.');
