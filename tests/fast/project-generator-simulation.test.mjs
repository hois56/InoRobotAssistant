import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {generateOlpGeneratorCases, createGeneratedProgramPlant} from '../support/generated-olp-projects.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {buildOlpProjectFromFiles} = await import(pathToFileURL(path.join(repoRoot, '2_3DSimulation', 'olp-project-core.mjs')));
const {OlpRuntime} = await import(pathToFileURL(path.join(repoRoot, '2_3DSimulation', 'olp-project-runtime.mjs')));

const context = vm.createContext({console, Date});
for (const name of ['assets.js', 'generator.js']) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, '4_ProjectGenerator', name), 'utf8'), context, {filename: name});
}
const G = vm.runInContext('Generator', context);
const cases = generateOlpGeneratorCases({repoRoot});

function simulationProject(entry, input = {}) {
    const sim = G.SimulationSettings(entry.steps, entry.options, input);
    const programs = G.SimulationProgramFiles(entry.steps, entry.options, sim);
    const files = {...programs, [`${entry.name}_SIM.prj`]: G.SimulationProjectInfo(Object.keys(programs)),
        'Data/P.pts': entry.files['Data/P.pts'], 'Data/Labels.jsn': entry.files['Data/Labels.jsn'],
        'Data/UserDefineWarning.jsn': entry.files['Data/UserDefineWarning.jsn']};
    return {sim, programs, files};
}

async function runSimulation(files, name) {
    const project = await buildOlpProjectFromFiles(Object.entries(files).map(([file, text]) => ({
        name: path.basename(file), relativePath: `${name}/${file}`, text: async () => text})));
    const plant = createGeneratedProgramPlant(project);
    const runtime = new OlpRuntime(project, plant.adapter);
    const timer = setTimeout(() => runtime.stop(), 5000);
    try { await runtime.run('main.pro'); } finally { clearTimeout(timer); }
    return {project, plant, runtime};
}

// Motion statements and the position bookkeeping around them.
const motionLines = text => text.split(/\r?\n/).map(line => line.trim())
    .filter(line => /^(Movj|Movl|R_Cur_pos = )/i.test(line))
    .map(line => line.replace(/Speed\[[^\]]+\]/, 'Speed[*]'));

test('the normal controller output is unchanged by the simulation settings', () => {
    const entry = cases.find(item => item.name === 'options-control-7');
    const before = Object.fromEntries(entry.steps.map(step => [step.ProcessName, G.ProcessProgram(step, entry.options, 1)]));
    simulationProject(entry, {Sequence: '1W 1 2', Cycles: 2});
    for (const step of entry.steps) assert.equal(G.ProcessProgram(step, entry.options, 1), before[step.ProcessName]);
    assert.equal(G.ProcessProgram(entry.steps[0], entry.options, 1, null), before[entry.steps[0].ProcessName]);
});

test('every generator configuration produces a simulation project without PLC handshakes that runs its cycles to End', async () => {
    let executed = 0;
    for (const entry of cases) {
        const {sim, programs, files} = simulationProject(entry, {Cycles: 2});
        const text = Object.values(programs).join('\n');
        assert.doesNotMatch(text, /^\s*(?:Wait|Get Port|Open Socket|Send Port)\b/m, entry.name);
        assert.doesNotMatch(text, /\bxw[A-Z]|\bxP\d+_|\byP\d+_|xTeach|s03_teach_mode|Manual_set_recipe|Init_signal|xReIO|Goto L\[0\]/, entry.name);
        assert.doesNotMatch(text, /\bundefined\b|NaN/, entry.name);
        const info = JSON.parse(files[`${entry.name}_SIM.prj`]);
        assert.equal(info.MultiTaskCount, 0);
        assert.deepEqual(info.ProgramFiles, Object.keys(programs));
        assert.ok(!info.ProgramFiles.some(file => /PLC_|s03_teach_mode/.test(file)), entry.name);
        // The motion statements are those of the controller program.
        let stage = 0;
        for (const step of entry.steps) {
            if (step.WorkType === 'Stage') stage++;
            assert.deepEqual(motionLines(programs[`${step.ProcessName}.pro`]), motionLines(G.ProcessProgram(step, entry.options, stage)), `${entry.name}/${step.ProcessName}`);
        }

        const {runtime, plant} = await runSimulation(files, entry.name);
        assert.equal(runtime.phase, 'completed', `${entry.name}: ${runtime.lastError}`);
        assert.equal(runtime.backgroundTasks.length, 0);
        assert.equal(runtime.velocityRate, sim.SpeedRate);
        assert.equal(runtime.tactLog.cycles.length, 2, entry.name);
        const last = entry.steps.at(-1);
        const peeling = last.WorkMethod === 'Peeling';
        assert.equal(runtime.readSymbol('R_Cur_pos'), last.No * 100 + (peeling ? 20 : 11), entry.name);
        assert.ok(plant.calls.moves.length >= 4 * entry.steps.length, entry.name);
        // Tool/vision feedback became fixed Delays; every Delay is one of the configured times.
        assert.ok(plant.calls.delays.every(ms => ms === sim.ToolTime * 1000 || ms === sim.VisionTime * 1000), `${entry.name}: ${plant.calls.delays}`);
        executed++;
    }
    assert.equal(executed, cases.length);
});

