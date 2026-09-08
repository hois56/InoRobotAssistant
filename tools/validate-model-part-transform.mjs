import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');

assert.match(
    main,
    /function getSelectedModelTransformTarget\(\)[\s\S]*?getImportedModelParts\(model\)\.includes\(part\) \? part : model/
);
assert.match(
    main,
    /function attachTransformControlsToSelectedModel\(\)[\s\S]*?const target = getSelectedModelTransformTarget\(\)[\s\S]*?attach\(target\)/
);
assert.match(
    main,
    /placement\.target = state\.selectedModel === model[\s\S]*?getSelectedModelTransformTarget\(\)/
);
assert.match(
    main,
    /function getPlacementTransformTarget\(\)[\s\S]*?getImportedModelParts\(model\)\.includes\(target\)/
);
assert.match(
    main,
    /function getImportedPartOriginWorld\(content, meshes\)[\s\S]*?bounds\.getCenter\(new THREE\.Vector3\(\)\)/
);
assert.match(
    main,
    /function createImportedPartTransformPivot\(content, meshes, displayName\)[\s\S]*?pivot\.userData\.modelPartPivot = true[\s\S]*?meshes\.forEach\(\(mesh\) => pivot\.attach\(mesh\)\)/
);
assert.match(
    main,
    /const part = sourceNode \|\| createImportedPartTransformPivot\(content, group\.meshes, displayName\)/
);
assert.doesNotMatch(
    main,
    /const part = sourceNode \|\| \(group\.meshes\.length === 1 \? group\.meshes\[0\] : new THREE\.Group\(\)\)/
);
assert.match(
    main,
    /applyWorldTranslationToModel\(target, placement\.sourceWorldPoint, placement\.targetPoint\)/
);
assert.match(
    main,
    /partTransforms: getImportedModelParts\(model\)\.map\(\(part\)/
);
assert.match(
    main,
    /function captureWorkspacePartState\(model\)[\s\S]*?matrix: part\.matrix\.toArray\(\)/
);
assert.match(
    main,
    /modelPartIndex: partIndex[\s\S]*?transform: captureClipboardTransform\(target\)/
);
assert.match(
    main,
    /const partIndex = Number\(command\.modelPartIndex\)[\s\S]*?getImportedModelParts\(model\)\[partIndex\] \|\| model/
);

console.log('Model part transform validation passed.');
