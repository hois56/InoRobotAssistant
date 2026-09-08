import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../2_3DSimulation/style.css', import.meta.url), 'utf8');

assert.match(main, /function getModelTreeAttachedModels\(host\)/);
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
    /line\.visible = transparency < 100[\s\S]*?state\.placement\.active[\s\S]*?model\.userData\?\.tcpFrame/,
    'Robot selection outlines must be hidden while model-tree placement is active.'
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
