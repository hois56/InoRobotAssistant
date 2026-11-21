import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function videoTiming(file) {
    const blocks = [];
    let defaultDuration, clusterTime = 0;
    function parse(start, end) {
        for (let at = start; at < end;) {
            const header = stripMarker => {
                let mask = 0x80, length = 1;
                while (mask && !(file[at] & mask)) { mask >>= 1; length++; }
                const first = file[at++];
                let value = stripMarker ? first ^ mask : first;
                while (--length) value = value * 256 + file[at++];
                return value;
            };
            const id = header(false), size = header(true), next = at + size;
            if ([0x18538067, 0x1654ae6b, 0xae, 0x1f43b675].includes(id)) parse(at, next);
            if (id === 0x23e383) defaultDuration = file.readUIntBE(at, size);
            if (id === 0xe7) clusterTime = file.readUIntBE(at, size);
            if (id === 0xa3) blocks.push(clusterTime + file.readInt16BE(at + 1));
            at = next;
        }
    }
    parse(0, file.length);
    return { defaultDuration, blocks };
}

test('저장한 녹화 파일을 잘라 이어 붙이고 지정 프레임부터 스톱워치를 넣어 저장한다', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/2_3DSimulation/');
    await page.locator('[data-panel-toggle="view-presets-panel"]').click();
    const edit = page.locator('#view-record-edit');
    const [recordBox, editBox] = await Promise.all([page.locator('#view-record').boundingBox(), edit.boundingBox()]);
    expect(Math.abs(recordBox.width - editBox.width)).toBeLessThan(1);
    expect(recordBox.y).toBe(editBox.y);
    await edit.click();
    const editor = page.locator('#recording-editor');
    const field = name => editor.locator('[data-edit="' + name + '"]');
    await expect(field('empty')).toBeVisible();
    const bytes = await page.evaluate(async () => {
        const { encodeVideo, selectFormat } = await import('/2_3DSimulation/recording-video.mjs');
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 180;
        const context = canvas.getContext('2d');
        const colors = ['#c02020', '#20c020', '#2020c0', '#c08020', '#a020a0'];
        const blob = await encodeVideo({ width: 320, height: 180, config: await selectFormat(320, 180), count: 60,
            draw(frame) {
                context.fillStyle = colors[Math.floor(frame / 12)];
                context.fillRect(0, 0, 320, 180);
                return canvas;
            }, progress() {}
        });
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await field('file').setInputFiles({ name: 'simulation.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
    const seek = field('seek');
    await expect(seek).toHaveAttribute('max', '60');
    await expect(field('delete-piece')).toBeDisabled();
    await expect(editor.locator('[data-edit="mark-in"], [data-edit="mark-out"]')).toHaveCount(0);
    const pieces = field('pieces').locator('[data-piece]');
    const handle = edge => editor.locator('[data-edge="' + edge + '"]');
    async function dragEdge(edge, delta, cancel = false) {
        await handle(edge).scrollIntoViewIfNeeded();
        const [grip, track] = await Promise.all([handle(edge).boundingBox(), field('pieces').boundingBox()]);
        const length = Number(await seek.getAttribute('max'));
        const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + delta * track.width / length, y, { steps: 6 });
        const dragged = await handle(edge).boundingBox();
        expect(Math.abs(dragged.x - grip.x - delta * track.width / length)).toBeLessThan(2);
        if (cancel) await page.keyboard.press('Escape');
        await page.mouse.up();
    }
    const at = frame => seek.evaluate((input, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, frame);
    await at(30); await field('clock').click();
    await at(33); await field('clock-end').click();
    await expect.poll(() => field('filmstrip').evaluate(canvas => {
        const ctx = canvas.getContext('2d');
        const pixel = x => [...ctx.getImageData(x, canvas.height / 2, 1, 1).data];
        return pixel(1)[0] > 150 && pixel(canvas.width - 2)[2] > 100;
    })).toBe(true);
    await handle('start').click();
    await expect(seek).toHaveValue('0');
    await dragEdge('start', 8, true);
    await expect(editor).toBeVisible();
    await expect(seek).toHaveAttribute('max', '60');
    await dragEdge('start', 6);
    await expect(seek).toHaveAttribute('max', '54');
    await dragEdge('end', -6);
    await expect(seek).toHaveAttribute('max', '48');
    await expect(field('clock-time')).toHaveText('00:00.40');
    await handle('end').press('ArrowRight');
    await expect(seek).toHaveAttribute('max', '49');
    await field('undo').click();
    await expect(seek).toHaveAttribute('max', '48');
    await at(6); await field('split').click();
    await expect(field('split')).toBeDisabled();
    const ruler = await field('ruler').boundingBox();
    await page.mouse.click(ruler.x + ruler.width * 18 / 48, ruler.y + 8);
    await expect(seek).toHaveValue('18');
    await seek.press('s');
    await expect(pieces).toHaveCount(3);
    await expect(field('pieces')).toHaveText('');
    const widths = await pieces.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width /
        node.parentElement.getBoundingClientRect().width));
    [6, 12, 30].forEach((n, i) => expect(widths[i]).toBeCloseTo(n / 48, 2));
    await expect(seek).toHaveAttribute('max', '48');
    await pieces.nth(1).click();
    await expect(pieces.nth(1)).toHaveClass(/is-selected/);
    await field('keep-piece').click();
    await expect(seek).toHaveAttribute('max', '12');
    await field('undo').click();
    await expect(seek).toHaveAttribute('max', '48');
    await pieces.nth(1).click();
    await field('delete-piece').click();
    await expect(pieces).toHaveCount(2);
    await expect(seek).toHaveAttribute('max', '36');
    await expect(field('clock-time')).toHaveText('00:00.20');
    await expect(field('clock-end-time')).toHaveText('00:00.25');
    await field('clear-clock').click();
    await expect(field('clear-clock')).toBeDisabled();
    await field('undo').click();
    await expect(field('clock-time')).toHaveText('00:00.20');
    await field('close').click();
    await edit.click();
    await expect(seek).toHaveAttribute('max', '36');
    await at(0); await field('play').click();
    await expect(seek).toHaveValue('36');
    await seek.focus(); await seek.press('ArrowLeft');
    await expect(seek).toHaveValue('35');
    await field('file').setInputFiles({ name: 'damaged.webm', mimeType: 'video/webm', buffer: Buffer.from('damaged') });
    await expect(field('status')).toHaveText('녹화 파일을 열 수 없습니다.');
    const downloading = page.waitForEvent('download');
    await field('save').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('simulation-edited.webm');
    const file = await readFile(await download.path());
    const timing = videoTiming(file);
    expect(timing.blocks).toEqual(Array.from({ length: 36 }, (_, i) => Math.floor(Math.round(i * 1e6 / 60) / 1000)));
    expect(Math.abs(timing.defaultDuration - 1e9 / 60)).toBeLessThan(1);
    const inspect = file => page.evaluate(async data => {
        const video = document.createElement('video');
        const loaded = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
        video.src = 'data:video/webm;base64,' + data;
        await loaded;
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 180;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const samples = [];
        for (const frame of [5, 6, 11, 12, 15, 17, 18, 30]) {
            const sought = new Promise(resolve => { video.onseeked = resolve; });
            video.currentTime = (frame + 0.5) / 60;
            await sought;
            ctx.drawImage(video, 0, 0);
            const center = [...ctx.getImageData(160, 90, 1, 1).data].slice(0, 3);
            const region = ctx.getImageData(225, 0, 95, 35).data;
            const digits = [];
            for (let i = 0; i < region.length; i += 4) {
                if (region[i] > 170 && region[i + 1] > 170 && region[i + 2] > 170) digits.push(i / 4);
            }
            samples.push({ center, digits });
        }
        return { samples, width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    }, file.toString('base64'));
    const result = await inspect(file);
    expect([result.width, result.height]).toEqual([320, 180]);
    expect(result.duration).toBeCloseTo(0.6, 3);
    const red = [192,32,32], blue = [32,32,192], yellow = [192,128,32], purple = [160,32,160];
    const expected = [red, blue, blue, blue, blue, blue, yellow, purple];
    result.samples.forEach(({ center, digits }, index) => {
        expect(Math.max(...center.map((value, channel) => Math.abs(value - expected[index][channel])))).toBeLessThan(20);
        if (index < 3) expect(digits).toHaveLength(0);
        else expect(digits.length).toBeGreaterThan(10);
    });
    // VP8 may move a few antialiased edge pixels across the brightness threshold.
    function changedDigitPixels(a, b) {
        const left = new Set(a.digits), right = new Set(b.digits);
        return a.digits.filter(p => !right.has(p)).length + b.digits.filter(p => !left.has(p)).length;
    }
    expect(changedDigitPixels(result.samples[3], result.samples[4])).toBeGreaterThan(5);
    expect(changedDigitPixels(result.samples[4], result.samples[5])).toBeLessThanOrEqual(3);
    await field('hide-clock').check();
    const hiddenDownload = page.waitForEvent('download');
    await field('save').click();
    const hidden = await inspect(await readFile(await (await hiddenDownload).path()));
    expect(hidden.samples[3].digits.length).toBeGreaterThan(10);
    for (const sample of hidden.samples.slice(4)) expect(sample.digits).toHaveLength(0);
});

test('녹화 중 되감기와 라이브, 정지·재개·종료·저장, 마지막 녹화 선택이 독립적으로 동작한다', async ({ page }) => {
    test.setTimeout(90_000);
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()) + '\nwindow.__review = {state, THREE};' });
    });
    const downloads = [];
    page.on('download', download => downloads.push(download));
    await page.goto('/2_3DSimulation/');
    await page.waitForFunction(() => window.__review?.state.renderer);
    await page.locator('[data-panel-toggle="view-presets-panel"]').click();
    const start = page.locator('#view-record');
    await expect(page.locator('#view-record-pause')).toHaveCount(0);
    const end = page.locator('#view-record-end'), save = page.locator('#view-record-save');
    const edit = page.locator('#view-record-edit'), dialog = page.locator('#recording-editor');
    const field = name => dialog.locator('[data-edit="' + name + '"]');
    await expect(save).toBeDisabled();
    await page.evaluate(() => {
        const {state, THREE} = window.__review;
        state.renderer.setPixelRatio(0.25);
        const aspect = state.renderer.domElement.width / state.renderer.domElement.height;
        state.scene = new THREE.Scene();
        state.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
        state.camera.position.z = 1;
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(10, 4),
            new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false }));
        state.scene.add(tile);
        window.__review.tile = tile;
    });
    const inspectChannel = channel => field('preview').evaluate((canvas, channel) =>
        canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[channel], channel);
    const size = async () => Number(await field('seek').getAttribute('max'));
    const at = frame => field('seek').evaluate((el, f) => {
        el.value = String(f); el.dispatchEvent(new Event('input', { bubbles: true }));
    }, frame);
    await start.click();
    await expect(start).toHaveText('녹화 정지');
    await expect(start).toHaveAttribute('aria-pressed', 'true');
    await edit.click();
    await expect(field('live')).toHaveAttribute('aria-pressed', 'true');
    expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(false);
    await expect.poll(() => inspectChannel(0)).toBeGreaterThan(160);
    await page.evaluate(() => window.__review.tile.material.color.setHex(0x0000ff));
    await expect.poll(() => inspectChannel(2)).toBeGreaterThan(160);
    await at(0);
    await expect.poll(() => inspectChannel(0)).toBeGreaterThan(160);
    const earlier = await size();
    await expect.poll(size).toBeGreaterThan(earlier + 2);
    await expect(field('seek')).toHaveValue('0');
    await at(2); await field('split').click();
    await field('live').click();
    await expect.poll(() => inspectChannel(2)).toBeGreaterThan(160);
    await start.click();
    await expect(start).toHaveText('녹화 재개');
    await expect(start).toHaveAttribute('aria-pressed', 'false');
    const paused = await size();
    await page.evaluate(() => window.__review.tile.material.color.setHex(0x00ff00));
    await page.waitForTimeout(240);
    expect(await size()).toBe(paused);
    expect(await inspectChannel(2)).toBeGreaterThan(160);
    await at(1); await field('clock').click();
    await at(4); await field('clock-end').click();
    const editReady = page.waitForEvent('download');
    await field('save').click();
    await start.click();
    await field('live').click();
    await expect.poll(() => inspectChannel(1)).toBeGreaterThan(160);
    const partial = await editReady;
    expect(partial.suggestedFilename()).toMatch(/-edited\.webm$/);
    expect(videoTiming(await readFile(await partial.path())).blocks.length).toBe(paused);
    await expect.poll(size).toBeGreaterThan(paused + 2);
    await end.click();
    await expect(start).toHaveText('녹화 시작');
    await expect(field('source')).toHaveValue('last');
    const finished = await size();
    expect(downloads).toEqual([partial]);
    const rawReady = page.waitForEvent('download');
    await save.click();
    await at(0);
    expect(await inspectChannel(0)).toBeGreaterThan(160);
    const raw = await rawReady;
    const rawFile = await readFile(await raw.path());
    expect(videoTiming(rawFile).blocks.length).toBe(finished);
    const adjoining = await page.evaluate(async ({ bytes, paused }) => {
        const video = document.createElement('video');
        const loaded = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
        video.src = 'data:video/webm;base64,' + bytes;
        await loaded;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }), colors = [];
        for (const f of [paused - 1, paused + 1]) {
            const ready = new Promise(resolve => { video.onseeked = resolve; });
            video.currentTime = (f + 0.5) / 60;
            await ready;
            ctx.drawImage(video, 0, 0, 2, 2);
            colors.push([...ctx.getImageData(0, 0, 1, 1).data]);
        }
        return colors;
    }, { bytes: rawFile.toString('base64'), paused });
    expect(adjoining[0][2]).toBeGreaterThan(190);
    expect(adjoining[1][1]).toBeGreaterThan(190);
    await start.click();
    await expect(field('source')).toHaveValue('current');
    await at(1); await field('split').click();
    await field('source').selectOption('last');
    await expect(field('pieces').locator('[data-piece]')).toHaveCount(2);
    await expect(field('pieces').locator('.is-selected')).toHaveCount(1);
    expect(await size()).toBe(finished);
    const prefixReady = page.waitForEvent('download');
    await save.click();
    const prefix = videoTiming(await readFile(await (await prefixReady).path())).blocks.length;
    expect(await page.evaluate(() => window.__review.state.viewRecording.active)).toBe(true);
    await field('source').selectOption('current');
    await expect.poll(size).toBeGreaterThan(prefix);
    // Keep the trim scale steady while the recorder continues sampling in the background.
    await at(4);
    const grip = await dialog.locator('[data-edge="end"]').boundingBox();
    const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    const held = await size();
    await page.mouse.move(x - 60, y, { steps: 5 });
    await page.waitForTimeout(160);
    expect(await size()).toBe(held);
    expect(await page.evaluate(() => window.__review.state.viewRecording.active)).toBe(true);
    // The transport can also be operated from the popped-out View panel during a drag.
    await start.evaluate(button => button.click());
    await expect(start).toHaveText('녹화 재개');
    await page.mouse.up();
    await expect(field('pieces').locator('[data-piece]')).toHaveCount(3);
    await field('undo').click();
    await expect(field('pieces').locator('[data-piece]')).toHaveCount(2);
    await end.click();
    await field('close').click();
});

