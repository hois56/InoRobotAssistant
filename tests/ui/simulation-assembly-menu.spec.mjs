import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.route('**/2_3DSimulation/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__assemblyMenu = { state, THREE, renderModelTree, selectSceneModelPart };' });
  });
  await page.goto('/2_3DSimulation/index.html');
  await page.waitForFunction(() => window.__assemblyMenu?.state.scene);
  await page.evaluate(() => {
    const { state, THREE, renderModelTree } = window.__assemblyMenu;
    const root = new THREE.Group();
    root.userData = { uploaded: true, placement: 'scene', modelName: 'Assembly.step', importedParts: [], cadAssemblyExpanded: ['module'] };
    for (let i = 0; i < 45; i++) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
      part.userData = { modelPartId: `menu-part-${i}`, modelPartName: `Part ${i}`, cadAssemblyPath: i >= 5 ? [{ id: 'module', name: 'Module' }] : [] };
      root.add(part); root.userData.importedParts.push(part);
    }
    state.scene.add(root); state.models.push(root); renderModelTree();
  });
}

test('가져온 조립 그룹은 일반 부품 메뉴를 열고 그룹 부품만 표시 설정을 바꾼다', async ({ page }) => {
  await setup(page);
  const group = page.locator('.model-tree-cad-assembly > details > summary .model-tree-group-name');
  await group.click({ button: 'right' });
  await expect(page.locator('#model-context-menu')).toBeVisible();
  await expect(page.locator('#model-change-color')).toBeVisible();
  await expect(page.locator('#model-hide')).toBeVisible();
  await page.locator('#model-transparency').evaluate(input => {
    input.value = '40'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => window.__assemblyMenu.state.models[0].userData.importedParts.map(p => p.userData.modelTransparency || 0))).toEqual([...Array(5).fill(0), ...Array(40).fill(40)]);
  await page.locator('#model-hide').click();
  expect(await page.evaluate(() => window.__assemblyMenu.state.models[0].userData.importedParts.map(p => p.visible))).toEqual([...Array(5).fill(true), ...Array(40).fill(false)]);
  await group.click({ button: 'right' });
  await expect(page.locator('#model-hide-label')).toHaveText('표시');
  await page.locator('#model-hide').click();
  expect(await page.evaluate(() => window.__assemblyMenu.state.models[0].userData.importedParts.every(p => p.visible))).toBe(true);
});

test('조립 그룹 색상과 동작 설정은 그룹 전체를 대상으로 하고 일반 부품 메뉴는 유지한다', async ({ page }) => {
  await setup(page);
  const group = page.locator('.model-tree-cad-assembly > details > summary .model-tree-group-name');
  await group.click({ button: 'right' });
  await page.locator('#model-color-picker').evaluate(input => {
    input.value = '#123456'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => window.__assemblyMenu.state.models[0].userData.importedParts.map(p => p.material.color.getHexString()))).toEqual([...Array(5).fill('ffffff'), ...Array(40).fill('123456')]);
  await page.locator('#model-motion-settings').click();
  expect(await page.evaluate(() => window.__assemblyMenu.state.modelSelection.size)).toBe(40);
  await expect(page.locator('#equipment-dialog')).toBeVisible();
  await page.locator('#equipment-close').click();
  await page.locator('.model-tree-part-button').first().click({ button: 'right' });
  await expect(page.locator('#model-rename')).toBeVisible();
  await expect(page.locator('#model-context-menu')).not.toHaveAttribute('data-cad-assembly-id');
});

for (const selected of [false, true]) {
  test(`그룹 안의 ${selected ? '선택한' : '선택하지 않은'} 부품 체크 해제 후 트리 스크롤을 유지한다`, async ({ page }) => {
    await setup(page);
    await page.evaluate(selected => {
      const a = window.__assemblyMenu, root = a.state.models[0];
      if (selected) a.selectSceneModelPart(root, root.userData.importedParts[35]);
    }, selected);
    const checkbox = page.locator('[data-model-part-visibility="menu-part-35"]');
    await checkbox.scrollIntoViewIfNeeded();
    const before = await page.locator('#model-tree').evaluate(tree => tree.scrollTop);
    expect(before).toBeGreaterThan(100);
    await checkbox.uncheck();
    await expect(page.locator('[data-model-part-visibility="menu-part-35"]')).not.toBeChecked();
    expect(await page.locator('#model-tree').evaluate(tree => tree.scrollTop)).toBeCloseTo(before, 0);
  });
}
