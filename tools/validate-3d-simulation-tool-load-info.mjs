import { readSimulationMarkup } from './read-simulation-markup.cjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const html = readSimulationMarkup();
const css = read('2_3DSimulation/style.css');
const main = read('2_3DSimulation/main.js');
// Version-history wording is checked by the version history tests, not here.

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
    'tool-attachment-dialog',
    'tool-attachment-robot'
].forEach((id) => assert(html.includes(`id="${id}"`), `Missing Tool load information element: ${id}`));

assert(html.includes('data-tool-load-mode="material"'), 'Missing material calculation mode.');
assert(html.includes('data-tool-load-mode="mass"'), 'Missing direct mass calculation mode.');
assert(!html.includes('id="program-add-grip-release"'), 'The Program Panel must not expose a separate release button.');
assert(css.includes('.tool-load-info-panel'), 'Missing Tool load information panel styles.');
assert(main.includes("model.userData.placement !== 'tcp'"), 'Tool load information must be restricted to attached Tools.');
assert(main.includes('normalizeToolLoadProperties'), 'Missing Tool load information state normalization.');
assert(main.includes('combineStepParts'), 'Tool load information must reuse the mass-properties calculation.');
assert(main.includes('integrateStepMesh'), 'Tool load information must integrate the imported Tool geometry.');
assert(main.includes('updateToolLoadPartControl'), 'Missing realtime material input handling.');
assert(main.includes('updateToolLoadMass'), 'Missing realtime direct mass input handling.');
assert(/\[[^\]]*el\.toolLoadInfoPanel[^\]]*\]\.forEach\(makePanelDraggable\)/.test(main), 'Tool load information panel must support dragging.');
assert(/\[[^\]]*el\.toolLoadInfoPanel[^\]]*\]\.forEach\(makePanelEdgeResizable\)/.test(main), 'Tool load information panel must support edge resizing.');
assert(main.includes('installSceneModelAsTool'), 'Missing Model Tree Tool installation handling.');
assert(main.includes('detachToolModel'), 'Missing Tool detachment handling.');
assert(main.includes('attachEquipmentObject'), 'Missing grip object use handling.');
assert(main.includes('detachEquipmentObject'), 'Missing grip object release handling.');
assert(main.includes("model?.kind === 'grip-part'"), 'Missing persisted grip object part restoration handling.');
assert(!html.includes('program-add-grip-use'), 'Legacy grip command button must be removed.');
assert(main.includes('normalizeToolAttachmentSource'), 'Missing Tool source restoration metadata handling.');
assert(main.includes("model?.kind === 'tool-part'"), 'Missing persisted Tool part restoration handling.');

console.log('3D Simulation Tool load information validation passed.');
