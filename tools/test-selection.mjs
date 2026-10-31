import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageRoots = {
  '0_Home': 'home', '1_RobotModelSelect': 'model', '2_3DSimulation': 'simulation',
  '3_ToolSelector': 'tool', '4_ProjectGenerator': 'project', '5_Software': 'software',
  '6_Document': 'document', '7_DebuggingTool': 'debugging', Servo: 'servo'
};
const ignoredDirectories = new Set([
  '.git', '.codex', '.serena', '.codex-remote-attachments', '.dotnet_home', '.npm-cache',
  '.wrangler', '.cache', 'node_modules', 'vendor', 'bin', 'obj', 'tmp', 'backups', 'playwright-report'
]);
const normalize = file => String(file).replaceAll('\\', '/').replace(/^\.\//, '');

export function isIgnoredPath(file) {
  if (/\.log$/i.test(file)) return true;
  return normalize(file).split('/').some(part => ignoredDirectories.has(part) ||
    /^test-results(?:-|$)/.test(part) || part.startsWith('.tmp'));
}

export function collectTests(root = repoRoot) {
  const catalog = { fast: [], ui: [], sources: {} };
  for (const [directory, kind, suffix] of [
    ['tests/fast', 'fast', '.test.mjs'], ['tests/tooling', 'fast', '.test.mjs'],
    ['tests/ui', 'ui', '.spec.mjs']
  ]) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(suffix)) continue;
      const file = `${directory}/${entry.name}`;
      catalog[kind].push(file);
      catalog.sources[file] = fs.readFileSync(path.join(root, file), 'utf8');
    }
  }
  catalog.fast.sort();
  catalog.ui.sort();
  return catalog;
}

function testAreas(file, source) {
  if (file.startsWith('tests/tooling/')) return ['tooling'];
  if (file.includes('regression-contracts.')) return Object.values(pageRoots);
  if (file.includes('version-history')) return ['home'];
  if (file.includes('bridge-output-scheduling.')) return ['bridge'];
  if (file.includes('project-generator-')) return ['project'];
  if (file.includes('servo-')) return ['servo'];
  if (source.includes('VirtualControllerBridge')) return ['simulation', 'bridge'];
  if (source.includes('2_3DSimulation') || file.includes('simulation-')) return ['simulation'];
  const areas = Object.entries(pageRoots).filter(([root]) => source.includes(root)).map(([, area]) => area);
  return areas.length ? areas : ['all'];
}

function fileAreas(file) {
  if (/^2_3DSimulation\/VirtualControllerBridge\//.test(file) || /^tests\/dotnet\//.test(file)) return ['bridge'];
  if (/^(test-fixtures\/generator-harness\/|tests\/fixtures\/generator-output-sha256\.json$|tools\/test-generator\.mjs$)/.test(file)) return ['generator'];
  if (/\.(md|txt)$/i.test(file) && !/(UPDATE_HISTORY|업데이트_기록)\.md$/i.test(file)) return [];
  if (file.startsWith('tests/fixtures/project-generator/') || file === 'tests/support/project-generator-samples.mjs') return ['project'];
  if (file === 'tests/fixtures/robot-purchase-codes.json') return ['model'];
  if (file.startsWith('downloads/') || file === 'tests/fixtures/software-downloads.json') return ['software'];
  if (file.startsWith('tests/fixtures/simulation-')) return ['simulation'];
  if (file.startsWith('tests/support/') || file.startsWith('tests/ui/helpers/')) return ['all'];
  if (file.startsWith('tests/tooling/')) return ['tooling'];
  if (file.startsWith('.githooks/')) return ['tooling'];
  if (file === 'tools/serve-local.cjs') return ['servo'];
  if (file === 'tools/static-server.mjs' || file === 'playwright.config.mjs') return ['all'];
  if (/^tools\/(build-localized-site|build-version-history|version-history|sync-.*history-data)\.cjs$/.test(file)) return ['all'];
  if (file.startsWith('tools/')) return ['tooling'];
  if (file.startsWith('Language/')) {
    const localizedPage = {
      'robot-model-select.json': 'model', 'robot-3d-viewer.json': 'simulation',
      'tool-selector.json': 'tool', 'project-generator.json': 'project',
      'software.json': 'software', 'document.json': 'document',
      'debugging-tool.json': 'debugging', 'servo.json': 'servo'
    }[file.split('/').at(-1)];
    return [localizedPage || 'all'];
  }
  if (/^(package(-lock)?\.json|\.github\/)/.test(file)) return ['all'];
  return [pageRoots[file.split('/')[0]] || 'all'];
}

// Unknown application/shared changes broaden coverage instead of silently skipping it.
export function planChecks(changedFiles, catalog, { verify = false, generator = false } = {}) {
  const files = [...new Set(changedFiles.map(normalize))].filter(file => !isIgnoredPath(file)).sort();
  const areas = new Set();
  const direct = new Set();
  for (const file of files) {
    if (catalog.fast.includes(file) || catalog.ui.includes(file)) {
      direct.add(file);
      if (file.includes('bridge-output-scheduling.')) areas.add('bridge');
    } else {
      for (const area of fileAreas(file)) areas.add(area);
    }
  }
  const select = kind => catalog[kind].filter(file => {
    if (direct.has(file) || areas.has('all')) return true;
    if (!areas.size) return false;
    if (kind === 'ui' && areas.has('bridge') && /controller|tcp-profile/.test(file)) return true;
    return testAreas(file, catalog.sources[file]).some(area => area === 'all' || areas.has(area));
  });
  return {
    fast: select('fast'),
    syntax: files.filter(file => /\.(js|mjs|cjs)$/.test(file)),
    ui: verify ? select('ui') : [],
    bridge: verify && areas.has('bridge'),
    generator: verify && (generator || areas.has('generator'))
  };
}
