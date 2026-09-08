import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    calculateMeasurementResult,
    calculatePlacementTarget,
    isValidTargetDistance
} from '../2_3DSimulation/measurement-core.mjs';

const measurement = calculateMeasurementResult(
    { x: 1, y: -2, z: 3 },
    { x: 4, y: 2, z: 15 }
);
assert.equal(measurement.diagonal, 13);
assert.deepEqual(
    [measurement.orthogonalX, measurement.orthogonalY, measurement.orthogonalZ],
    [3, 4, 12]
);
assert.deepEqual([measurement.dx, measurement.dy, measurement.dz], [3, 4, 12]);

const samePoint = calculateMeasurementResult(
    { x: 10, y: 20, z: 30 },
    { x: 10, y: 20, z: 30 }
);
assert.equal(samePoint.isSamePoint, true);
assert.equal(calculatePlacementTarget(samePoint.first, samePoint.second, 10), null);

const placement = calculatePlacementTarget(
    { x: 0, y: 0, z: 0 },
    { x: 3, y: 4, z: 0 },
    10
);
assert.deepEqual(placement.targetPoint, { x: 6, y: 8, z: 0 });
assert.deepEqual(placement.translation, { x: 6, y: 8, z: 0 });
const unchangedPlacement = calculatePlacementTarget(
    { x: -1, y: 2, z: 5 },
    { x: -1, y: 2, z: 10 },
    5
);
assert.deepEqual(unchangedPlacement.targetPoint, { x: -1, y: 2, z: 10 });
assert.equal(isValidTargetDistance(0), true);
assert.equal(isValidTargetDistance(-1), false);
assert.equal(isValidTargetDistance(NaN), false);
assert.equal(isValidTargetDistance(Infinity), false);
assert.equal(isValidTargetDistance('10'), false);

