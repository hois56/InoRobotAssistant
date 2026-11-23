import { expect, test } from '@playwright/test';

async function expectIconFont(icon, weight) {
    await expect(icon).toHaveCSS('font-weight', weight);
    const rendered = await icon.evaluate(async element => {
        const style = getComputedStyle(element, '::before');
        const glyph = style.content.startsWith('"') ? style.content.slice(1, -1) : '';
        const fonts = await element.ownerDocument.fonts.load(`${style.fontWeight} 16px ${style.fontFamily}`, glyph);
        return {
            glyphLength: [...glyph].length,
            fonts: fonts.map(({ family, weight, status }) => ({ family, weight, status }))
        };
    });
    expect(rendered).toEqual({
        glyphLength: 1,
        fonts: [{ family: 'Font Awesome 6 Free', weight, status: 'loaded' }]
    });
}

test('외부 아이콘 CDN 없이 시뮬레이션과 분리 창에서 버튼 아이콘을 표시한다', async ({ page }) => {
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/**', route => route.abort());
    await page.goto('/2_3DSimulation/', { waitUntil: 'domcontentloaded' });

    await expectIconFont(page.locator('#model-browser-panel [data-panel-action="hide"] .fa-eye-slash'), '900');
    await expectIconFont(page.locator('#sketch-workbench button .fa-regular.fa-square'), '400');

    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.locator('[data-panel-toggle="position-points-panel"]').click();
    const popupReady = page.waitForEvent('popup');
    await page.locator('#position-points-panel [data-panel-action="popout"]').click();
    const popup = await popupReady;
    await expect(popup.locator('link[href*="/ajax/libs/font-awesome/"]')).toHaveCount(0);
    await expectIconFont(popup.locator('#position-points-panel [data-panel-action="hide"] .fa-eye-slash'), '900');
});
