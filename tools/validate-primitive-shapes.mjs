import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../3_ToolSelector/vendor/three/three.module.js';
import {
    PRIMITIVE_SHAPE_LIMITS,
    PRIMITIVE_SHAPE_SCHEMA_VERSION,
    PRIMITIVE_SHAPE_TYPES,
    normalizePrimitiveShapeDimensions,
    normalizePrimitiveShapeRecord,
    primitiveShapeGeometrySpec,
    serializePrimitiveShapeRecord,
    updatePrimitiveShapeDimension
} from '../2_3DSimulation/primitive-shape-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, '2_3DSimulation/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, '2_3DSimulation/style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, '2_3DSimulation/main.js'), 'utf8');

assert.deepEqual(PRIMITIVE_SHAPE_TYPES, ['box', 'cone', 'cylinder', 'sphere']);
for (const type of PRIMITIVE_SHAPE_TYPES) {
    const dimensions = normalizePrimitiveShapeDimensions(type, { x: 120, y: 80, z: 60 });
    assert.ok(Object.values(dimensions).every((value) => value > 0));
    assert.deepEqual(primitiveShapeGeometrySpec(type, dimensions).baseZ, 0);

    const spec = primitiveShapeGeometrySpec(type, dimensions);
    let geometry;
    if (type === 'box') {
        geometry = new THREE.BoxGeometry(spec.width, spec.depth, spec.height);
        geometry.translate(0, 0, spec.height / 2);
    } else if (type === 'cylinder') {
        geometry = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.height, 32);
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, 0, spec.height / 2);
    } else if (type === 'cone') {
        geometry = new THREE.ConeGeometry(spec.radius, spec.height, 32);
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, 0, spec.height / 2);
    } else {
        geometry = new THREE.SphereGeometry(spec.radius, 32, 20);
        geometry.translate(0, 0, spec.radius);
    }
    geometry.computeBoundingBox();
    assert.ok(Math.abs(geometry.boundingBox.min.x + dimensions.x / 2) < 1e-6);
    assert.ok(Math.abs(geometry.boundingBox.min.y + dimensions.y / 2) < 1e-6);
    assert.ok(Math.abs(geometry.boundingBox.min.z) < 1e-6);
    geometry.dispose();
}

assert.deepEqual(
    normalizePrimitiveShapeDimensions('box', { x: 120, y: 80, z: 60 }),
    { x: 120, y: 80, z: 60 }
);
assert.deepEqual(
    normalizePrimitiveShapeDimensions('cylinder', { x: 120, y: 80, z: 60 }),
    { x: 120, y: 120, z: 60 }
);
assert.deepEqual(
    updatePrimitiveShapeDimension('cone', { x: 120, y: 120, z: 60 }, 'y', 90),
    { x: 90, y: 90, z: 60 }
);
assert.deepEqual(
    updatePrimitiveShapeDimension('sphere', { x: 120, y: 120, z: 120 }, 'z', 75),
    { x: 75, y: 75, z: 75 }
);

for (const value of [0, -1, NaN, Infinity, -Infinity, PRIMITIVE_SHAPE_LIMITS.max + 1]) {
    assert.throws(() => normalizePrimitiveShapeDimensions('box', { x: value, y: 10, z: 10 }));
}
assert.throws(() => normalizePrimitiveShapeDimensions('unknown', { x: 1, y: 1, z: 1 }));

const record = serializePrimitiveShapeRecord({
    workspaceModelId: 'model-shape-1',
    name: '원통형 1',
    primitiveShapeType: 'cylinder',
    primitiveShapeDimensions: { x: 80, y: 40, z: 150 },
    transform: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    materialColor: '#abcdef'
});
assert.equal(record.kind, 'primitive-shape');
assert.equal(record.primitiveShapeDimensions.y, 80);
assert.equal(record.materialColor, '#abcdef');
assert.equal(PRIMITIVE_SHAPE_SCHEMA_VERSION, 1);
assert.deepEqual(normalizePrimitiveShapeRecord(record), record);