test('녹화 중 시점을 오갈 때 추가된 물체와 형상 변경을 되감고 원본을 보존한다', async ({ page }) => {
    await page.goto('/2_3DSimulation/');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { SceneRecording } = await import('/2_3DSimulation/scene-recording.mjs?v=20261120-4');
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
        mesh.name = 'mesh'; scene.add(mesh);
        const vertices = mesh.geometry.attributes.position;
        const initial = vertices.getX(0);
        const rec = new SceneRecording(() => null);
        rec.sample(scene, camera, 0);
        mesh.position.x = 4;
        const group = new THREE.Group(); group.name = 'later'; scene.add(group); group.add(mesh);
        vertices.setX(0, 7); vertices.needsUpdate = true;
        rec.sample(scene, camera, 100);
        function read(t) {
            rec.play(t);
            const item = rec.scene.getObjectByName('mesh');
            return [!!rec.scene.getObjectByName('later'), item.position.x, item.geometry.attributes.position.getX(0)];
        }
        const frames = [read(100), read(0)];
        // Continue collecting while reviewing the beginning.
        mesh.position.x = 8;
        vertices.setX(0, 9); vertices.needsUpdate = true;
        rec.sample(scene, camera, 200);
        frames.push(read(200), read(150), read(0), read(200));
        rec.dispose();
        return { initial, frames, live: [mesh.position.x, vertices.getX(0), mesh.parent.name] };
    });
    expect(result.live).toEqual([8, 9, 'later']);
    expect(result.frames).toEqual([[true,4,7], [false,0,result.initial], [true,8,9],
        [true,6,7], [false,0,result.initial], [true,8,9]]);
});

