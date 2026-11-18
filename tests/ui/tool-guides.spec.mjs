import {test, expect} from '@playwright/test';

// The home "사용 방법" guides (0_Home/tool-guide.js + 0_Home/tool-guide-embed.js) replay the real
// 1_RobotModelSelect, 3D Simulation, 3_ToolSelector, 4_ProjectGenerator and 6_Document pages step by step.
// Every step must name its target (lit area + label), show its own caption, and leave the page in the
// state the caption describes, also after seeking.
const homePage = '/0_Home/ko/index.html';

async function openGuide(page, key) {
    await page.goto(homePage);
    await page.waitForFunction(() => window.ToolGuide);
    await page.evaluate(guide => window.ToolGuide.open(guide), key);
    await page.waitForFunction(() => window.ToolGuide.getState().frameReady, null, {timeout: 90_000});
    await page.evaluate(() => window.ToolGuide.pause());
    return page.evaluate(() => window.ToolGuide.getState());
}

const guideState = page => page.evaluate(() => {
    const state = window.ToolGuide.getState();
    const stage = document.querySelector('[data-tool-guide-stage]').getBoundingClientRect();
    const callout = document.querySelector('.manual-guide-callout').getBoundingClientRect();
    return {
        ...state,
        caption: document.querySelector('[data-tool-guide-caption-title]').textContent,
        counter: document.querySelector('.manual-guide-caption-step').textContent,
        calloutInside: callout.left >= stage.left - 1 && callout.right <= stage.right + 1 && callout.top >= stage.top - 1 && callout.bottom <= stage.bottom + 1
    };
});

async function seek(page, time) {
    await page.evaluate(value => window.ToolGuide.seekTo(value), time);
    await page.waitForTimeout(150);
}

// Walk every step: the frame runs that step, the caption counts it, and the target is lit and labelled.
async function walkSteps(page, opened) {
    const {steps, duration} = opened;
    for (const [index, step] of steps.entries()) {
        const end = steps[index + 1]?.at ?? duration;
        await seek(page, Math.min(end - 200, step.at + 1500));
        await expect.poll(async () => (await guideState(page)).child?.step, {message: step.id}).toBe(step.id);
        // A seek replays earlier steps; one that reads a CAD file finishes a moment later.
        await expect.poll(async () => (await guideState(page)).overlay.focus, {message: `${step.id} lights its target`}).toBe(true);
        const state = await guideState(page);
        expect(state.counter, step.id).toBe(`${index + 1} / ${steps.length}`);
        expect(state.caption.length, step.id).toBeGreaterThan(0);
        expect(state.overlay.callout, `${step.id} label`).toBe(state.caption);
        expect(state.calloutInside, `${step.id} label stays on stage`).toBe(true);
    }
}

// The shared theme keeps the site header sticky above page content; the guide must still cover it,
// or its title and close button sit behind the INOVANCE logo once the home page is scrolled.
// Chromium hit-testing misses the sticky header here, so compare the stacking order directly.
test('가이드 창의 제목과 닫기 버튼은 고정된 사이트 헤더에 가려지지 않는다', async ({page}) => {
    await page.setViewportSize({width: 1600, height: 900});
    await page.goto(homePage);
    await page.waitForFunction(() => window.ToolGuide);
    await page.evaluate(() => {
        window.scrollTo(0, 400);
        window.ToolGuide.open('tool');
    });
    const close = page.locator('#tool-guide-modal .manual-guide-close');
    await expect(close).toBeVisible();
    const layers = await page.evaluate(() => {
        const header = document.querySelector('body > header.site-header');
        const dialog = document.querySelector('#tool-guide-modal .manual-guide-dialog').getBoundingClientRect();
        return {
            guide: Number(getComputedStyle(document.getElementById('tool-guide-modal')).zIndex),
            header: Number(getComputedStyle(header).zIndex),
            overlaps: dialog.top < header.getBoundingClientRect().bottom
        };
    });
    expect(layers.overlaps, 'the dialog top reaches the header band at this size').toBe(true);
    expect(layers.guide).toBeGreaterThan(layers.header);
    await close.click();
    await expect(page.locator('#tool-guide-modal')).not.toHaveClass(/is-open/);
});

const childData = (page, key) => page.evaluate(guide => window.ToolGuide.getState().child?.[guide], key);
const timeOf = (opened, id) => opened.steps.find(step => step.id === id).at;

