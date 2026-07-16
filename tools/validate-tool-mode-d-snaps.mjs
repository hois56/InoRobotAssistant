import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs';

const modeDSource = readFileSync(new URL('../3_ToolSelector/mode-d.js', import.meta.url), 'utf8');
const modeDStyles = readFileSync(new URL('../3_ToolSelector/mode-d.css', import.meta.url), 'utf8');
const modeDHtml = readFileSync(new URL('../3_ToolSelector/index.html', import.meta.url), 'utf8');
assert.match(modeDSource, /state\.controls\.enableDamping\s*=\s*false/);
assert.doesNotMatch(modeDSource, /state\.controls\.dampingFactor\s*=/);
assert.match(modeDSource, /KG_PER_MM3_PER_G_PER_CM3\s*=\s*1e-6/);
assert.match(modeDSource, />g\/cm³</);
assert.doesNotMatch(modeDSource, />kg\/mm³</);
assert.match(modeDSource, /markerParent\.clientLeft/);
assert.match(modeDSource, /markerParent\.clientTop/);
assert.match(modeDSource, /function isSnapCandidateVisible/);
assert.match(modeDSource, /visibilityRaycaster\.intersectObjects\(enabledMeshes, false\)/);
assert.match(modeDSource, /candidateDistance\s*<=\s*frontHit\.distance\s*\+\s*depthTolerance/);
assert.match(modeDStyles, /\.cad-snap-marker\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;/s);
assert.match(modeDStyles, /\.cad-snap-marker b\s*\{[^}]*position:\s*absolute;/s);
assert.match(modeDSource, /new TransformControls\(state\.camera, state\.renderer\.domElement\)/);
assert.match(modeDSource, /state\.rotationHandler\.setMode\('rotate'\)/);
assert.match(modeDSource, /removeRotationScreenHandle\(state\.rotationHandler\)/);
assert.match(modeDSource, /object\.name\s*===\s*'E'/);
assert.match(modeDSource, /AXIS_COLORS\s*=\s*Object\.freeze\(\{\s*x:\s*'#d32f2f',\s*y:\s*'#388e3c',\s*z:\s*'#1976d2'\s*\}\)/);
assert.match(modeDSource, /applyTransformControlColors\(state\.rotationHandler\)/);
assert.match(modeDSource, /function createThickAxesHelper/);
assert.match(modeDSource, /new THREE\.CylinderGeometry\(shaftRadius, shaftRadius, shaftLength/);
assert.match(modeDSource, /function createTcpTargetMarker/);
assert.match(modeDSource, /new THREE\.OctahedronGeometry\(size, 0\)/);
assert.match(modeDSource, /targetColor\s*=\s*0x22d3ee/);
assert.match(modeDSource, /function createCenterOfMassMarker/);
assert.match(modeDSource, /color:\s*0xfacc15/);
assert.match(modeDHtml, /cad-legend-tcp/);
assert.match(modeDHtml, /cad-legend-cog/);
assert.match(modeDHtml, /id="cad-grid-toggle"[^>]*aria-pressed="false"[^>]*>그리드 OFF</);
assert.match(modeDSource, /gridVisible:\s*false/);
assert.match(modeDSource, /state\.gridHelper\.visible\s*=\s*state\.gridVisible/);
assert.match(modeDSource, /function toggleGrid\(\)/);
assert.match(modeDSource, /el\.gridToggle\.setAttribute\('aria-pressed', String\(state\.gridVisible\)\)/);
assert.match(modeDStyles, /\.cad-grid-toggle\s*\{/);
assert.match(modeDStyles, /\.cad-grid-toggle\.is-active\s*\{/);
assert.match(modeDSource, /function syncOrientationFromHandler/);
assert.match(modeDHtml, /data-vector="rotation" data-axis="x"/);
assert.match(modeDHtml, /data-vector="rotation" data-axis="y"/);
assert.match(modeDHtml, /data-vector="rotation" data-axis="z"/);
assert.doesNotMatch(modeDHtml, /data-pick="(?:x|y)"/);
assert.match(modeDHtml, /data-axis-direction="z"/);
assert.match(modeDHtml, />에지 중심점</);
assert.match(modeDHtml, />면 중심점</);
assert.match(modeDHtml, />원\/호 중심점</);
assert.match(modeDHtml, />형상 중심점</);
assert.doesNotMatch(modeDHtml, /value="surface"/);
assert.doesNotMatch(modeDHtml, /면 위 자유점/);
assert.doesNotMatch(modeDSource, /type:\s*'surface'/);

const positions = [
  [0, 0, 0], [100, 0, 0], [100, 200, 0], [0, 200, 0],
  [0, 0, 300], [100, 0, 300], [100, 200, 300], [0, 200, 300]
];

const triangles = [
  [0, 2, 1], [0, 3, 2],
  [4, 5, 6], [4, 6, 7],
  [0, 1, 5], [0, 5, 4],
  [1, 2, 6], [1, 6, 5],
  [2, 3, 7], [2, 7, 6],
  [3, 0, 4], [3, 4, 7]
];

const meshDefinition = {
  attributes: { position: { array: positions.flat() } },
  index: { array: triangles.flat() },
  brep_faces: Array.from({ length: 6 }, (_, index) => ({ first: index * 2, last: index * 2 + 1, color: null }))
};

const { candidates, stats } = buildStepSnapCandidates(meshDefinition, { solidCenter: [50, 100, 150] });
const byType = (type) => candidates.filter((candidate) => candidate.type === type);
const hasPoint = (items, expected, tolerance = 1e-8) => items.some(({ point }) => (
  Math.hypot(point[0] - expected[0], point[1] - expected[1], point[2] - expected[2]) <= tolerance
));

assert.equal(stats.faceCount, 6);
assert.equal(stats.featureEdgeCount, 12);
assert.equal(byType('vertex').length, 8);
assert.equal(byType('endpoint').length, 8);
assert.equal(byType('edge-midpoint').length, 12);
assert.equal(byType('face-center').length, 6);
assert.equal(byType('shape-center').length, 1);
assert.ok(hasPoint(byType('vertex'), [100, 200, 300]));
assert.ok(hasPoint(byType('endpoint'), [100, 200, 300]));
assert.ok(hasPoint(byType('edge-midpoint'), [50, 0, 0]));
assert.ok(hasPoint(byType('face-center'), [50, 100, 300]));
assert.ok(hasPoint(byType('shape-center'), [50, 100, 150]));

const virtualMesh = {
  attributes: {
    position: {
      array: [
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        2, 1, 0, 2, 2, 0, 3, 1, 0
      ]
    }
  },
  index: { array: [0, 1, 2, 3, 4, 5] },
  brep_faces: [{ first: 0, last: 0, color: null }, { first: 1, last: 1, color: null }]
};
const virtualResult = buildStepSnapCandidates(virtualMesh, { virtualExtensionRatio: 1.5 });
assert.ok(hasPoint(virtualResult.candidates.filter((candidate) => candidate.type === 'virtual-intersection'), [2, 0, 0]));

console.log('Tool Mode D snap validation passed.');
