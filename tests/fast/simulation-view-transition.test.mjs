import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../2_3DSimulation/motion-program-core.mjs';
import { normalizeIoFunctionMapping } from '../../2_3DSimulation/io-function-mapping-core.mjs';

test('V1~V10은 프로그램과 IO 매핑에서 복원하고 범위를 넘는 뷰는 제한한다', () => {
  const steps = Array.from({ length: 10 }, (_, slot) => ({ id: `view-${slot}`, motion: 'VIEW', viewSlot: slot,
    joints: [0], tcp: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] } }));
  assert.deepEqual(core.cloneMotionProgram({ steps }).steps.map(step => step.viewSlot), steps.map(step => step.viewSlot));
  for (let slot = 0; slot < 10; slot++) assert.equal(normalizeIoFunctionMapping({ action: 'VIEW', viewSlot: slot }).viewSlot, slot);
  assert.equal(normalizeIoFunctionMapping({ action: 'VIEW', viewSlot: 99 }).viewSlot, 9);
  const project = { schemaVersion: 1, robots: [{ instanceId: 'view-robot', modelFolder: 'test', displayName: 'test',
    robotType: 'six-axis', jointCount: 1, baseTransform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    homeAngles: [0], currentAngles: [0], steps }] };
  assert.deepEqual(core.normalizeMotionProject(project).robots[0].steps.map(step => step.viewSlot), steps.map(step => step.viewSlot));
  project.robots[0].steps[9].viewSlot = 10;
  assert.throws(() => core.normalizeMotionProject(project), /view slot must be 0 to 9/);
});

test('이전 View 명령의 시간 데이터는 불러오기·복사 때 보존한다', () => {
  const program = core.createEmptyMotionProgram();
  program.steps = [0, 0.4, 12].map((seconds, index) => ({
    id: `view-${index}`, motion: 'VIEW', viewSlot: index, viewTransitionSeconds: seconds,
    joints: [0], tcp: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  }));
  assert.deepEqual(core.cloneMotionProgram(program).steps.map(step => step.viewTransitionSeconds), [0, 0.4, 12]);
});

test('뷰 전환 시간은 즉시 전환 0초를 허용하고 잘못된 입력을 정규화한다', () => {
  const normalize = core.normalizeViewTransitionSeconds;
  assert.equal(typeof normalize, 'function');
  assert.equal(normalize(0), 0);
  assert.equal(normalize('2.5'), 2.5);
  assert.equal(normalize(-1), 0);
  assert.equal(normalize(7200), 3600);
  for (const value of [undefined, null, '', 'invalid', Infinity]) assert.equal(normalize(value), 1);
  const legacy = core.cloneMotionProgram({ steps: [{ id: 'legacy', motion: 'VIEW', viewSlot: 0,
    joints: [0], tcp: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] } }] });
  assert.equal(legacy.steps[0].viewTransitionSeconds, undefined);
});
