import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fixtures = new URL('../../test-fixtures/cad/solidworks/', import.meta.url);
const fixture = name => readFile(new URL(name, fixtures));

function withoutSavedMeshes(data, expectedRecords) {
  // The fixture uses the compressed SolidWorks container. Rename only the
  // embedded display records to exercise the part and assembly fallbacks.
  const encoded = Buffer.from('Contents/DisplayLists', 'ascii').map(value => (value >>> 4) | (value << 4));
  let records = 0;
  for (let at = data.indexOf(encoded, 26); at >= 0; at = data.indexOf(encoded, at + 1)) {
    if (data.readUInt32LE(at - 4) !== encoded.length) continue;
    data[at] = (data[at] + 1) & 255;
    records++;
  }
  expect(records).toBe(expectedRecords);
  return data;
}

async function readModel(page, name) {
  await page.waitForFunction(fileName => {
    const state = window.__solidWorksTest?.state;
    return state && !state.fileImportLoads.size && state.models.some(model => model.userData.modelName === fileName);
  }, name, { timeout: 15_000 });
  return page.evaluate(fileName => {
    const { state, THREE } = window.__solidWorksTest;
    const model = state.models.find(candidate => candidate.userData.modelName === fileName);
    const bounds = new THREE.Box3().setFromObject(model);
    const parts = model.userData.importedParts.map(part => ({
      name: part.userData.modelPartName,
      position: part.getWorldPosition(new THREE.Vector3()).toArray()
    }));
    const colors = new Set();
    model.traverse(child => {
      if (child.isMesh) for (const material of [child.material].flat()) colors.add(material.color.getHexString());
    });
    return { parts, size: bounds.getSize(new THREE.Vector3()).toArray(), colors: [...colors].sort() };
  }, name);
}

test('SolidWorks 파일과 폴더 참조를 가져오고 작업공간에서 조립품을 복원한다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    const body = (await response.text()) + '\nwindow.__solidWorksTest = { state, THREE, saveMotionProjectNow };';
    await route.fulfill({ response, body });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__solidWorksTest?.state.workspaceRecovery.ready);
  const fileInput = page.locator('#input-import-3d');
  const confirm = page.locator('#btn-confirm-import');
  const prompt = page.locator('#solidworks-reference-dialog');
  await expect(page.locator('#btn-import-solidworks-folder')).toHaveCount(0);
  await expect(fileInput).toHaveAttribute('accept', /\.sldprt,\.sldasm/);

  await fileInput.setInputFiles({
    name: 'C00_cube_10mm.SLDPRT', mimeType: 'application/octet-stream',
    buffer: await fixture('C00_cube_10mm.SLDPRT')
  });
  await confirm.click();
  const cube = await readModel(page, 'C00_cube_10mm.SLDPRT');
  expect(cube.parts.map(part => part.name)).toEqual(['C00_cube_10mm']);
  expect(cube.size.map(value => Math.round(value * 100))).toEqual([1000, 1000, 1000]);
  expect(cube.colors).toEqual(['cad1ee']);

  const reconstructedName = 'Reconstructed.SLDPRT';
  await fileInput.setInputFiles({
    name: reconstructedName, mimeType: 'application/octet-stream',
    buffer: withoutSavedMeshes(await fixture('C00_cube_10mm.SLDPRT'), 6)
  });
  await confirm.click();
  const reconstructed = await readModel(page, reconstructedName);
  expect(reconstructed.parts).toHaveLength(1);
  expect(reconstructed.size.map(value => Math.round(value * 100))).toEqual([1000, 1000, 1000]);
  await expect(prompt).not.toBeVisible();

  const assemblyName = 'Pickering120.SLDASM';
  const embedded = await fixture(assemblyName);
  await fileInput.setInputFiles({ name: 'Embedded.SLDASM', mimeType: 'application/octet-stream', buffer: embedded });
  await confirm.click();
  expect((await readModel(page, 'Embedded.SLDASM')).parts).toHaveLength(5);
  await expect(prompt).not.toBeVisible();

  const assembly = withoutSavedMeshes(Buffer.from(embedded), 2);
  const payload = { name: assemblyName, mimeType: 'application/octet-stream', buffer: assembly };
  async function openMissingAssembly() {
    await fileInput.setInputFiles(payload);
    await confirm.click();
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Body.SLDPRT');
  }
  await openMissingAssembly();
  await page.keyboard.press('Escape');
  await expect(prompt).not.toBeVisible();
  await expect(page.locator('#loading-overlay')).not.toBeVisible();

  const folder = testInfo.outputPath('SolidWorks pack');
  const partFolder = path.join(folder, '참조 부품');
  const incomplete = testInfo.outputPath('Incomplete pack');
  await Promise.all([mkdir(partFolder, { recursive: true }), mkdir(incomplete, { recursive: true })]);
  await Promise.all([
    writeFile(path.join(folder, 'Alt.SLDASM'), embedded),
    fixture('Body.SLDPRT').then(bytes => writeFile(path.join(incomplete, 'Body.SLDPRT'), bytes)),
    ...['Body.SLDPRT', 'Pin.SLDPRT'].map(async name => writeFile(path.join(partFolder, name), await fixture(name)))
  ]);
  async function chooseFolder(directory) {
    const chooserPromise = page.waitForEvent('filechooser');
    await prompt.locator('#btn-select-solidworks-reference-folder').click();
    await (await chooserPromise).setFiles(directory);
  }
  await openMissingAssembly();
  await chooseFolder(incomplete);
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Pin.SLDPRT');
  await chooseFolder(folder);
  await expect(prompt).not.toBeVisible();

  const result = await readModel(page, assemblyName);
  expect(result.parts.map(part => part.name)).toEqual(['Body-1', 'Pin-1', 'Pin-2', 'Pin-3', 'Pin-4']);
  expect(new Set(result.parts.slice(1).map(part => part.position.map(value => value.toFixed(2)).join(','))).size).toBe(4);
  expect(result.size.map(value => Math.round(value * 100))).toEqual([390, 1845, 390]);
  await page.evaluate(() => window.__solidWorksTest.saveMotionProjectNow());
  await page.reload();
  await page.locator('#btn-workspace-restore').click();
  expect(await readModel(page, assemblyName)).toEqual(result);
  expect(await readModel(page, reconstructedName)).toEqual(reconstructed);
});
