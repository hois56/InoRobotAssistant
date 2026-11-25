import {test, expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const documentPage = '/6_Document/';

async function openDocuments(page) {
    await page.goto(documentPage);
    await expect(page.locator('#manualList .manual-item').first()).toBeVisible();
}

test('문서 항목 탐색은 필터를 접거나 펼쳐도 가로로 넘치지 않는다', async ({page}) => {
    await openDocuments(page);
    const sidebar = page.locator('.document-sidebar');
    for (const width of [1280, 360]) {
        await page.setViewportSize({width, height: 800});
        for (const action of ['collapseAllFilters', 'expandAllFilters']) {
            await page.locator('#' + action).click();
            expect(await sidebar.evaluate(el => el.scrollWidth - el.clientWidth), `${width}px, ${action}`).toBe(0);
        }
    }
});

test('문서는 카드 대신 구분선 있는 행으로 나오고 결과 수가 표시된 행 수와 일치한다', async ({page}) => {
    await openDocuments(page);
    const rows = page.locator('#manualList .manual-item');
    await expect(page.locator('#manualCountValue')).toHaveText(String(await rows.count()));
    await expect(page.locator('.ambient-glow')).toHaveCount(0);
    const firstRow = rows.first();
    await expect(firstRow.locator('h3')).not.toBeEmpty();
    await expect(firstRow.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
});

test('필터를 고르면 선택 항목의 개수만큼 표시하고 선택은 하나만 강조된다', async ({page}) => {
    await openDocuments(page);
    const total = Number(await page.locator('#manualCountValue').textContent());
    await page.locator('#filterToggleHardware').click();
    const scara = page.locator('#typeFilters [data-type="scara"]');
    const expected = Number(await scara.locator('.filter-count').textContent());
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(total);
    await scara.click();
    await expect(scara).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#manualCountValue')).toHaveText(String(expected));
    await expect(page.locator('#manualList .manual-item')).toHaveCount(expected);
    // Other groups keep a hidden "all" state, but only the real selection is shown as pressed.
    await expect(page.locator('.filter-btn[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('.filter-btn.active:not([data-quiet])')).toHaveCount(1);

    await page.locator('#typeFilters [data-type="all"]').click();
    const hardwareTotal = await page.locator('#manualList .manual-item').count();
    expect(hardwareTotal).toBeGreaterThan(expected);
    expect(hardwareTotal).toBeLessThan(total);
    await expect(page.locator('#manualCountValue')).toHaveText(String(hardwareTotal));
    await expect(page.locator('#manualList .manual-code').filter({hasText: /^CAD$/})).toHaveCount(0);
    await expect(page.locator('.filter-btn[aria-pressed="true"]')).toHaveCount(1);
});

test('검색은 선택한 필터 안에서 좁히고 결과가 없으면 안내 문구와 0을 표시한다', async ({page}) => {
    await openDocuments(page);
    await page.locator('#manualSearch').fill('IR-S4');
    const matches = await page.locator('#manualList .manual-item').count();
    expect(matches).toBeGreaterThan(0);
    for (const title of await page.locator('.manual-title').allTextContents()) expect(title.toLowerCase()).toContain('ir-s4');
    await expect(page.locator('#manualCountValue')).toHaveText(String(matches));
    await page.locator('#manualSearch').fill('zzzz-no-such-manual');
    await expect(page.locator('#manualList .manual-item')).toHaveCount(0);
    await expect(page.locator('.empty-state')).toHaveText('매뉴얼을 찾을 수 없습니다.');
    await expect(page.locator('#manualCountValue')).toHaveText('0');
});

test('미리보기와 다운로드는 해당 문서를 연결하고 CAD는 2D·3D 다운로드를 제공한다', async ({page}) => {
    await openDocuments(page);
    await page.evaluate(() => {
        window.__opened = [];
        window.open = (url, target) => { window.__opened.push([url, target]); return null; };
        window.__downloads = [];
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            if (this.hasAttribute('download')) window.__downloads.push([this.getAttribute('href'), this.download]);
            else click.call(this);
        };
    });
    const first = page.locator('#manualList .manual-item').first();
    const title = (await first.locator('h3').textContent()).trim();
    await first.locator('[data-action="view"]').click();
    await first.locator('[data-action="download"]').click();
    const calls = await page.evaluate(() => ({opened: window.__opened, downloads: window.__downloads}));
    expect(calls.opened).toHaveLength(1);
    expect(calls.opened[0][1]).toBe('_blank');
    expect(decodeURIComponent(calls.opened[0][0])).toContain(title);
    expect(calls.downloads).toEqual([[calls.opened[0][0], title]]);

    await page.locator('#filterToggleCad').click();
    await page.locator('#cadFilters [data-cad="scara"]').click();
    const cadRow = page.locator('#manualList .manual-item').first();
    await expect(cadRow.locator('.manual-code')).toHaveText('CAD');
    await expect(cadRow.locator('button')).toHaveText([/2D/, /3D/]);
    await cadRow.locator('button').first().click();
    const download = await page.evaluate(() => window.__downloads.at(-1));
    expect(download[1]).toMatch(/_2D\.(dwg|dxf)$/i);
});

test('셀렉션 가이드 필터의 다운로드 버튼으로 각 PDF 원본을 받는다', async ({page}) => {
    await openDocuments(page);
    await page.locator('#filterToggleHardware').click();
    await page.locator('#typeFilters [data-type="selection"]').click();
    const buttons = page.locator('#manualList [data-action="download"]');
    const files = {
        sel_guide: /Selection Guide/i,
        sel_leaflet: /Selection Leaflet-EN/i,
        sel_leaflet_display: /Special Robot of Display/i
    };
    for (const [id, name] of Object.entries(files)) {
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            buttons.and(page.locator(`[data-id="${id}"]`)).click()
        ]);
        expect(await download.failure(), id).toBeNull();
        expect(download.suggestedFilename()).toMatch(name);
        const bytes = await readFile(await download.path());
        expect(bytes.subarray(0, 5).toString(), id).toBe('%PDF-');
    }
});

test('Remote IO Excel 미리보기에서 두 시트와 그림을 읽고 원본은 다운로드 버튼으로 받는다', async ({page}) => {
    await openDocuments(page);
    await page.locator('#manualSearch').fill('remote_io_list.xlsx');
    const row = page.locator('#manualList .manual-item');
    const downloads = [];
    page.context().on('page', opened => opened.on('download', file => downloads.push(file)));
    page.on('download', file => downloads.push(file));
    const [preview] = await Promise.all([
        page.waitForEvent('popup', {timeout: 5000}),
        row.getByRole('button', {name: '미리보기'}).click()
    ]);
    await expect(preview.getByRole('heading', {name: 'Remote IO', exact: true})).toBeVisible();
    await expect(preview.getByRole('cell', {name: 'Start program', exact: true})).toBeVisible();
    await expect(preview.getByRole('cell', {name: 'Current jump motion MH parameter-High'})).toHaveCount(1);
    await expect.poll(() => preview.getByRole('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await preview.setViewportSize({width: 360, height: 800});
    expect(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await preview.getByRole('link', {name: '확장 Remote IO'}).click();
    await expect(preview.getByRole('heading', {name: '확장 Remote IO'})).toBeInViewport();
    await expect(preview.getByRole('cell', {name: 'H076A', exact: true})).toHaveCount(1);
    expect(downloads).toHaveLength(0);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        row.getByRole('button', {name: '다운로드'}).click()
    ]);
    expect(download.suggestedFilename()).toBe('Remote_IO_List.xlsx');
    const original = await readFile(new URL('../../6_Document/Software_manual/Remote_IO_List.xlsx', import.meta.url));
    expect(await readFile(await download.path())).toEqual(original);
    await expect(preview.locator('meta[name="workbook-sha256"]')).toHaveAttribute('content', createHash('sha256').update(original).digest('hex'));
});

test('홈 안내 데모가 쓰는 구조를 유지한다', async ({page}) => {
    await openDocuments(page);
    expect(await page.evaluate(() => typeof window.renderManuals)).toBe('function');
    const item = page.locator('#manualList .manual-item').first();
    await expect(item.locator('h3')).toHaveCount(1);
    await expect(item.locator('button')).toHaveCount(2);
    await expect(item.locator('button').nth(0)).toHaveAttribute('data-action', 'view');
    await expect(item.locator('button').nth(1)).toHaveAttribute('data-action', 'download');
    await expect(page.locator('#manualSearch')).toBeVisible();
    for (const selector of ['#typeFilters [data-type="all"]', '#catFilters [data-cat="all"]', '#eduFilters [data-cat="all"]', '#typeFilters [data-type="scara"]']) {
        await expect(page.locator(selector)).toHaveCount(1);
    }
});

test('언어를 바꿔도 선택한 필터와 결과를 유지하고 행 버튼도 번역한다', async ({page}) => {
    await openDocuments(page);
    await page.locator('#filterToggleHardware').click();
    await page.locator('#typeFilters [data-type="scara"]').click();
    const count = await page.locator('#manualCountValue').textContent();
    await page.locator('.inorobot-language-select').selectOption('en');
    await expect(page.locator('.page-title')).toHaveText('Need help?');
    await expect(page.locator('#typeFilters [data-type="scara"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#manualCountValue')).toHaveText(count);
    await expect(page.locator('.result-count-unit')).toHaveText('items');
    await expect(page.locator('#manualList .manual-item').first().locator('button')).toHaveText(['Preview', 'Download']);
    await page.locator('.inorobot-language-select').selectOption('ko');
    await expect(page.locator('#manualList .manual-item').first().locator('button')).toHaveText(['미리보기', '다운로드']);
});

test('휴대폰 폭에서도 행 버튼 글자가 잘리지 않고 긴 CAD 버튼은 한 줄씩 놓인다', async ({page}) => {
    await page.setViewportSize({width: 375, height: 800});
    await openDocuments(page);
    for (const locale of ['ko', 'en', 'zh-CN', 'vi', 'tr', 'ru']) {
        await page.locator('.inorobot-language-select').selectOption(locale);
        const clipped = await page.locator('#manualList .manual-action').evaluateAll(buttons => buttons
            .flatMap(button => [...button.querySelectorAll('span')])
            .filter(span => span.scrollWidth > span.clientWidth + 1)
            .map(span => span.textContent.trim()));
        expect(clipped, locale).toEqual([]);
    }
    // English "2D Download" does not fit beside "3D Download" at this width.
    await page.locator('.inorobot-language-select').selectOption('en');
    const cad =page.locator('#manualList .manual-item', {hasText: '2D Download'}).first().locator('.manual-action');
    const [first, second] = await cad.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
    expect(second).toBeGreaterThan(first);
});

test('밝은 화면은 외부 UI CDN 없이 동작하고 글자 크기·대비·버튼 크기가 모바일에서도 유지된다', async ({page}) => {
    const errors = [];
    const requested = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(request.url()));
    await page.emulateMedia({colorScheme: 'light'});
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await openDocuments(page);
    await page.locator('#expandAllFilters').click();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 246, 250)');
    expect(requested.filter(url => /tailwind|unpkg|lucide|jsdelivr|cdnjs/i.test(url))).toEqual([]);

    const measured = await page.evaluate(() => {
        function luminance(color) {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => {
                const channel = Number(value) / 255;
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            });
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        }
        const selectors = ['.header-title', '.page-title', '.page-lead', '.sidebar-heading', '.filter-action', '.filter-section-title', '.filter-btn:not(.active)', '.filter-btn.active:not([data-quiet])',
            '.filter-count', '.result-count', '.manual-title', '.manual-code', '.manual-tag', '.manual-date', '.manual-action-view', '.manual-action-download'];
        return selectors.map(selector => {
            const element = document.querySelector(selector);
            let surface = element;
            let background = getComputedStyle(surface).backgroundColor;
            while (background === 'rgba(0, 0, 0, 0)' && surface.parentElement) {
                surface = surface.parentElement;
                background = getComputedStyle(surface).backgroundColor;
            }
            const foreground = luminance(getComputedStyle(element).color);
            const back = luminance(background);
            return {selector, fontSize: parseFloat(getComputedStyle(element).fontSize), ratio: (Math.max(foreground, back) + .05) / (Math.min(foreground, back) + .05)};
        });
    });
    for (const {selector, ratio, fontSize} of measured) {
        expect(ratio, `${selector} contrast`).toBeGreaterThanOrEqual(4.5);
        expect(fontSize, `${selector} font size`).toBeGreaterThanOrEqual(14);
    }

    for (const width of [360, 640, 768, 1280]) {
        await page.setViewportSize({width, height: 900});
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px viewport`).toBe(true);
        const minimumHeight = width <= 720 ? 44 : 40;
        for (const button of await page.locator('#manualList .manual-item:nth-child(-n+3) button').all()) {
            const box = await button.boundingBox();
            expect(box.height, `${width}px action height`).toBeGreaterThanOrEqual(minimumHeight);
            expect(box.x, `${width}px action left edge`).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width, `${width}px action right edge`).toBeLessThanOrEqual(width);
        }
        for (const button of await page.locator('.filter-btn:visible').all()) {
            expect((await button.boundingBox()).height, `${width}px filter height`).toBeGreaterThanOrEqual(40);
        }
        const search = await page.locator('.search-control').boundingBox();
        expect(search.height).toBeGreaterThanOrEqual(48);
        expect(search.x + search.width).toBeLessThanOrEqual(width);
        for (const title of await page.locator('.manual-title').evaluateAll(nodes => nodes.slice(0, 5).map(node => node.scrollWidth <= node.clientWidth + 1))) expect(title).toBe(true);
    }
    expect(errors).toEqual([]);
});
