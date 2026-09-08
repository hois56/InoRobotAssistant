import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const style = readFileSync(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8');

assert.match(html, /id="cad-origin-snap-type"/);
assert.doesNotMatch(html, /id="cad-origin-snap"/);
assert.match(html, /data-i18n="legacy\.스냅 기준"/);
assert.match(html, /id="cad-point-placement"/);
assert.match(html, /id="cad-point-target-x"/);
assert.match(html, /id="cad-point-target-y"/);
assert.match(html, /id="cad-point-target-z"/);
assert.match(html, /id="cad-point-move"/);
assert.match(html, /data-i18n="legacy\.선택점을 이 위치로 이동"/);

assert.match(source, /selectedCandidate: null/);
assert.match(source, /function findCadSnapAtPointer\(pointerEvent, \{ entityId = null, allowOutsideRadius = false \} = \{\}\)/);
assert.match(source, /if \(entityId && candidate\.entityId !== entityId\) return;/);
assert.match(source, /if \(!allowOutsideRadius && pixelDistance > SNAP_RADIUS_PX\) return;/);
assert.match(source, /function selectCadSnapCandidate\(snap\)/);
assert.match(source, /function applyCadPointPlacement\(\)/);
assert.match(source, /root\.position\.add\(targetParentPoint\.sub\(currentParentPoint\)\)/);
assert.match(source, /findCadSnapAtPointer\(event, \{[\s\S]*?entityId: hit\.entity\.id,[\s\S]*?allowOutsideRadius: true/);
assert.match(source, /el\.cadPointMove\?\.addEventListener\('click', applyCadPointPlacement\)/);
assert.doesNotMatch(source, /el\.cadOriginSnap\?\.addEventListener\('click'/);

assert.match(style, /\.cad-point-placement\s*\{/);
assert.match(style, /\.cad-point-target-grid\s*\{/);
assert.match(style, /\.cad-point-placement \.shape-primary-button/);

console.log('2D CAD automatic snap and point placement validation passed');
