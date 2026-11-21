import { expect, test } from '@playwright/test';

const keyPattern = /^(legacy|pages|common)\./;

async function useLocale(page, locale) {
    await page.addInitScript(value => {
        try { localStorage.setItem('inorobot.locale', value); } catch {}
    }, locale);
}

test('시뮬레이션은 번역 키 이름 대신 문구를 표시하고 도움말도 선택한 언어로 바꾼다', async ({ page }) => {
    await useLocale(page, 'en');
    await page.goto('/2_3DSimulation/', { waitUntil: 'domcontentloaded' });
    const conveyor = page.locator('#btn-conveyor-tracking');
    await expect(conveyor).toHaveAttribute('data-simulation-tooltip', 'Show/hide conveyor panel');
    await expect(page.locator('#sketch-text-content')).toHaveAttribute('placeholder', 'Enter text.');
    await expect(page.locator('[data-pts-empty]')).toHaveText('No point records.');

    const leaked = await page.evaluate(pattern => {
        const expression = new RegExp(pattern);
        const values = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (expression.test(node.data.trim())) values.push(node.data.trim());
        }
        for (const element of document.querySelectorAll('[title], [placeholder], [aria-label], [data-simulation-tooltip]')) {
            for (const name of ['title', 'placeholder', 'aria-label', 'data-simulation-tooltip']) {
                const value = element.getAttribute(name);
                if (value && expression.test(value)) values.push(name + '=' + value);
            }
        }
        return values;
    }, keyPattern.source);
    expect(leaked).toEqual([]);

    await page.evaluate(() => window.InoRobotI18n.setLocale('ru'));
    await expect(conveyor).toHaveAttribute('data-simulation-tooltip', 'Показать или скрыть панель конвейера');
    await page.evaluate(() => window.InoRobotI18n.setLocale('ko'));
    await expect(conveyor).toHaveAttribute('data-simulation-tooltip', '컨베이어 표시/숨김');
});

for (const locale of ['en', 'ru']) {
    test(`툴 선정 판정 결과 표는 휴대폰 화면 밖으로 페이지를 넓히지 않는다 (${locale})`, async ({ page }) => {
        await useLocale(page, locale);
        await page.setViewportSize({ width: 360, height: 800 });
        await page.goto('/3_ToolSelector/', { waitUntil: 'domcontentloaded' });
        await page.locator('#d_m').fill('3');
        await page.locator('#main-calculate').click();
        await expect(page.locator('#restable tr')).not.toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
        const scroller = page.locator('#result .tool-grid-scroll');
        await expect(scroller).toHaveCSS('overflow-x', 'auto');
    });
}
