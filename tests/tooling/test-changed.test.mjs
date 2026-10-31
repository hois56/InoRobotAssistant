import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { repoRoot } from '../../tools/test-selection.mjs';

function cli(...args) {
  return spawnSync(process.execPath, ['tools/test-changed.mjs', ...args], { cwd: repoRoot, encoding: 'utf8' });
}

test('CLI preview selects contracts and one browser suite for software changes', () => {
  const result = cli('--list', '--ui', '--', '5_Software/script.js');
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(plan.fast, ['tests/fast/regression-contracts.test.mjs']);
  assert.deepEqual(plan.ui, ['tests/ui/core-flows.spec.mjs']);
  assert.equal(plan.bridge, false);
  assert.equal(plan.generator, false);
});

test('documentation command completes without running application checks', () => {
  const result = cli('--', 'AGENTS.md');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /빠른 검사 0개, 구문 0개, UI 0개/);
  assert.doesNotMatch(result.stdout, /\[changed\] 관련/);
});

test('external generator preview never requires or executes the external source', () => {
  const result = cli('--list', '--ui', '--generator');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).generator, true);
});

test('CLI rejects unknown options and paths outside the workspace', () => {
  for (const args of [['--unknown'], ['--list', '--', '../outside.js']]) {
    const result = cli(...args);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /\[changed\] 관련/);
  }
});
