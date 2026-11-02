import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { performance } from 'node:perf_hooks';

const original = fs.readFileSync(process.env.INOROBOT_OLP_RUNTIME_PATH ?? new URL('../../2_3DSimulation/olp-runtime.mjs',import.meta.url), 'utf8');
const patched = original;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check, message = 'condition') {
    const end = performance.now() + 1500;
    while (!check() && performance.now() < end) await tick();
    assert.ok(check(), 'Timed out waiting for ' + message);
}
const move = (index, extra = '', tool = 1, zone = 0) => `MovJ P[${index}],V[100],Z[${zone}],Tool[${tool}],Wobj[0]${extra};`;
function fixture(lines, { source = patched, optIn = true, rapidLine = true, controlledClock = false } = {}) {
    let clock = 0;
    const timers = [];
    const context = vm.createContext({ AbortController, performance: controlledClock ? { now: () => clock } : performance,
        setTimeout: (callback, delay) => {
            timers.push(delay);
            if (controlledClock) queueMicrotask(() => { clock += delay; callback(); });
            else return setTimeout(callback, delay);
        }, clearTimeout, console });
    vm.runInContext(source.replace(/\bexport\s+(?=(?:const|class|function))/g, '')
        .replace(/^export\s*\{[^}]+\};?\s*$/mg, '') + '\nglobalThis.OlpRuntime = OlpRuntime;', context);
    const text = ['Start;', ...(rapidLine ? ['RapidMove(ALL,ON);'] : []), ...lines, 'End;'].join('\n');
    const project = { programPath: 'main.pro', programFiles: ['main.pro'], programs: [{ path: 'main.pro', text }],
        pointRecords: Array.from({ length: 8 }, (_, index) => ({ kind: 'point', index: index + 1, values: [index, 0, 0, 0, 0, 0] })) };
    const calls = [], gates = [];
    let active = 0, maxActive = 0, onStart = null;
    const runtime = new context.OlpRuntime(project, { queueStopMoves: optIn,
        move: (motion, expression, speed, _project, current, options) => {
            active++; maxActive = Math.max(maxActive, active);
            const call = { motion, expression, speed, options, timing: options.motionQueueTiming,
                timingAtInvoke: options.motionQueueTiming?.nextStartAt, scanLine: current.currentLineNumber };
            calls.push(call);
            const promise = new Promise((resolve, reject) => gates.push({
                resolve: () => { active--; resolve(); }, reject: error => { active--; reject(error); }
            }));
            onStart?.(call);
            return promise;
        } });
    runtime.motionSettings.rapidMove = { ptp: true };
    return { runtime, project, calls, gates, timers, advanceClock: value => { clock += value; },
        get active() { return active; }, get maxActive() { return maxActive; },
        set onStart(value) { onStart = value; } };
}
async function finishMoves(f, count, running) {
    for (let index = 0; index < count; index++) {
        await until(() => f.calls.length > index, 'physical movement ' + index);
        f.gates[index].resolve();
    }
    await running;
}

test('read ahead is enabled only by the adapter; physical movements remain serial', async () => {
    const lines = [move(1), move(2), move(3), 'TimeOut(0,D[0]);'];
    const legacy = fixture(lines, { source: original, optIn: false });
    const red = legacy.runtime.run();
    await until(() => legacy.calls.length === 1);
    for (let n = 0; n < 10; n++) await tick();
    assert.match(legacy.runtime.currentLineText, /P\[1\]/);
    await finishMoves(legacy, 3, red);

    const f = fixture(lines);
    const running = f.runtime.run();
    await until(() => f.runtime.pendingMotions.size === 3, 'three bounded queue entries');
    assert.match(f.runtime.currentLineText, /P\[3\]/);
    assert.equal(f.calls.length, 1, 'Scanning ahead must not invoke later adapters concurrently.');
    f.calls[0].timing.nextStartAt = 123;
    f.gates[0].resolve();
    await until(() => f.calls.length === 2);
    assert.equal(f.calls[1].timing, f.calls[0].timing);
    assert.equal(f.calls[1].timingAtInvoke, 123);
    f.gates[1].resolve();
    await until(() => f.calls.length === 3);
    f.gates[2].resolve();
    await running;
    assert.equal(f.maxActive, 1);
    assert.equal(f.runtime.phase, 'completed');
    assert.equal(f.runtime.pendingMotions.size, 0);
    assert.equal(f.runtime.stopMoveQueue, null);
});

