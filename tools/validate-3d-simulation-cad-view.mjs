import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');

const cadFit = source.match(/function fitCadDocument\(topOnly = false\)[\s\S]*?function createCad3dFromSelection\(\)/)?.[0] || '';
assert.match(cadFit, /fitCameraToBounds\(bounds, \{ topOnly \}\)/);
assert.doesNotMatch(cadFit, /state\.camera\.isPerspectiveCamera/);

const fitHelper = source.match(/function fitCameraToBounds\(bounds, \{ topOnly = false \} = \{\}\)[\s\S]*?function fitCamera\(\)/)?.[0] || '';
assert.match(fitHelper, /setCameraUpFromPreset\(state\.camera, \[0, 0, 1\]\)/);
assert.match(fitHelper, /state\.controls\.target\.copy\(center\)/);
assert.match(fitHelper, /state\.controls\.update\(\)/);
assert.match(fitHelper, /requestRender\(\)/);

assert.match(source, /state\.controls\.addEventListener\('start', beginSimulationViewNavigation\)/);
assert.match(source, /state\.controls\.addEventListener\('end', endSimulationViewNavigation\)/);

console.log('3D Simulation CAD view-control validation passed.');
