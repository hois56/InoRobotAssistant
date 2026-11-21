import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../../shared/site-engine.js';
import vm from 'node:vm';
import test from 'node:test';
import { generateOlpGeneratorCases } from '../support/generated-olp-projects.mjs';

test('the standalone generator works in a VM without browser codecs or Uint8Array.fromBase64', () => {
    const context = vm.createContext({});
    vm.runInContext('Uint8Array.fromBase64 = undefined', context);
    vm.runInContext(fs.readFileSync('4_ProjectGenerator/generator.js', 'utf8'), context);
    const project = vm.runInContext("Generator.DataPrj([{ No: 1, ProcessName: '공정_一' }], {})", context);
    assert.ok(JSON.parse(project).ProgramFiles.includes('공정_一.pro'));
});

function api() {
    const ctx = vm.createContext({ console, Date, InoSite: globalThis.InoSite, TextDecoder, Uint8Array, window: {}, document: { addEventListener() {}, getElementById() { return {}; } } });
    for (const file of ['assets.js', 'generator.js', 'app.js', 'project-editor.js']) vm.runInContext(fs.readFileSync(`4_ProjectGenerator/${file}`, 'utf8'), ctx);
    return vm.runInContext('({ E: ProjectEditor, G: Generator, ProcessStep, defaults: state.options, handleGeneratedContent, state })', ctx);
}
function fixture(metadata = false) {
    const a = api(), steps = [1, 2, 3].map(n => new a.ProcessStep(n));
    steps[1].WorkType = steps[2].WorkType = 'Stage'; steps[1].WorkMethod = 'Put';
    const config = a.E.config(steps, { ...a.defaults, EnableToolControl: true, EnableMultiRecipe: true, RecipeCount: 3 }, 'Example');
    const generated = a.E.generate(config, a.G);
    const files = new Map(Object.entries(generated).map(([path, text]) => [path, { text, bytes: new TextEncoder().encode(text) }]));
    if (metadata) files.set(a.E.META, { text: a.E.metadata(config, generated) });
    const open = () => a.E.open(files, 'Example.prj', a.defaults, a.G);
    return { ...a, config, generated, files, open };
}
const freshConfig = s => JSON.parse(JSON.stringify(s.original));

test('review diff aligns added, removed and replaced lines with real line numbers', () => {
    const { E } = api();
    const rows = JSON.parse(JSON.stringify(E.diffLines('start\nold\nend', 'start\nnew\nextra\nend')));
    assert.deepEqual(rows.map(r => [r.before?.number ?? null, r.after?.number ?? null]), [[1, 1], [2, 2], [null, 3], [3, 4]]);
    assert.equal(rows[1].before.kind, 'removed'); assert.equal(rows[1].after.kind, 'added');
    assert.equal(rows[2].before, null); assert.equal(rows[3].after.kind, 'same');
    assert.deepEqual([...E.diffLines('', '')], []);
    assert.equal(E.diffLines('', 'new')[0].after.kind, 'added');
    assert.equal(E.diffLines('old', '')[0].before.kind, 'removed');
});

test('review diff preserves repeated context and trims unchanged large-file boundaries', () => {
    const { E } = api(), common = Array.from({ length: 2500 }, (_, i) => `line ${i}`).join('\n');
    const rows = E.diffLines(common + '\r\nold\r\nlast', common + '\nnew\nlast');
    assert.equal(rows.filter(r => r.before?.kind === 'removed').length, 1);
    assert.equal(rows.find(r => r.after?.kind === 'added').after.number, 2501);
    const repeated = E.diffLines('same\nold\nsame\nkeep\nsame', 'same\nnew\nsame\nsame');
    assert.deepEqual([...repeated.filter(r => r.before?.kind === 'removed').map(r => r.before.text)], ['old', 'keep']);
});

