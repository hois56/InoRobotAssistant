import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ Date, Assets: { Robots_6_axis: '' } });
vm.runInContext(fs.readFileSync('4_ProjectGenerator/generator.js', 'utf8') + ';globalThis.api = Generator;', context);
const api = context.api;
const options = { RobotName: 'test', EnableTeachingMode: true };
const tray = (No, extra = {}) => ({ No, WorkType: 'Tray', WorkMethod: 'Get', VisionUse: 'No use', ...extra });

test('zero-cell and single-cell Tray processes omit all Tray additions', () => {
  for (const count of [0, 1]) {
    const steps = [tray(1, { TrayXCount: count, TrayYCount: count })];
    assert.doesNotMatch(api.OffsetProgram(steps, options), /Set_tray_offset|xwTray_index/);
    assert.doesNotMatch(api.LabelsJson(steps, options), /xwTray_index/);
    assert.equal(JSON.parse(api.DataWarning(steps, options)).Warings[12], '');
  }
});

test('mixed Tray processes only generate offsets for multi-cell trays', () => {
  const steps = [tray(1, { TrayXCount: 0, TrayYCount: 0 }), tray(2, { TrayXCount: 1, TrayYCount: 1 }), tray(3, { TrayXCount: 1, TrayYCount: 4 })];
  const code = api.OffsetProgram(steps, options);
  assert.equal((code.match(/Set_tray_offset\(\);/g) || []).length, 1);
  const func = api.TrayOffsetFunction(steps);
  assert.doesNotMatch(func, /Case [12]:/);
  assert.match(func, /Case 3:/);
  assert.match(api.LabelsJson(steps, options), /xwTray_index/);
  assert.equal(JSON.parse(api.DataWarning(steps, options)).Warings[12], 'ERR : Tray Count Error!');
});

test('Tray defaults, per-process settings, labels and alarm are generated together', () => {
  const steps = [tray(1), tray(11, { WorkMethod: 'Put', TrayXCount: 4, TrayYCount: 2, TrayPitchX: 0, TrayPitchY: -12.5 })];
  const code = api.OffsetProgram(steps, options);
  assert.equal((code.match(/Set_tray_offset\(\);/g) || []).length, 2);
  assert.match(code, /Int X_count;/);
  assert.match(code, /Int Y_count;/);
  assert.match(code, /Double pitch_X;/);
  assert.match(code, /Double pitch_Y;/);
  assert.doesNotMatch(code, /(?:Int|Double) (?:X_count|Y_count|pitch_X|pitch_Y) =/);
  assert.match(code, /Case 1:[\s\S]*?X_count = 3;[\s\S]*?Y_count = 3;[\s\S]*?pitch_X = -58;[\s\S]*?pitch_Y = -58;/);
  assert.match(code, /Case 11:[\s\S]*?X_count = 4;[\s\S]*?pitch_X = 0;[\s\S]*?pitch_Y = -12.5;/);
  assert.match(code, /If num < 0 Or num >= total_cell\s+Alarm\[12\];\s+Ret;/);
  assert.match(code, /LPR\[B_PR\] = \(pitch_X\*row, pitch_Y\*col,0,0,0,0\);/);
  const labels = JSON.parse(api.LabelsJson(steps, options));
  const entries = Object.values(labels).flatMap(section => section.LabelsArray || []);
  assert.equal(entries.filter(item => item.sLabel === 'xwTray_index' && item.nIndex === 37 && item.sOriginalName === 'INW[37]').length, 1);
  assert.equal(JSON.parse(api.DataWarning(steps, options)).Warings[12], 'ERR : Tray Count Error!');
});

test('Tray defaults remain initialized when no settings switch is generated', () => {
  const code = api.TrayOffsetFunction([tray(1)]);
  assert.doesNotMatch(code, /Switch B_Cur_process/);
  assert.match(code, /Int X_count = 3;/);
  assert.match(code, /Int Y_count = 3;/);
  assert.match(code, /Double pitch_X = -58;/);
  assert.match(code, /Double pitch_Y = -58;/);
});

test('projects without Tray do not receive Tray outputs', () => {
  const steps = [{ No: 1, WorkType: 'Stage', WorkMethod: 'Put' }];
  assert.doesNotMatch(api.OffsetProgram(steps, options), /Set_tray_offset|xwTray_index/);
  assert.doesNotMatch(api.LabelsJson(steps, options), /xwTray_index/);
  assert.equal(JSON.parse(api.DataWarning(steps, options)).Warings[12], '');
});