test('simulation settings drive the generated cycle, tray cell, speed, peel speed and tool time', async () => {
    const entry = cases.find(item => item.name === 'options-control-6');
    const {programs, files} = simulationProject(entry, {Sequence: '1W, 1 3 2W 2', Cycles: 3, SpeedRate: 60, ToolTime: 0.15, VisionTime: 0, TrayCell: 6, PeelSpeed: 35});
    const main = programs['main.pro'];
    assert.match(main, /Velset Rate\[60\];/);
    assert.match(main, /For cycle=1,cycle<=3,Step\[1\]/);
    assert.deepEqual([...main.matchAll(/\.P(\d+)_pos\((\d)\);/g)].map(match => `${match[1]}:${match[2]}`), ['1:1', '1:0', '3:0', '2:1', '2:0']);
    assert.match(programs['s02_offset.pro'], /Int num = 5; # Simulation tray cell 6/);
    assert.match(programs[`${entry.steps[2].ProcessName}.pro`], /Speed\[35\]/);
    assert.doesNotMatch(Object.values(programs).join('\n'), /Simulation vision time/);
    const {runtime, plant} = await runSimulation(files, entry.name);
    assert.equal(runtime.phase, 'completed', runtime.lastError);
    assert.equal(runtime.tactLog.cycles.length, 3);
    assert.ok(plant.calls.delays.length > 0 && plant.calls.delays.every(ms => ms === 150));
    // Tray cell 6 of a 4 x 2 tray with pitch -12.25 / 20.5: row 1, column 1.
    assert.deepEqual(runtime.readPositionSymbol('PR[10]').slice(0, 2), [-12.25, 20.5]);
});

test('invalid simulation settings are rejected with a message instead of a broken program', () => {
    const entry = cases.find(item => item.name === 'options-control-6');
    const noWait = cases.find(item => item.name === 'options-control-4');
    const reject = (target, input, pattern) => assert.throws(() => G.SimulationSettings(target.steps, target.options, input), pattern);
    reject(entry, {Sequence: '1, 9'}, /process numbers from the list/);
    reject(entry, {Sequence: '1, x'}, /process numbers from the list/);
    reject(noWait, {Sequence: '1W'}, /Wait Position option/);
    reject(entry, {Cycles: 0}, /cycles/);
    reject(entry, {Cycles: 1.5}, /cycles/);
    reject(entry, {SpeedRate: 101}, /speed/);
    reject(entry, {ToolTime: -1}, /times/);
    reject(entry, {VisionTime: ''}, /times/);
    reject(entry, {TrayCell: 9}, /tray cell/);
    reject(entry, {PeelSpeed: 0}, /Peeling speed/);
    assert.throws(() => G.SimulationSettings([], entry.options, {}), /at least one process/);
    assert.deepEqual(G.SimulationSettings(entry.steps, entry.options, {}).Sequence.map(call => call.No), entry.steps.map(step => step.No));
});
