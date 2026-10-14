import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('서보 안내의 제목·설명·사양표는 한국어·영어·베트남어로 전환되고 모바일에서 읽을 수 있다', async ({ page }) => {
    await page.goto('/Servo/');
    for (const locale of ['ko', 'en', 'vi']) {
        const source = JSON.parse(fs.readFileSync(new URL(`../../Language/${locale}/servo.json`, import.meta.url), 'utf8')).pages.servo;
        await page.locator('#inorobot-language-select').selectOption(locale);
        await expect(page.locator('#servo-hero-title')).toHaveText(source.hero.title);
        const home = JSON.parse(fs.readFileSync(new URL(`../../Language/${locale}/home.json`, import.meta.url), 'utf8'));
        await expect(page.locator('header h1')).toHaveText(home.legacy['Servo System Solution']);
        await expect(page.locator('.spec-table tbody tr')).toHaveCount(18);
        for (let i = 0; i < source.specs.rows.length; i++) {
            const row = page.locator('.spec-table tbody tr').nth(i);
            await expect(row.locator('th')).toHaveText(source.specs.rows[i].label);
            await expect(row.locator('td')).toHaveText(source.specs.rows[i].value);
        }
        await expect(page.locator('.dimension-summary')).toContainText('59 × 84 × 41 mm');
        if (locale !== 'ko') expect(await page.locator('main').innerText()).not.toMatch(/[가-힣]/);
        await page.screenshot({ path: test.info().outputPath(`servo-${locale}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#servo-hero-title')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('servo-vi-mobile.png'), fullPage: true });
    await page.locator('#inorobot-language-select').selectOption('ko');
    await expect(page.locator('#servo-hero-title')).toHaveText('INOVANCE 서보로 간편하게 완성하는 PC 기반 위치제어');
});
