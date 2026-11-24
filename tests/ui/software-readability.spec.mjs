import {test, expect} from '@playwright/test';

const softwarePage = '/5_Software/';

test('제품 필터는 키보드 초점을 유지하고 불필요한 소개·검색·안내를 표시하지 않는다', async ({page}) => {
    await page.goto(softwarePage);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.locator('.page-heading, .download-guide, #softwareEmpty')).toHaveCount(0);
    const visibleReleases = page.locator('.software-card:visible');
    await expect(visibleReleases).toHaveCount(6);
    const tpFilter = page.locator('.filter-btn[data-type="InoRobotTP"]');
    await tpFilter.focus();
    await page.keyboard.press('Enter');
    await expect(tpFilter).toHaveAttribute('aria-pressed', 'true');
    await expect(tpFilter).toBeFocused();
    await expect(visibleReleases).toHaveCount(2);
    await expect(page.locator('#softwareResultCount')).toContainText('2');
    await page.locator('.filter-btn[data-type="InoRobotKoreanInstaller"]').click();
    await expect(visibleReleases).toHaveCount(1);
    await page.locator('.filter-btn[data-type="all"]').click();
    await expect(visibleReleases).toHaveCount(6);
});

test('한국어 버전명과 설명을 표시하고 언어를 전환해도 선택한 제품을 보존한다', async ({page}) => {
    await page.goto(softwarePage);
    await expect(page.locator('h1')).toHaveText('소프트웨어 다운로드 센터');
    await expect(page.locator('#release-number-InoRobotLab-0')).toHaveText('SPC25K14 R5');
    await expect(page.locator('.release-version').filter({hasText: '표준 버전'})).toHaveCount(2);
    await expect(page.locator('.release-version').filter({hasText: '디스플레이 버전'})).toHaveCount(2);
    await expect(page.locator('.release-version').last()).toHaveText('베타 버전');
    await expect(page.locator('.release-number').last()).toHaveText('V1.0');
    await expect(page.locator('.language-patch-icon')).toHaveText('A가');
    const standard = page.locator('.software-card').filter({has: page.locator('.release-version', {hasText: '표준 버전'})}).first();
    await expect(standard.locator('.release-version')).toHaveText('표준 버전');
    await expect(standard.locator('.release-meta')).toContainText('2026-10-01');
    await expect(standard.locator('.release-meta .release-number')).toHaveText('V4R24C4SPC25');
    await expect(page.locator('.release-heading').filter({hasText: /[()]/})).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/Standard|Display|Beta/);
    await page.locator('.filter-btn[data-type="InoRobotLab"]').click();
    await page.locator('.inorobot-language-select').selectOption('en');
    await expect(page.locator('h1')).toHaveText('Software Download Center');
    await expect(page.locator('.language-patch-icon')).toHaveText('A가');
    await expect(page.locator('.filter-btn[data-type="InoRobotLab"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.software-card:visible')).toHaveCount(3);
    await expect(page.locator('.software-card:visible .download-btn').first()).toHaveAccessibleName(/InoRobotLab.*Simulation version SPC25K14 R5.*Download Portable.*659MB/);
    await expect(page.locator('.software-card:visible .release-version').nth(1)).toContainText('Standard');
    await page.locator('.inorobot-language-select').selectOption('ko');
    await expect(page.locator('.software-card:visible .release-version').nth(1)).toContainText('표준 버전');
    await expect(page.locator('.software-card:visible .release-version').nth(2)).toContainText('디스플레이 버전');
});

test('밝은 화면은 외부 UI CDN 없이 동작하고 모바일에서도 읽을 수 있는 대비와 버튼 크기를 유지한다', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({colorScheme: 'light'});
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await page.goto(softwarePage);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 246, 250)');
    await expect(page.locator('.software-card:visible')).toHaveCount(6);
    const contrast = await page.evaluate(() => {
        function luminance(color) {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => {
                const channel = Number(value) / 255;
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            });
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        }
        return ['.release-version', '.release-description', '.release-date', '.release-number', '.download-btn', '.download-size', '.download-btn + .download-btn', '.software-group[data-group="InoRobotTP"] .download-btn', '.software-group[data-group="InoRobotKoreanInstaller"] .download-btn', '.filter-btn.active'].map(selector => {
            const element = document.querySelector(selector);
            let surface = element;
            let background = getComputedStyle(surface).backgroundColor;
            while (background === 'rgba(0, 0, 0, 0)' && surface.parentElement) {
                surface = surface.parentElement;
                background = getComputedStyle(surface).backgroundColor;
            }
            const foreground = luminance(getComputedStyle(element).color);
            const back = luminance(background);
            return {selector, ratio: (Math.max(foreground, back) + .05) / (Math.min(foreground, back) + .05)};
        });
    });
    for (const {selector, ratio} of contrast) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
    for (const width of [360, 640, 768, 1280, 1920]) {
        await page.setViewportSize({width, height: 900});
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px viewport`).toBe(true);
        const logo = await page.locator('.logo-link').boundingBox();
        expect(logo.x, '로고는 본문 중앙 정렬 폭과 독립적으로 화면 왼쪽에 배치한다').toBeLessThanOrEqual(32);
        for (const meta of await page.locator('.release-meta').all()) {
            const date = await meta.locator('.release-date').boundingBox();
            const number = await meta.locator('.release-number').boundingBox();
            expect(Math.abs(date.y - number.y)).toBeLessThan(2);
            expect(number.x).toBeGreaterThan(date.x + date.width);
        }
        for (const button of await page.locator('.download-btn:visible').all()) {
            const box = await button.boundingBox();
            expect(box.width).toBeGreaterThan(120);
            expect(box.height).toBeGreaterThanOrEqual(42);
            expect(await button.locator('.download-label').evaluate(label => {
                const range = document.createRange();
                range.selectNodeContents(label);
                return range.getBoundingClientRect().width <= label.getBoundingClientRect().width + 1;
            })).toBe(true);
        }
    }
    expect(errors).toEqual([]);
});
