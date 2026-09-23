import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `Could not find ${name}.`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${name}.`);
}

const mainSource = readFileSync(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const contextMenuSource = [
    extractFunction(mainSource, 'closeOlpPointContextMenu'),
    extractFunction(mainSource, 'openOlpPointContextMenu'),
    extractFunction(mainSource, 'handleOlpPointContextMenu')
].join('\n') + '\nthis.handleOlpPointContextMenu = handleOlpPointContextMenu;';

const record = { path: 'Data/P.pts', index: 1, sourceSymbol: 'P' };
const row = { dataset: { olpPointIndex: '1', olpPointSymbol: 'P' } };
const menu = {
    classList: {
        hidden: true,
        add() { this.hidden = true; },
        remove() { this.hidden = false; }
    },
    style: {},
    getBoundingClientRect: () => ({ width: 160, height: 80 })
};
const state = { olp: { manualMoveBusy: false, workOriginBusy: false, pointContextTarget: null }, motionSessions: new Set() };
const writeButton = { disabled: false };
const moveButton = { disabled: false };
let olpRunning = true;
const sandbox = {
    state,
    el: { olpPointContextMenu: menu, olpPointWriteCurrent: writeButton, olpPointMoveTarget: moveButton },
    window: { innerWidth: 800, innerHeight: 600 },
    isOlpRunning: () => olpRunning,
    isVirtualControllerActive: () => false,
    getOlpProject: () => ({}),
    getOlpSelectedPointFile: () => ({ records: [record] })
};
vm.runInNewContext(contextMenuSource, sandbox);

let prevented = false;
sandbox.handleOlpPointContextMenu({
    target: { closest: () => row },
    preventDefault() { prevented = true; },
    clientX: 120,
    clientY: 140
});

assert.equal(prevented, true, 'The native browser context menu was not suppressed on an OLP point row.');
assert.equal(menu.classList.hidden, false, 'The application point menu did not open while another OLP runtime was running.');
assert.equal(writeButton.disabled, true, 'Editing a point remained enabled while OLP was running.');
assert.equal(moveButton.disabled, true, 'Moving to a point remained enabled while OLP was running.');
assert.deepEqual({ ...state.olp.pointContextTarget }, { path: 'Data/P.pts', index: 1, sourceSymbol: 'P' });

olpRunning = false;
prevented = false;
sandbox.handleOlpPointContextMenu({
    target: { closest: () => row },
    preventDefault() { prevented = true; },
    clientX: 120,
    clientY: 140
});
assert.equal(prevented, true);
assert.equal(menu.classList.hidden, false);
assert.equal(writeButton.disabled, false, 'Point editing was disabled while OLP was stopped.');
assert.equal(moveButton.disabled, false, 'Point movement was disabled while OLP was stopped.');

console.log('OLP point context-menu validation passed: app menu opens in both states and busy actions are disabled.');
