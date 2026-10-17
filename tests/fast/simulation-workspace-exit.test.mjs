import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
function setup() {
  const storage = new Map();
  const context = vm.createContext({
    localStorage: { getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key) },
    WORKSPACE_EXIT_SNAPSHOT_PREFIX: 'exit:', console: { warn() {} }
  });
  vm.runInContext(source.slice(source.indexOf('function readWorkspaceExitSnapshot('), source.indexOf('async function findWorkspaceRecoveryCandidates(')), context);
  const record = { id: 'robot-workspace', revision: 4, state: { schemaVersion: 1, commands: [] } };
  const fallback = { baseRevision: 4, capturedAt: 100, state: { schemaVersion: 1, commands: ['MOVJ', 'MOVL'] } };
  storage.set('exit:robot-workspace', JSON.stringify(fallback));
  return { context, storage, record, fallback };
}

test('종료 직전 명령은 미완료 저장보다 우선하고 후속 세션과 보관된 작업은 덮어쓰지 않는다', () => {
  const { context, record } = setup();
  for (const revision of [4, 5]) {
    assert.deepEqual(Array.from(context.readWorkspaceExitSnapshot({ ...record, revision }).state.commands), ['MOVJ', 'MOVL']);
  }
  for (const update of [{ revision: 6 }, { revision: 3 }, { archived: true }]) {
    const newer = { ...record, ...update };
    assert.equal(context.readWorkspaceExitSnapshot(newer), newer);
  }
});

test('이전 저장 완료는 종료 백업을 지우지 않고 최신 저장 완료 후에만 정리한다', () => {
  const { context, storage, record } = setup();
  context.clearCommittedWorkspaceExitSnapshot({ ...record, revision: 5 }, 90);
  assert.equal(storage.size, 1);
  context.clearCommittedWorkspaceExitSnapshot({ ...record, revision: 5 }, 100);
  assert.equal(storage.size, 1);
  context.clearCommittedWorkspaceExitSnapshot({ ...record, revision: 5 }, 110);
  assert.equal(storage.size, 0);
});

test('손상된 종료 백업이 있어도 정상 작업을 불러온다', () => {
  const { context, storage, record } = setup();
  storage.set('exit:robot-workspace', '{invalid');
  assert.equal(context.readWorkspaceExitSnapshot(record), record);
});
