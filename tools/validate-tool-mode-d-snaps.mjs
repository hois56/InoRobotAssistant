import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { averagePoints, buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs';

const modeDSource = readFileSync(new URL('../3_ToolSelector/mode-d.js', import.meta.url), 'utf8');
const modeDStyles = readFileSync(new URL('../3_ToolSelector/mode-d.css', import.meta.url), 'utf8');
const modeDHtml = readFileSync(new URL('../3_ToolSelector/index.html', import.meta.url), 'utf8');
const multiPointTranslations = {
  en: ['Multiple point center', 'Multiple point selection'],
  'zh-CN': ['多点中心', '多点选择'],
  vi: ['Tâm đa điểm', 'Chọn nhiều điểm']
};
for (const [locale, [centerLabel, selectionLabel]] of Object.entries(multiPointTranslations)) {
  const localeData = JSON.parse(readFileSync(new URL(`../Language/${locale}/tool-selector.json`, import.meta.url), 'utf8'));
  assert.equal(localeData.legacy['다중 점 중심점'], centerLabel);
  assert.equal(localeData.legacy['다중 점 선택'], selectionLabel);
  assert.notEqual(localeData.legacy['스냅 선택'], '스냅 선택');
}
const cadRobotSelectionTranslations = {
  en: 'Evaluate Robot Suitability',
  'zh-CN': '评估机器人适用性',
  vi: 'Đánh giá độ phù hợp của robot'
};
for (const [locale, label] of Object.entries(cadRobotSelectionTranslations)) {
  const localeData = JSON.parse(readFileSync(new URL(`../Language/${locale}/tool-selector.json`, import.meta.url), 'utf8'));
  assert.equal(localeData.legacy['로봇 적합성 판정'], label);
  assert.notEqual(localeData.legacy['CAD 계산 결과로 로봇 선정'], 'CAD 계산 결과로 로봇 선정');
}
assert.match(modeDSource, /import \{ TrackballControls \} from '.\/vendor\/three\/examples\/jsm\/controls\/TrackballControls\.js'/);
assert.match(modeDSource, /new TrackballControls\(state\.camera, state\.renderer\.domElement\)/);
assert.match(modeDSource, /state\.controls\.staticMoving\s*=\s*true/);
assert.doesNotMatch(modeDSource, /new OrbitControls\(/);
assert.match(modeDSource, /state\.controls\?\.handleResize\?\.\(\)/);
assert.match(modeDSource, /KG_PER_MM3_PER_G_PER_CM3\s*=\s*1e-6/);
assert.match(modeDSource, />g\/cm³</);
assert.doesNotMatch(modeDSource, />kg\/mm³</);
assert.match(modeDSource, /markerParent\.clientLeft/);
assert.match(modeDSource, /markerParent\.clientTop/);
assert.match(modeDSource, /function isSnapCandidateVisible/);
assert.match(modeDSource, /function findSnapAtPointer\(pointerEvent\)\s*\{\s*if \(!state\.parts\.length[\s\S]*?\) return null;\s*state\.camera\.updateMatrixWorld\(true\);\s*state\.scene\.updateMatrixWorld\(true\);/s);
assert.match(modeDSource, /visibilityRaycaster\.intersectObjects\(enabledMeshes, false\)/);
assert.match(modeDSource, /candidateDistance\s*<=\s*frontHit\.distance\s*\+\s*depthTolerance/);
assert.match(modeDSource, /function pickSnapFaceAtPointer\(pointerEvent\)/);
assert.match(modeDSource, /modeDPartIndex\s*=\s*partIndex/);
assert.match(modeDSource, /function getSnapFaceTriangleRange\(part, triangleIndex\)/);
assert.match(modeDSource, /function createSnapFaceOverlay\(selection\)/);
assert.match(modeDSource, /function selectSnapFace\(selection\)[\s\S]*?triangleRanges:\s*selection\.triangleRanges/s);
assert.match(modeDSource, /state\.snapFaceCandidates\.forEach\(\(candidate\)\s*=>/);
assert.match(modeDSource, /const snap\s*=\s*state\.snapFaceSelection\s*\?\s*findSnapAtPointer\(event\)\s*:\s*null/);
assert.match(modeDSource, /selection\.key\s*!==\s*state\.snapFaceSelection\?\.key\s*&&\s*selectSnapFace\(selection\)/);
assert.match(modeDSource, /clearSnapFaceSelection\(\);[\s\S]*?state\.multiPoints\.push|state\.multiPoints\.push[\s\S]*?clearSnapFaceSelection\(\);/s);
assert.match(modeDSource, /function updateSnapCandidateMarkers\(\)/);
assert.match(modeDSource, /state\.snapFaceCandidates\.forEach\(\(candidate\)\s*=>/);
assert.match(modeDSource, /state\.snapDisplayedCandidates\s*=\s*candidates\.map/);
assert.match(modeDSource, /state\.snapCandidateMarkers\.push\(createSnapCandidateMarker\(\)\)/);
assert.match(modeDSource, /state\.controls\.addEventListener\('start', hideSnapCandidateMarkersForNavigation\)/);
assert.match(modeDSource, /state\.controls\.addEventListener\('end',[\s\S]*?updateSnapCandidateMarkers\(\)/s);
assert.match(modeDStyles, /\.cad-snap-candidate-marker\s*\{[^}]*z-index:\s*3;/s);
assert.match(modeDStyles, /\.cad-snap-candidate-marker > span\s*\{[^}]*opacity:\s*\.82;/s);
assert.match(modeDStyles, /\.cad-snap-marker\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;/s);
assert.match(modeDStyles, /\.cad-snap-marker\s*\{[^}]*color:\s*#f59e0b;/s);
assert.match(modeDStyles, /\.cad-snap-marker > span\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;[^}]*border:\s*1\.25px solid currentColor;/s);
assert.match(modeDStyles, /\.cad-snap-marker > span\s*\{[^}]*background:\s*transparent;[^}]*font-size:\s*0;/s);
assert.doesNotMatch(modeDStyles, /\.cad-snap-marker::(?:before|after)/);
assert.match(modeDStyles, /data-snap-type="circle-center"[^}]*> span,[\s\S]*?border-radius:\s*50%/);
assert.match(modeDStyles, /data-snap-type="rectangle-center"[^}]*> span\s*\{[^}]*background:\s*radial-gradient\(circle at center,/);
assert.match(modeDStyles, /transform:\s*scale\(var\(--cad-snap-camera-scale\)\)/);
assert.match(modeDStyles, /filter:\s*drop-shadow\(0 0 2px/);
assert.match(modeDStyles, /data-snap-type="endpoint"[^}]*> span\s*\{[^}]*background:\s*radial-gradient\(circle at center,/s);
assert.match(modeDStyles, /\.cad-snap-marker b\s*\{[^}]*position:\s*absolute;/s);
assert.match(modeDSource, /new TransformControls\(state\.camera, state\.renderer\.domElement\)/);
assert.match(modeDSource, /ROBOT_SELECTION_GRAVITY\s*=\s*9\.8/);
assert.match(modeDSource, /function calculateCadRobotSuitability\(\)/);
assert.match(modeDSource, /centerInertia\[1\]\[1\] \+ mass \* \(x \* x \+ z \* z\)/);
assert.match(modeDSource, /centerInertia\[2\]\[2\] \+ mass \* \(x \* x \+ y \* y\)/);
assert.match(modeDSource, /state\.massProperties\s*=\s*\{/);
assert.match(modeDSource, /invalidateCadRobotSelection\(\)/);
assert.match(modeDHtml, /id="cad-robot"/);
assert.match(modeDHtml, /id="cad-robot-calculate"[^>]*disabled/);
assert.match(modeDHtml, /id="cad-robot-result"[^>]*hidden/);
assert.match(modeDHtml, /window\.ToolSelectorRobotModels\s*=\s*ROBOTS/);
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
assert.match(modeDSource, /function keepHelperAtScreenSize/);
assert.match(modeDSource, /function updateCameraScaledHelpers/);
assert.match(modeDSource, /worldUnitsPerPixel\s*=\s*\(cameraDepth \* fovScale\) \/ \(viewportHeight \* cameraZoom\)/);
assert.match(modeDSource, /updateCameraScaledHelpers\(\);\s*\r?\n\s*updateSnapMarkerCameraScale\(\);\s*\r?\n\s*state\.renderer\.render/);
assert.match(modeDSource, /function updateSnapMarkerCameraScale\(\)/);
assert.match(modeDSource, /Math\.sqrt\(cameraDistance \/ referenceDistance\)/);
assert.match(modeDSource, /SNAP_MARKER_CAMERA_SCALE\.min/);
assert.match(modeDSource, /HELPER_SCREEN_PIXELS\.tcp/);
assert.match(modeDSource, /HELPER_SCREEN_PIXELS\.selectedSnap/);
assert.match(modeDSource, /function createCenterOfMassMarker/);
assert.match(modeDSource, /color:\s*0xfacc15/);
assert.match(modeDHtml, /cad-legend-tcp/);
assert.match(modeDHtml, /cad-legend-cog/);
assert.match(modeDHtml, /id="cad-grid-toggle"[^>]*aria-pressed="false"[^>]*>그리드 OFF</);
assert.match(modeDHtml, /id="cad-outline-toggle"[^>]*aria-pressed="false"/);
assert.match(modeDSource, /gridVisible:\s*false/);
assert.match(modeDSource, /outlineMode:\s*false/);
assert.match(modeDSource, /state\.gridHelper\.visible\s*=\s*state\.gridVisible/);
assert.match(modeDSource, /function toggleGrid\(\)/);
assert.match(modeDSource, /function syncPartOutlines\(\)/);
assert.match(modeDSource, /function setOutlineMode\(enabled\)/);
assert.match(modeDSource, /new THREE\.EdgesGeometry\(mesh\.geometry, 28\)/);
assert.match(modeDSource, /new THREE\.LineSegments\(/);
assert.match(modeDSource, /el\.gridToggle\.setAttribute\('aria-pressed', String\(state\.gridVisible\)\)/);
assert.match(modeDStyles, /\.cad-grid-toggle\s*\{/);
assert.match(modeDStyles, /\.cad-grid-toggle\.is-active\s*\{/);
assert.match(modeDStyles, /\.cad-outline-toggle\s*\{/);
assert.match(modeDStyles, /\.cad-outline-toggle\.is-active\s*\{/);
assert.match(modeDSource, /function syncOrientationFromHandler/);
assert.match(modeDHtml, /data-vector="rotation" data-axis="x"/);
assert.match(modeDHtml, /data-vector="rotation" data-axis="y"/);
assert.match(modeDHtml, /data-vector="rotation" data-axis="z"/);
assert.doesNotMatch(modeDHtml, /data-pick="(?:x|y)"/);
assert.match(modeDHtml, /data-axis-direction="z"/);
assert.match(modeDHtml, />좌표계 방향 \(deg\)</);
assert.doesNotMatch(modeDHtml, /id="cad-rotation-handler"[^>]*checked/);
assert.match(modeDHtml, /value="multi-point-center"/);
assert.doesNotMatch(modeDHtml, /value="multi-circle-center"/);
assert.match(modeDHtml, /id="cad-multi-center-apply"/);
assert.match(modeDHtml, /id="cad-multi-center-reset"/);
assert.match(modeDSource, /requiredType\s*=\s*isMultiPointCenterMode\(\)\s*\?\s*'auto'/);
assert.match(modeDSource, /multiPoints\.length\s*>=\s*4/);
assert.doesNotMatch(modeDSource, /isMultiPointCenterMode\(\)\s*\?\s*'circle-center'/);
assert.match(modeDSource, /addEventListener\('inorobot:i18nready', refreshDynamicLanguage\)/);
assert.match(modeDSource, /addEventListener\('inorobot:languagechange', refreshDynamicLanguage\)/);
assert.match(modeDSource, /function snapTypeLabelKey\(type\)/);
assert.match(modeDSource, /function setSnapReadout\(message\)/);
assert.match(modeDSource, /function refreshDynamicLanguage\(\)[\s\S]*?renderStatus\(\);[\s\S]*?renderSnapReadout\(\);/);
assert.match(modeDSource, /commitSnapPoint\(getMultiPointCenter\(\), '다중 점 중심점'\)/);
assert.match(modeDHtml, />에지 중심점</);
assert.match(modeDHtml, />면 중심점</);
assert.match(modeDHtml, />원\/호 중심점</);
assert.match(modeDHtml, />사각형 중심점</);
assert.match(modeDHtml, />형상 중심점</);
assert.doesNotMatch(modeDHtml, /value="surface"/);
assert.doesNotMatch(modeDHtml, /면 위 자유점/);
assert.doesNotMatch(modeDSource, /type:\s*'surface'/);

assert.deepEqual(averagePoints([[0, 0, 0], [10, 0, 0]]), [5, 0, 0]);
assert.deepEqual(averagePoints([[0, 0, 0], [12, 0, 0], [0, 12, 0]]), [4, 4, 0]);
assert.deepEqual(averagePoints([[0, 0, 0], [8, 0, 0], [8, 8, 0], [0, 8, 0]]), [4, 4, 0]);
assert.throws(() => averagePoints([[0, 0, 0]]), RangeError);
assert.throws(() => averagePoints(Array.from({ length: 5 }, () => [0, 0, 0])), RangeError);
assert.throws(() => averagePoints([[0, 0, 0], [Number.NaN, 0, 0]]), TypeError);

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
assert.equal(byType('rectangle-center').length, 6);
assert.equal(byType('shape-center').length, 1);
assert.ok(hasPoint(byType('vertex'), [100, 200, 300]));
assert.ok(hasPoint(byType('endpoint'), [100, 200, 300]));
assert.ok(hasPoint(byType('edge-midpoint'), [50, 0, 0]));
assert.ok(hasPoint(byType('face-center'), [50, 100, 300]));
assert.ok(hasPoint(byType('rectangle-center'), [50, 100, 300]));
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

function createArcFan(angleDegrees, segmentCount, radius = 50, radialScale = () => 1) {
  const positions = [0, 0, 0];
  const indices = [];
  for (let segment = 0; segment <= segmentCount; segment += 1) {
    const angle = (-angleDegrees / 2 + angleDegrees * segment / segmentCount) * Math.PI / 180;
    const scaledRadius = radius * radialScale(segment);
    positions.push(Math.cos(angle) * scaledRadius, Math.sin(angle) * scaledRadius, 0);
  }
  for (let segment = 0; segment < segmentCount; segment += 1) indices.push(0, segment + 1, segment + 2);
  return {
    attributes: { position: { array: positions } },
    index: { array: indices },
    brep_faces: [{ first: 0, last: segmentCount - 1 }]
  };
}

const coarseArcResult = buildStepSnapCandidates(createArcFan(120, 4));
assert.ok(coarseArcResult.candidates
  .filter(({ type }) => type === 'circle-center')
  .some(({ point }) => Math.hypot(...point) < 1e-5));
const imperfectArcResult = buildStepSnapCandidates(createArcFan(
  180,
  12,
  50,
  (segment) => (segment === 4 ? 1.02 : segment === 8 ? 0.985 : 1)
));
assert.ok(imperfectArcResult.candidates
  .filter(({ type }) => type === 'circle-center')
  .some(({ point }) => Math.hypot(...point) < 1));

console.log('Tool Mode D snap validation passed.');