test('implementation backpressure keeps at most three outstanding movements', async () => {
    const f = fixture([1, 2, 3, 4, 5].map(index => move(index)));
    const running = f.runtime.run();
    await until(() => f.runtime.pendingMotions.size === 3);
    assert.match(f.runtime.currentLineText, /P\[3\]/);
    let peak = 3;
    for (let index = 0; index < 5; index++) {
        await until(() => f.calls.length > index);
        peak = Math.max(peak, f.runtime.pendingMotions.size);
        assert.ok(f.runtime.pendingMotions.size <= 3);
        f.gates[index].resolve();
    }
    await running;
    assert.equal(peak, 3);
    assert.equal(f.maxActive, 1);
});

test('assignment and TimeOut barriers wait for the last physical movement', async () => {
    const f = fixture(['TimeStart(0);', move(1), move(2), 'D[9]=42;', move(3), 'TimeOut(0,D[0]);']);
    const running = f.runtime.run();
    await until(() => f.runtime.pendingMotions.size === 2);
    assert.equal(f.runtime.readSymbol('D[9]'), 0);
    f.gates[0].resolve();
    await until(() => f.calls.length === 2);
    assert.equal(f.runtime.readSymbol('D[9]'), 0);
    f.gates[1].resolve();
    await until(() => f.calls.length === 3);
    assert.equal(f.runtime.readSymbol('D[9]'), 42);
    assert.equal(f.runtime.stopwatches.size, 1);
    f.gates[2].resolve();
    await running;
    assert.equal(f.runtime.stopwatches.size, 0);
    assert.ok(f.runtime.readSymbol('D[0]') > 0);
});

test('a long queue drain already yielded and does not add a timer before TimeOut', async () => {
    const f = fixture(['TimeStart(0);', move(1), move(2), 'TimeOut(0,D[0]);'], { controlledClock: true });
    const running = f.runtime.run();
    await until(() => f.runtime.pendingMotions.size === 2);
    f.advanceClock(100);
    f.gates[0].resolve();
    await until(() => f.calls.length === 2);
    f.advanceClock(100);
    f.gates[1].resolve();
    await running;
    assert.equal(f.runtime.readSymbol('D[0]'), 0.2, 'TimeOut must still read the unchanged physical clock.');
    assert.deepEqual(f.timers, [], 'Waiting for physical completion must not trigger a redundant interpreter timer.');
});

test('Tool changes split groups and do not scan ahead over the change', async () => {
    const f = fixture([move(1, '', 1), move(2, '', 2)]);
    const running = f.runtime.run();
    await until(() => f.calls.length === 1);
    for (let n = 0; n < 10; n++) await tick();
    assert.match(f.runtime.currentLineText, /P\[1\]/);
    f.gates[0].resolve();
    await until(() => f.calls.length === 2);
    assert.notEqual(f.calls[1].timing, f.calls[0].timing);
    f.gates[1].resolve();
    await running;
});