test('홈의 사용 방법은 밝은 배경에서 재생하고 좁은 화면에서도 단계를 이동할 수 있다', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(homePage);
    const trigger = page.locator('button[data-tool-guide="document"]');
    await trigger.click();
    const guide = page.locator('#tool-guide-modal').getByRole('dialog');
    await expect(guide).toHaveCSS('background-color', 'rgb(253, 254, 251)');
    await expect(guide.locator('.manual-guide-header')).toHaveCSS('background-color', 'rgb(250, 250, 246)');
    await expect(guide.locator('[data-tool-guide-next]')).toHaveCSS('background-color', 'rgb(253, 254, 251)');
    await expect(guide.locator('[data-tool-guide-launch]')).toHaveCSS('background-color', 'rgb(48, 71, 53)');
    await page.waitForFunction(() => window.ToolGuide.getState().frameReady);
    await guide.locator('[data-tool-guide-play]').click();
    for (const width of [1440, 360]) {
        await page.setViewportSize({width, height: 800});
        const stage = await guide.locator('[data-tool-guide-stage]').boundingBox();
        const mask = await guide.locator('.manual-guide-focus svg').boundingBox();
        expect(mask.width).toBeCloseTo(stage.width, 0);
        expect(mask.height).toBeCloseTo(stage.height, 0);
        for (const selector of ['[data-tool-guide-close]', '[data-tool-guide-play]', '[data-tool-guide-next]', '[data-tool-guide-launch]']) {
            await expect(guide.locator(selector)).toBeInViewport({ratio: 1});
        }
    }
    const next = guide.locator('[data-tool-guide-next]');
    await next.click();
    await expect(guide.locator('.manual-guide-caption-step')).toHaveText(/^2 \/ /);
    await guide.locator('[data-tool-guide-previous]').click();
    await expect(guide.locator('.manual-guide-caption-step')).toHaveText(/^1 \/ /);
    await guide.locator('[data-tool-guide-close]').click();
    await expect(trigger).toBeFocused();
});

// Once a click opens a window, that window is lit (not the card behind it) and the click ring is gone.
// On a stage that already shows the whole page at a readable size, the picture never pans or zooms.
test('열린 창을 강조하고 읽을 수 있는 크기에서는 화면을 움직이지 않는다', async ({page}) => {
    await page.setViewportSize({width: 1600, height: 900});
    const opened = await openGuide(page, 'model');
    const cameras = new Set();
    for (const [index, step] of opened.steps.entries()) {
        await seek(page, (opened.steps[index + 1]?.at ?? opened.duration) - 250);
        const camera = (await guideState(page)).camera;
        cameras.add([camera.scale, camera.left, camera.top].map(value => value.toFixed(2)).join(','));
        if (step.id !== 'model_open') continue;
        const lit = await page.evaluate(() => {
            const frame = document.getElementById('tool-guide-frame');
            const focus = frame.contentWindow.InoRobotToolManual.getFocusRect();
            const modal = frame.contentDocument.querySelector('#options-modal .modal-content').getBoundingClientRect();
            return {
                offset: Math.max(Math.abs(focus.left - modal.left), Math.abs(focus.top - modal.top), Math.abs(focus.width - modal.width), Math.abs(focus.height - modal.height)),
                ring: window.ToolGuide.getState().child.ringVisible
            };
        });
        expect(lit.offset, 'the opened detail window is lit').toBeLessThan(2);
        expect(lit.ring, 'the click ring is gone after the click').toBe(false);
    }
    expect([...cameras]).toHaveLength(1);
});

// On a laptop-sized window (a stage of about 1200x440) the picture used to zoom and pan at every step
// while the page inside also scrolled, and step changes flickered. The picture now stays put at a
// readable size with a shorter page window, and only the page scrolls.
test('노트북 크기 화면에서도 가이드 화면을 확대·이동하지 않고 페이지만 스크롤한다', async ({page}) => {
    await page.setViewportSize({width: 1536, height: 730});
    const opened = await openGuide(page, 'tool');
    const cameras = new Set();
    let frameHeight = 0;
    for (const [index, step] of opened.steps.entries()) {
        await seek(page, (opened.steps[index + 1]?.at ?? opened.duration) - 250);
        await expect.poll(async () => (await guideState(page)).overlay.focus, {message: `${step.id} lights its target`}).toBe(true);
        const {camera, frame} = await guideState(page);
        cameras.add([camera.scale, camera.left, camera.top].map(value => value.toFixed(2)).join(','));
        frameHeight = frame.height;
    }
    expect([...cameras], 'the picture never zooms or pans').toHaveLength(1);
    expect(Number([...cameras][0].split(',')[0]), 'the page is shown at a readable size').toBeGreaterThanOrEqual(0.79);
    expect(frameHeight, 'a short stage gets a shorter page window').toBeLessThan(720);
});

