import assert from 'node:assert/strict';
import { OlpRuntime } from '../2_3DSimulation/olp-runtime.mjs';

async function validateWaitInPosition(command) {
    let releaseMotion;
    let notifyMotionStarted;
    let notifyWaiting;
    const motionStarted = new Promise((resolve) => { notifyMotionStarted = resolve; });
    const waiting = new Promise((resolve) => { notifyWaiting = resolve; });
    const pendingMotion = new Promise((resolve) => { releaseMotion = resolve; });
    const point = {
        path: 'P.pts',
        kind: 'point',
        sourceSymbol: 'P',
        index: 1,
        name: 'P1',
        values: [10, 20, 30, 0, 0, 0]
    };
    const runtime = new OlpRuntime({
        programPath: 'main.pro',
        programFiles: ['main.pro'],
        programs: [{ path: 'main.pro', text: `MovJ P[1],V[100],NWait;\n${command}` }],
        pointFiles: [{ path: 'P.pts', kind: 'point', records: [point] }],
        pointRecords: [point]
    }, {
        move: async () => {
            notifyMotionStarted();
            return pendingMotion;
        },
        cursor: (snapshot) => {
            if (snapshot.phase === 'waiting' && snapshot.waitCondition === 'InPos') notifyWaiting();
        }
    });

    let completed = false;
    const run = runtime.run().then(() => { completed = true; });
    await motionStarted;
    await waiting;
    assert.equal(completed, false, `${command} continued before the pending NWait motion reached its target.`);
    releaseMotion();
    await run;
    assert.equal(runtime.phase, 'completed');
}

await validateWaitInPosition('WaitInPos;');
await validateWaitInPosition('WaitInPos(100);');

console.log('OLP WaitInPos validation passed: bare and parenthesized forms wait for pending NWait motion completion.');
