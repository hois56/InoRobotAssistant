import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildWorldToToolTransform,
  cadColorToHex,
  createStepExportFileName,
  normalizeCadColorHex,
  transformPointToTool
} from '../3_ToolSelector/step-export-transform.mjs';

const closeTo = (actual, expected, tolerance = 1e-10) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance));
};

const identity = buildWorldToToolTransform([0, 0, 0], [0, 0, 0]);
assert.deepEqual(identity.translation, [0, 0, 0]);
assert.deepEqual(identity.rotations.map(({ angleDegrees }) => angleDegrees), [0, 0, 0]);
closeTo(transformPointToTool([15, 25, 35], [10, 20, 30], [0, 0, 0]), [5, 5, 5]);
closeTo(transformPointToTool([10, 20, 30], [10, 20, 30], [42, -18, 73]), [0, 0, 0]);
closeTo(transformPointToTool([0, 0, 1], [0, 0, 0], [90, 0, 0]), [0, 1, 0]);
closeTo(transformPointToTool([0, 1, 0], [0, 0, 0], [0, 0, 90]), [1, 0, 0]);
assert.equal(createStepExportFileName('fixture.stp'), 'fixture_ToolCS.step');
assert.equal(createStepExportFileName('assembly.STEP'), 'assembly_ToolCS.step');
assert.equal(cadColorToHex([1, 0.5, 0]), '#ff8000');
assert.equal(cadColorToHex([100, 150, 200]), '#6496c8');
assert.equal(cadColorToHex(null), '#64748b');
assert.equal(normalizeCadColorHex('#AABBCC'), '#aabbcc');
assert.equal(normalizeCadColorHex('#f00'), '#64748b');

const html = readFileSync(new URL('../3_ToolSelector/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../3_ToolSelector/mode-d.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../3_ToolSelector/step-export-worker.mjs', import.meta.url), 'utf8');
assert.match(html, /id="cad-export-step"[^>]*disabled/);
assert.match(html, /accept="\.step,\.stp,\.stl"/);
assert.match(html, /체크한 부품만 Tool 원점과 좌표계 방향을 적용해 내보냅니다\./);
assert.match(source, /new Worker\(new URL\('\.\/step-export-worker\.mjs', import\.meta\.url\), \{ type: 'module' \}\)/);
assert.match(source, /renderer\.domElement\.addEventListener\('mousedown', preventMiddleButtonAutoscroll, \{ capture: true \}\)/);
assert.match(source, /if \(event\.button === 1\) event\.preventDefault\(\)/);
assert.match(source, /import \{ STLLoader \} from 'three\/addons\/loaders\/STLLoader\.js'/);
assert.match(source, /new STLLoader\(\)\.parse\(await file\.arrayBuffer\(\)\)/);
assert.match(source, /\['step', 'stp', 'stl'\]\.includes\(extension\)/);
assert.match(source, /state\.sourceStepFile\s*=\s*extension === 'stl' \? null : file/);
assert.match(source, /el\.exportStep\.disabled\s*=\s*extension === 'stl'/);
assert.match(source, /originMm:\s*state\.origin\.toArray\(\)/);
assert.match(source, /rotationDegrees:\s*state\.rotationDegrees\.toArray\(\)/);
assert.match(source, /sourceColorHex:\s*cadColorToHex\(meshDefinition\.color\)/);
assert.match(source, /cadParts:\s*state\.parts\.map/);
assert.match(source, /enabled:\s*part\.enabled/);
assert.match(source, /selectedPartCount\s*=\s*state\.parts\.filter\(\(part\) => part\.enabled\)\.length/);
assert.doesNotMatch(source, /part\.mesh\.material\.color\.setHex\(MATERIALS/);
assert.match(worker, /replicad-opencascadejs@0\.23\.0/);
assert.match(worker, /replicad@0\.23\.0\?bundle/);
assert.match(worker, /shape\s*=\s*shape\.translate\(transform\.translation\)/);
assert.match(worker, /shape\s*=\s*shape\.rotate\(angleDegrees, \[0, 0, 0\], axis\)/);
assert.match(worker, /createColorPreservingExportItems\(shape, cadParts\)/);
assert.match(worker, /iterTopo\(shape\.wrapped, 'solid'\)/);
assert.match(worker, /color:\s*part\.color/);
assert.match(worker, /enabled:\s*part\?\.enabled === true/);
assert.match(worker, /if \(!part\.enabled\) return \[\];/);
assert.match(worker, /No STEP parts selected for export\./);
assert.match(worker, /Could not match STEP solids to the selected parts\./);
assert.match(worker, /exportSTEP\([\s\S]*\{ unit: 'MM', modelUnit: 'MM' \}/);

console.log('Tool Mode D STEP export validation passed.');
