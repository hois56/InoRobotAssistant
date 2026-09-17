import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8');

assert.match(main, /function getModelTreeAttachedModels\(host\)/);
assert.match(main, /function syncEmptyStateVisibility\(\)[\s\S]*?state\.models\.length > 0[\s\S]*?userData\?\.robotName/);
assert.match(main, /state\.models\.push\(model\);\s*state\.scene\.add\(model\);\s*\/\/ The model is already visible[\s\S]*?syncEmptyStateVisibility\(\);/);
assert.match(main, /finally \{[\s\S]*?syncEmptyStateVisibility\(\);\s*finishBackgroundModelLoading/);
assert.match(main, /function renderJogControls\(robot\)/);
assert.match(main, /const jogLabel = 'BASE';/);
assert.match(main, /function setJogMode\(mode, \{ preserveSnapMove = false \} = \{\}\)/);
assert.match(main, /const isBase = !isJoint;/);
assert.doesNotMatch(main, /btnJogWorkObjectMode|btn-jog-workobject-mode|workObjectJogLabel/,
    'The JOG panel must not expose a Wobj coordinate-mode control.'
);
assert.doesNotMatch(html, /id="btn-jog-workobject-mode"/,
    'The JOG panel markup must not include a Wobj coordinate-mode control.'
);
assert.doesNotMatch(main, /state\.jogCoordinateMode === 'workobject'/,
    'JOG pose presentation must remain independent of Wobj coordinates.'
);
const setJogMode = main.match(/function setJogMode\([\s\S]*?(?=\r?\nfunction setBaseJogGizmoMode)/)?.[0] || '';
assert.notEqual(setJogMode, '', 'setJogMode must remain present for coordinate-mode checks.');
assert.doesNotMatch(setJogMode, /renderJogControls\(/,
    'Changing JOG mode must not recursively re-render the controls.'
);
assert.match(main, /button\.disabled = !available;/,
    'Wobj entries must remain selectable independently of motion lock state.'
);
const selectWorkObject = main.match(/function selectWorkObject\(index\)[\s\S]*?(?=\r?\nfunction applyWorkObjectEditor)/)?.[0] || '';
assert.notEqual(selectWorkObject, '', 'selectWorkObject must remain present for selection checks.');
assert.doesNotMatch(selectWorkObject, /isMotionActive\(\)/,
    'Selecting a Wobj must not be blocked by the motion lock.'
);
assert.match(main, /function applyModelTreeVisibilityVisual\(model, visible\)/);
assert.match(
    main,
    /attachedModels\.length > 0[\s\S]*?model\.visible = true[\s\S]*?model\.userData\.modelTreeHidden = !nextVisible/,
    'A hidden host with attached models must keep its transform root visible.'
);
assert.match(main, /isModelTreeAttachedObject\(object, model\)/);
assert.match(main, /function isSceneModelObjectPickable\(object, model\)/);
assert.match(main, /if \(!isSceneModelObjectPickable\(object, model\)\) return null;/);
assert.match(main, /modelTreeVisibilityRecords/);
assert.match(main, /syncModelTreeHiddenHost\(host\)/);
assert.match(main, /applyModelTreeVisibilityVisual\(robot, snapshot\.visible !== false\)/);
assert.match(main, /visible: isModelTreeVisible\(robot\)/);
assert.match(main, /className = 'model-tree-visibility-indicator'/);
assert.match(main, /const MODEL_DEFAULT_OUTLINE_COLOR = 0x000000;/);
assert.match(main, /const MODEL_SELECTION_OUTLINE_COLOR = 0xfacc15;/);
assert.match(main, /function isModelOutlineSelectionTarget\(mesh, model\)/);
assert.match(main, /function updateModelSelectionOutlines\(\{ ensureSelection = true \}/);
assert.match(main, /const nextColor = isModelOutlineSelectionTarget\(mesh, model\)/);
assert.match(main, /if \(!state\.outlineMode && ensureSelection\)[\s\S]*?syncModelOutlines\(\);/);
assert.match(main, /if \(!state\.outlineMode && !selected\)[\s\S]*?disposeModelOutlineLine\(mesh\.userData\.outlineLine\)/);
assert.match(
    main,
    /line\.visible = transparency < 100[\s\S]*?state\.outlineMode \|\| selected/,
    'Selected model outlines must remain visible while model-tree placement is active.'
);
assert.doesNotMatch(
    main,
    /line\.visible = transparency < 100[\s\S]*?state\.placement\.active[\s\S]*?model\.userData\?\.tcpFrame/,
    'Robot outlines must not be hidden while model-tree placement is active.'
);
assert.match(main, /setModelPartHighlight\(part, highlighted\)[\s\S]*?updateModelSelectionOutlines\(\);/);
assert.match(main, /state\.selectedModel = model \|\| null;[\s\S]{0,500}?updateModelSelectionOutlines\(\);/);
assert.doesNotMatch(main, /material\.emissive\.setHex\(MODEL_SELECTION_OUTLINE_COLOR\)/);
assert.match(main, /function normalizeModelTransparencyPercent\(value\)[\s\S]*?return Math\.max\(0, Math\.min\(100/);
assert.match(main, /const displayTransparency = transparency;/);
assert.match(main, /Attached Tools\/loads live below the robot hierarchy[\s\S]*?target === model && isModelTreeAttachedObject\(child, model\)/);
assert.match(main, /function applyModelTransparencyVisual\(model, part, value\)[\s\S]*?getModelTreeAttachedModels\(model\)\.forEach\(\(attachedModel\)/);
assert.doesNotMatch(main, /function applyModelTransparencyVisual\(model, part, value\)[\s\S]*?if \(!changed\) return false;/);
assert.match(main, /material\.depthWrite = transparency > 0 \? false : baseline\.depthWrite;/);

assert.match(html, /id="model-context-menu"/);
assert.match(html, /id="model-transparency" type="range" min="0" max="100" step="1" value="0"/);
assert.match(html, /id="model-transparency-value">0%<\/output>/);
assert.match(css, /\.model-tree-visibility-indicator/);
assert.match(css, /\.model-tree-button-hidden/);

console.log('Model visibility validation passed.');
