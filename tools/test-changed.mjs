import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { collectTests, planChecks, repoRoot, isIgnoredPath } from './test-selection.mjs';

const options = new Set();
const explicitFiles = [];
let positional = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--') { positional = true; continue; }
  if (!positional && arg.startsWith('--')) {
    if (!['--ui', '--staged', '--list', '--generator'].includes(arg)) throw new Error(`알 수 없는 옵션: ${arg}`);
    options.add(arg);
  } else {
    const relative = path.relative(repoRoot, path.resolve(repoRoot, arg)).replaceAll('\\', '/');
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`저장소 밖의 경로: ${arg}`);
    explicitFiles.push(relative);
  }
}

function gitFiles(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\0').filter(Boolean);
}

let files = explicitFiles;
if (!files.length && !options.has('--generator')) {
  const pathspec = ['--', '.', ':(exclude).codex', ':(exclude).serena', ':(exclude).codex-remote-attachments',
    ':(exclude)test-results*', ':(exclude).tmp*'];
  files = gitFiles(['diff', ...(options.has('--staged') ? ['--cached'] : ['HEAD']), '--name-only', '--no-renames', '-z', ...pathspec]);
  if (!options.has('--staged')) files.push(...gitFiles(['ls-files', '--others', '--exclude-standard', '-z', ...pathspec]));
}
files = [...new Set(files)].filter(file => !isIgnoredPath(file));
const plan = planChecks(files, collectTests(), { verify: options.has('--ui'), generator: options.has('--generator') });
plan.syntax = plan.syntax.filter(file => fs.existsSync(path.join(repoRoot, file)));
if (options.has('--list')) {
  console.log(JSON.stringify({ files, ...plan }, null, 2));
  process.exit(0);
}

console.log(`[changed] 파일 ${files.length}개: 빠른 검사 ${plan.fast.length}개, 구문 ${plan.syntax.length}개, UI ${plan.ui.length}개${plan.bridge ? ', C# 브리지' : ''}${plan.generator ? ', 외부 생성기' : ''}`);
function run(label, command, args) {
  const start = performance.now();
  console.log(`\n[changed] ${label}`);
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  console.log(`[changed] ${label}: ${((performance.now() - start) / 1000).toFixed(1)}초`);
  if (result.status !== 0) process.exit(result.status || 1);
}

if (plan.syntax.length) run('변경 파일 구문 검사', process.execPath, ['tools/check-js-syntax.mjs', ...plan.syntax]);
if (plan.fast.length) run('관련 빠른 검사', process.execPath, ['--test', ...plan.fast]);
if (plan.bridge) {
  run('C# 브리지 동작 검사', process.execPath, ['--test', 'tests/dotnet/bridge-output-scheduling.test.mjs']);
  run('C# 브리지 빌드', 'dotnet', ['build', '2_3DSimulation/VirtualControllerBridge/InoRobotVirtualControllerBridge.csproj']);
}
if (plan.generator) run('외부 C# 생성 결과 검사', process.execPath, ['tools/test-generator.mjs']);
if (plan.ui.length) run('관련 브라우저 검사', process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...plan.ui]);
if (!plan.fast.length && !plan.syntax.length && !plan.ui.length && !plan.bridge && !plan.generator) {
  console.log('[changed] 자동 검사 대상이 없습니다. 문서만 바뀐 경우에는 내용을 확인하세요.');
}
