import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { generateProjectSamples, repoRoot } from '../support/project-generator-samples.mjs';

const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'project-generator');

test('프로젝트 생성기의 대표 로봇 프로그램과 데이터 결과가 기준과 일치한다', () => {
  const actual = generateProjectSamples();
  const expectedFiles = fs.readdirSync(fixtureRoot).filter(file => file.endsWith('.snapshot')).sort();
  const actualFiles = Object.keys(actual).map(file => `${file}.snapshot`).sort();

  assert.deepEqual(actualFiles, expectedFiles, '프로젝트 생성기 출력 파일 구성이 바뀌었습니다.');

  for (const [file, contents] of Object.entries(actual)) {
    const expected = fs.readFileSync(path.join(fixtureRoot, `${file}.snapshot`), 'utf8');
    assert.equal(contents, expected, `${file}의 생성 결과가 기준과 달라졌습니다. 결과를 검토한 뒤 의도된 변경일 때만 기준을 갱신하세요.`);
  }
});
