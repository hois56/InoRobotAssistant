import assert from 'node:assert/strict';
import { OlpRuntime } from '../2_3DSimulation/olp-runtime.mjs';

function createPointFile(path, z) {
    return {
        path,
        kind: 'point',
        records: [{
            path,
            kind: 'point',
            sourceSymbol: 'P',
            index: 1,
            name: 'P1',
            values: [10, 20, z, 0, 0, 0]
        }]
    };
}

const defaultPointFile = createPointFile('P.pts', -100);
const selectedPointFile = createPointFile('Process.pts', -55);
const targetValues = [];
const project = {
    programPath: 'main.pro',
    programFiles: ['main.pro'],
    programs: [{
        path: 'main.pro',
        text: 'LoadPoints("Process.pts");\nMovL P[1];'
    }],
    pointFiles: [defaultPointFile, selectedPointFile],
    pointRecords: [...defaultPointFile.records, ...selectedPointFile.records],
    labels: {}
};

const runtime = new OlpRuntime(project, {
    move: async (...args) => targetValues.push(args[5]?.targetOverride?.values || [])
});

await runtime.run();

assert.deepEqual(targetValues, [[10, 20, -55, 0, 0, 0]]);
console.log('OLP point-file selection validation passed: active point files take precedence for P[n].');
