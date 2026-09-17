import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildStepSnapCandidates } from '../3_ToolSelector/snap-geometry.mjs';

const simulationSource = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const simulationStyles = readFileSync(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8');
const simulationHtml = readFileSync(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');
const stepWorkerSource = readFileSync(new URL('../2_3DSimulation/step-import-worker.js', import.meta.url), 'utf8');
assert.match(simulationHtml, /id="robot-model-choice-dialog"/);
assert.match(simulationHtml, /id="btn-add-robot-model-choice"/);
assert.match(simulationHtml, /id="btn-replace-robot-model-choice"/);
assert.match(simulationHtml, /data-interference-snap-point="p1"/);
assert.match(simulationHtml, /data-interference-snap-point="p2"/);
assert.match(simulationHtml, /data-interference-snap-point="datum"/);
assert.match(simulationSource, /getArticulatedRobots\(\)\.length === 0/);
assert.match(simulationSource, /openRobotModelChoiceDialog\(model\)/);
assert.match(simulationSource, /function setInterferenceSnapMode\(enabled/);
assert.match(simulationSource, /function handleInterferenceSnapSelection\(snap\)/);
assert.match(simulationSource, /buildSimulationSnapCandidates\('interference'\)/);
assert.match(simulationSource, /scope === 'interference' && state\.interferenceSnapMode/);
const simulationSnapButtonFunction = simulationSource.match(
  /function updateSimulationSnapButton\(\)[\s\S]*?(?=\r?\n(?:async )?function toggleSimulationSnapMoveMode)/
)?.[0] || '';
assert.match(simulationSnapButtonFunction, /if \(state\.snapMoveMode\) setBaseJogGizmoEnabled\(false\)/);
assert.doesNotMatch(simulationSnapButtonFunction, /syncModelOutlines\(\)/);
assert.match(simulationSource, /function activateModelPlacement\([\s\S]*?updateSimulationSnapButton\(\);\s*syncModelOutlines\(\);/);
assert.match(simulationSource, /function deactivateModelPlacement\([\s\S]*?updateSimulationSnapButton\(\);\s*syncModelOutlines\(\);/);
assert.doesNotMatch(
  simulationSource,
  /state\.placement\.active && model\.userData\?\.tcpFrame/,
  'Robot outlines must remain visible while placement snap points are displayed.'
);
assert.match(simulationSource, /const snapMoveActive = Boolean\(state\.snapMoveMode\)/);
assert.match(simulationSource, /btnJogBaseMode\?\.classList\.toggle\('active', isBase && !snapMoveActive\)/);
const baseJogGizmoFunction = simulationSource.match(
  /function setBaseJogGizmoEnabled\(enabled\)[\s\S]*?(?=\r?\nfunction getBaseJogRotationAxes)/
)?.[0] || '';
assert.match(baseJogGizmoFunction, /&& !state\.snapMoveMode/);
assert.match(simulationSource, /void loadModelFromServer\(model, \{ append: true \}\)/);
assert.match(simulationSource, /const selectedRobot = getSelectedRobotModel\(\)/);
const selectedRobotFunction = simulationSource.match(
  /function getSelectedRobotModel\(\)[\s\S]*?(?=\r?\nfunction closeRobotModelChoiceDialog)/
)?.[0] || '';
assert.match(selectedRobotFunction, /getArticulatedRobots\(\)/);
assert.match(selectedRobotFunction, /state\.activeArticulatedModel/);
assert.match(selectedRobotFunction, /robots\.length === 1 \? robots\[0\] : null/);
assert.match(simulationSource, /el\.btnReplaceRobotModelChoice\.disabled = motionLocked \|\| !selectedRobot/);
assert.match(simulationSource, /replaceRobot: pending\.selectedRobot/);
assert.match(simulationSource, /function removeRobotForReplacement\(robot\)/);
assert.match(simulationSource, /removeRobotForReplacement\(replaceRobot\)/);
assert.match(simulationSource, /const replacingRobot = Boolean\(replaceRobot\)/);
assert.match(simulationSource, /const appendModel = options.append === true/);
assert.match(simulationSource, /else if \(!appendModel\) \{\s*cleanupScene\(\);\s*\}/);
assert.doesNotMatch(simulationSource, /btnAddMode|chk-add-mode|add-mode-toggle|모델 추가 모드|Add Mode|forceAddMode/);
assert.doesNotMatch(simulationHtml, /btnAddMode|chk-add-mode|add-mode-toggle|모델 추가 모드/);
assert.doesNotMatch(simulationStyles, /add-mode-toggle/);
const findSimulationSnapFunction = simulationSource.match(
  /function findSimulationSnapAtPointer\(pointerEvent\)[\s\S]*?(?=\r?\nfunction showSimulationSnapMarker)/
 )?.[0] || '';

assert.match(simulationSource, /mesh\.userData\.stepBrepFaces/);
assert.match(simulationSource, /function getPrimitiveShapeBrepFaces\(mesh\)/);
assert.match(simulationSource, /const brepFaces = getValidatedStepBrepFaces\(mesh\) \|\| getPrimitiveShapeBrepFaces\(mesh\)/);
assert.match(simulationSource, /brep_faces:\s*brepFaces/);
assert.match(simulationSource, /geometry\.groups/);
assert.match(simulationSource, /function getSimulationSnapFaceTriangleRanges\(mesh, triangleIndex\)[\s\S]*?getPrimitiveShapeBrepFaces\(mesh\)/);
assert.match(simulationSource, /meshDefinition\.brepFaces/);
assert.match(stepWorkerSource, /brepFaces:\s*Array\.isArray\(meshDefinition\.brep_faces\)/);
assert.match(stepWorkerSource, /first:\s*first \+ triangleOffset/);
assert.match(stepWorkerSource, /last:\s*last \+ triangleOffset/);
assert.match(stepWorkerSource, /STEP_MESH_CHUNK_TARGET_BYTES\s*=\s*6 \* 1024 \* 1024/);
assert.match(stepWorkerSource, /LARGE_STEP_MESH_CHUNK_TARGET_BYTES\s*=\s*4 \* 1024 \* 1024/);
assert.match(stepWorkerSource, /function postLargeMeshChunks\(mesh, message, requestId, partMeta = \{\}\)/);
assert.match(stepWorkerSource, /occt-wasm@3\.7\.0\/dist\/index\.js/);
assert.match(stepWorkerSource, /async function parseLargeStepFile\(message, requestId\)/);
assert.match(stepWorkerSource, /kernel\.meshShape\(shape/);
assert.match(stepWorkerSource, /kernel\[Symbol\.dispose\]\?\.\(\)/);
assert.match(stepWorkerSource, /function ensureOcctImporter\(\)/);
assert.match(stepWorkerSource, /message\.type === 'init'/);
assert.match(stepWorkerSource, /type:\s*'ready'/);
assert.match(simulationSource, /function warmStepImportWorker\(\)/);
assert.match(simulationSource, /function scheduleStepImportWorkerWarmup\(\)/);
assert.match(simulationSource, /scheduleStepImportWorkerWarmup\(\);/);
assert.match(simulationHtml, /id="import-quality"/);
assert.match(simulationHtml, /value="lightweight"/);
assert.match(simulationHtml, /value="standard"/);
assert.match(simulationHtml, /value="high"/);
assert.match(simulationSource, /STEP_IMPORT_QUALITY_PRESETS/);
assert.match(simulationSource, /function getSelectedStepImportQuality\(\)/);
assert.match(simulationSource, /function refreshImportQualityOptions\(/);
assert.match(simulationSource, /getStepTessellationParameters\(file\.size, qualityKey\)/);
assert.match(simulationSource, /getLargeStepTessellationParameters\(file\.size, qualityKey\)/);
assert.match(simulationSource, /getStepImportCacheKey\(file, parameters, qualityKey\)/);
assert.match(simulationSource, /parseUploaded3DFile\(file, extension, placement, importQuality\.key,/);
assert.match(simulationSource, /function readStepImportCache\(key\)/);
assert.match(simulationSource, /function scheduleStepImportCacheWrite\(record\)/);
assert.match(simulationSource, /cached\?\.meshes\?\.length/);
assert.match(simulationSource, /STEP_IMPORT_CACHE_MAX_ENTRIES\s*=\s*6/);
assert.match(simulationSource, /STEP_IMPORT_CACHE_MAX_SOURCE_BYTES\s*=\s*96 \* MEBIBYTE/);
assert.match(simulationSource, /const cacheEnabled = file\.size <= STEP_IMPORT_CACHE_MAX_SOURCE_BYTES/);
assert.match(simulationSource, /payload\.type === 'done'[\s\S]*?finish\(resolve, payload\);/);
assert.match(simulationSource, /payload\.type === 'error'[\s\S]*?finish\(reject,[\s\S]*?, true\)/);
assert.match(simulationSource, /await yieldToAnimationFrame\(\)/);
assert.match(simulationSource, /function getPreparedSimulationSnapMeshes\(scope = getSimulationSnapScope\(\)\)/);
assert.match(simulationSource, /function getSimulationSnapModels\(scope = 'scene'\)/);
assert.match(simulationSource, /function isSimulationSnapModel\(model\)[\s\S]*?model\?\.userData\?\.uploaded \|\| isPrimitiveShapeModel\(model\)/);
assert.match(simulationSource, /scope === 'zero'[\s\S]*?isSimulationSnapModel\(model\)/);
assert.match(simulationSource, /scope === 'scene'[\s\S]*?isSimulationSnapModel\(model\)/);
assert.match(simulationSource, /scope === 'placement'[\s\S]*?return getSimulationSnapModels\('scene'\)\.filter\(\(model\) => \(\s*model !== movingModel \|\| !state\.placement\.sourcePoint\s*\)\)/);
assert.match(simulationSource, /scope === 'tool'[\s\S]*?isPrimitiveShapeModel\(model\)[\s\S]*?model\.userData\.placement === 'scene'/);
assert.match(simulationSource, /const placement = scope === 'tool' \? 'tcp' : 'scene'/);
const getSimulationSnapMeshesFunction = simulationSource.match(
  /function getSimulationSnapMeshes\(scope = 'scene'\)[\s\S]*?(?=\r?\nfunction cloneSimulationSnapFaceSelection)/
 )?.[0] || '';
const getSimulationSnapFaceSelectionsFunction = simulationSource.match(
  /function getSimulationSnapFaceSelections\(\)[\s\S]*?(?=\r?\nfunction getSimulationSnapFaceSelectionSignature)/
 )?.[0] || '';
const buildSimulationSnapResultFunction = simulationSource.match(
  /function buildSimulationSnapResultForMesh\(mesh, lazyChunk = false, faceSelection = null\)[\s\S]*?(?=\r?\nfunction buildSimulationCombinedSnapCandidates)/
 )?.[0] || '';
const pickSimulationSnapFaceFunction = simulationSource.match(
  /function pickSimulationSnapFaceAtPointer\(pointerEvent, scope = getSimulationSnapScope\(\)\)[\s\S]*?(?=\r?\nfunction handleSimulationSnapFaceSelectionClick)/
 )?.[0] || '';
const snapFaceSelectionClickFunction = simulationSource.match(
  /function handleSimulationSnapFaceSelectionClick\(event\)[\s\S]*?(?=\r?\nfunction selectSimulationSnapFace)/
 )?.[0] || '';
const selectSceneModelFunction = simulationSource.match(
  /function selectSceneModel\(model, options = \{\}\)[\s\S]*?(?=\r?\nfunction beginNumericTransformHistory)/
 )?.[0] || '';
const sketchModelEdgeSnapFunction = simulationSource.match(
  /function getSketchModelEdgeSnapCandidate\(event\)[\s\S]*?(?=\r?\nfunction getSketchSnappedPoint)/
 )?.[0] || '';
assert.match(simulationSource, /function getAllSimulationSnapMeshes\(scope = 'scene', \{ includeHidden = false \} = \{\}\)/);
assert.match(simulationSource, /function isDirectSimulationSnapMesh\(mesh\)/);
assert.match(getSimulationSnapFaceSelectionsFunction, /filter\(\(selection\) => !isSimulationSnapRobotMesh\(selection\?\.mesh\)\)/);
assert.match(getSimulationSnapMeshesFunction, /getAllSimulationSnapMeshes\(scope, \{ includeHidden: true \}\)/);
assert.match(getSimulationSnapMeshesFunction, /selectedMeshes = \[\.\.\.new Set\(selections\.map\(\(selection\) => selection\.mesh\)\)\][\s\S]*?filter\(\(mesh\) => !isSimulationSnapRobotMesh\(mesh\)\)/);
assert.match(getSimulationSnapMeshesFunction, /return selectedMeshes;/);
assert.match(getSimulationSnapMeshesFunction, /selected-face scope must never[\s\S]*?expand to unrelated meshes/);
assert.match(getSimulationSnapMeshesFunction, /filter\(isDirectSimulationSnapMesh\)/);
assert.doesNotMatch(getSimulationSnapMeshesFunction, /return loadedMeshes\.filter\(\(mesh\) => !isSimulationSnapRobotMesh\(mesh\)\)/);
assert.doesNotMatch(getSimulationSnapMeshesFunction, /clearSimulationSnapFaceSelection/);
const getAllSimulationSnapMeshesFunction = simulationSource.match(
  /function getAllSimulationSnapMeshes\(scope = 'scene', \{ includeHidden = false \} = \{\}\)[\s\S]*?(?=\r?\nfunction getSimulationSnapFaceSelections)/
 )?.[0] || '';
assert.match(getAllSimulationSnapMeshesFunction, /scope === 'placement'[\s\S]*?findSceneModelAncestor\(child\) === state\.placement\.model/);
assert.match(simulationSource, /function cloneSimulationSnapFaceSelections\(/);
assert.match(simulationSource, /\? cloneSimulationSnapFaceSelections\(\) : \[\]/);
assert.match(simulationSource, /scope === 'placement' && state\.placement\.active/);
assert.match(simulationSource, /scope === 'measurement' && state\.measurement\.active/);
assert.match(simulationSource, /scope === 'tool' && state\.tcpSnapMode/);
assert.match(simulationSource, /const hasSelectedFirstPoint = \(scope === 'placement' && Boolean\(state\.placement\.sourcePoint\)\)[\s\S]*?state\.measurement\.points\[0\]/);
assert.match(simulationSource, /const meshes = faceSelections\.length \|\| hasSelectedFirstPoint[\s\S]*?getSimulationSnapMeshes\(scope\)[\s\S]*?: \[\]/);
assert.match(simulationSource, /buildSimulationCombinedSnapCandidates\(candidateGroups, faceSelections\)/);
assert.match(simulationSource, /Build each selected face independently/);
assert.match(simulationSource, /Without a face selection, build the complete candidate[\s\S]*?cross-model P2\/measurement point/);
assert.match(simulationSource, /function getSimulationSnapRobotSpecialCandidates\([\s\S]*?if \(faceSelections\.length\) return \[\];/);
assert.match(buildSimulationSnapResultFunction, /if \(isSimulationSnapRobotMesh\(mesh\)\) return null;/);
assert.match(pickSimulationSnapFaceFunction, /getAllSimulationSnapMeshes\(scope\)[\s\S]*?filter\(\(mesh\) => !isSimulationSnapRobotMesh\(mesh\)\)/);
assert.match(simulationSource, /function pickSimulationSnapRobotAtPointer\(pointerEvent\)/);
assert.match(snapFaceSelectionClickFunction, /const robot = pickSimulationSnapRobotAtPointer\(event\)/);
assert.match(snapFaceSelectionClickFunction, /resetSimulationSnapFaceContextAndRebuild\(scope\)/);
assert.match(simulationSource, /function rebuildSimulationSnapCandidatesForCurrentInteraction\(scope = getSimulationSnapScope\(\)\)/);
assert.match(simulationSource, /toggleSimulationSnapMoveMode\(\)[\s\S]*?rebuildSimulationSnapCandidatesForCurrentInteraction\('scene'\)/);
assert.match(selectSceneModelFunction, /selectionChanged && isSimulationSnapPicking\(\)[\s\S]*?resetSimulationSnapFaceContextAndRebuild\(getSimulationSnapScope\(\)\)/);
assert.match(simulationSource, /if \(state\.selectedModel === match\.model && state\.selectedModelPart === match\.part\) \{\s*setSelectedModelPart\(null\)/);
assert.match(simulationSource, /if \(model\) selectSceneModel\(state\.selectedModel === model \? null : model\);/);
assert.match(sketchModelEdgeSnapFunction, /getAllSimulationSnapMeshes\('scene'\)\.filter\(\(mesh\) => \([\s\S]*?!isSimulationSnapRobotMesh\(mesh\)/);
assert.match(simulationSource, /Multi-face snap combination skipped/);
assert.match(simulationSource, /Snap candidate marker refresh skipped/);
assert.match(simulationSource, /Selected face snap candidate generation failed:[\s\S]*?invalidateSimulationSnapCandidates\(\);[\s\S]*?면 선택은 유지됩니다/);
const selectSimulationSnapFaceFunction = simulationSource.match(
  /function selectSimulationSnapFace\(selection, \{ additive = false \} = \{\}\)[\s\S]*?(?=\r?\nfunction snapTypeInfo)/
 )?.[0] || '';
assert.doesNotMatch(selectSimulationSnapFaceFunction, /catch \([\s\S]*?clearSimulationSnapFaceSelection\(\)/);
assert.match(simulationSource, /buildSimulationSnapCandidates\('tool'\)/);
assert.match(simulationSource, /getSimulationSnapMeshes\('tool'\)/);
assert.match(simulationSource, /function handleSimulationSnapFaceSelectionClick\(event\)[\s\S]*?state\.placement\.active[\s\S]*?handleMeasurementSnapSelection\(snap\)/);
assert.match(simulationSource, /function handleSimulationSnapFaceSelectionClick\(event\)[\s\S]*?state\.measurement\.active[\s\S]*?handleMeasurementSnapSelection\(snap\)/);
assert.match(simulationSource, /function handleSimulationSnapFaceSelectionClick\(event\)[\s\S]*?state\.tcpSnapMode[\s\S]*?handleTcpSnapSelection\(snap\)/);
assert.match(findSimulationSnapFunction, /state\.camera\.updateMatrixWorld\(true\);/);
assert.doesNotMatch(findSimulationSnapFunction, /state\.scene\.updateMatrixWorld\(true\);/);
assert.match(simulationSource, /function updateSimulationSnapCandidateMarkers\(\)[\s\S]*?if \(state\.viewNavigationActive\) return;/);
assert.match(simulationSource, /const hasDirectSnapCandidates = state\.snapCandidates\.some\(\(candidate\) =>/);
assert.match(simulationSource, /function updateSimulationSnapCandidateMarkers\(\)[\s\S]*?state\.camera\.updateMatrixWorld\(true\);/);
assert.match(simulationSource, /function hideSimulationSnapCandidateMarkersForNavigation\(\)/);
assert.match(simulationSource, /snapPointerMoveFrame = requestAnimationFrame/);
assert.match(simulationSource, /function isSimulationSnapInteractionActive\(\)[\s\S]*?!state\.viewNavigationActive/);
assert.match(simulationSource, /function beginSimulationViewNavigation\(\)[\s\S]*?hideSimulationSnapMarker\(\);/);
assert.match(simulationSource, /state\.controls\.addEventListener\('start', beginSimulationViewNavigation\)/);
assert.match(simulationSource, /state\.controls\.addEventListener\('end', endSimulationViewNavigation\)/);
assert.match(simulationSource, /function handleSimulationSnapPointerMove\(event\)[\s\S]*?isSimulationSnapInteractionActive\(\)/);
assert.match(simulationSource, /SIMULATION_SNAP_MAX_PER_TYPE\s*=\s*Object\.freeze\(\{[\s\S]*?endpoint:\s*Infinity/);
assert.match(simulationSource, /SIMULATION_SNAP_DISABLED_TYPES\s*=\s*Object\.freeze\(\[[\s\S]*?'face-center'[\s\S]*?'shape-center'[\s\S]*?'virtual-intersection'/);
assert.match(simulationSource, /disabledTypes:\s*SIMULATION_SNAP_DISABLED_TYPES/);
assert.doesNotMatch(simulationHtml, /data-zero-snap-type="(?:face-center|shape-center|virtual-intersection)"/);
assert.doesNotMatch(simulationHtml, /<option value="(?:face-center|shape-center|virtual-intersection)"/);
assert.match(simulationSource, /maxPerType:\s*\{[\s\S]*?endpoint:\s*Infinity/);
assert.match(simulationSource, /function getSimulationSnapScreenIndex\(meshes, bounds\)/);
assert.match(simulationSource, /function getSimulationSnapWorldIndex\(meshes\)/);
assert.match(simulationSource, /function buildSimulationSnapWorldOctree\(candidates, depth = 0\)/);
assert.match(simulationSource, /candidate\.snapWorldPoint/);
assert.match(simulationSource, /getSimulationSnapCandidatesNearPointer\([\s\S]*?candidatesNearPointer\.forEach\(\(candidate\)/);
assert.match(simulationSource, /SIMULATION_SNAP_OVERLAP_TOLERANCE_PX\s*=\s*7/);
assert.match(simulationSource, /'circle-center':\s*\{\s*label:\s*'원\/호 중심점',[^}]*priority:\s*0\s*\}/);
assert.match(simulationSource, /'rectangle-center':\s*\{\s*label:\s*'사각형 중심점',[^}]*priority:\s*0\s*\}/);
assert.match(simulationSource, /'hole-center':\s*\{\s*label:\s*'구멍 가상 중심점',[^}]*priority:\s*-1\s*\}/);
assert.match(simulationSource, /\(profile\.holes \|\| \[\]\)\.forEach\(\(hole, holeIndex\) => \{[\s\S]*?addCandidate\([\s\S]*?'hole-center'/);
assert.match(simulationSource, /candidate\.type === 'rectangle-center'[\s\S]*?candidate\.type === 'hole-center'/);
assert.match(simulationSource, /'robot-base-center':\s*\{\s*label:\s*'로봇 바디 중심점',[^}]*priority:\s*0\s*\}/);
assert.match(simulationSource, /function getRobotBodyBaseMesh\(robot\)/);
assert.match(simulationSource, /function getSimulationSnapRobotBodyCenterCandidates\(scope = 'scene', faceSelections = \[\]\)/);
assert.match(simulationSource, /getExtremeSectionCenter\(baseMesh\.geometry, 2, -1\)/);
assert.match(simulationSource, /'robot-tcp':\s*\{\s*label:\s*'현재 TCP \(점\)'[^}]*priority:\s*0\s*\}/);
assert.match(simulationSource, /function getSimulationSnapRobotTcpCandidates\(scope = 'scene', faceSelections = \[\]\)/);
assert.match(simulationSource, /'scene-origin':\s*\{\s*label:\s*'0,0 영점 위치',[^}]*priority:\s*0\s*\}/);
assert.match(simulationSource, /function isSimulationSnapReferenceCandidate\(candidate\)[\s\S]*?candidate\?\.type === 'scene-origin'/);
assert.match(simulationSource, /function getSimulationSnapSceneOriginCandidates\(scope = 'scene', faceSelections = \[\]\)[\s\S]*?type: 'scene-origin'/);
assert.match(simulationSource, /function getSimulationSnapRobotSpecialCandidates\(scope = 'scene', faceSelections = \[\]\)[\s\S]*?getSimulationSnapSceneOriginCandidates\(scope, faceSelections\)/);
assert.match(simulationSource, /function getSketchExternalSnapCandidates\(\)[\s\S]*?addSketchSnapCandidate\(candidates, new THREE\.Vector3\(\), 'origin'/);
assert.match(simulationSource, /function getSketchExternalSnapCandidates\(\)[\s\S]*?addSketchSnapCandidate\(candidates, sketchPoint, 'robot-body-center'/);
assert.match(simulationSource, /candidate\.type === 'origin'\) return uiText\('0,0 영점 위치'\)/);
assert.match(simulationSource, /function getPreparedSimulationSnapMeshes\(scope = getSimulationSnapScope\(\)\)[\s\S]*?scope === 'scene' && state\.sketch\.active/);
assert.match(simulationSource, /const hasReferenceSnapCandidates = state\.snapCandidates\.some\(\(candidate\) =>[\s\S]*?isSimulationSnapReferenceCandidate\(candidate\)/);
assert.match(simulationSource, /function isSimulationSnapCandidateVisible\(candidate, projected, meshes\)[\s\S]*?isSimulationSnapReferenceCandidate\(candidate\)/);
assert.match(simulationSource, /function getSimulationSnapWorldIndexMeshes\(meshes\)[\s\S]*?isSimulationSnapReferenceCandidate\(candidate\)/);
assert.match(simulationSource, /function isSimulationSnapRobotMesh\(mesh\)/);
assert.match(simulationSource, /const excludeMovingModel = scope === 'placement' && state\.placement\.sourcePoint/);
assert.match(simulationSource, /\(excludeMovingModel && robot === movingModel\)/);
assert.match(simulationSource, /function isArticulatedRobotModel\(model\)/);
assert.match(simulationSource, /function getNextRobotInstanceNumber\(\)/);
assert.doesNotMatch(simulationSource, /const matchingRobots = getArticulatedRobots\(\)/);
assert.match(simulationSource, /const modelOrder = new Map\(state\.models\.map\(\(model, index\) => \[model, index\]\)\)/);
assert.match(simulationSource, /Number\(isArticulatedRobotModel\(right\)\) - Number\(isArticulatedRobotModel\(left\)\)/);
assert.match(simulationSource, /const replacementInstanceNumber = replacingRobot/);
assert.match(simulationSource, /instanceNumber: replacementInstanceNumber/);
assert.match(simulationSource, /instanceNumber: robot\.userData\.robotInstanceNumber/);
assert.match(simulationSource, /selectedMeshes\.every\(\(mesh\) => loadedMeshes\.includes\(mesh\)\)/);
assert.match(simulationSource, /return getAllSimulationSnapMeshes\(scope\)\.filter\(\(mesh\) => !isSimulationSnapRobotMesh\(mesh\)\)/);
assert.match(simulationSource, /SIMULATION_SNAP_CENTER_MARKER_TYPES = new Set\([\s\S]*?'scene-origin'/);
assert.match(simulationSource, /SIMULATION_SNAP_MARKER_TYPE_ORDER = Object\.freeze\([\s\S]*?'scene-origin'/);
assert.equal((simulationHtml.match(/robot-base-center/g) || []).length, 4);
assert.equal((simulationHtml.match(/robot-tcp/g) || []).length, 4);
assert.equal((simulationHtml.match(/(?:value="hole-center"|data-zero-snap-type="hole-center")/g) || []).length, 4);
assert.match(simulationSource, /endpoint:\s*\{\s*label:\s*'끝점',[^}]*priority:\s*2\s*\}/);
assert.match(simulationSource, /'edge-midpoint':\s*\{\s*label:\s*'에지 중심점',[^}]*priority:\s*3\s*\}/);
assert.match(simulationSource, /function compareSimulationSnapCandidates\(left, right\)/);
assert.match(simulationSource, /Math\.abs\(pixelDifference\) <= SIMULATION_SNAP_OVERLAP_TOLERANCE_PX/);
assert.match(simulationSource, /nearby\.sort\(requiredType[\s\S]*?: compareSimulationSnapCandidates\)/);
assert.match(simulationSource, /if \(isLazySimulationSnapMesh\(mesh\)\) continue;/);
assert.match(simulationSource, /function scheduleLazySimulationSnapBuild\(mesh\)/);
assert.match(simulationSource, /getLazySimulationSnapMeshAtPointer\(pointerX, pointerY, bounds, meshes\)/);
assert.match(simulationSource, /const SIMULATION_SNAP_COLOR = 0xef4444/);
assert.match(simulationSource, /color:\s*SIMULATION_SNAP_COLOR/);
assert.match(simulationStyles, /data-snap-type="endpoint"[^}]*> span\s*\{[^}]*background:\s*radial-gradient\(circle at center,/s);
assert.match(simulationStyles, /:root\s*\{[^}]*--simulation-snap-color:\s*#ef4444;/s);
assert.match(simulationStyles, /data-snap-type="hole-center"[^}]*> span\s*\{[^}]*border-radius:\s*50%;/s);
assert.match(simulationStyles, /\.simulation-snap-marker > span\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;[^}]*border:\s*1\.25px solid var\(--simulation-snap-color\);[^}]*color:\s*var\(--simulation-snap-color\);/s);
assert.match(simulationStyles, /\.simulation-snap-marker > span\s*\{[^}]*box-shadow:\s*0 0 6px rgba\(239, 68, 68, 0\.68\);/s);
assert.doesNotMatch(simulationStyles, /data-snap-type="(?:face-center|shape-center|virtual-intersection)"/);
assert.match(simulationStyles, /\.simulation-snap-marker\s*\{[^}]*transform:\s*translate\(-7px,\s*-50%\);/s);
assert.match(simulationStyles, /\.simulation-snap-marker\.label-left\s*\{[^}]*transform:\s*translate\(calc\(-100% \+ 7px\),\s*-50%\);/s);
assert.doesNotMatch(simulationStyles, /\.simulation-snap-marker(?:\.label-left)?\s*\{[^}]*transform:[^;}]*,\s*-6px\)/s);
  assert.match(simulationHtml, /style\.css\?v=[^"'\s]+/);
  assert.match(simulationHtml, /main\.js\?v=[^"'\s]+/);
assert.match(simulationSource, /step-import-worker\.js\?v=[^"'\s]*large-step-chunked-snap/);
assert.match(simulationSource, /STEP_LARGE_FILE_ENGINE_MIN_BYTES\s*=\s*64 \* MEBIBYTE/);
assert.match(simulationSource, /MAX_MODEL_IMPORT_SIZE_BYTES\s*=\s*500 \* MEBIBYTE/);
assert.match(simulationSource, /file\.size > MAX_MODEL_IMPORT_SIZE_BYTES/);
assert.match(simulationSource, /function rejectOversizedModelImport\(file\)/);
assert.match(simulationSource, /LARGE_MODEL_PERFORMANCE_MIN_BYTES\s*=\s*100 \* MEBIBYTE/);
assert.match(simulationSource, /LARGE_MODEL_RENDER_FPS\s*=\s*60/);
assert.match(simulationSource, /state\.renderer\.shadowMap\.enabled\s*=\s*!enabled/);
assert.match(simulationSource, /enabled \? 1 : 2/);
assert.match(simulationSource, /function requiresContinuousRendering\(\)/);
assert.match(simulationSource, /if \(requiresContinuousRendering\(\)\) requestRender\(\);/);
assert.doesNotMatch(simulationSource, /1000 \/ LARGE_MODEL_RENDER_FPS/);
assert.doesNotMatch(simulationSource, /function updateCameraScaledTcpAxes\(\)[\s\S]*?state\.scene\.updateMatrixWorld\(true\);/);
assert.match(simulationSource, /useLargeFileEngine \? 'large' : 'standard'/);

const workerContext = {
  self: { addEventListener() {} }
};
runInNewContext(stepWorkerSource, workerContext);
const workerBucket = workerContext.createBucket([0.5, 0.5, 0.5]);
assert.deepEqual(
  JSON.parse(JSON.stringify(workerContext.modernFaceRanges(
    new Uint32Array([0, 6, 0, 6, 9, 1])
  ))),
  [{ first: 0, last: 1 }, { first: 2, last: 4 }]
);
assert.deepEqual(
  JSON.parse(JSON.stringify(workerContext.modernFaceRanges([
    { first: 0, last: 1 }, { start: 2, count: 3 }
  ]))),
  [{ first: 0, last: 1 }, { first: 2, last: 4 }]
);
assert.deepEqual(
  JSON.parse(JSON.stringify(workerContext.modernFaceRanges([
    [0, 3, 0], [3, 6, 1]
  ]))),
  [{ first: 0, last: 0 }, { first: 1, last: 2 }]
);
const createWorkerEntry = (brepFaces) => ({
  positions: new Float32Array(18),
  indices: new Uint16Array(6),
  normals: new Float32Array(18),
  brepFaces,
  positionLength: 18,
  indexLength: 6,
  normalLength: 18,
  vertexCount: 6
});
workerContext.appendEntry(workerBucket, createWorkerEntry([{ first: 0, last: 1 }]));
workerContext.appendEntry(workerBucket, createWorkerEntry([{ first: 0, last: 1 }]));
assert.deepEqual(
  JSON.parse(JSON.stringify(workerBucket.brepFaces)),
  [{ first: 0, last: 1 }, { first: 2, last: 3 }]
);

const chunkSourceMesh = {
  positions: new Float32Array([
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0
  ]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  normals: new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1
  ]),
  faceGroups: runInNewContext('new Int32Array([0, 3, 0, 3, 3, 0])', workerContext)
};
const chunkGrouping = workerContext.groupLargeMeshTriangleRanges(chunkSourceMesh);
assert.equal(chunkGrouping.preservesFaces, true);
assert.equal(chunkGrouping.groups.length, 1);
const packedLargeChunk = workerContext.createLargeMeshChunk(
  chunkSourceMesh,
  chunkGrouping.groups[0],
  chunkGrouping.preservesFaces
);
assert.deepEqual(Array.from(packedLargeChunk.indices), [0, 1, 2, 0, 2, 3]);
assert.deepEqual(
  JSON.parse(JSON.stringify(packedLargeChunk.brepFaces)),
  [{ first: 0, last: 0 }, { first: 1, last: 1 }]
);

const largeFallbackGrouping = workerContext.groupLargeMeshTriangleRanges({
  positions: new Float32Array(9),
  indices: new Uint32Array(60000 * 3),
  normals: new Float32Array(9),
  faceGroups: null
});
assert.equal(largeFallbackGrouping.preservesFaces, false);
assert.equal(largeFallbackGrouping.groups.length, 2);
assert.ok(largeFallbackGrouping.groups[0][0].last < largeFallbackGrouping.groups[1][0].first);

const circleSegmentCount = 24;
const circleRadius = 50;
const circlePositions = [0, 0, 0];
const circleIndices = [];
for (let segment = 0; segment < circleSegmentCount; segment += 1) {
  const angle = (segment / circleSegmentCount) * Math.PI * 2;
  circlePositions.push(Math.cos(angle) * circleRadius, Math.sin(angle) * circleRadius, 0);
}
for (let segment = 0; segment < circleSegmentCount; segment += 1) {
  circleIndices.push(0, segment + 1, ((segment + 1) % circleSegmentCount) + 1);
}
const circleSnapResult = buildStepSnapCandidates({
  attributes: { position: { array: circlePositions } },
  index: { array: circleIndices },
  brep_faces: [{ first: 0, last: circleSegmentCount - 1 }]
});
const circleCenters = circleSnapResult.candidates.filter(({ type }) => type === 'circle-center');
assert.ok(circleCenters.some(({ point }) => Math.hypot(point[0], point[1], point[2]) < 1e-6));

const positions = [
  [0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0],
  [0, 0, 100], [100, 0, 100], [100, 100, 100], [0, 100, 100]
];
const triangles = [
  [0, 2, 1], [0, 3, 2],
  [4, 5, 6], [4, 6, 7],
  [0, 1, 5], [0, 5, 4],
  [1, 2, 6], [1, 6, 5],
  [2, 3, 7], [2, 7, 6],
  [3, 0, 4], [3, 4, 7]
];
const bufferGeometryLike = {
  attributes: { position: { array: positions.flat() } },
  index: { array: triangles.flat() }
};
const preservedBrepFaces = Array.from(
  { length: 6 },
  (_, faceIndex) => ({ first: faceIndex * 2, last: faceIndex * 2 + 1 })
);

const withoutCadFaces = buildStepSnapCandidates(bufferGeometryLike);
const withCadFaces = buildStepSnapCandidates({
  attributes: bufferGeometryLike.attributes,
  index: bufferGeometryLike.index,
  brep_faces: preservedBrepFaces
});
const selectedRightFace = buildStepSnapCandidates(bufferGeometryLike, {
  triangleRanges: [{ first: 6, last: 7 }]
});

assert.equal(withoutCadFaces.stats.faceCount, 0);
assert.equal(withCadFaces.stats.faceCount, 6);
assert.equal(withoutCadFaces.candidates.filter(({ type }) => type === 'face-center').length, 0);
assert.equal(withCadFaces.candidates.filter(({ type }) => type === 'face-center').length, 6);
assert.ok(selectedRightFace.candidates.length > 0);
assert.ok(selectedRightFace.candidates.every(({ point }) => Math.abs(point[0] - 100) < 1e-6));

const largeEndpointPositions = [];
const largeEndpointIndices = [];
const largeEndpointFaces = [];
for (let triangleIndex = 0; triangleIndex < 3000; triangleIndex += 1) {
  const x = triangleIndex * 3;
  const vertexOffset = largeEndpointPositions.length / 3;
  largeEndpointPositions.push(x, 0, 0, x + 1, 0, 0, x, 1, 0);
  largeEndpointIndices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
  largeEndpointFaces.push({ first: triangleIndex, last: triangleIndex });
}
const largeEndpointResult = buildStepSnapCandidates({
  attributes: { position: { array: new Float32Array(largeEndpointPositions) } },
  index: { array: new Uint32Array(largeEndpointIndices) },
  brep_faces: largeEndpointFaces
}, {
  maxStraightLines: 1,
  maxVirtualPairs: 1,
  maxVirtualCandidates: 1,
  maxPerType: { endpoint: Infinity }
});
const largeEndpoints = largeEndpointResult.candidates.filter(({ type }) => type === 'endpoint');
assert.equal(largeEndpoints.length, 9000);
assert.ok(largeEndpoints.some(({ point }) => point[0] === 8997 && point[1] === 1));

console.log('3D Simulation STEP snap validation passed.');
