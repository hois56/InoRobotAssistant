import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { integrateStepMesh } from '../3_ToolSelector/mass-properties.mjs';
import { buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs';

const source = readFileSync(new URL('../3_ToolSelector/mode-d.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../3_ToolSelector/step-import-worker.js', import.meta.url), 'utf8');
const largeWorker = readFileSync(new URL('../2_3DSimulation/step-import-worker.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../3_ToolSelector/index.html', import.meta.url), 'utf8');

assert.doesNotMatch(html, /<script[^>]+occt-import-js@0\.0\.23/);
assert.match(source, /new Worker\(new URL\('\.\/step-import-worker\.js\?v=20260720-exact-small-1', import\.meta\.url\)\)/);
assert.match(source, /LARGE_STEP_ENGINE_MIN_BYTES\s*=\s*100 \* 1024 \* 1024/);
assert.match(source, /LARGE_STEP_ENGINE_WORKER_URL\s*=\s*'\.\.\/2_3DSimulation\/step-import-worker\.js/);
assert.match(source, /STEP_IMPORT_QUALITY_PRESETS/);
assert.match(source, /linearDeflectionType: 'absolute_value'/);
assert.match(source, /linearDeflection: 5/);
assert.match(source, /getLargeStepTessellationParameters\(fileSizeBytes, qualityKey = 'default'\)/);
assert.match(source, /getSelectedStepImportQuality/);
assert.match(source, /importQuality\.key/);
assert.match(source, /importLargeStepInWorker/);
assert.match(source, /engine:\s*'large'/);
assert.doesNotMatch(source, /const workerBuffer = buffer\.slice\(0\)/);
assert.match(source, /worker\.postMessage\([\s\S]*buffer,[\s\S]*\}, \[buffer\]\)/);
assert.match(source, /finish\(resolve, event\.data\.result\);/);
assert.match(source, /finish\(resolve, \{ success: true, meshCount:/);
assert.match(source, /resetModeDStepImportWorkerSession/);
assert.match(source, /cancelModeDStepImports/);
assert.match(source, /cadImportGeneration/);
assert.match(source, /importStepWithFallback\(file/);
assert.match(source, /file\.arrayBuffer\(\)/);
assert.match(source, /MODE_D_STEP_CACHE_DB_NAME/);
assert.match(source, /MODE_D_STEP_CACHE_MAX_BYTES\s*=\s*32 \* 1024 \* 1024/);
assert.match(source, /normalizeLargeWorkerMesh/);
assert.doesNotMatch(source, /showFastStepPreview/);
assert.match(source, /worker\.terminate\(\)/);
assert.match(source, /createCenterOnlySnapData/);
assert.doesNotMatch(source, /buildMemoryAwareSnapData/);
assert.match(source, /on-demand-face-analysis/);
assert.match(source, /면을 선택하면 상세 스냅 후보를 계산합니다\./);

assert.match(worker, /importScripts\(OCCT_IMPORT_SCRIPT_URL\)/);
assert.match(worker, /occt\.ReadStepFile\(new Uint8Array\(buffer\), options \|\| null\)/);
assert.match(worker, /toTypedArray\(mesh\?\.attributes\?\.position\?\.array, Float32Array\)/);
assert.match(worker, /toTypedArray\(mesh\?\.index\?\.array, Uint32Array\)/);
assert.match(worker, /self\.postMessage\(\{ type: 'complete', result: compactResult \}, transferables\)/);
assert.match(largeWorker, /occt-wasm@3\.7\.0\/dist\/index\.js/);
assert.match(largeWorker, /async function parseLargeStepFile\(message, requestId\)/);
assert.match(largeWorker, /kernel\.importXCAFFromSTEP\(sourceBuffer\)/);
assert.match(largeWorker, /function collectXcafParts\(document\)/);
assert.match(largeWorker, /document\.getRoots\(\)/);
assert.match(largeWorker, /document\.getChildren\(label\)/);
assert.match(largeWorker, /part\.shapeHandle/);
assert.match(largeWorker, /postLargeMeshChunks\(mesh, message, requestId, part\)/);
assert.match(largeWorker, /segmented: true/);
assert.match(largeWorker, /kernel\.importStep\(sourceBuffer\)/);
assert.match(largeWorker, /kernel\.meshShape\(shape/);
assert.match(largeWorker, /function postLargeMeshChunks\(mesh, message, requestId, partMeta = \{\}\)/);

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

let workerHandler = null;
const workerMessages = [];
vm.runInNewContext(worker, {
  self: {
    addEventListener: (_type, callback) => { workerHandler = callback; },
    postMessage: (message) => workerMessages.push(message)
  },
  importScripts: () => {},
  TextDecoder,
  TextEncoder,
  Uint8Array,
  ArrayBuffer,
  Number,
  String,
  Math,
  Promise,
  console
});
const sampleStep = [
  'ISO-10303-21;',
  'DATA;',
  "#1=CARTESIAN_POINT('',(1.,2.,3.));",
  "#2=CARTESIAN_POINT('',(-4.,5.,6.));",
  "#10=MANIFOLD_SOLID_BREP('Sample Part',#20);",
  'ENDSEC:',
  'END-ISO-10303-21;'
].join(String.fromCharCode(10));
await workerHandler({
  data: {
    buffer: new TextEncoder().encode(sampleStep).buffer,
    fastPreview: true,
    fileName: 'sample.step',
    options: {}
  }
});
const fastPreview = workerMessages.find((message) => message.type === 'fast-preview')?.result;
assert.equal(fastPreview?.success, true);
assert.equal(fastPreview.parts.length, 1);
assert.equal(fastPreview.parts[0].name, 'Sample Part');
assert.equal(fastPreview.parts[0].rootEntityId, 10);
assert.deepEqual(Array.from(fastPreview.parts[0].min), [-4, 2, 3]);
assert.deepEqual(Array.from(fastPreview.parts[0].max), [1, 5, 6]);

console.log('Tool Mode D STEP import validation passed.');
