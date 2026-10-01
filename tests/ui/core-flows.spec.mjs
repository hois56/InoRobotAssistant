import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expectedDownloads = JSON.parse(fs.readFileSync(
  path.join(repoRoot, 'tests', 'fixtures', 'software-downloads.json'), 'utf8'
));

test('모델 선택 화면에서 모델과 구매 코드 연결을 구성 목록까지 보존한다', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/1_RobotModelSelect/index.html', { waitUntil: 'domcontentloaded' });
  const productCard = page.locator('#product-container [data-product-id="IR-R15H-145S-K-INT"]');
  await expect(productCard).toBeVisible({ timeout: 20_000 });
  await productCard.click();

  const modal = page.locator('#options-modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#dynamic-purchase-code .code-badge')).toHaveText('01741446');
  await page.locator('#add-to-cart-btn').click();
  await expect(page.locator('#cart-overlay')).toBeVisible();
  await expect(page.locator('#cart-list .cart-item')).toContainText('IR-R15H-145S-K-INT');
  await expect(page.locator('#cart-list .cart-item')).toContainText('01741446');
  expect(pageErrors).toEqual([]);
});

test('소프트웨어 버전과 다운로드 버튼이 기준 파일에 연결된다', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/5_Software/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#softwareList .software-card').first()).toBeVisible({ timeout: 20_000 });

  const actual = await page.locator('#softwareList .software-card').evaluateAll(cards => cards.map(card => {
    const groupName = card.querySelector('h3')?.textContent.trim();
    const version = card.querySelector('h3')?.parentElement?.querySelector('div')?.textContent.trim();
    const downloads = Array.from(card.querySelectorAll('button[data-download-key]')).map(button => {
      const key = decodeURIComponent(button.dataset.downloadKey);
      const locked = button.dataset.downloadLocked === 'true';
      const path = button.dataset.downloadPath ? decodeURIComponent(button.dataset.downloadPath) : null;
      const visibleLabel = button.textContent.replace(/\s+/g, ' ').trim();
      const type = /install|설치/i.test(visibleLabel) ? 'install' : 'portable';
      const label = type === 'install' ? 'Download Install' : 'Download Portable';
      return { label, type, path, assetId: locked ? key : null };
    });
    return {
      productId: groupName,
      version: version?.replace(/\s+/g, ' '),
      isLocked: card.querySelector('button[data-download-locked="true"]') !== null,
      downloads
    };
  }));

  expect(actual).toEqual(expectedDownloads);
  expect(pageErrors).toEqual([]);
});

test('서로 다른 소프트웨어 파일을 내려받아도 파일명과 내용이 각각 일치한다', async ({ page }) => {
  const downloadRoutes = new Map();
  await page.route('https://media.githubusercontent.com/**', async route => {
    const url = new URL(route.request().url());
    const downloadPath = decodeURIComponent(url.pathname.split('/5_Software/')[1] || '');
    const filename = path.posix.basename(downloadPath);
    downloadRoutes.set(filename, downloadPath);
    await route.fulfill({
      status: 200,
      contentType: 'application/zip',
      headers: { 'content-disposition': `attachment; filename="${filename}"` },
      body: `test-download:${downloadPath}`
    });
  });

  await page.goto('/5_Software/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#softwareList .software-card').first()).toBeVisible({ timeout: 20_000 });
  const candidates = [
    'InoRobotLab/InoRobotLabSetUp_V4R24C4SPC25_x64.exe',
    'InoRobotTP/InoRobotTP_win_x86_V4R24C4SPC25.zip'
  ];
  const buttons = page.locator('#softwareList button[data-download-path]');
  const matchingButtons = [];
  for (const downloadPath of candidates) {
    const count = await buttons.count();
    let found = null;
    for (let index = 0; index < count; index++) {
      const candidate = buttons.nth(index);
      if (decodeURIComponent(await candidate.getAttribute('data-download-path')) === downloadPath) {
        found = candidate;
        break;
      }
    }
    assert.ok(found, `다운로드 버튼을 찾을 수 없습니다: ${downloadPath}`);
    matchingButtons.push(found);
  }

  const results = [];
  for (let index = 0; index < matchingButtons.length; index++) {
    const downloadPath = candidates[index];
    const downloadPromise = page.waitForEvent('download');
    await matchingButtons[index].click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    const stream = await download.createReadStream();
    assert.ok(stream, `${filename}의 다운로드 내용을 읽을 수 없습니다.`);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    results.push({ filename, contents: Buffer.concat(chunks).toString('utf8') });
    expect(results.at(-1)).toEqual({
      filename: path.posix.basename(downloadPath),
      contents: `test-download:${downloadPath}`
    });
  }

  expect(results.sort((a, b) => a.filename.localeCompare(b.filename)))
    .toEqual(candidates.map(downloadPath => ({
      filename: path.posix.basename(downloadPath),
      contents: `test-download:${downloadPath}`
    })).sort((a, b) => a.filename.localeCompare(b.filename)));
  expect([...downloadRoutes.values()].sort()).toEqual([...candidates].sort());
});
