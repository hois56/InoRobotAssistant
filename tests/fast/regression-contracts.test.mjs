import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures');

function evaluateBrowserData(relativePath, expression, globals = {}) {
  const sourcePath = path.join(repoRoot, relativePath);
  const sandbox = vm.createContext({
    document: { addEventListener() {} },
    window: {},
    ...globals
  });
  const source = `${fs.readFileSync(sourcePath, 'utf8')}\n;globalThis.__testValue = ${expression};`;
  new vm.Script(source, { filename: relativePath }).runInContext(sandbox);
  return JSON.parse(JSON.stringify(sandbox.__testValue));
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

test('모델별 케이블 구매 코드 연결이 승인된 기준과 일치한다', () => {
  const products = evaluateBrowserData('1_RobotModelSelect/data.js', 'productsData');
  const actual = products.map(product => ({
    modelId: product.id,
    cables: (product.cables || []).map(({ cable, code }) => ({ cable, code }))
  }));

  assert.deepEqual(actual, readFixture('robot-purchase-codes.json'));

  const ids = products.map(product => product.id);
  assert.equal(new Set(ids).size, ids.length, '중복 모델 ID가 있습니다.');
});

test('R15H와 R20H 기본 케이블 코드를 문자 그대로 보존한다', () => {
  const products = evaluateBrowserData('1_RobotModelSelect/data.js', 'productsData');
  const defaultCodes = Object.fromEntries(products.map(product => [
    product.id,
    product.cables?.find(cable => cable.cable === '5m (Default)')?.code ?? null
  ]));

  assert.equal(defaultCodes['IR-R15H-145S-K-INT'], '01741446');
  assert.equal(defaultCodes['IR-R20H-120S-K-INT'], '1741447');
});

test('CAD 매니페스트의 모델과 파일이 실제로 존재한다', () => {
  const products = evaluateBrowserData('1_RobotModelSelect/data.js', 'productsData');
  const manifest = evaluateBrowserData('1_RobotModelSelect/cad-manifest.js', 'window.InoRobotCadManifest');
  const productIds = new Set(products.map(product => product.id));

  for (const [modelId, entry] of Object.entries(manifest)) {
    assert.ok(productIds.has(modelId), `매니페스트에 없는 모델: ${modelId}`);
    assert.equal(typeof entry.threeD, 'string', `${modelId}의 3D CAD 경로가 없습니다.`);
    assert.ok(!entry.threeD.split(/[\\/]/).includes('..'), `${modelId}의 경로가 저장소 밖을 가리킵니다.`);
    assert.ok(
      fs.existsSync(path.join(repoRoot, '1_RobotModelSelect', entry.threeD)),
      `${modelId}의 CAD 파일을 찾을 수 없습니다: ${entry.threeD}`
    );
  }
});

test('소프트웨어 버전별 다운로드 파일 연결이 승인된 기준과 일치한다', () => {
  const groups = evaluateBrowserData(
    '5_Software/script.js',
    'softwareGroups',
    { document: { addEventListener() {}, querySelector() {} } }
  );
  const actual = groups.flatMap(group => group.versions.map(version => ({
    productId: group.id,
    version: version.tagName,
    isLocked: Boolean(version.isLocked),
    downloads: version.downloads.map(({ label, type, path: downloadPath, assetId }) => ({
      label,
      type,
      path: downloadPath || null,
      assetId: assetId || null
    }))
  })));

  assert.deepEqual(actual, readFixture('software-downloads.json'));

  for (const version of actual) {
    const types = version.downloads.map(download => download.type);
    assert.equal(new Set(types).size, types.length, `${version.productId} ${version.version}: 중복 다운로드 종류`);

    for (const download of version.downloads) {
      assert.ok(download.path, `${version.productId} ${version.version}: 파일 경로가 없습니다.`);
      assert.ok(!download.path.split(/[\\/]/).includes('..'), `${download.path}: 저장소 밖을 가리킵니다.`);
      assert.ok(
        fs.existsSync(path.join(repoRoot, '5_Software', download.path)),
        `다운로드 파일을 찾을 수 없습니다: ${download.path}`
      );
      if (version.isLocked) assert.ok(download.assetId, `${version.productId}: 잠금 다운로드 ID가 없습니다.`);
    }
  }
});

test('주요 화면의 로컬 스크립트와 스타일 경로가 실제 파일을 가리킨다', () => {
  const pages = [
    '0_Home/ko/index.html',
    '1_RobotModelSelect/index.html',
    '2_3DSimulation/index.html',
    '3_ToolSelector/index.html',
    '4_ProjectGenerator/index.html',
    '5_Software/index.html',
    '7_DebuggingTool/index.html'
  ];

  for (const page of pages) {
    const html = fs.readFileSync(path.join(repoRoot, page), 'utf8');
    const references = [...html.matchAll(/<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref)\s*=\s*["']([^"']+)["']/gi)];

    for (const match of references) {
      const reference = match[1].split(/[?#]/, 1)[0];
      if (!reference || /^(?:https?:|data:|javascript:|\/\/)/i.test(reference)) continue;

      const target = reference.startsWith('/')
        ? path.join(repoRoot, reference.slice(1))
        : path.resolve(repoRoot, path.dirname(page), reference);
      assert.ok(fs.existsSync(target), `${page}에서 로컬 파일을 찾을 수 없습니다: ${reference}`);
    }
  }
});

test('Communication Tester 다운로드는 실행 파일을 담은 ZIP 아카이브를 가리킨다', () => {
  const html = fs.readFileSync(path.join(repoRoot, '7_DebuggingTool/index.html'), 'utf8');
  const archivePath = path.join(repoRoot, '7_DebuggingTool/CommunicationTester/InoRobot_Comm_Test_V3.2.zip');

  assert.match(html, /href="CommunicationTester\/InoRobot_Comm_Test_V3\.2\.zip"/);
  const archive = fs.readFileSync(archivePath);
  assert.equal(archive.readUInt32LE(0), 0x04034b50, 'Communication Tester 다운로드 파일이 ZIP 아카이브가 아닙니다.');
});
