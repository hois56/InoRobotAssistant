import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {OlpRuntime, formatOlpTactCsv, olpTactMovesForCycle} = await import(pathToFileURL(path.join(repoRoot, '2_3DSimulation', 'olp-runtime.mjs')));

// Planned durations the simulator would report for each target, independent of how fast the adapter returns.
const PLANNED = {'P[1]': 1.25, 'P[2]': 0.75, 'P[3]': 1};

function fixture(lines, {input = () => 0, gate = null} = {}) {
    const text = ['Start;', ...lines, 'End;'].join('\n');
    const project = {programPath: 'main.pro', programFiles: ['main.pro'], programs: [{path: 'main.pro', text}],
        pointRecords: [1, 2, 3].map(index => ({kind: 'point', index, values: [index, 0, 0, 0, 0, 0]}))};
    const changes = [];
    const runtime = new OlpRuntime(project, {
        move: async (motion, expression, speed, _project, current, options) => {
            current.handleMotionProgress(options, {progress: 1, durationSeconds: PLANNED[expression]});
            if (options.nwait && gate) await gate.promise;
            return expression === 'P[3]' ? {blendedNext: true} : undefined;
        },
        home: async (_index, _speed, _project, current, options) => {
            current.handleMotionProgress(options, {progress: 1, durationSeconds: 2});
        },
        delay: async () => { gate?.release(); },
        readAddress: address => (address.prefix === 'IN' && address.index === 0 ? input() : 0),
        tactChanged: current => changes.push(current.tactLog.version)
    });
    return {runtime, changes};
}

test('each move is timed by its planned duration, Delay is non-motion time and TimeStart/TimeOut mark cycles', async () => {
    const {runtime, changes} = fixture([
        'Home[0],V[100];',
        'TimeStart(0);',
        'MovJ P[1],V[100],Z[0],Tool[1],Wobj[0];',
        'Delay T[0.5];',
        'MovL P[2],V[80],Z[CP],Tool[1],Wobj[0];',
        'TimeOut(0,D[0]);',
        'TimeStart(0);',
        'MovJ P[1],V[100],Z[0],Tool[1],Wobj[0];',
        'TimeOut(0,D[0]);'
    ]);
    await runtime.run();
    assert.equal(runtime.phase, 'completed', runtime.lastError);
    const log = runtime.tactLog;
    assert.deepEqual(log.moves.map(move => [move.motion, move.target, move.cycle, move.seconds, move.gapSeconds, move.start]), [
        ['HOME', 'Home[0]', null, 2, 0, 0],
        ['MOVJ', 'P[1]', 1, 1.25, 0, 2],
        ['MOVL', 'P[2]', 1, 0.75, 0.5, 3.75],
        ['MOVJ', 'P[1]', 2, 1.25, 0, 4.5]
    ]);
    assert.ok(log.moves.every(move => move.done && !move.failed && !move.estimated));
    assert.deepEqual(log.cycles.map(cycle => [cycle.index, cycle.seconds, cycle.motionSeconds, cycle.waitSeconds, cycle.moveCount]),
        [[1, 2.5, 2, 0.5, 2], [2, 1.25, 1.25, 0, 1]]);
    // TimeOut still writes its wall-clock value; the adapters returned at once, so it is far below the model time.
    assert.ok(runtime.readSymbol('D[0]') < 1);
    assert.deepEqual(olpTactMovesForCycle(log, 1).map(move => move.target), ['P[1]', 'P[2]']);
    assert.ok(changes.length >= 8, 'the UI is told about every move and cycle');
    assert.deepEqual(log.moves[2], {...log.moves[2], speed: 80, zone: 'CP', process: 'main', functionName: 'main', file: 'main.pro', line: 6});
});

test('a satisfied Wait adds the time it waited and the next run starts a new log', async () => {
    let on = 0;
    setTimeout(() => { on = 1; }, 120);
    const {runtime} = fixture(['MovJ P[1],V[100],Z[0],Tool[1],Wobj[0];', 'Wait In[0]==ON;', 'MovJ P[2],V[100],Z[0],Tool[1],Wobj[0];'], {input: () => on});
    await runtime.run();
    const [, second] = runtime.tactLog.moves;
    assert.ok(second.gapSeconds >= 0.1 && second.gapSeconds < 1, String(second.gapSeconds));
    const first = runtime.tactLog;
    await runtime.run();
    assert.notEqual(runtime.tactLog, first);
    assert.equal(runtime.tactLog.moves[0].start, 0);
});

test('an Nwait move overlapping a Delay counts the longer of the two, not both', async () => {
    let release;
    const gate = {promise: new Promise(resolve => { release = resolve; }), release: () => release()};
    const {runtime} = fixture(['TimeStart(0);', 'MovJ P[1],V[100],Z[0],Tool[1],Wobj[0],Nwait;', 'Delay T[0.3];',
        'MovJ P[2],V[100],Z[0],Tool[1],Wobj[0];', 'TimeOut(0,D[0]);'], {gate});
    await runtime.run();
    const [cycle] = runtime.tactLog.cycles;
    // 1.25 s Nwait move with a 0.3 s Delay inside it, then a 0.75 s move.
    assert.equal(cycle.seconds, 2);
    assert.equal(runtime.tactLog.moves[1].gapSeconds, 0);
});

test('a blended corner is flagged and the CSV lists moves and cycles', async () => {
    const {runtime} = fixture(['TimeStart(0);', 'MovL P[3],V[100],Z[CP],Tool[1],Wobj[0];', 'MovL P[2],V[100],Z[0],Tool[1],Wobj[0];', 'TimeOut(0,D[0]);']);
    await runtime.run();
    assert.deepEqual(runtime.tactLog.moves.map(move => move.blended), [true, false]);
    const lines = formatOlpTactCsv(runtime.tactLog).trimEnd().split('\r\n');
    assert.equal(lines[0], 'cycle,sequence,process,function,file,line,motion,target,speed,zone,acc,dec,move_s,gap_s,start_s,end_s,blended,estimated,failed');
    assert.equal(lines[1], '1,1,main,main,main.pro,3,MOVL,P[3],V[100],CP,,,1.000,0.000,0.000,1.000,1,0,0');
    // The last column is TimeOut's wall-clock value, near zero with these instant adapters.
    assert.match(lines.at(-1), /^1,1\.750,1\.750,0\.000,2,\d+\.\d{3}$/);
});

test('a failed move is marked instead of being counted', async () => {
    const project = {programPath: 'main.pro', programFiles: ['main.pro'], programs: [{path: 'main.pro', text: 'Start;\nMovJ P[1],V[100],Z[0];\nEnd;'}],
        pointRecords: [{kind: 'point', index: 1, values: [1, 0, 0, 0, 0, 0]}]};
    const runtime = new OlpRuntime(project, {move: async () => { throw new Error('IK failed for P[1]'); }});
    await assert.rejects(runtime.run(), /IK failed/);
    assert.deepEqual(runtime.tactLog.moves.map(move => [move.failed, move.seconds]), [[true, null]]);
    assert.equal(runtime.tactLog.clock, 0);
});
