import assert from 'node:assert/strict';
import { OlpRuntime } from '../2_3DSimulation/olp-runtime.mjs';

const sharedValues = new Map([['IN[512]', 0]]);
const sharedIoBus = {
    readAddress(address) {
        return sharedValues.get(`${address.prefix}[${address.index}]`) || 0;
    },
    writeAddress(address, value) {
        sharedValues.set(`${address.prefix}[${address.index}]`, Number(value) ? 1 : 0);
    }
};

const project = {
    programPath: 'main.pro',
    programFiles: ['main.pro'],
    programs: [{
        path: 'main.pro',
        text: 'Start\nWait In[512] == ON;\nEnd'
    }]
};

const stopped = [];
const createRuntime = (robotId) => new OlpRuntime(project, {
    ...sharedIoBus,
    onStopped: (snapshot) => stopped.push({ robotId, snapshot })
});

const robotA = createRuntime('robot-a');
const robotB = createRuntime('robot-b');
const runA = robotA.run();
const runB = robotB.run();

await new Promise((resolve) => setTimeout(resolve, 35));
assert.equal(robotA.phase, 'waiting');
assert.equal(robotB.phase, 'waiting');

// One shared-bus write must release both independent robot runtimes.
sharedIoBus.writeAddress({ prefix: 'IN', index: 512 }, 1);
await Promise.all([runA, runB]);

assert.equal(robotA.phase, 'completed');
assert.equal(robotB.phase, 'completed');
assert.equal(stopped.length, 2);
console.log('OLP shared IO validation passed: one In[512] signal released all robot runtimes.');