test('all supported generator variants restore process types, socket endpoints and options from actual files', () => {
    const a = api();
    for (const sample of generateOlpGeneratorCases()) {
        const files = new Map(Object.entries(sample.files).map(([path, text]) => [path.replace(/^Data\/Remote_IO_mapping.dat$/, 'Remote_IO_mapping.dat'), { text }]));
        const session = a.E.open(files, `${sample.name}.prj`, a.defaults, a.G);
        const actual = session.original;
        for (const key of ['RobotName', 'EnableToolControl', 'EnableTeachingMode', 'EnableWaitPos', 'EnableProcessBusy', 'EnableTcpSpeed', 'EnableTorque', 'EnableMultiRecipe']) {
            assert.equal(actual.options[key], sample.options[key], `${sample.name}: ${key}`);
        }
        sample.steps.forEach((step, i) => {
            for (const key of ['No', 'WorkType', 'WorkMethod', 'ExtraWaitCount']) assert.equal(actual.steps[i][key], step[key], `${sample.name}: ${key}`);
            if (a.G.UsesVisionSocket(step)) {
                const expected = sample.options.VisionConfigs[step.id] || { IsClient: true, IpAddress: '192.168.1.10', Port: '5000' };
                const imported = actual.options.VisionConfigs[actual.steps[i].id];
                assert.equal(imported.IsClient, expected.IsClient, sample.name);
                if (expected.IsClient) assert.equal(imported.Port, expected.Port, sample.name);
                else assert.ok(session.issues.some(issue => issue.id === actual.steps[i].id && issue.fields.includes('Vision server port')), sample.name);
            }
        });
    }
});

test('adding a process preserves manual code, labels, all recipe coordinates and binary attachments', () => {
    const f = fixture();
    const path = 'sP01_Tray_Get.pro';
    f.files.get(path).text = f.files.get(path).text.replace('V[100]', 'V[42]') + '\n# Custom recovery\nFunc Recover()\n    Delay T[3];\nEndFunc;\n';
    for (const p of ['Data/P.pts', 'Data/P01.pts', 'Data/P02.pts']) f.files.get(p).text = f.files.get(p).text.replace('P[111] = 0.000000', 'P[111] = 123.456789');
    const labels = JSON.parse(f.files.get('Data/Labels.jsn').text);
    labels.InputBitLabels.LabelsArray[0].sDescription = 'Custom PLC description';
    f.files.get('Data/Labels.jsn').text = JSON.stringify(labels);
    const bytes = new Uint8Array([0, 255, 30, 10]); f.files.set('custom/settings.bin', { bytes, text: null });
    const session = f.open(), next = freshConfig(session);
    next.steps.push({ ...next.steps[0], No: 4, id: 'new-process', ProcessName: 'sP04_Tray_Get', _customName: null });
    const plan = f.E.plan(session, next, f.G);
    assert.equal(plan.changes.filter(c => c.conflict).length, 0, JSON.stringify(plan.changes.filter(c => c.conflict).map(c => c.path)));
    assert.equal(plan.files.get(path).text, f.files.get(path).text);
    for (const p of ['Data/P.pts', 'Data/P01.pts', 'Data/P02.pts']) {
        assert.match(plan.files.get(p).text, /P\[111\] = 123.456789/);
        assert.match(plan.files.get(p).text, /P\[411\]/);
    }
    assert.match(plan.files.get('Data/Labels.jsn').text, /Custom PLC description/);
    assert.equal(plan.files.get('custom/settings.bin').bytes, bytes);
    assert.deepEqual([...f.E.validate(plan.files)], []);
});