test('Z-1, Nwait, Until, events, vibration, zone rate and opt-out retain legacy dispatch', async () => {
    for (const options of [{ zone: '-1' }, { nwait: true }, { until: 'In[0]' }, { outEvents: [{ mode: 'start' }] },
        { vibrationMode: 'ON' }, { zoneRate: 0 }, { optOut: true }]) {
        const f = fixture([], { optIn: !options.optOut });
        const command = f.runtime.parseMotion(move(1));
        Object.assign(command.options, options);
        f.runtime.peekNextMotion = () => f.runtime.parseMotion(move(2));
        let settled = false;
        const running = f.runtime.executeMotion(command).then(() => { settled = true; });
        await until(() => f.calls.length === 1);
        assert.equal(f.calls[0].timing, undefined);
        assert.equal(f.runtime.stopMoveQueue, null);
        if (options.nwait) {
            await running;
            assert.equal(settled, true);
            assert.equal(f.runtime.pendingMotions.size, 1, 'Nwait must retain its old pending-promise behavior.');
        } else assert.equal(settled, false);
        f.gates[0].resolve();
        await running;
        await f.runtime.awaitPendingMotions();
    }
});

test('live edit to a nonmotion line drains the active group before applying it', async () => {
    const f = fixture([move(1), move(2)]);
    f.onStart = () => {
        if (f.calls.length === 1) queueMicrotask(() => {
            f.project.programs[0].text = f.project.programs[0].text.replace(move(2), 'D[9]=77;');
        });
    };
    const running = f.runtime.run();
    await until(() => f.runtime.currentLineText === 'D[9]=77;');
    assert.equal(f.calls.length, 1);
    assert.equal(f.runtime.readSymbol('D[9]'), 0);
    f.gates[0].resolve();
    await running;
    assert.equal(f.calls.length, 1);
    assert.equal(f.runtime.readSymbol('D[9]'), 77);
});

test('queued adapter failure preserves the physical command context and stops dependents', async () => {
    const f = fixture([move(1), move(2), move(3)]);
    const running = f.runtime.run();
    await until(() => f.runtime.pendingMotions.size === 3);
    f.gates[0].reject(new Error('motor failure'));
    await assert.rejects(running, /motor failure/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.runtime.phase, 'error');
    assert.match(f.runtime.lastError, /main\.pro:3: motor failure/);
    assert.match(f.runtime.lastError, /P\[1\]/);
});

test('Stop prevents already queued movements from invoking their adapters', async () => {
    const f = fixture([move(1), move(2), move(3)]);
    const running = f.runtime.run();
    await until(() => f.runtime.pendingMotions.size === 3);
    f.runtime.stop();
    f.gates[0].resolve();
    await assert.rejects(running, /OLP stopped/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.runtime.phase, 'stopped');
});

test('pause before queued invocation invalidates the shared clock after resume', async () => {
    const f = fixture([move(1), move(2)]);
    const running = f.runtime.run();
    await until(() => f.runtime.pendingMotions.size === 2);
    f.calls[0].timing.nextStartAt = 123;
    f.runtime.togglePause();
    f.gates[0].resolve();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(f.calls.length, 1);
    f.runtime.togglePause();
    await until(() => f.calls.length === 2);
    assert.ok(Number.isNaN(f.calls[1].timingAtInvoke));
    f.gates[1].resolve();
    await running;
});

test('pause after first completion but before second enqueue still resets its clock', async () => {
    const f = fixture([]);
    const first = f.runtime.parseMotion(move(1));
    const second = f.runtime.parseMotion(move(2));
    f.runtime.peekNextMotion = () => second;
    await f.runtime.executeMotion(first);
    assert.equal(f.calls.length, 1);
    f.runtime.togglePause();
    f.calls[0].timing.nextStartAt = 987;
    f.gates[0].resolve();
    await until(() => f.runtime.pendingMotions.size === 0);
    f.runtime.togglePause();
    f.runtime.peekNextMotion = () => null;
    const tail = f.runtime.executeMotion(second);
    await until(() => f.calls.length === 2);
    assert.ok(Number.isNaN(f.calls[1].timingAtInvoke));
    f.gates[1].resolve();
    await tail;
});

