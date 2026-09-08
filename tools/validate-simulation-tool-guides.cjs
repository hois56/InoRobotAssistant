const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
    const browser = await chromium.launch({ channel:'msedge', headless:true });
    try {
        const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:8765/');
        for (const app of ['tool', 'simulation']) {
            await page.locator(`[data-tool-guide="${app}"]`).click();
            const frame = page.frames().find(f => f.url().includes(app === 'tool' ? '/3_ToolSelector/' : '/2_3DSimulation/'));
            await frame.waitForFunction(() => window.InoRobotToolManual?.getState().prepared, null, {timeout:60000});
            if (await page.locator('[data-tool-guide-play]').getAttribute('aria-pressed') === 'true') await page.locator('[data-tool-guide-play]').click();
            const seek = time => page.locator('[data-tool-guide-seek]').evaluate((el, time) => { el.value = time; el.dispatchEvent(new Event('input', {bubbles:true})); }, time);
            const read = () => frame.evaluate(() => ({
                menu:document.querySelector('.project-guide-menu')?.textContent,
                values:Array.from(document.querySelectorAll('#d_m,#d_lx,#d_lz,#d_ixx,#d_iyy,#d_izz')).map(el => el.value),
                cursor:document.querySelector('.tool-guide-cursor').getAttribute('style'),
                box:document.querySelector('.tool-guide-spotlight').getAttribute('style')
            }));
            await seek(3000);
            const menu = await read();
            assert.match(menu.menu, app === 'tool' ? /R25/ : /IR-S4/);
            await page.waitForTimeout(350);
            assert.deepEqual(await read(), menu, `${app}: paused scene changed`);
            await page.screenshot({path:`tmp/${app}-guide-menu.png`});
            if (app === 'tool') {
                await seek(14600);
                assert.equal(await frame.locator('#d_lz').inputValue(), '12');
                await page.screenshot({path:'tmp/tool-guide-typing.png'});
                await seek(28000);
                assert.deepEqual((await read()).values, ['5','35','120','0.018','0.021','0.015']);
                assert.equal(await frame.locator('#result').evaluate(el => el.classList.contains('hide')), false);
                await seek(3000);
                assert.deepEqual(await read(), menu, 'Rewind must restore model menu and geometry');
                await seek(0);
                const failures = await frame.evaluate(() => {
                    const api = window.InoRobotToolManual, failures = [];
                    for (let time = 0; time <= 27000; time += 50) {
                        api.setTimelineTime(time);
                        if ([1750,4800,7800,10800,13800,16800,19300,21800,25900].includes(time)) {
                            const box = document.querySelector('.tool-guide-spotlight').getBoundingClientRect();
                            const cursor = document.querySelector('.tool-guide-cursor').getBoundingClientRect();
                            if (cursor.x < box.left || cursor.x > box.right || cursor.y < box.top || cursor.y > box.bottom) failures.push(time);
                        }
                    }
                    return failures;
                });
                assert.deepEqual(failures, []);
            } else {
                for (const time of [13000,22600,24200,35000,37700,39800,47000,51600,55100,59500,67000,70000]) {
                    await seek(time);
                    if (time === 24200) {
                        assert.equal(await frame.locator('dialog[open] .tool-guide-cursor').count(), 1);
                        await page.screenshot({path:'tmp/simulation-guide-confirm.png'});
                    }
                    if (time === 39800) {
                        assert.equal(await frame.locator('#guide-snap-anchor').count(), 1);
                        await page.screenshot({path:'tmp/simulation-guide-snap.png'});
                    }
                }
                await seek(8000);
                assert.equal(await frame.locator('.project-guide-menu').count(), 0);
                await seek(3000);
                assert.match((await read()).menu, /IR-S4/);
            }
            await page.locator('[data-tool-guide-close]').click();
        }
        assert.deepEqual(errors, []);
        console.log('PASS: simulation/tool menus, typing, calculation, pause, rewind and click geometry');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
