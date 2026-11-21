import { expect, test } from '@playwright/test';

test('simulation setup panels follow the selected language and keep edited values', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForSelector('#btn-conveyor-tracking', { state: 'attached' });
    const language = locale => page.evaluate(value => window.InoRobotI18n.setLocale(value), locale);
    await page.locator('.inorobot-language-select').selectOption('en');
    await expect(page.locator('[data-panel-toggle="workobject-panel"]')).toHaveAccessibleName(/Work object coordinate system/);
    await page.locator('#btn-test-model').click();
    const dialog = page.locator('#test-model-dialog');
    const quantity = dialog.locator('[data-test-quantity="conveyor"]');
    await quantity.fill('3');
    await expect(dialog).not.toContainText(/[가-힣]/);
    await expect(dialog.locator('#test-model-total')).toContainText('3');
    const englishLabel = await quantity.getAttribute('aria-label');
    await language('ru');
    await expect(quantity).toHaveValue('3');
    await expect(quantity).not.toHaveAttribute('aria-label', englishLabel);
    await expect(dialog.locator('#test-model-total')).toContainText(/[А-Яа-я]/);
    for (const locale of ['zh-CN', 'vi', 'tr', 'ko']) {
        await language(locale);
        const expected = await page.evaluate(() => ({
            label: window.InoRobotI18n.translate('가져올 수량'),
            total: window.InoRobotI18n.translate('선택 수량: {count}개').replace('{count}', '3')
        }));
        await expect(quantity).toHaveValue('3');
        await expect(quantity).toHaveAccessibleName(new RegExp(expected.label));
        await expect(dialog.locator('#test-model-total')).toHaveText(expected.total);
    }
    await page.keyboard.press('Escape');
    await language('en');
    await page.locator('#btn-conveyor-tracking').click();
    const belt = page.locator('#conveyor-tracking-dialog');
    await expect(belt.locator('#conveyor-tracking-title svg')).toBeVisible();
    await belt.locator('[data-action="run"]').click();
    await expect(belt.locator('[data-test-status]')).not.toContainText(/[가-힣]/);
    await expect(belt).not.toContainText(/[가-힣]/);
    await page.locator('#btn-io-simulator').click();
    await page.locator('#io-function-mapping-button').click();
    const mapping = page.locator('#io-function-mapping-dialog');
    await expect(mapping).not.toContainText(/[가-힣]/);
    await mapping.locator('#io-equipment-settings').click();
    const equipment = page.locator('#equipment-form');
    await equipment.locator('[name="type"]').selectOption('OBJECT');
    await equipment.locator('[name="name"]').fill('Fixture A');
    for (const locale of ['zh-CN', 'vi', 'tr', 'ru']) {
        await language(locale);
        await expect(equipment).not.toContainText(/[가-힣]/);
        await expect(equipment.locator('[name="type"]')).toHaveValue('OBJECT');
        await expect(equipment.locator('[name="name"]')).toHaveValue('Fixture A');
        const caption = await page.evaluate(() => window.InoRobotI18n.translate('모든 등록 오브젝트 원위치'));
        await expect(equipment.locator('[name="resetAll"] + span')).toHaveText(caption);
    }
    await equipment.locator('[name="type"]').selectOption('FILM_PEEL');
    await expect(equipment.locator('#equipment-advanced > summary')).toContainText('Опорная модель');
    await expect(equipment.locator('[name="filmGripSide"] option').first()).toHaveText('Начальный край X');
    await language('ko');
    await expect(equipment.locator('[name="filmGripSide"] option').first()).toHaveText('X 시작 변');
});