test('single-step mode completes only the permitted movement and never queues ahead', async () => {
    const f = fixture([move(1), move(2)], { rapidLine: false });
    const running = f.runtime.run(null, { singleStep: true });
    await until(() => f.calls.length === 1);
    assert.equal(f.calls[0].timing, undefined);
    assert.equal(f.runtime.stopMoveQueue, null);
    f.gates[0].resolve();
    await until(() => f.runtime.paused);
    assert.equal(f.calls.length, 1);
    f.runtime.stop();
    await assert.rejects(running, /OLP stopped/);
});

test('a paused RUN batch consumes one permit per queued movement and can resume continuously', async () => {
    const f = fixture([move(1), move(2), move(3)]);
    const running = f.runtime.run();
    await until(() => f.runtime.pendingMotions.size === 3);
    f.runtime.togglePause();
    f.gates[0].resolve();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(f.calls.length, 1);
    f.runtime.stepOnce();
    await until(() => f.calls.length === 2);
    assert.equal(f.runtime.stepPermit, 0);
    assert.ok(Number.isNaN(f.calls[1].timingAtInvoke));
    f.gates[1].resolve();
    await until(() => f.runtime.paused);
    assert.equal(f.calls.length, 2, 'A single STEP must not release the third queued movement.');
    f.runtime.togglePause();
    await until(() => f.calls.length === 3);
    assert.equal(f.runtime.stepMode, false);
    assert.ok(Number.isNaN(f.calls[2].timingAtInvoke));
    f.gates[2].resolve();
    await running;
    assert.equal(f.maxActive, 1);
});

test('STEP permits are not consumed by both the queued physical task and a backpressured parser', async () => {
    const f = fixture([1, 2, 3, 4, 5].map(index => move(index)));
    const running = f.runtime.run();
    try {
        await until(() => f.runtime.pendingMotions.size === 3);
        f.runtime.togglePause();
        f.gates[0].resolve();
        await new Promise(resolve => setTimeout(resolve, 10));
        f.runtime.stepOnce();
        await until(() => f.calls.length === 2);
        f.gates[1].resolve();
        await until(() => f.runtime.paused);
        assert.equal(f.calls.length, 2);
        f.runtime.stepOnce();
        await until(() => f.calls.length === 3);
        f.gates[2].resolve();
        await until(() => f.runtime.paused || f.calls.length >= 4);
        assert.equal(f.calls.length, 3, 'The fourth, unscanned movement needs a separate STEP permit.');
        f.runtime.togglePause();
        await until(() => f.calls.length === 4);
        f.gates[3].resolve();
        await until(() => f.calls.length === 5);
        f.gates[4].resolve();
        await running;
    } finally {
        if (f.runtime.running) {
            f.runtime.stop();
            for (const gate of f.gates) gate.resolve();
            await running.catch(() => {});
        }
    }
});


test('STEP resumes a paused active interpolated movement without permitting the next queued movement', async () => {
    const f = fixture([move(1), move(2), move(3)]);
    const running = f.runtime.run();
    try {
        await until(() => f.runtime.pendingMotions.size === 3);
        // This is the contract used by the physical interpolation adapter;
        // a stopped gate between adapters deliberately leaves this count zero.
        f.runtime.activeInterpolatedMotions = 1;
        f.runtime.togglePause();
        f.runtime.stepOnce();
        assert.equal(f.runtime.stepPermit, 0, 'STEP belongs to the already running physical movement.');
        f.runtime.activeInterpolatedMotions = 0;
        f.gates[0].resolve();
        await until(() => f.runtime.paused);
        assert.equal(f.calls.length, 1, 'The next adapter must remain paused after the first movement finishes.');
        f.runtime.stepOnce();
        await until(() => f.calls.length === 2);
        f.gates[1].resolve();
        await until(() => f.runtime.paused);
        assert.equal(f.calls.length, 2);
        f.runtime.togglePause();
        await until(() => f.calls.length === 3);
        f.gates[2].resolve();
        await running;
        assert.equal(f.maxActive, 1);
    } finally {
        if (f.runtime.running) {
            f.runtime.stop();for (const gate of f.gates) gate.resolve();
            await running.catch(() => {});
        }
    }
});
