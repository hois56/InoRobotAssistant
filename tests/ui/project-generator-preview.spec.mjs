import { test, expect } from '@playwright/test';

async function checkTableContrast(page, view) {
    const table = page.locator('#tableContainer table');
    await expect(table.locator('tbody tr').first()).toBeVisible();
    const lowest = await table.evaluate(table => {
        function luminance(color) {
            const [r, g, b] = color.match(/[\d.]+/g).map(Number).map(value => {
                const channel = value / 255;
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            });
            return .2126 * r + .7152 * g + .0722 * b;
        }
        const samples = table.querySelectorAll('th, tbody tr:first-child :is(td, span, input), button');
        return [...samples].filter(el => !el.childElementCount).map(el => {
            let surface = el;
            while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)' && surface.parentElement) {
                surface = surface.parentElement;
            }
            const ink = luminance(getComputedStyle(el).color);
            const paper = luminance(getComputedStyle(surface).backgroundColor);
            return { text: el.value || el.textContent, ratio: (Math.max(ink, paper) + .05) / (Math.min(ink, paper) + .05) };
        }).sort((a, b) => a.ratio - b.ratio)[0];
    });
    expect.soft(lowest.ratio, view + ' — ' + lowest.text).toBeGreaterThanOrEqual(4.5);
}

test('data preview tables are readable in view and edit modes', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    await page.locator('#btnOption').click();
    await page.locator('#chkMultiRecipe').check();
    await page.locator('#btnApplyOptions').click();
    const files = page.locator('#fileSelector');
    const edit = page.locator('#btnToggleEdit');
    for (const file of ['Labels.jsn', 'P.pts', 'P01.pts', 'UserDefineWarning.jsn', 'Remote_IO_mapping.dat']) {
        await files.selectOption(file);
        await checkTableContrast(page, file);
        if (file === 'Remote_IO_mapping.dat') {
            await expect(edit).toBeDisabled();
        } else {
            await edit.click();
            await expect(page.locator('#tableContainer input').first()).toBeVisible();
            await checkTableContrast(page, file + ' (edit)');
            await edit.click();
        }
    }
});

test('Korean project name hint fits on one line', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    const hint = page.locator('#projectNameHint');
    await expect(hint).toHaveText('영문, 숫자, 밑줄(_)만 사용 가능 (최대 16자)');
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 390, 641, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const fits = await hint.evaluate(el => {
            const text = document.createRange();
            text.selectNodeContents(el);
            const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
            return el.clientHeight <= lineHeight + 1 && text.getBoundingClientRect().width <= el.clientWidth + 1;
        });
        expect.soft(fits, width + 'px').toBe(true);
    }
});

test('long translated preview headings keep the file list inside the preview panel', async ({ page }) => {
    await page.goto('/4_ProjectGenerator/');
    for (const width of [1440, 1301, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const locale of ['ru', 'vi', 'en']) {
            await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption(locale);
            const box = await page.evaluate(() => {
                const panel = document.querySelector('.generator-preview').getBoundingClientRect();
                const select = document.querySelector('#fileSelector').getBoundingClientRect();
                return { overflow: select.right - panel.right, width: select.width };
            });
            expect(box.overflow, `${locale}@${width}`).toBeLessThanOrEqual(0.5);
            expect(box.width, `${locale}@${width}`).toBeGreaterThanOrEqual(110);
        }
    }
});
