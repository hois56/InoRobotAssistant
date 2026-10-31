import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTests, planChecks, isIgnoredPath } from '../../tools/test-selection.mjs';

const catalog = collectTests();
const plan = (files, verify = false) => planChecks(files, catalog, { verify });

test('model and software edits retain purchase/download contracts without simulation or C# checks', () => {
  for (const file of ['1_RobotModelSelect/data.js', '5_Software/script.js', 'downloads/release-assets.json']) {
    const result = plan([file], true);
    assert.ok(result.fast.includes('tests/fast/regression-contracts.test.mjs'));
    assert.deepEqual(result.ui, ['tests/ui/core-flows.spec.mjs']);
    assert.equal(result.bridge, false);
    assert.equal(result.generator, false);
    assert.ok(!result.fast.some(file => file.includes('simulation-')));
  }
});

test('web generator edits always compare generated programs and data', () => {
  const result = plan(['4_ProjectGenerator/generator.js'], true);
  assert.ok(result.fast.includes('tests/fast/project-generator-output.test.mjs'));
  assert.ok(result.fast.includes('tests/fast/project-generator-tray.test.mjs'));
  assert.ok(result.ui.includes('tests/ui/project-generator-tray.spec.mjs'));
  assert.equal(result.generator, false);
});

test('saving simulation changes runs light tests; completion adds simulation UI only', () => {
  const files = ['2_3DSimulation/main.js'];
  const light = plan(files);
  const complete = plan(files, true);
  assert.ok(light.fast.includes('tests/fast/simulation-wobj-jog.test.mjs'));
  assert.deepEqual(light.ui, []);
  assert.ok(complete.ui.includes('tests/ui/simulation-wheel-zoom.spec.mjs'));
  assert.ok(!complete.ui.includes('tests/ui/servo-localization.spec.mjs'));
  assert.equal(complete.bridge, false);
  assert.equal(complete.generator, false);
});

test('native bridge execution is limited to bridge changes and completion checks', () => {
  const files = ['2_3DSimulation/VirtualControllerBridge/NativeRobotClient.cs'];
  assert.equal(plan(files).bridge, false);
  assert.equal(plan(files, true).bridge, true);
  assert.equal(plan(['tests/dotnet/BridgeOutputScheduling/Program.cs'], true).bridge, true);
});

test('external generator checks are explicit and do not run on unrelated web edits', () => {
  assert.equal(plan(['tools/test-generator.mjs'], true).generator, true);
  assert.equal(plan(['tests/fixtures/generator-output-sha256.json'], true).generator, true);
  assert.equal(planChecks([], catalog, { verify: true, generator: true }).generator, true);
});

test('documentation and local test artifacts do not schedule application checks', () => {
  const result = plan(['AGENTS.md', 'tests/fixtures/README.md', '.codex/old-check.mjs', 'test-results-recheck/report.js'], true);
  assert.deepEqual(result.fast, []);
  assert.deepEqual(result.ui, []);
  assert.deepEqual(result.syntax, []);
  for (const file of ['.serena/memories/test.md', 'a/bin/Debug/a.cs', 'test-results-foo/report.js']) {
    assert.ok(isIgnoredPath(file));
  }
});

test('history updates keep the multilingual history consistency check', () => {
  const result = plan(['0_Home/UPDATE_HISTORY.md'], true);
  assert.ok(result.fast.includes('tests/fast/version-history-sync.test.mjs'));
  assert.deepEqual(result.ui, ['tests/ui/home-version-history.spec.mjs']);
});

test('shared language runtime and unclassified application files expand coverage safely', () => {
  for (const file of ['Language/runtime/language.js', 'new-feature/runtime.js']) {
    const result = plan([file], true);
    assert.equal(result.fast.length, catalog.fast.length);
    assert.equal(result.ui.length, catalog.ui.length);
    assert.equal(result.bridge, false);
  }
});

test('test tooling changes run their own checks without starting all browsers', () => {
  const result = plan(['tools/watch-tests.mjs', 'tools/test-changed.mjs'], true);
  assert.ok(result.fast.includes('tests/tooling/test-selection.test.mjs'));
  assert.deepEqual(result.ui, []);
  assert.equal(result.bridge, false);
  assert.equal(result.generator, false);
});

test('individual page translations stay scoped while the shared runtime expands coverage', () => {
  const result = plan(['Language/ko/project-generator.json'], true);
  assert.ok(result.fast.includes('tests/fast/project-generator-output.test.mjs'));
  assert.ok(result.ui.includes('tests/ui/project-generator-tray.spec.mjs'));
  assert.ok(!result.ui.includes('tests/ui/simulation-wheel-zoom.spec.mjs'));
});

test('explicit test changes, deleted source paths and Windows paths are retained and deduplicated', () => {
  const direct = 'tests/ui/simulation-wheel-zoom.spec.mjs';
  assert.deepEqual(plan([direct, direct], true).ui, [direct]);
  assert.ok(plan(['2_3DSimulation/deleted-core.mjs']).fast.length > 0);
  const result = plan(['4_ProjectGenerator\\generator.js', '4_ProjectGenerator/generator.js']);
  assert.deepEqual(result.syntax, ['4_ProjectGenerator/generator.js']);
  assert.equal(result.fast.length, new Set(result.fast).size);
});
