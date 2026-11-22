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
    // The simulator renders its markup after the WebAssembly engine loads, which can
    // take longer than the default wait while other browser tests share the machine.
    await expect(conveyor).toBeAttached({ timeout: 30000 });
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

test('다른 요소를 바로 번역해도 그 직전에 추가된 문구가 번역되지 않고 남지 않는다', async ({ page }) => {
    await useLocale(page, 'en');
    await page.goto('/privacy/');
    // apply() pauses the observer; records already queued for other new nodes must still be handled.
    const texts = await page.evaluate(async () => {
        const earlier = document.createElement('p');
        earlier.textContent = '새 동작';
        document.body.append(earlier);
        const later = document.createElement('p');
        later.textContent = '전체 정지';
        document.body.append(later);
        window.InoRobotI18n.apply(later);
        await new Promise(resolve => setTimeout(resolve, 50));
        return [earlier.textContent, later.textContent];
    });
    expect(texts).toEqual(['New motion', 'Stop all']);

    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('init();\n', 'window.__simulationReady = init();\n') });
    });
    await page.goto('/2_3DSimulation/');
    await page.waitForFunction(() => window.__simulationReady, null, { timeout: 30000 });
    await page.evaluate(() => window.__simulationReady);
    const motion = page.locator('#equipment-dialog');
    await expect(motion.locator('#equipment-basic label').first()).toContainText('Motion type');
    expect(await motion.evaluate(dialog => [...dialog.querySelectorAll('label, legend, button')]
        .filter(element => element.childNodes.length && /[가-힣]/.test(element.firstChild?.data || ''))
        .map(element => element.firstChild.data.trim()))).toEqual([]);
});

test('드롭다운의 접근성 이름도 선택한 언어를 따른다', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    const picker = page.getByRole('combobox', { name: 'Language', exact: true });
    await picker.selectOption('ru');
    await expect(page.locator('#fileSelector')).toHaveAttribute('aria-label', 'Предварительный просмотр файла');
    // Process selects keep untranslated option values but name themselves after their column.
    const row = page.locator('#stepsList select[data-aria-key]');
    await expect(row.first()).toHaveAttribute('aria-label', 'Тип');
    await picker.selectOption('en');
    await expect(row.nth(1)).toHaveAttribute('aria-label', 'Method');

    await useLocale(page, 'en');
    await page.goto('/2_3DSimulation/');
    await expect(page.locator('#model-select')).toHaveAttribute('aria-label', /^(?!.*[가-힣]).*Robot Model/);
});
