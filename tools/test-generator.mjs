import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectFile = path.join(repoRoot, 'test-fixtures', 'generator-harness', 'GeneratorHarness.csproj');
const fixtureFile = path.join(repoRoot, 'tests', 'fixtures', 'generator-output-sha256.json');
const defaultGeneratorRoot = path.resolve(repoRoot, '..', 'InoRobot_Proejct_Gen_for_SDC', 'InoRobot_Proejct_Gen_for_SDC');
const generatorRoot = path.resolve(process.env.INOROBOT_GENERATOR_SOURCE || defaultGeneratorRoot);
const writeBaseline = process.argv.includes('--write-baseline');
const temporaryRoot = fs.mkdtempSync(path.join(repoRoot, 'tmp', 'generator-regression-'));
const outputRoot = path.join(temporaryRoot, 'generated');
const normalizedGeneratorRoot = generatorRoot.replaceAll('\\', '/');

if (!fs.existsSync(path.join(generatorRoot, 'InoRobot_Project_Gen_for_SDC.csproj')) ||
    !fs.existsSync(path.join(generatorRoot, 'Templates', 'SDC'))) {
  console.error(`생성기 원본 또는 템플릿을 찾을 수 없습니다: ${generatorRoot}`);
  console.error('생성기 검사는 NOT VERIFIED입니다. INOROBOT_GENERATOR_SOURCE에 원본 폴더를 지정할 수 있습니다.');
  process.exit(1);
}

fs.mkdirSync(outputRoot, { recursive: true });
const args = [
  'run',
  '--project', projectFile,
  '--property:GeneratorSourceRoot=' + normalizedGeneratorRoot,
  '--',
  outputRoot
];
const run = spawnSync('dotnet', args, { cwd: repoRoot, encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) {
  console.error(`생성기 하네스 실행 실패 (${run.status ?? '중단'}). 생성 결과를 보존했습니다: ${outputRoot}`);
  process.exit(run.status || 1);
}

function normalizeGeneratedText(value) {
  // Program generation stamps the current clock into its info program. Normalize only those clock fields.
  return value
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n')
    .replace(/(\bTime\s*=\s*")[^"]*(")/g, '$1<TIMESTAMP>$2')
    .replace(/(\b(?:iYear|byMonth|byDay|byHour|byMinute)\s*=\s*)\d+(\s*;)/g, '$1<TIME_PART>$2')
    .replace(/(#Date\s*:\s*)\d{4}-\d{2}-\d{2}/g, '$1<DATE>')
    .replace(/(#Time\s*:\s*)\d{2}:\d{2}:\d{2}/g, '$1<TIME>');
}

function collectHashes(directory) {
  const result = {};
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }

      const relativePath = path.relative(directory, fullPath).replaceAll('\\', '/');
      const contents = normalizeGeneratedText(fs.readFileSync(fullPath, 'utf8'));
      result[relativePath] = crypto.createHash('sha256').update(contents, 'utf8').digest('hex');
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

const actual = collectHashes(outputRoot);
if (writeBaseline) {
  fs.writeFileSync(fixtureFile, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
  console.log(`대표 생성 결과 기준값을 기록했습니다: ${path.relative(repoRoot, fixtureFile)}`);
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  process.exit(0);
}

if (!fs.existsSync(fixtureFile)) {
  console.error(`생성기 기준 파일이 없습니다: ${fixtureFile}`);
  console.error(`현재 생성 결과는 다음 경로에 보존했습니다: ${outputRoot}`);
  process.exit(1);
}

const expected = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
const relativePaths = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
const changed = relativePaths.filter(file => expected[file] !== actual[file]);

if (changed.length) {
  console.error(`생성 결과가 기준과 ${changed.length}개 파일에서 다릅니다:`);
  for (const file of changed) {
    console.error(`- ${file}: expected=${expected[file] || 'MISSING'} actual=${actual[file] || 'MISSING'}`);
  }
  console.error(`실제 생성 결과를 보존했습니다: ${outputRoot}`);
  process.exit(1);
}

const resolvedRoot = fs.realpathSync(temporaryRoot);
const allowedRoot = fs.realpathSync(path.join(repoRoot, 'tmp')) + path.sep;
if (!resolvedRoot.startsWith(allowedRoot)) {
  console.error(`임시 결과 경로가 허용 범위를 벗어나 정리하지 않았습니다: ${resolvedRoot}`);
  process.exit(1);
}
fs.rmSync(resolvedRoot, { recursive: true, force: true });
console.log(`생성기 회귀 검사 통과: ${relativePaths.length}개 출력 파일`);