test('Tool Selector 가이드는 모드 D로 STEP CAD를 불러와 질량 특성과 로봇 적합성을 보여 준다', async ({page}) => {
    const opened = await openGuide(page, 'tool');
    await walkSteps(page, opened);
    await seek(page, timeOf(opened, 'tool_overall') + 1500);
    await expect.poll(async () => (await childData(page, 'tool')).overall, {timeout: 20_000}).toContain('적합');
    const done = await childData(page, 'tool');
    expect(done).toMatchObject({mode: 'cad', parts: 8, material: 'brass', tcp: '100', robot: 'S4'});
    expect(parseFloat(done.mass)).toBeGreaterThan(0.2);
    // Rewinding clears the CAD and returns to the page's first mode.
    await seek(page, 0);
    await expect.poll(async () => (await childData(page, 'tool')).parts).toBe(0);
    expect((await childData(page, 'tool')).mode).toBe('direct');
});

test('Project Generator 가이드는 공정을 추가하고 실제 ZIP을 만든다', async ({page}) => {
    const opened = await openGuide(page, 'project');
    await walkSteps(page, opened);
    await seek(page, timeOf(opened, 'project_add') + 2000);
    expect((await childData(page, 'project')).rows).toBe(2);
    await seek(page, opened.duration - 300);
    await expect.poll(async () => (await childData(page, 'project')).package?.name, {timeout: 20_000}).toBe('InoRobot_Demo.zip');
});

test('Document 가이드는 분류를 펼쳐 검색하고 미리보기 뒤 내려받는다', async ({page}) => {
    const opened = await openGuide(page, 'document');
    await walkSteps(page, opened);
    await seek(page, timeOf(opened, 'doc_search') + 3000);
    expect((await childData(page, 'document')).query).toBe('IR-S4');
    await seek(page, timeOf(opened, 'doc_preview') + 2000);
    expect((await childData(page, 'document')).preview).toBe(true);
    await seek(page, timeOf(opened, 'doc_download') + 2500);
    await expect.poll(async () => (await page.evaluate(() => window.ToolGuide.getState().child.toast))).toMatch(/\.pdf$/i);
    expect((await childData(page, 'document')).preview).toBe(false);
});

test('Robot Model Select 가이드는 필터·옵션·구매 코드·다운로드를 단계마다 보여 준다', async ({page}) => {
    const opened = await openGuide(page, 'model');
    await walkSteps(page, opened);
    await seek(page, timeOf(opened, 'model_code') + 1500);
    const configured = await childData(page, 'model');
    expect(configured.productId).toBe('IR-R25-178S-INT');
    expect(configured.options).toMatchObject({cableType: 'High Flex (유연형)', pendant: 'without-cover', communication: 'IRCB501-2PN-BD'});
    await seek(page, timeOf(opened, 'model_cad') + 2000);
    expect(await page.evaluate(() => window.ToolGuide.getState().child.toast)).toBe('Inovance_CAD_IR-R25-178S-INT.zip');
    await seek(page, 0);
    await expect.poll(async () => (await childData(page, 'model')).modalOpen).toBe(false);
});

// Plays the guide frame by frame inside one task, the way the player does while playing (no forced
// seek), so scroll speeds are measured exactly. Starts from where the player is paused; afterwards
// the paused player rewinds the page to its own time, so check the page through the samples.
const playFrames = (page, from, to, frameMs = 20) => page.evaluate(({from, to, frameMs}) => {
    const frame = document.getElementById('tool-guide-frame');
    const api = frame.contentWindow.InoRobotToolManual;
    const doc = frame.contentDocument;
    const {steps, activeCue} = window.ToolGuide.getState();
    const samples = [];
    let cue = activeCue;
    api.setPaused(false);
    for (let t = from; t <= to; t += frameMs) {
        const step = steps.filter(item => t >= item.at).pop();
        if (step.id !== cue) {
            cue = step.id;
            api.renderTimelineCue(step.id, step.at);
        }
        api.setTimelineTime(t);
        samples.push({
            t, step: step.id,
            modal: doc.getElementById('modal-body')?.scrollTop ?? 0,
            page: frame.contentWindow.scrollY,
            comm: doc.querySelector('#modal-body input[name="commSelection"]:checked')?.value || null,
            marks: doc.querySelectorAll('[data-guide-mark]').length,
            preview: Boolean(doc.querySelector('.model-manual-document-viewer'))
        });
    }
    api.setPaused(true);
    return samples;
}, {from, to, frameMs});

