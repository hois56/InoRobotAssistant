import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const reference = process.argv[2];
if (!reference) throw new Error('Pass the generator.js file from the JavaScript version.');
const assets = await readFile(new URL('../4_ProjectGenerator/assets.js', import.meta.url), 'utf8');
const current = new URL('../4_ProjectGenerator/generator.js', import.meta.url);

class FixedDate extends Date {
    constructor(...args) {
        super(...(args.length ? args : [2026, 5, 1, 15, 2, 1]));
    }
}

async function load(file) {
    const generator = await readFile(file, 'utf8');
    return vm.runInNewContext(assets + '\n' + generator + '\n;Generator', { Date: FixedDate, TextDecoder });
}
const [before, after] = await Promise.all([load(reference), load(current)]);
const steps = [
    ['Tray', 'Get', 'Vacuum'], ['Stage', 'Put', 'Gripper'], ['Peeling', 'Peeling', 'Gripper'],
    ['Trash', 'Put', 'Vacuum'], ['Stage', 'Get', 'Vacuum'], ['Vision', 'Calibration', 'Vision (Socket)'],
    ['MCR', 'Check', 'MCR'], ['Stage', 'Put', 'Vacuum'], ['Vision', 'Check', 'Vision (Socket)'],
    ['Tray', 'Put', 'Gripper'], ['Other', 'Get', 'Gripper']
].map(([WorkType, WorkMethod, ToolType], i) => ({
    No: i + 1, id: 'k' + i, ProcessName: '작업_' + (i + 1), WorkType, WorkMethod, ToolType,
    ExtraWaitCount: i % 9, VisionUse: i % 3 === 0 ? 'Use - IO' : i % 2 ? 'Use - Socket' : 'No use',
    TrayXCount: i === 0 ? 4 : 1, TrayYCount: i === 0 ? 2 : 1, TrayPitchY: i === 0 ? 12.25 : 0,
    StageSlot: i % 2 === 0 ? 2 : 0
}));

let comparisons = 0;
for (let mask = 0; mask < 64; mask++) {
    const enabled = bit => Boolean(mask & (1 << bit));
    const options = {
        RobotName: enabled(0) ? 'IR-R10-140S5-D1NH-INT_01741041' : 'IR-S7-60Z20S3-C2LH-INT_01741021',
        EnableMultiRecipe: enabled(0), RecipeCount: 4, EnableTcpSpeed: enabled(1), EnableTorque: enabled(2),
        EnableToolControl: enabled(3), ToolControlType: enabled(4) ? 'DIO' : 'PLC_IO',
        EnableTeachingMode: enabled(4), EnableWaitPos: enabled(5),
        EnableProcessBusy: enabled(0), PreserveProcessNumbers: enabled(5),
        VisionConfigs: { k1: { IsClient: false, Port: 5234 } }
    };
    function compare(name, ...args) {
        const expected = before[name](...args);
        const actual = after[name](...args);
        if (actual !== expected) {
            let offset = 0;
            while (offset < expected.length && expected[offset] === actual[offset]) offset++;
            throw new Error(name + ' differs for option mask ' + mask + ' at character ' + offset);
        }
        comparisons++;
    }
    for (const name of ['MainProgram', 'InitialProgram', 'OffsetProgram', 'TeachModeProgram',
        'DataPoints', 'DataWarning', 'DataPrj', 'LabelsJson']) compare(name, steps, options);
    compare('ToolControlProgram', options, steps);
    for (const name of ['PLCInternalProgram', 'RobPointMapping', 'RemoteIOInfo']) compare(name, options);
    for (const step of steps) {
        compare('ProcessProgram', step, options, 2);
        compare('ProcessProgram', step, options, 2, { VisionTime: 0.125, ToolTime: 0.25, PeelSpeed: 30 });
    }
}
console.log(comparisons + ' file contents matched across 64 option combinations.');
