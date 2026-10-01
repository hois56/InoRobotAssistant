import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testFiles = fs.readdirSync(path.join(repoRoot, 'tests', 'fast'))
  .filter(file => file.endsWith('.test.mjs'))
  .sort()
  .map(file => path.join('tests', 'fast', file));
const ignoredDirectories = new Set([
  '.git', '.codex', '.dotnet_home', '.npm-cache', '.wrangler', '.cache',
  'node_modules', 'vendor', 'bin', 'obj', 'tmp', 'backups', 'test-results', 'playwright-report'
]);
const watchedExtensions = new Set([
  '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.xml', '.xaml',
  '.cs', '.csproj', '.pro', '.pts', '.jsn', '.csv', '.dat', '.xlsx',
  '.stp', '.step', '.glb', '.gltf', '.svg', '.png', '.webp', '.snapshot',
  '.md', '.yml', '.yaml', '.toml', '.txt', '.ini', '.cfg', '.config', '.resx', '.props', '.targets',
  '.ts', '.tsx', '.jsx', '.scss', '.less', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.pdf', '.h', '.prg'
]);
const browserUiRoots = new Set([
  '0_Home', '1_RobotModelSelect', '2_3DSimulation', '3_ToolSelector',
  '4_ProjectGenerator', '5_Software', '7_DebuggingTool', 'Language'
]);
const defaultGeneratorRoot = path.resolve(repoRoot, '..', 'InoRobot_Proejct_Gen_for_SDC', 'InoRobot_Proejct_Gen_for_SDC');
const generatorRoot = path.resolve(process.env.INOROBOT_GENERATOR_SOURCE || defaultGeneratorRoot);
const pending = new Set();
let activeProcess = null;
let debounceTimer = null;
let stopped = false;

function ignoredPath(filename) {
  if (!filename) return false;
  return String(filename).replaceAll('\\', '/').split('/').some(part => ignoredDirectories.has(part));
}

function isWatchedFile(filename) {
  if (!filename) return true;
  if (ignoredPath(filename)) return false;
  return watchedExtensions.has(path.extname(String(filename)).toLowerCase());
}

function enqueue(kinds = []) {
  if (stopped) return;
  pending.add('fast');
  for (const kind of kinds) pending.add(kind);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runNext, 500);
}

function runNext() {
  if (stopped || activeProcess) return;
  const kind = ['fast', 'ui', 'portable', 'dotnet-generator'].find(candidate => pending.has(candidate)) || null;
  if (!kind) return;
  pending.delete(kind);

  const argsByKind = {
    fast: ['--test', ...testFiles],
    ui: [path.join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js'), 'test'],
    portable: ['run', 'verify:portable'],
    'dotnet-generator': [path.join(repoRoot, 'tools', 'test-generator.mjs')]
  };
  const command = kind === 'portable' ? (process.platform === 'win32' ? 'npm.cmd' : 'npm') : process.execPath;
  const label = {
    fast: '빠른 데이터·출력 검사',
    ui: '브라우저 UI 검사',
    portable: 'C# 빌드 포함 전체 로컬 검사',
    'dotnet-generator': 'C# 생성기 출력 검사'
  }[kind];
  console.log(`\n[watch] ${label}를 실행합니다.`);
  activeProcess = spawn(command, argsByKind[kind], { cwd: repoRoot, stdio: 'inherit', shell: kind === 'portable' && process.platform === 'win32' });
  activeProcess.on('exit', code => {
    console.log(`[watch] ${kind} ${code === 0 ? '통과' : `실패 (${code ?? '중단'})`}`);
    activeProcess = null;
    runNext();
  });
}

const watchers = [];
try {
  watchers.push(fs.watch(repoRoot, { recursive: true }, (_eventType, filename) => {
    if (!isWatchedFile(filename)) return;
    const normalized = String(filename || '').replaceAll('\\', '/');
    const parts = normalized.split('/');
    const extension = path.extname(normalized).toLowerCase();
    const externalGeneratorRelated = normalized.startsWith('test-fixtures/generator-harness/') ||
      normalized === 'tests/fixtures/generator-output-sha256.json' ||
      normalized === 'tools/test-generator.mjs';
    const kinds = [];
    if (externalGeneratorRelated) kinds.push('dotnet-generator');
    if (browserUiRoots.has(parts[0]) && ['.html', '.js', '.mjs', '.css', '.json', '.svg', '.png', '.webp', '.stp', '.step', '.glb', '.gltf'].includes(extension)) {
      kinds.push('ui');
    }
    if (normalized.startsWith('tests/ui/') || normalized === 'tests/fixtures/software-downloads.json' || normalized === 'playwright.config.mjs' || normalized === 'tools/static-server.mjs') {
      kinds.push('ui');
    }
    if (['.cs', '.csproj', '.sln'].includes(extension) && !normalized.startsWith('test-fixtures/generator-harness/')) {
      kinds.push('portable');
    }
    enqueue(kinds);
  }));

  if (fs.existsSync(path.join(generatorRoot, 'InoRobot_Project_Gen_for_SDC.csproj'))) {
    watchers.push(fs.watch(generatorRoot, { recursive: true }, (_eventType, filename) => {
      if (isWatchedFile(filename)) enqueue(['dotnet-generator']);
    }));
    console.log(`외부 C# 생성기 감시 중: ${generatorRoot}`);
  } else {
    console.log('외부 C# 생성기 소스를 찾지 못해 해당 변경 감시는 비활성화했습니다.');
  }
} catch (error) {
  for (const watcher of watchers) watcher.close();
  console.error(`파일 감시를 시작하지 못했습니다: ${error.message}`);
  process.exit(1);
}

console.log(`저장소 변경 감시 중: ${repoRoot}`);
console.log('저장 때마다 빠른 검사를 실행합니다. UI, C# 빌드, 생성기 관련 변경에는 해당 검사를 추가로 실행합니다.');
console.log('중지하려면 Ctrl+C를 누르세요.');
enqueue();

function stop() {
  stopped = true;
  clearTimeout(debounceTimer);
  for (const watcher of watchers) watcher.close();
  if (activeProcess) activeProcess.kill();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
