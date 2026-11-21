import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bridge position frames do not burst-read all outputs', () => {
  const source = readFileSync('2_3DSimulation/VirtualControllerBridge/src/worker.rs', 'utf8');
  const frame = source.slice(source.indexOf('fn tick('), source.indexOf('fn failed_feedback('));
  assert.equal([...frame.matchAll(/\.sdk\.output\(/g)].length, 1);
  assert.match(frame, /if started >= self\.next_output/);
  assert.match(frame, /self\.output_index = \(index \+ 1\) % 17/);
});