const html = readFileSync(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8');
assert.match(html, /id="measurement-panel"/);
assert.match(html, /id="btn-measurement"/);
assert.match(html, /data-panel-toggle="measurement-panel"/);
assert.doesNotMatch(html, /data-measurement-mode="free-space"/);
assert.doesNotMatch(html, /measurement-mode-tabs/);
assert.match(html, /id="measurement-snap-controls"/);
assert.doesNotMatch(html, /id="model-zero-snap-radius"/);
assert.doesNotMatch(html, /id="measurement-snap-radius"/);
assert.doesNotMatch(html, /id="tcp-snap-radius"/);
assert.match(html, /name="measurement-display-mode" value="diagonal"/);
assert.match(html, /id="snap-face-orientation-actions"/);
assert.match(html, /id="btn-snap-face-horizontal"/);
assert.match(html, /id="btn-snap-face-vertical"/);
assert.equal((html.match(/data-view-monitor[^>]*disabled/g) || []).length, 0);
assert.match(css, /\.viewer-language-row \.inorobot-language-label\s*\{\s*display:\s*none;/);
assert.match(css, /\.viewer-language-row \.inorobot-language-select\s*\{[\s\S]*?width:\s*76px;[\s\S]*?min-width:\s*76px;/);
assert.match(css, /\.snap-face-orientation-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
assert.match(html, /id="model-placement-section"/);
assert.doesNotMatch(html, /id="model-placement-snap-radius"/);
assert.doesNotMatch(html, /id="measurement-placement-model"/);
assert.doesNotMatch(html, /id="measurement-placement-p1"/);
assert.doesNotMatch(html, /id="measurement-placement-p2"/);
assert.doesNotMatch(html, /id="measurement-placement-distance-input"/);
assert.doesNotMatch(html, /id="measurement-placement-translation"/);
assert.match(css, /\.measurement-placement-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
assert.doesNotMatch(html, /id="measurement-placement-current-distance"/);
assert.doesNotMatch(html, /data-measurement-mode="placement"/);
const placementIndex = html.indexOf('id="model-placement-section"');
assert.ok(placementIndex > html.indexOf('id="model-transform-panel"'));
assert.ok(placementIndex < html.indexOf('id="measurement-panel"'));
assert.match(main, /calculatePlacementTarget/);
assert.match(main, /getSimulationSnapScope\(\).*measurement/s);
assert.match(main, /if \(state\.placement\.active\) return 'placement';/);
assert.match(main, /function activateModelPlacement\(model\)/);
assert.doesNotMatch(main, /candidateModel\?\.userData\?\.uploaded/);
const placementSnapSelectionFunction = main.match(
    /function handleMeasurementSnapSelection\(snap\)[\s\S]*?(?=\r?\nfunction resetMeasurementSelection)/
)?.[0] || '';
assert.doesNotMatch(placementSnapSelectionFunction, /candidateModel|candidateModel\s*!==\s*placement\.model/);
assert.match(placementSnapSelectionFunction, /placement\.sourcePoint = point;/);
assert.match(
    placementSnapSelectionFunction,
    /placement\.sourcePoint = point;[\s\S]*?clearSimulationSnapFaceSelection\(\{ invalidate: false \}\);[\s\S]*?invalidateSimulationSnapCandidates\(\)/
);
assert.match(main, /parent\.worldToLocal\(sourceWorldPoint\.clone\(\)\)/);
assert.match(main, /function setPrimitiveShapeDimensionMode\(enabled\)/);
assert.match(main, /button\.disabled = false;/);
assert.match(main, /modelBrowserPanel\?\.classList\.toggle\('transform-mode-active', Boolean\(activeMode\)\)/);
assert.match(main, /shapePanelVisible \|\| dimensionModeActive/);
assert.match(main, /isPrimitiveShapeModel\(state\.selectedModel\) && mode === 'scale'[\s\S]*?setPrimitiveShapeDimensionMode\(true\)/);
assert.match(main, /function updatePlacementDimensionOverlay\(\)/);
assert.match(main, /showExtensionLines = true/);
assert.match(main, /function updatePlacementPreviewFromTranslation\(translation\)/);
assert.match(main, /function exitActiveTransformMode\(\)/);
assert.match(main, /event\.key === 'Escape' && exitActiveTransformMode\(\)/);
assert.match(main, /function capturePlacementDimensionOrigin\(\)/);
assert.match(main, /function handlePlacementTransformObjectChange\(target\)/);
assert.match(main, /state\.transformControls\.addEventListener\('objectChange', \(\) => \{\s*handlePlacementTransformObjectChange/s);
assert.match(main, /dimensionOriginWorldPoint/);
assert.match(main, /dimensionTargetWorldPoint/);
assert.match(main, /PLACEMENT_DIMENSION_DISPLAY_EPSILON/);
assert.match(main, /function beginPlacementDimensionLabelEdit\(axis\)/);
assert.match(main, /function finishPlacementDimensionLabelEdit\(edit, apply\)/);
assert.match(main, /if \(state\.placement\.active\) \{\s*updatePlacementDimensionOverlay\(\);\s*return;/);
assert.match(main, /const pX = new THREE\.Vector3\(target\.x, source\.y, source\.z\)/);
const placementOverlayFunction = main.match(
    /function updatePlacementDimensionOverlay\(\)[\s\S]*?(?=\r?\nfunction updatePrimitiveDimensionOverlay)/
)?.[0] || '';
assert.match(placementOverlayFunction, /const dimensionStart = descriptor\.source\[0\]\.clone\(\);/);
assert.match(placementOverlayFunction, /const dimensionEnd = descriptor\.source\[1\]\.clone\(\);/);
assert.match(placementOverlayFunction, /dimensionEnd,\s*false/);
assert.match(main, /label\.textContent = `\$\{axis\.toUpperCase\(\)\} =/);
assert.match(main, /edit\.kind === 'placement'[\s\S]*?finishPlacementDimensionLabelEdit\(edit, apply\)/);
assert.match(main, /const translation = placement\.dimensionTranslation/);
assert.match(main, /function applyPlacementDimensionTranslation\(translation\)/);
assert.match(main, /input\.addEventListener\('input', \(\) => \{/);
assert.match(css, /\.model-browser-panel\.transform-mode-active \.model-tree\s*\{[\s\S]*?max-height:\s*76px/);
assert.match(css, /\.model-browser-panel\.transform-mode-active \.model-transform-panel\s*\{[\s\S]*?flex:\s*1 1 auto/);
assert.match(main, /const previewTranslation = placement\.previewTranslation\?\.clone\(\)/);
assert.match(main, /applyWorldTranslationToModel\(\s*getPlacementTransformTarget\(\),\s*placement\.sourceWorldPoint,\s*previewTargetPoint/s);
const transformModeFunction = main.match(
    /function toggleSelectedTransformMode\(mode\)[\s\S]*?(?=\r?\nfunction setModelPlacementUiVisibility)/
 )?.[0] || '';
assert.match(transformModeFunction, /if \(state\.placement\.active\) deactivateModelPlacement\(\);/);
assert.match(main, /recordHistory\('선택 모델 기준 배치'/);
assert.match(main, /if \(handleMeasurementSnapSelection\(snap\)\) showSimulationSnapMarker\(snap\);/);
assert.doesNotMatch(main, /isFreeSpaceMeasurementActive|handleFreeMeasurementSelection|captureFreeSpaceMeasurementPlane|findFreeMeasurementPointAtPointer|freeSpaceComplete|freeSpacePlane|freeSpaceFallback|free-space/);
assert.match(main, /const displayMode = placement\.active \? 'diagonal' : measurement\.displayMode;/);
assert.match(main, /const point = createMeasurementPoint\(snap\);/);
assert.match(main, /const snap = findSimulationSnapAtPointer\(event\);/);
assert.doesNotMatch(main, /snapRadiusPx|measurementSnapRadius|zeroPointSnapRadius|tcpSnapRadius/);
assert.match(main, /const snapRadius = SNAP_RADIUS_PX/);
assert.match(main, /function getSimulationSnapFaceNormal\(selection = getActiveSimulationSnapFaceSelection\(\)\)/);
assert.match(main, /new THREE\.Matrix3\(\)\.getNormalMatrix\(mesh\.matrixWorld\)/);
assert.match(main, /function applySnapFaceOrientation\(mode\)/);
assert.match(main, /function createViewWindowCell\(slot, fallbackPreset = null\)/);
assert.match(main, /const preset = getViewPreset\(slot\) \|\| fallbackPreset;/);
assert.match(main, /function openViewWindow\(slot\)[\s\S]*?getViewPreset\(index\) \|\| captureViewPreset\(index\)/);
assert.match(main, /monitorButton\.disabled = !state\.camera \|\| !state\.scene/);
assert.match(main, /targetTcpZ\.copy\(currentTcpZ\)/);
assert.match(main, /mode === 'vertical'[\s\S]*?targetTcpZ\.dot\(currentTcpZ\)/);
assert.match(main, /applySnapFaceOrientation\('horizontal'\)/);
assert.match(main, /applySnapFaceOrientation\('vertical'\)/);
assert.match(main, /updateSnapFaceOrientationUi\(\)/);
assert.match(main, /const targetTcpZDirections =/);
assert.match(main, /const twistAngles =/);
assert.match(main, /for \(const candidate of targetCandidates\)/);
const panelLauncherFunction = main.match(
    /function updatePanelLauncher\([\s\S]*?(?=\r?\nfunction togglePanelVisibility)/
)?.[0] || '';
assert.match(panelLauncherFunction, /panelId === 'jog-panel' && !getJogTargetRobot\(\)/);
assert.doesNotMatch(panelLauncherFunction, /isPrimitiveShapeModel\(state\.selectedModel\)/);
const sceneSelectionFunction = main.match(
    /function selectSceneModel\([\s\S]*?(?=\r?\nfunction beginNumericTransformHistory)/
)?.[0] || '';
assert.doesNotMatch(sceneSelectionFunction, /renderPrimitiveJogControls|hideJogPanel\(\)/);
assert.match(main, /label\._measurementWorldPoint = null;/);
assert.match(main, /if \(!worldPoint\) \{\s*label\.classList\.add\('hidden'\);\s*return;/);
assert.match(css, /\.measurement-overlay-label/);

console.log('3D Simulation measurement validation passed.');
