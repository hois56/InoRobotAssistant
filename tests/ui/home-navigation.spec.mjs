import { test, expect } from '@playwright/test';

const allTools = ['tool-model', 'tool-simulation', 'tool-tool', 'tool-project', 'tool-software', 'tool-document', 'tool-debuggingTool', 'motion-card-title'];
const categoryTools = [
    ['tool-model', 'tool-tool', 'tool-document'],
    ['tool-simulation', 'tool-tool', 'tool-document'],
    ['tool-simulation', 'tool-project', 'tool-software', 'tool-document', 'tool-debuggingTool'],
    ['tool-model', 'tool-software', 'tool-document']
];

for (const [locale, labels] of Object.entries({
    ko: ['전체', '선정', '설계', '제어', '자료'],
    en: ['All', 'Selection', 'Design', 'Control', 'Resources'],
    'zh-CN': ['全部', '选型', '设计', '控制', '资料'],
    vi: ['Tất cả', 'Lựa chọn', 'Thiết kế', 'Điều khiển', 'Tài liệu'],
    tr: ['Tümü', 'Seçim', 'Tasarım', 'Kontrol', 'Kaynaklar'],
    ru: ['Все', 'Подбор', 'Проектирование', 'Управление', 'Материалы']
})) {
    test(`홈 업무 필터는 언어별로 정해진 도구만 순서대로 표시한다 (${locale})`, async ({ page }) => {
        await page.addInitScript(code => localStorage.setItem('inorobot.locale', code), locale);
        await page.setViewportSize({ width: locale === 'ko' ? 1440 : 360, height: 900 });
        await page.goto(`/0_Home/${locale}/`);
        const filters = page.locator('.tool-filters');
        const visibleTools = () => page.locator('.tool-card:visible h2').evaluateAll(titles => titles.map(title => title.id));
        const [all, ...categories] = labels;
        const allLabel = `${all} 8`;
        await expect(filters.getByRole('button')).toHaveText([allLabel, ...categories]);
        expect(await visibleTools()).toEqual(allTools);
        const expectedTools = [...categoryTools, allTools];
        for (const [index, label] of [...categories, allLabel].entries()) {
            const button = filters.getByRole('button', { name: label, exact: true });
            await button.focus();
            await button.press('Enter');
            await expect(button).toHaveAttribute('aria-pressed', 'true');
            await expect(filters.getByRole('button', { pressed: true })).toHaveCount(1);
            await expect(button).toBeFocused();
            expect(await visibleTools()).toEqual(expectedTools[index]);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
}

test('홈의 각 도구는 카드 한 곳에서 열고 헤더에는 원본 로고를 표시한다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/0_Home/ko/');

    const cards = page.locator('.tool-grid a.tool-link');
    await expect(cards).toHaveCount(8);
    const toolPaths = await cards.evaluateAll(links => links.map(link => link.pathname));
    const visiblePaths = await page.locator('a:visible').evaluateAll(links => links.map(link => link.pathname));
    for (const path of toolPaths) {
        expect.soft(visiblePaths.filter(candidate => candidate === path), path).toHaveLength(1);
    }

    const logo = page.getByRole('img', { name: 'INOVANCE', exact: true });
    await expect(logo).toHaveAttribute('src', '/1_RobotModelSelect/INOVANCE_Logo.png');
    expect(await logo.evaluate(image => getComputedStyle(image).filter)).toBe('none');
});
