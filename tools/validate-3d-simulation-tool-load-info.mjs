import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const html = read('2_3DSimulation/index.html');
const css = read('2_3DSimulation/style.css');
const main = read('2_3DSimulation/main.js');
const versionHistory = read('0_Home/version-history.json');

[
    'model-tool-load-info',
    'tool-load-info-panel',
    'tool-load-material-list',
    'tool-load-mass',
    'tool-load-result-cog',
    'tool-load-result-origin-inertia',
    'tool-load-result-center-inertia',
    'model-install-tool',
    'model-detach-tool',
    'model-use-grip-object',
    'model-release-grip-object',
    'program-add-grip-use',
    'tool-attachment-dialog',
    'tool-attachment-robot'
].forEach((id) => assert(html.includes(`id="${id}"`), `Missing Tool load information element: ${id}`));

assert(html.includes('data-tool-load-mode="material"'), 'Missing material calculation mode.');
assert(html.includes('data-tool-load-mode="mass"'), 'Missing direct mass calculation mode.');
assert(!html.includes('id="program-add-grip-release"'), 'The Program Panel must not expose a separate release button.');
assert(/id="program-add-grip-use"[^>]*>[\s\S]*?fa-hand-back-fist/.test(html), 'The pick-up command must use the closed-fist icon.');
assert(/id="model-use-grip-object"[^>]*>[\s\S]*?fa-hand-back-fist/.test(html)
    && /id="model-release-grip-object"[^>]*>[\s\S]*?fa-hand(?!-back-fist)/.test(html), 'Model Tree grip actions must use the correct hand icons.');
assert(css.includes('.tool-load-info-panel'), 'Missing Tool load information panel styles.');
assert(main.includes("model.userData.placement !== 'tcp'"), 'Tool load information must be restricted to attached Tools.');
assert(main.includes('normalizeToolLoadProperties'), 'Missing Tool load information state normalization.');
assert(main.includes('combineStepParts'), 'Tool load information must reuse the mass-properties calculation.');
assert(main.includes('integrateStepMesh'), 'Tool load information must integrate the imported Tool geometry.');
assert(main.includes('updateToolLoadPartControl'), 'Missing realtime material input handling.');
assert(main.includes('updateToolLoadMass'), 'Missing realtime direct mass input handling.');
assert(main.includes('el.armLoadPanel, el.toolLoadInfoPanel].forEach(makePanelDraggable)'), 'Tool load information panel must support dragging.');
assert(main.includes('el.armLoadPanel, el.toolLoadInfoPanel].forEach(makePanelEdgeResizable)'), 'Tool load information panel must support edge resizing.');
assert(main.includes('installSceneModelAsTool'), 'Missing Model Tree Tool installation handling.');
assert(main.includes('detachToolModel'), 'Missing Tool detachment handling.');
assert(main.includes('useGripObject'), 'Missing grip object use handling.');
assert(main.includes('releaseGripObject'), 'Missing grip object release handling.');
assert(main.includes('isGripObjectMotion'), 'Missing grip object program motion handling.');
assert(main.includes("model?.kind === 'grip-part'"), 'Missing persisted grip object part restoration handling.');
assert(main.includes('applyProgramGripObjectAction'), 'Missing grip object program execution handling.');
assert(/function getSelectedGripObjectReference\(\)\s*\{[\s\S]*?if \(isGripObjectModelInUse\(state\.selectedModel\)\)\s*\{\s*return createGripObjectModelRef\(state\.selectedModel\);\s*\}/.test(main), 'The selected in-use grip object must remain the default program target.');
assert(html.includes('data-i18n="legacy.물건 잡기"'), 'Model Tree must label the grip action as 물건 잡기.');
assert(html.includes('data-i18n="legacy.놓기"'), 'Model Tree must label the release action as 놓기.');
assert(main.includes("GRIP_USE: uiText('물건 잡기')"), 'Grip-use program commands must be labeled 물건 잡기.');
assert(main.includes("GRIP_RELEASE: uiText('놓기')"), 'Grip-release program commands must be labeled 놓기.');
assert(/\(isGrip\s*\?\s*\[\s*\['GRIP_USE', uiText\('물건 잡기'\)\],\s*\['GRIP_RELEASE', uiText\('놓기'\)\]\s*\]/.test(main), 'Grip command rows must limit the motion selector to grab and release.');
assert(main.includes('normalizeToolAttachmentSource'), 'Missing Tool source restoration metadata handling.');
assert(main.includes("model?.kind === 'tool-part'"), 'Missing persisted Tool part restoration handling.');
assert(versionHistory.includes('로봇에 부착된 Tool의 부품별 재질 또는 직접 입력한 질량'), 'Missing Korean Tool load information version entry.');
assert(versionHistory.includes('为已安装的 Tool 添加负载信息'), 'Missing Chinese Tool load information version entry.');
assert(versionHistory.includes('Đã thêm thông tin tải cho Tool được gắn'), 'Missing Vietnamese Tool load information version entry.');

console.log('3D Simulation Tool load information validation passed.');
