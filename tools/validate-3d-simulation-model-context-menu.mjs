import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');

const contextHandlers = source.match(
    /el\.modelDelete\?\.addEventListener\('click',[\s\S]*?el\.transformModeButtons\.forEach/
)?.[0] || '';

assert.match(contextHandlers, /deleteSelectedModel\(\{ allowDuringMotion: true \}\)/);
assert.doesNotMatch(contextHandlers, /modelDelete[\s\S]*?isRobotMotionActive\(\)/);
assert.match(contextHandlers, /openToolAttachmentDialog\(target\.model, target\.part, \{ allowDuringMotion: true \}\)/);
assert.match(contextHandlers, /registerSceneModelAsArmLoad\(target\.model, getArticulatedRobotForAttachment\(\), 3, \{[\s\S]*?allowDuringMotion: true/);
assert.match(contextHandlers, /detachToolModel\(target\.model, \{ allowDuringMotion: true \}\)/);
assert.match(contextHandlers, /useGripObject\(target\.model, target\.part, getGripObjectRobot\(\), \{[\s\S]*?allowDuringMotion: true/);
assert.match(contextHandlers, /releaseGripObject\(activeGripObject, \{ allowDuringMotion: true \}\)/);
assert.match(contextHandlers, /openZeroPointEditor\(target\.model, \{ allowDuringMotion: true \}\)/);

assert.match(markup, /id="model-delete"/);
assert.match(markup, /id="model-install-tool"/);
assert.match(markup, /id="model-detach-tool"/);
assert.match(markup, /id="model-arm-load"/);
assert.match(markup, /id="model-use-grip-object"/);
assert.match(markup, /id="model-release-grip-object"/);
assert.match(markup, /id="model-change-zero-point"/);

const deleteBlock = source.match(/function deleteSelectedModel\([\s\S]*?\n\}/)?.[0] || '';
assert.match(deleteBlock, /allowDuringMotion = false/);
assert.match(deleteBlock, /isModelMotionActive\(model\)/);
assert.match(source, /function isModelMotionActive\(model\)[\s\S]*?isOlpRuntimeRunning/);

const toolAttachBlock = source.match(/function installSceneModelAsTool\([\s\S]*?\n\}/)?.[0] || '';
assert.match(toolAttachBlock, /allowDuringMotion = false/);
assert.match(toolAttachBlock, /!allowDuringMotion && isMotionActive\(\)/);

const toolDetachBlock = source.match(/function detachToolModel\([\s\S]*?\n\}/)?.[0] || '';
assert.match(toolDetachBlock, /allowDuringMotion = false/);
assert.match(toolDetachBlock, /!allowDuringMotion && isMotionActive\(\)/);

const armLoadBlock = source.match(/function registerSceneModelAsArmLoad\([\s\S]*?\n\}/)?.[0] || '';
assert.match(armLoadBlock, /allowDuringMotion = false/);
assert.match(armLoadBlock, /!allowDuringMotion && isMotionActive\(\)/);

const zeroPointBlock = source.match(/function openZeroPointEditor\([\s\S]*?\n\}/)?.[0] || '';
assert.match(zeroPointBlock, /allowDuringMotion = false/);
assert.match(zeroPointBlock, /!allowDuringMotion && isMotionActive\(\)/);

const gripUseBlock = source.match(/function useGripObject\([\s\S]*?\n\}/)?.[0] || '';
const gripReleaseBlock = source.match(/function releaseGripObject\([\s\S]*?\n\}/)?.[0] || '';
assert.match(gripUseBlock, /allowDuringMotion = false/);
assert.match(gripReleaseBlock, /allowDuringMotion = false/);

for (const functionName of [
    'updateArmLoadCalculationSetting',
    'calculateArmLoadPropertiesFromModel',
    'applyArmLoadPanelField',
    'setArmLoadAttachmentAxis',
    'setArmLoadVisibility'
]) {
    const block = source.match(new RegExp(`function ${functionName}\\([\\s\\S]*?\\n\\}`))?.[0] || '';
    assert.doesNotMatch(block, /if \(isMotionActive\(\)\) return/);
}

console.log('3D simulation model context-menu validation passed.');
