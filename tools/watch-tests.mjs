import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isIgnoredPath, repoRoot } from './test-selection.mjs';

const verify = process.argv.includes('--ui');
const watchedExtensions = new Set([
  '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.xml', '.xaml', '.cs', '.csproj', '.sln',
  '.pro', '.pts', '.jsn', '.csv', '.dat', '.xlsx', '.stp', '.step', '.glb', '.gltf', '.svg',
  '.png', '.webp', '.snapshot', '.md', '.yml', '.yaml', '.toml', '.txt', '.ini', '.cfg',
  '.config', '.resx', '.props', '.targets', '.ts', '.tsx', '.jsx', '.scss', '.less',
  '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.pdf', '.h', '.prg'
]);
const generatorRoot = path.resolve(process.env.INOROBOT_GENERATOR_SOURCE ||
  path.join(repoRoot, '..', 'InoRobot_Proejct_Gen_for_SDC', 'InoRobot_Proejct_Gen_for_SDC'));
const pending = new Set();
const watchers = [];
let pendingGenerator = false;
let activeProcess = null;
let debounceTimer = null;
let stopped = false;

function enqueue(filename, external = false) {
  if (stopped || (filename && isIgnoredPath(filename))) return;
  if (filename && !watchedExtensions.has(path.extname(filename).toLowerCase())) return;
  if (external) pendingGenerator = true;
  else pending.add(filename || '.');
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runNext, 800);
}

function runNext() {
  if (stopped || activeProcess || (!pending.size && !pendingGenerator)) return;
  const files = [...pending];
  pending.clear();
  const args = ['tools/test-changed.mjs', ...(verify ? ['--ui'] : []),
    ...(pendingGenerator ? ['--generator'] : []), '--', ...files];
  pendingGenerator = false;
  activeProcess = spawn(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
  activeProcess.on('error', error => console.error(`[watch] ${error.message}`));
  activeProcess.on('close', code => {
    console.log(`[watch] ${code === 0 ? '통과' : `실패 (${code ?? '중단'})`}`);
    activeProcess = null;
    // Saves made while a check was running are coalesced into one subsequent run.
    if (!stopped && (pending.size || pendingGenerator)) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runNext, 800);
    }
  });
}

try {
  watchers.push(fs.watch(repoRoot, { recursive: true }, (_eventType, filename) => enqueue(filename)));
  if (verify && fs.existsSync(path.join(generatorRoot, 'InoRobot_Project_Gen_for_SDC.csproj'))) {
    watchers.push(fs.watch(generatorRoot, { recursive: true }, (_eventType, filename) => enqueue(filename, true)));
    console.log(`외부 C# 생성기 감시 중: ${generatorRoot}`);
  } else if (verify) {
    console.log('외부 C# 생성기 소스를 찾지 못해 해당 변경 감시는 비활성화했습니다.');
  }
} catch (error) {
  for (const watcher of watchers) watcher.close();
  console.error(`파일 감시를 시작하지 못했습니다: ${error.message}`);
  process.exit(1);
}

console.log(`저장소 변경 감시 중: ${repoRoot}`);
console.log(verify ? '저장한 영역의 화면·C# 검사까지 실행합니다.' : '저장한 영역의 빠른 검사·구문 검사만 실행합니다. 화면·C# 검사도 원하면 --ui를 지정하세요.');
console.log('저장을 기다립니다. 중지하려면 Ctrl+C를 누르세요.');

function stop() {
  stopped = true;
  clearTimeout(debounceTimer);
  for (const watcher of watchers) watcher.close();
  if (activeProcess) activeProcess.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