const peakSpeed = (samples, key) => Math.max(0, ...samples.slice(1).map((sample, index) => Math.abs(sample[key] - samples[index][key]) / (sample.t - samples[index].t)));

// The options window is long: the guide used to scroll about 1,000-1,600 px of dense option text in
// well under a second (communication card, then back up to the purchase code), which flickered.
// Long scrolls now keep a readable speed, and the option is clicked only after it has arrived.
test('Robot Model Select 가이드는 긴 옵션 창도 읽을 수 있는 속도로 스크롤한다', async ({page}) => {
    await page.setViewportSize({width: 1536, height: 730});
    const opened = await openGuide(page, 'model');
    const from = timeOf(opened, 'model_pendant') + 1500;
    await seek(page, from);
    const samples = await playFrames(page, from, timeOf(opened, 'model_cad') - 20);
    const comm = samples.filter(sample => sample.step === 'model_comm');
    const code = samples.filter(sample => sample.step === 'model_code');
    expect(comm.at(-1).modal - comm[0].modal, 'the communication card is far down the options window').toBeGreaterThan(600);
    expect(code[0].modal - code.at(-1).modal, 'the purchase code is back at the top').toBeGreaterThan(600);
    expect(peakSpeed(samples, 'modal'), 'peak scroll speed (px/ms)').toBeLessThanOrEqual(1.3);
    const clicked = comm.find(sample => sample.comm === 'IRCB501-2PN-BD');
    expect(clicked, 'the communication card gets picked').toBeTruthy();
    expect(clicked.modal, 'the option is clicked after the scroll has finished').toBe(comm.at(-1).modal);
    expect(code.at(-1).modal, 'the purchase code step has finished scrolling').toBe(code.at(-40).modal);
});

// Opening the spreadsheet preview used to close and rebuild the options window and the model cards
// underneath it, so the picture changed all at once as the preview started.
test('Robot Model Select 가이드는 구성 내역을 열 때 상세 창을 다시 만들지 않는다', async ({page}) => {
    await page.setViewportSize({width: 1536, height: 730});
    const opened = await openGuide(page, 'model');
    const from = timeOf(opened, 'model_excel') + 1500;
    await seek(page, from);
    // Mark one element of the options window and one model card; a rebuild would replace them.
    await page.evaluate(() => {
        const doc = document.getElementById('tool-guide-frame').contentDocument;
        doc.querySelector('#modal-body > *').dataset.guideMark = 'kept';
        doc.querySelector('#product-container [data-product-id]').dataset.guideMark = 'kept';
    });
    const samples = await playFrames(page, from, timeOf(opened, 'model_preview') + 400);
    expect(samples.at(-1).preview, 'the preview is open').toBe(true);
    expect(samples.filter(sample => sample.marks !== 2).map(sample => `${sample.step} +${sample.t}`), 'the options window and the cards stay the same elements').toEqual([]);
    expect(samples.at(-1).comm, 'the chosen options stay chosen').toBe('IRCB501-2PN-BD');
});

test('3D Simulation 가이드는 Test 모델 수량 입력과 반복 운전까지 보여 준다', async ({page}) => {
    test.setTimeout(240_000);
    const opened = await openGuide(page, 'simulation');
    await walkSteps(page, opened);
    await seek(page, timeOf(opened, 'sim_test_import') + 1800);
    const picker = await page.evaluate(() => {
        const doc = document.getElementById('tool-guide-frame').contentDocument;
        return {
            cards: doc.querySelectorAll('#test-model-dialog [data-test-quantity]').length,
            confirmEnabled: !doc.getElementById('btn-confirm-test-model').disabled
        };
    });
    expect(picker.cards).toBeGreaterThan(0);
    expect(picker.confirmEnabled).toBe(true);
    await seek(page, timeOf(opened, 'sim_watch') + 4000);
    const simulation = await childData(page, 'simulation');
    expect(simulation.programSteps).toBe(2);
    expect(simulation.repeat).toBe(true);
    // Seeking back must reopen the picker cleanly (the app's own confirmation was resolved).
    await seek(page, timeOf(opened, 'sim_test_import') + 1800);
    await expect.poll(() => page.evaluate(() => document.getElementById('tool-guide-frame').contentDocument.getElementById('test-model-dialog').open)).toBe(true);
});