test('renaming a custom process preserves code and updates main and user-added module references', () => {
    const f = fixture(true), path = 'sP01_Tray_Get.pro';
    f.files.get(path).text += '\n# field edit\n';
    f.files.set('custom.pro', { text: 'Include "sP01_Tray_Get.pro";\nFunc Custom()\n    sP01_Tray_Get.P1_pos();\nEndFunc;\n' });
    const s = f.open(), next = freshConfig(s);
    next.steps[0]._customName = 'PickPart';
    const result = f.E.plan(s, next, f.G);
    assert.equal(result.changes.some(c => c.conflict), false, JSON.stringify(result.changes.filter(c => c.conflict).map(c => ({path:c.path, details:c.details}))));
    assert.equal(result.files.has(path), false);
    assert.match(result.files.get('PickPart.pro').text, /# field edit/);
    assert.match(result.files.get('main.pro').text, /PickPart.P1_pos/);
    assert.match(result.files.get('custom.pro').text, /Include "PickPart.pro"/);
    assert.match(result.files.get('custom.pro').text, /PickPart.P1_pos/);
    f.state.steps = [Object.assign(new f.ProcessStep(1), { _customName: 'PickPart' })];
    assert.match(f.handleGeneratedContent('PickPart.pro'), /Func P1_pos/);
});

test('deleting a middle process keeps P3, its IO and Stage2 slot and detects modified deletions', () => {
    const f = fixture(true), s = f.open(), next = freshConfig(s);
    next.steps = next.steps.filter(s => s.No !== 2);
    const plan = f.E.plan(s, next, f.G);
    assert.equal(plan.changes.some(c => c.conflict), false);
    assert.match(plan.files.get('sP03_Stage_Get.pro').text, /Stage2_Vac_OFF/);
    assert.match(plan.files.get('s04_Tool_Control.pro').text, /Func Stage2_Vac_ON/);
    const labels = JSON.parse(plan.files.get('Data/Labels.jsn').text);
    const item = labels.InputBitLabels.LabelsArray.find(l => l.sLabel === 'xP3_work_pos_start');
    assert.equal(item.nIndex, 546);
    assert.match(plan.files.get('Data/P.pts').text, /P\[311\]/);
    assert.doesNotMatch(plan.files.get('Data/P.pts').text, /P\[211\]/);
    s.files.get('sP02_Stage_Put.pro').text += '\n# Custom code';
    assert.equal(f.E.plan(s, next, f.G).changes.find(c => c.path === 'sP02_Stage_Put.pro').conflict, true);
});

test('Tray Get becomes Stage Put, preserving speeds and taught points and flagging overlapping tool edits', () => {
    const f = fixture(true), path = 'sP01_Tray_Get.pro';
    f.files.get(path).text = f.files.get(path).text.replace('V[100]', 'V[65]');
    f.files.get('Data/P.pts').text = f.files.get('Data/P.pts').text.replace('P[111] = 0.000000', 'P[111] = 55.000000');
    const s = f.open(), next = freshConfig(s);
    Object.assign(next.steps[0], { WorkType: 'Stage', WorkMethod: 'Put', StageSlot: 3 });
    let plan = f.E.plan(s, next, f.G);
    assert.equal(plan.changes.some(c => c.conflict), false);
    assert.match(plan.files.get('sP01_Stage_Put.pro').text, /V\[65\]/);
    assert.match(plan.files.get('sP01_Stage_Put.pro').text, /Stage3_Vac_ON/);
    assert.match(plan.files.get('Data/P.pts').text, /P\[111\] = 55.000000/);
    s.files.get(path).text = s.files.get(path).text.replace('s04_Tool_Control.Tool_Vac_ON();', 's04_Tool_Control.Tool_Grip();');
    plan = f.E.plan(s, next, f.G);
    assert.equal(plan.changes.find(c => c.path === 'sP01_Stage_Put.pro').conflict, true);
});

test('no-op round trip preserves bytes; metadata allows another edit without losing custom files', () => {
    const f = fixture(true), s = f.open(), next = freshConfig(s);
    let result = f.E.plan(s, next, f.G);
    assert.equal(result.changes.length, 0);
    for (const [path, file] of s.files) assert.equal(result.files.get(path), file);
    next.steps[0]._customName = 'Pickup';
    result = f.E.plan(s, next, f.G);
    result.files.set(f.E.META, { text: f.E.metadata(next, result.generated) });
    const again = f.E.open(result.files, 'Example.prj', f.defaults, f.G);
    const edit = freshConfig(again); edit.options.EnableTcpSpeed = true;
    const second = f.E.plan(again, edit, f.G);
    assert.equal(second.changes.some(c => c.conflict), false);
    assert.ok(second.files.has('Pickup.pro'));
    assert.ok(second.files.has('PLC_TCP_Speed.pro'));
});

test('three-way merge detects overlap and handles simultaneous array additions without losing user fields', () => {
    const { E } = api();
    assert.equal(E.mergeText('a\nb\nc', 'a\ncustom\nc', 'a\ngenerated\nc').conflict, true);
    assert.equal(E.mergeText('a\nb\nc', 'x\nb\nc', 'a\nb\ny').text, 'x\nb\ny');
    const json = E.mergeJson('{"ProgramFiles":["a.pro"]}', '{"ProgramFiles":["a.pro","user.pro"],"custom":42}', '{"ProgramFiles":["a.pro","new.pro"]}');
    assert.equal(json.conflict, false);
    assert.deepEqual(JSON.parse(json.text).ProgramFiles, ['a.pro', 'user.pro', 'new.pro']);
    assert.equal(JSON.parse(json.text).custom, 42);
});

test('points reset is explicit and missing Includes or duplicate addresses block export validation', () => {
    const f = fixture(), s = f.open();
    s.files.get('Data/P.pts').text = s.files.get('Data/P.pts').text.replace('P[111] = 0.000000', 'P[111] = 999.000000');
    const result = f.E.plan(s, freshConfig(s), f.G, {}, [1]);
    assert.match(result.files.get('Data/P.pts').text, /P\[111\] = 0.000000/);
    result.files.set('bad.pro', { text: 'Include "missing.pro";' });
    assert.ok(f.E.validate(result.files).some(p => p.includes('missing.pro')));
    const labels = JSON.parse(result.files.get('Data/Labels.jsn').text);
    labels.InputBitLabels.LabelsArray.push({ ...labels.InputBitLabels.LabelsArray[0], sLabel: 'user_duplicate' });
    result.files.set('Data/Labels.jsn', { text: JSON.stringify(labels) });
    assert.ok(f.E.validate(result.files).some(p => p.includes('Duplicate label address')));
});

test('ZIP and folder input reject unsafe and case-colliding paths', async () => {
    const { E } = api();
    assert.throws(() => E.safePath('../outside.pro'));
    await assert.rejects(() => E.readEntries([{ name: 'main.pro', arrayBuffer: async () => new ArrayBuffer(0) }, { name: 'MAIN.pro', arrayBuffer: async () => new ArrayBuffer(0) }]), /Duplicate/);
    await assert.rejects(() => E.readEntries([{ name: 'bad.zip', arrayBuffer: async () => new ArrayBuffer(0) }], { loadAsync: async () => ({ files: { safe: { dir: false, name: 'safe.pro', unsafeOriginalName: '../safe.pro' } } }) }), /Invalid/);
});

test('all project options can change while custom JSON fields and process IO remain intact', () => {
    const f = fixture(true), s = f.open();
    const current = JSON.parse(s.files.get('Example.prj').text); current.CustomControllerSetting = { retained: true };
    s.files.get('Example.prj').text = JSON.stringify(current);
    for (const flag of ['EnableTeachingMode', 'EnableWaitPos', 'EnableProcessBusy', 'EnableToolControl', 'EnableTcpSpeed', 'EnableTorque', 'EnableMultiRecipe']) {
        const next = freshConfig(s); next.options[flag] = !next.options[flag];
        const result = f.E.plan(s, next, f.G);
        assert.equal(result.changes.some(c => c.conflict), false, flag);
        assert.deepEqual(JSON.parse(result.files.get('Example.prj').text).CustomControllerSetting, { retained: true });
        assert.deepEqual([...f.E.validate(result.files)], [], flag);
    }
});

test('custom label names and renamed program comments survive additional processes', () => {
    const f = fixture(true), labels = JSON.parse(f.files.get('Data/Labels.jsn').text);
    const item = labels.InputBitLabels.LabelsArray.find(l => l.sLabel === 'xP1_work_pos_start');
    item.sLabel = 'xCustomerPick';
    f.files.get('Data/Labels.jsn').text = JSON.stringify(labels);
    f.files.get('main.pro').text = f.files.get('main.pro').text.replaceAll('xP1_work_pos_start', 'xCustomerPick') + '\n# sP01_Tray_Get.P1_pos() note\nPrint "sP01_Tray_Get.pro";\n';
    const s = f.open(), next = freshConfig(s); next.steps[0]._customName = 'Pickup';
    next.steps.push({ ...next.steps[0], id: 'new', No: 4, _customName: null, WorkType: 'Tray' });
    const result = f.E.plan(s, next, f.G);
    assert.equal(result.changes.some(c => c.conflict), false, JSON.stringify(result.changes.filter(c => c.conflict).map(c => ({path:c.path, details:c.details}))));
    assert.match(result.files.get('main.pro').text, /If xCustomerPick/);
    assert.match(result.files.get('main.pro').text, /# sP01_Tray_Get.P1_pos\(\) note/);
    assert.match(result.files.get('main.pro').text, /Print "sP01_Tray_Get.pro"/);
    const merged = JSON.parse(result.files.get('Data/Labels.jsn').text).InputBitLabels.LabelsArray.find(l => l.sLabel === 'xCustomerPick');
    assert.equal(merged.nIndex, 544);
});

test('a custom PLC address is retained when the process list changes', () => {
    const f = fixture(true), labels = JSON.parse(f.files.get('Data/Labels.jsn').text);
    const item = labels.InputBitLabels.LabelsArray.find(l => l.sLabel === 'xP1_work_pos_start');
    item.nIndex = 702; item.sOriginalName = 'IN[702]'; f.files.get('Data/Labels.jsn').text = JSON.stringify(labels);
    const s = f.open(), next = freshConfig(s); next.steps = next.steps.filter(s => s.No !== 2);
    const result = f.E.plan(s, next, f.G);
    assert.equal(result.changes.some(c => c.conflict), false);
    assert.equal(JSON.parse(result.files.get('Data/Labels.jsn').text).InputBitLabels.LabelsArray.find(l => l.sLabel === 'xP1_work_pos_start').nIndex, 702);
});

test('unrecognized generator programs remain available for manual identification', () => {
    const f = fixture();
    for (const [path, file] of f.files) if (/\.pro$/.test(path)) file.text = file.text.replace(/P\d+_pos/g, 'Custom_entry');
    const session = f.open();
    assert.equal(session.original.steps.length, 0);
    assert.equal(session.issues.filter(i => i.kind === 'unmapped').length, 3);
    assert.ok(session.files.has('sP01_Tray_Get.pro'));
});

test('no-op preserves user JSON formatting and missing module calls are reported', () => {
    const f = fixture(true);
    f.files.get('Example.prj').text = JSON.stringify(JSON.parse(f.files.get('Example.prj').text));
    const session = f.open(), result = f.E.plan(session, freshConfig(session), f.G);
    assert.equal(result.changes.length, 0);
    assert.equal(result.files.get('Example.prj'), session.files.get('Example.prj'));
    result.files.set('broken.pro', { text: 'Func Run()\n sP99_Unknown.P99_pos();\nEndFunc;' });
    assert.ok(f.E.validate(result.files).some(p => p.includes('missing module sP99_Unknown')));
});

test('robot model changes update points headers while preserving taught coordinates and stored inactive options', () => {
    const f = fixture(true);
    f.files.get('Data/P.pts').text = f.files.get('Data/P.pts').text.replace('P[111] = 0.000000', 'P[111] = 456.000000');
    const s = f.open(), next = freshConfig(s);
    next.options.RobotName = 'IR-S7-60Z20S3-C2LH-INT_01741021';
    const result = f.E.plan(s, next, f.G);
    assert.equal(result.changes.some(c => c.conflict), false);
    assert.match(result.files.get('Data/P.pts').text, /IR-S7-60Z20S3-C2LH-INT_01741021/);
    assert.match(result.files.get('Data/P.pts').text, /P\[111\] = 456.000000/);
    assert.deepEqual([...f.E.validate(result.files)], []);
    const saved = freshConfig(s); saved.options.EnableMultiRecipe = false; saved.options.RecipeCount = 7;
    saved.options.EnableToolControl = false; saved.options.ToolControlType = 'DIO';
    const generated = f.E.generate(saved, f.G), files = new Map(Object.entries(generated).map(([p, text]) => [p, { text }]));
    files.set(f.E.META, { text: f.E.metadata(saved, generated) });
    const again = f.E.open(files, 'Example.prj', f.defaults, f.G);
    assert.equal(again.original.options.RecipeCount, 7);
    assert.equal(again.original.options.ToolControlType, 'DIO');
});
