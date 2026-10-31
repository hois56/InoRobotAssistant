import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isIgnoredPath } from './test-selection.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set([
  '.git', '.codex', '.dotnet_home', '.npm-cache', '.wrangler', '.cache',
  'node_modules', 'vendor', 'bin', 'obj', 'tmp', 'backups'
]);
const sourceExtensions = new Set(['.js', '.mjs', '.cjs']);
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (ignoredDirectories.has(entry.name) || isIgnoredPath(path.relative(repoRoot, fullPath))) continue;
    if (entry.isDirectory()) collect(fullPath);
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
}

if (process.argv.length > 2) {
  for (const filename of new Set(process.argv.slice(2))) {
    const fullPath = path.resolve(repoRoot, filename);
    const relative = path.relative(repoRoot, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`저장소 밖의 경로: ${filename}`);
    if (sourceExtensions.has(path.extname(fullPath)) && fs.existsSync(fullPath) && !isIgnoredPath(relative)) files.push(fullPath);
  }
} else {
  collect(repoRoot);
}
files.sort();

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: fs.readFileSync(file, 'utf8')
  });
  if (result.status !== 0) {
    failures.push({ file, output: `${result.stdout || ''}${result.stderr || ''}`.trim() });
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`\n${path.relative(repoRoot, failure.file)}\n${failure.output}`);
  }
  console.error(`\nJavaScript 구문 오류 ${failures.length}건 / 검사 파일 ${files.length}개`);
  process.exitCode = 1;
} else {
  console.log(`JavaScript 구문 검사 통과: ${files.length}개 파일`);
}
