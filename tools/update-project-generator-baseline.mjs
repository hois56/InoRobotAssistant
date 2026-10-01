import fs from 'node:fs';
import path from 'node:path';
import { generateProjectSamples, repoRoot } from '../tests/support/project-generator-samples.mjs';

const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'project-generator');
const samples = generateProjectSamples();
fs.mkdirSync(fixtureRoot, { recursive: true });

for (const [file, contents] of Object.entries(samples)) {
  fs.writeFileSync(path.join(fixtureRoot, `${file}.snapshot`), contents, 'utf8');
}

console.log(`프로젝트 생성기 기준 결과 ${Object.keys(samples).length}개를 기록했습니다.`);