for (const fallback of [false, true]) {
    test(`뷰 녹화는 세로 구도를 유지하며 넓은 화면의 좌우를 잘라 16:9, 60fps로 저장한다 (${fallback ? 'WebP' : 'WebCodecs'})`, async ({ page }) => {
        test.setTimeout(90_000);
        if (fallback) await page.addInitScript(() => Object.defineProperty(window, 'VideoEncoder', { value: undefined }));
        await page.route('**/2_3DSimulation/main.js*', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: (await response.text()) + '\nwindow.__recordTest = { state, THREE };' });
        });
        await page.goto('/2_3DSimulation/index.html');
        await page.waitForFunction(() => window.__recordTest?.state.renderer);
        await page.locator('[data-panel-toggle="view-presets-panel"]').click();
        const record = page.locator('#view-record');
        await expect(record).toBeVisible();
        await expect(page.locator('.view-presets-help')).toHaveCount(0);
        await page.locator('[data-view-monitor]').first().click();
        await expect(page.locator('#view-window')).toBeVisible();
        await page.addStyleTag({ content: '#canvas-container::after { content:""; position:absolute; inset:0; background:#ff00ff; z-index:99999; pointer-events:none; }' });
        const size = await page.evaluate(useOrtho => {
            const { state, THREE } = window.__recordTest;
            const canvas = state.renderer.domElement;
            // Keep the browser test fast while retaining the full viewport aspect.
            state.renderer.setPixelRatio(0.4);
            const aspect = canvas.width / canvas.height;
            state.scene = new THREE.Scene();
            state.scene.background = new THREE.Color(0x181818);
            state.camera = useOrtho ? new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10)
                : new THREE.PerspectiveCamera(90, aspect, 0.1, 10);
            state.camera.position.z = 1;
            function guide(x, y, width, height, color) {
                const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
                    new THREE.MeshBasicMaterial({ color, toneMapped: false }));
                mesh.position.set(x, y, 0);
                state.scene.add(mesh);
            }
            for (const sign of [-1, 1]) {
                guide(0, sign * 0.88, 0.4, 0.14, 0x0000ff);
                guide(sign * (aspect + 16 / 9) / 2, 0, 0.08, 1, 0xff0000);
            }
            const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5),
                new THREE.MeshBasicMaterial({ color: 0x00ff00, toneMapped: false }));
            marker.position.x = -aspect / 2;
            marker.userData.self = marker; // robot metadata may be circular
            state.scene.add(marker);
            window.__recordTest.marker = marker;
            return { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth,
                extraHeight: innerHeight - canvas.clientHeight, viewportWidth: innerWidth };
        }, fallback);
        expect(size.width / size.height).toBeGreaterThan(2);
        await record.click();
        await expect(record).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#view-record-edit')).toBeEnabled();
        const motion = await page.evaluate(() => {
            const { state, marker } = window.__recordTest;
            const begin = performance.now();
            state.viewRecording.sample(begin);
            while (performance.now() - begin < 450) { /* Deliberately miss display refreshes. */ }
            marker.position.x = -marker.position.x;
            const end = performance.now();
            state.viewRecording.sample(end);
            return { begin, end };
        });
        // Keep recording through an actual resize to a narrower 16:10 viewport.
        await page.setViewportSize({ width: size.viewportWidth, height: size.extraHeight + Math.round(size.cssWidth * 10 / 16) });
        await page.waitForFunction(() => {
            const camera = window.__recordTest.state.camera;
            const aspect = camera.isPerspectiveCamera ? camera.aspect : (camera.right - camera.left) / (camera.top - camera.bottom);
            return Math.abs(aspect - 1.6) < 0.005;
        });
        const stop = await page.evaluate(async () => {
            window.__recordTest.state.viewRecording.sample(performance.now());
            await new Promise(resolve => setTimeout(resolve, 120));
            const now = performance.now();
            document.getElementById('view-record-end').click();
            return now;
        });
        const downloading = page.waitForEvent('download');
        await page.locator('#view-record-save').click();
        const download = await downloading;
        expect(download.suggestedFilename()).toMatch(/\.webm$/);
        const file = await readFile(await download.path());
        const { defaultDuration, blocks } = videoTiming(file);
        expect(Math.abs(defaultDuration - 1e9 / 60)).toBeLessThan(1);
        expect(blocks.length).toBeGreaterThanOrEqual(27);
        expect(blocks).toEqual(blocks.map((_, i) => Math.floor(Math.round(i * 1e6 / 60) / 1000)));
        const result = await page.evaluate(async ({ base64, motion, stop }) => {
            const video = document.createElement('video');
            const ready = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
            video.src = 'data:video/webm;base64,' + base64;
            await ready;
            const canvas = document.createElement('canvas');
            canvas.width = 160; canvas.height = 90;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            async function pixelsAt(time) {
                const sought = new Promise(resolve => { video.onseeked = resolve; });
                video.currentTime = time;
                await sought;
                context.drawImage(video, 0, 0, 160, 90);
                return context.getImageData(0, 0, 160, 90).data;
            }
            function hasVerticalGuides(data) {
                return [5, 84].every(y => data[(y * 160 + 80) * 4 + 2] > 150);
            }
            const centers = [];
            let overlay = 0, outside = 0, verticalGuides = true;
            for (const fraction of [0.2, 0.5, 0.8]) {
                const time = motion.begin + fraction * (motion.end - motion.begin);
                const data = await pixelsAt(video.duration - (stop - time) / 1000);
                verticalGuides &&= hasVerticalGuides(data);
                let sum = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] > 160 && data[i + 2] > 160 && data[i + 1] < 90) overlay++;
                    if (data[i] > 160 && data[i + 1] < 90 && data[i + 2] < 90) outside++;
                    if (data[i + 1] > 150 && data[i] < 80 && data[i + 2] < 80) { sum += i / 4 % 160; count++; }
                }
                centers.push(sum / count);
            }
            const narrow = await pixelsAt(video.duration - 0.05);
            const black = x => narrow[(30 * 160 + x) * 4] < 10;
            return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, centers, overlay,
                outside, verticalGuides: verticalGuides && hasVerticalGuides(narrow), narrowEdges: [1, 12, 147, 158].map(black) };
        }, { base64: file.toString('base64'), motion, stop });
        expect(result.width * 9).toBe(result.height * 16);
        expect(Math.abs(result.height - size.height)).toBeLessThanOrEqual(9);
        expect(Math.abs(result.duration - blocks.length / 60)).toBeLessThan(0.002);
        expect(result.overlay).toBe(0);
        expect(result.outside).toBe(0);
        expect(result.verticalGuides).toBe(true);
        expect(result.narrowEdges).toEqual([true, false, false, true]);
        expect(Math.abs(result.centers[1] - 80)).toBeLessThan(8);
        expect(result.centers[1] - result.centers[0]).toBeGreaterThan(10);
        expect(result.centers[2] - result.centers[1]).toBeGreaterThan(10);
        await expect(record).toHaveAttribute('aria-pressed', 'false');
        await expect(record).toBeEnabled();
        await page.locator('#view-record-edit').click();
        const editor = page.locator('#recording-editor');
        await expect(editor).toBeVisible();
        await expect(editor.locator('[data-edit="seek"]')).toHaveAttribute('max', String(blocks.length));
        await editor.locator('[data-edit="close"]').click();
        await expect(record).toBeEnabled();
    });
}