assert.match(html, /id="shape-panel"/);
assert.match(html, /data-panel-toggle="shape-panel"/);
assert.match(html, /id="shape-create"/);
assert.equal((html.match(/data-shape-create-dimension=/g) || []).length, 3);
assert.equal((html.match(/data-shape-selected-dimension=/g) || []).length, 3);
assert.equal((html.match(/data-shape-create-dimension="[^"]+"[^>]*step="0\.5"/g) || []).length, 3);
assert.equal((html.match(/data-shape-selected-dimension="[^"]+"[^>]*step="0\.5"/g) || []).length, 3);
assert.match(html, /id="primitive-dimension-overlay"/);
assert.match(css, /\.shape-panel\s*\{/);
assert.match(css, /\.primitive-dimension-label\s*\{/);
assert.match(css, /@media \(max-width: 768px\)/);
assert.match(main, /function createPrimitiveShapeRoot\(/);
assert.match(main, /function getPrimitiveShapeName\(type, index\)[\s\S]*?uiText\(primitiveShapeDisplayName\(type\)\)/);
assert.match(main, /function refreshPrimitiveShapeNames\([\s\S]*?model\.userData\.modelName = modelName/);
assert.match(main, /function refreshLocalizedControls\(\)\s*\{\s*refreshPrimitiveShapeNames\(\);/);
assert.match(main, /primitiveShapeNameIndex/);
assert.match(main, /function applyPrimitiveShapeDimensions\(/);
assert.match(main, /setSelectedTransformMode\('translate', false\);\s*setTransformHandlesEnabled\(true\);/);
assert.match(main, /function getJogTargetRobot\(\)[\s\S]*?return robots\.length === 1 \? robots\[0\] : null;/);
const runBaseJogButtonFunction = main.match(
    /function runBaseJogButton\(button\)[\s\S]*?(?=\r?\nfunction startBaseJogHold)/
 )?.[0] || '';
assert.match(runBaseJogButtonFunction, /const robot = getJogTargetRobot\(\)/);
assert.doesNotMatch(runBaseJogButtonFunction, /isPrimitiveShapeModel|jogPrimitiveShapeInBase/);
assert.match(main, /const extensionLine = new THREE\.LineSegments/);
assert.match(main, /extensionLine\.geometry\.setFromPoints\(\[sourceStart, start, sourceEnd, end\]\)/);
assert.match(main, /source: \[new THREE\.Vector3\(-x \/ 2, -y \/ 2, z\), new THREE\.Vector3\(x \/ 2, -y \/ 2, z\)\]/);
assert.match(main, /const diameterReferenceZ = type === 'cone' \? 0 : z/);
assert.match(main, /y: null,/);
assert.match(main, /const labelAxis = isRoundShape && axis === 'x' \? 'Ø' : axis\.toUpperCase\(\)/);
assert.match(main, /const arrowHalfLength = Number\(arrows\[0\]\?\.geometry\?\.parameters\?\.height\) \/ 2/);
assert.match(main, /arrows\[0\]\?\.position\.copy\(start\)\.addScaledVector\(direction, arrowHalfLength\)/);
assert.match(main, /arrows\[1\]\?\.position\.copy\(end\)\.addScaledVector\(direction, -arrowHalfLength\)/);
assert.match(main, /direction\.clone\(\)\.negate\(\)/);
assert.match(main, /outlineGeometrySource !== mesh\.geometry/);
assert.match(main, /model\.updateMatrixWorld\(true\);\s*syncModelOutlines\(\);/);
assert.match(main, /const editingSelectedShape = editing\?\.model === model/);
assert.match(main, /&& \(!editing \|\| editingSelectedShape\)/);
assert.match(main, /label\.contains\(editing\.input\)/);
const primitiveDimensionLabelEditFunction = main.match(
    /function beginPrimitiveDimensionLabelEdit\(axis\)[\s\S]*?(?=\r?\nfunction finishPrimitiveDimensionLabelEdit)/
)?.[0] || '';
assert.match(primitiveDimensionLabelEditFunction, /input\.addEventListener\('input'/);
assert.match(primitiveDimensionLabelEditFunction, /edit\.beforeDimensions/);
assert.match(primitiveDimensionLabelEditFunction, /applyPrimitiveShapeDimensions\(edit\.model, nextDimensions, \{[\s\S]*?recordHistoryChange: false[\s\S]*?status: false/);
assert.match(primitiveDimensionLabelEditFunction, /edit\.liveChanged = true/);
const primitiveDimensionLabelFinishFunction = main.match(
    /function finishPrimitiveDimensionLabelEdit\(apply\)[\s\S]*?(?=\r?\nfunction beginPrimitiveShapeDimensionHistory)/
)?.[0] || '';
assert.match(primitiveDimensionLabelFinishFunction, /!apply && edit\.liveChanged/);
assert.match(primitiveDimensionLabelFinishFunction, /edit\.beforeDimensions/);
assert.match(main, /function findSceneModelPartAncestor\(/);
assert.match(main, /\.find\(\(selection\) => selection && \(selection\.part \|\| getImportedModelParts\(selection\.model\)\.length <= 1\)\)/);
assert.match(main, /if \(selection\.part\) selectSceneModelPart\(selection\.model, selection\.part\);/);
assert.match(main, /serializePrimitiveShapeRecord\(/);
assert.match(main, /function restoreWorkspacePrimitiveShape\(/);
const applyBaseJogNumericTargetFunction = main.match(
    /function applyBaseJogNumericTarget\(event\)[\s\S]*?(?=\r?\nfunction finishBaseJogNumericHistory)/
 )?.[0] || '';
assert.match(applyBaseJogNumericTargetFunction, /const robot = getJogTargetRobot\(\)/);
assert.doesNotMatch(applyBaseJogNumericTargetFunction, /const shape =|isPrimitiveShapeModel/);
assert.match(main, /function enableHalfStepWheel\(input/);
assert.match(main, /input\.step = '0\.5'/);
assert.match(main, /input\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\);\s*onInput\?\.\(\)/);
assert.match(main, /Object\.entries\(el\.shapeCreateDimensions \|\| \{\}\)[\s\S]*?enableHalfStepWheel\(input\)/);
assert.match(main, /Object\.values\(el\.shapeSelectedDimensions \|\| \{\}\)[\s\S]*?applySelectedPrimitiveShapeDimension\(\{ currentTarget: input \}\)[\s\S]*?enableHalfStepWheel\(/);

console.log('Primitive shape core and UI contracts passed.');
