import { expect, test } from '@playwright/test';

const calibrationPage = '/7_DebuggingTool/ZeroCalibration/';
const placeholderOpacity = field => field.evaluate(input => getComputedStyle(input, '::placeholder').opacity);

test('빈 영점 입력칸의 0은 클릭이나 Tab으로 들어가면 사라지고 떠나면 다시 보인다', async ({ page }) => {
    await page.goto(calibrationPage, { waitUntil: 'domcontentloaded' });
    const factory = page.locator('#factory-0');
    const teaching = page.locator('#teaching-0');
    await expect(page.locator('#axis-rows input[placeholder="0"]')).toHaveCount(12);
    await expect(factory).toHaveValue('');
    await expect.poll(() => placeholderOpacity(factory)).toBe('1');

    await factory.click();
    await expect.poll(() => placeholderOpacity(factory)).toBe('0');
    await page.keyboard.press('Tab');
    await expect(teaching).toBeFocused();
    await expect.poll(() => placeholderOpacity(factory)).toBe('1');
    await expect.poll(() => placeholderOpacity(teaching)).toBe('0');
    await expect(page.locator('#result-0')).toHaveText('0');
});

test('실제로 입력한 0도 다시 선택하면 새 숫자로 덮어쓸 수 있다', async ({ page }) => {
    await page.goto(calibrationPage, { waitUntil: 'domcontentloaded' });
    const factory = page.locator('#factory-5');
    const teaching = page.locator('#teaching-5');
    await factory.fill('0');
    await teaching.click();
    await factory.click();
    await page.keyboard.type('-42');
    await expect(factory).toHaveValue('-42');
    await expect(page.locator('#result-5')).toHaveText('-42');

    await teaching.fill('0');
    await factory.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.type('36');
    await expect(teaching).toHaveValue('36');
    await teaching.click({ position: { x: 6, y: 10 } });
    await page.keyboard.type('1');
    await expect(teaching).toHaveValue('136');
    await page.locator('button[onclick="resetAll()"]').click();
    await expect(factory).toHaveValue('');
    await expect(teaching).toHaveValue('');
    await expect(page.locator('#result-5')).toHaveText('0');
});

test.describe('모바일 영점 보정', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('빈 입력칸을 탭하면 안내 숫자 없이 입력할 수 있다', async ({ page }) => {
        await page.goto(calibrationPage, { waitUntil: 'domcontentloaded' });
        const teaching = page.locator('#teaching-2');
        await teaching.tap();
        await expect(teaching).toBeFocused();
        await expect.poll(() => placeholderOpacity(teaching)).toBe('0');
        await page.keyboard.type('25');
        await expect(teaching).toHaveValue('25');
    });
});
