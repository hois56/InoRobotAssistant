// Run against tools/serve-local.cjs; PLAYWRIGHT_MODULE may point to a bundled installation.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        let downloads = 0;
        page.on('pageerror', error => errors.push(error.message));
        page.on('download', () => downloads++);
        await page.goto(process.env.GUIDE_TEST_URL || 'http://127.0.0.1:8765/');
        await page.locator('[data-tool-guide="project"]').click();
        const frame = page.frames().find(item => item.url().includes('/4_ProjectGenerator/'));
        await frame.waitForFunction(() => window.InoRobotToolManual?.getState().prepared);
        // Stop the host clock before testing exact media times.
        if (await page.locator('[data-tool-guide-play]').getAttribute('aria-pressed') === 'true') await page.locator('[data-tool-guide-play]').click();
        const read = () => frame.evaluate(() => ({
            name: document.getElementById('prjName').value,
            model: document.getElementById('cmbRobotModel').selectedOptions[0].textContent,
            rows: Array.from(document.querySelectorAll('#stepsList > div')).map(row => Array.from(row.querySelectorAll('select')).slice(0, 2).map(select => select.value)),
            menu: document.querySelector('.project-guide-menu')?.textContent || '',
            options: !document.getElementById('optionsModal').classList.contains('hidden'),
            speed: document.getElementById('chkTcpSpeed').checked,
            caret: document.querySelector('.project-guide-caret')?.getAttribute('style'),
            pointer: document.querySelector('.tool-guide-cursor').getAttribute('style'),
            box: document.querySelector('.tool-guide-spotlight').getAttribute('style'),
            scroll: scrollY
        }));
        const seek = time => frame.evaluate(time => window.InoRobotToolManual.setTimelineTime(time), time);
        await seek(2600);
        const partial = await read();
        assert.equal(partial.name, 'InoRo');
        await page.waitForTimeout(300);
        assert.deepEqual(await read(), partial, 'Pause must freeze typing, cursor, highlight and scroll');
        await seek(6500);
        assert.match((await read()).menu, /R25/);
        await seek(13000);
        const typeMenu = await read();
        assert.equal(typeMenu.menu, 'TrayStageMCRVisionTrash');
        await seek(16700);
        assert.equal((await read()).menu, 'GetPutPeeling');
        await seek(26000);
        assert.equal((await read()).speed, true);
        assert.equal((await read()).options, true);
        await seek(31000);
        assert.equal((await read()).options, false);
        assert.deepEqual((await read()).rows, [['Tray', 'Get'], ['Stage', 'Put']]);
        await seek(13000);
        assert.deepEqual(await read(), typeMenu, 'Rewinding must restore the same scene');
        await seek(39000);
        await frame.waitForFunction(() => window.InoRobotToolManual.getState().project.package?.size > 0);
        assert.equal(await frame.locator('.tool-guide-toast small').textContent(), 'InoRobot_Demo.zip');
        assert.equal(downloads, 0, 'Tutorial must not download files');

        // Advance the actual renderer frame by frame through all interactions.
        const motionErrors = await frame.evaluate(async () => {
            const api = window.InoRobotToolManual;
            api.resetTimeline();
            const failures = [];
            const clicks = new Map([[5100, '#cmbRobotModel'], [7000, '[data-demo-option]'], [9800, '#btnAdd'],
                [11800, '#stepsList > div:nth-child(2) select'], [13700, '[data-demo-option]'],
                [15400, '#stepsList > div:nth-child(2) select:nth-of-type(2)'], [17400, '[data-demo-option]'],
                [23000, '#btnOption'], [25100, '#chkTcpSpeed'], [28700, '#btnApplyOptions'], [35000, '#btnGenerate']]);
            for (let time = 0; time <= 42000; time += 50) {
                api.setTimelineTime(time);
                const cursor = document.querySelector('.tool-guide-cursor').getBoundingClientRect();
                const box = document.querySelector('.tool-guide-spotlight').getBoundingClientRect();
                if (![cursor.x, cursor.y, box.x, box.y].every(Number.isFinite)) failures.push(`Invalid geometry at ${time}`);
                const selector = clicks.get(time);
                if (selector) {
                    const target = document.querySelector(selector)?.getBoundingClientRect();
                    if (!target || cursor.x < target.left - 4 || cursor.x > target.right + 4 || cursor.y < target.top - 4 || cursor.y > target.bottom + 4) failures.push(`Click misses ${selector} at ${time}: cursor ${cursor.x},${cursor.y}; target ${JSON.stringify(target?.toJSON())}; box ${JSON.stringify(box.toJSON())}`);
                }
                await new Promise(requestAnimationFrame);
            }
            return failures;
        });
        assert.deepEqual(motionErrors, []);
        assert.equal((await read()).name, 'InoRobot_Demo');
        assert.match((await read()).model, /R25/);
        assert.deepEqual(errors, []);
        assert.equal(downloads, 0);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('[data-tool-guide-seek]').evaluate(el => { el.value = '16700'; el.dispatchEvent(new Event('input', { bubbles:true })); });
        assert.equal((await read()).menu, 'GetPutPeeling');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const stage = await page.locator('[data-tool-guide-stage]').boundingBox();
        const option = await frame.locator('[data-demo-option]').boundingBox();
        assert.ok(option.x >= stage.x && option.x + option.width <= stage.x + stage.width, 'Mobile option must fit inside the player');
        assert.ok(option.y >= stage.y && option.y + option.height <= stage.y + stage.height, 'Mobile option must remain visible');
        assert.ok(option.height >= 20, 'Mobile dropdown must remain readable');
        if (process.env.GUIDE_SCREENSHOT) await page.screenshot({ path:process.env.GUIDE_SCREENSHOT });
        console.log('PASS: typing, dropdowns, click arrival, full timeline, pause, rewind, project generation, mobile rendering and no downloads.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
