import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    createBinaryStl,
    createFacetedStep,
    normalizeModelExportTriangles
} from '../2_3DSimulation/model-export.mjs';

const simulationSource = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const simulationHtml = readFileSync(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');
const simulationStyles = readFileSync(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8');

assert.doesNotMatch(simulationHtml, /id="btn-download-cad"/);
assert.doesNotMatch(simulationSource, /handleCADDownload|getCadPathVariants|btn-download-cad/);
assert.match(simulationHtml, /id="model-export"/);
assert.match(simulationHtml, /id="model-export-format"/);
assert.match(simulationHtml, /<option value="stl">STL<\/option>/);
assert.match(simulationHtml, /<option value="step">STEP<\/option>/);
assert.match(simulationSource, /function collectGeneratedShapeExportTriangles\(model\)/);
assert.match(simulationSource, /function exportGeneratedShapeFromDialog\(\)/);
assert.match(simulationSource, /createFacetedStep\(triangles, baseName\)/);
assert.match(simulationSource, /createBinaryStl\(triangles\)/);
assert.match(simulationStyles, /\.model-export-dialog/);

const cubePoints = [
    [0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0],
    [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]
];
const cubeFaces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]
].map(([a, b, c]) => ({ a: cubePoints[a], b: cubePoints[b], c: cubePoints[c] }));

const normalized = normalizeModelExportTriangles(cubeFaces);
assert.equal(normalized.length, 12);
assert.equal(createBinaryStl(cubeFaces).byteLength, 84 + 12 * 50);
const step = createFacetedStep(cubeFaces, 'cube');
assert.match(step, /ISO-10303-21;/);
assert.match(step, /FACETED_BREP/);
assert.match(step, /CLOSED_SHELL/);
assert.match(step, /FACE_SURFACE/);
assert.match(step, /END-ISO-10303-21;\n$/);

console.log('3D model export validation passed.');
