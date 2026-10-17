import { test, expect } from '@playwright/test';

test('조립 STEP의 중첩 부품은 이름과 배치 좌표를 유지한다', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/health');
    const result = await page.evaluate(async () => {
        const { OcctKernel } = await import('https://cdn.jsdelivr.net/npm/occt-wasm@5.3.4/dist/index.js');
        const kernel = await OcctKernel.init({ wasm: 'https://cdn.jsdelivr.net/npm/occt-wasm@5.3.4/dist/occt-wasm.wasm' });
        const doc = kernel.createXCAFDocument();
        let step;
        try {
            const root = doc.addShape(kernel.makeBox(10, 20, 30), { name: 'Base', color: [1, 0, 0] });
            const component = doc.addChild(root, kernel.makeBox(15, 25, 35), { name: 'Arm', location: { tx: 100 }, color: [0, 1, 0] });
            const tip = doc.addChild(doc.getReferredLabel(component), kernel.makeBox(5, 6, 7), { name: 'Tip', location: { ty: 40 }, color: [0, 0, 1] });
            step = doc.exportSTEP();
        } finally {
            doc.close();
            kernel[Symbol.dispose]();
        }
        return await new Promise((resolve, reject) => {
            const worker = new Worker('/2_3DSimulation/step-import-worker.js');
            const parts = [];
            const timeout = setTimeout(() => finish(new Error('Assembly import timeout')), 40_000);
            const finish = (error, done) => {
                clearTimeout(timeout);
                worker.terminate();
                if (error) reject(error);
                else resolve({ parts, done, step });
            };
            worker.onerror = event => finish(new Error(event.message));
            worker.onmessage = ({ data }) => {
                if (data.type === 'mesh') {
                    const mesh = data.mesh;
                    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
                    mesh.positions.forEach((value, index) => {
                        min[index % 3] = Math.min(min[index % 3], value);
                        max[index % 3] = Math.max(max[index % 3], value);
                    });
                    parts.push({ id: mesh.partId, name: mesh.partName, assemblyPath: mesh.assemblyPath, color: mesh.color, min, max });
                }
                if (data.type === 'error') finish(new Error(data.message));
                if (data.type === 'done') finish(null, data);
            };
            const fileBuffer = new TextEncoder().encode(step).buffer;
            worker.postMessage({ type: 'parse', engine: 'large', requestId: 1, fileName: 'assembly.step', fileBuffer }, [fileBuffer]);
        });
    });
    expect(result.done.segmented).toBe(true);
    expect(new Set(result.parts.map(part => part.id)).size).toBe(3);
    const tip = result.parts.find(part => part.name === 'Tip');
    expect(tip).toBeDefined();
    expect(tip.min).toEqual([100, 40, 0]);
    expect(tip.max).toEqual([105, 46, 7]);
    expect(tip.assemblyPath).toHaveLength(1);
    expect(tip.assemblyPath[0].name).toBe('Arm');

    // Exercise the same large-file path through the app using the tiny fixture.
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text())
            .replace('const STEP_LARGE_FILE_ENGINE_MIN_BYTES = 50 * MEBIBYTE;', 'const STEP_LARGE_FILE_ENGINE_MIN_BYTES = 0;')
            .replace('init();\n', 'window.__assemblyReady = init();\n');
        await route.fulfill({ response, body: source + '\nwindow.__assembly = { state, serializeWorkspaceSnapshot, restoreWorkspaceSnapshot };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__assembly);
    await page.evaluate(() => window.__assemblyReady);
    await page.locator('#input-import-3d').setInputFiles({ name: 'Nested.step', mimeType: 'application/octet-stream', buffer: Buffer.from(result.step) });
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(() => window.__assembly.state.models[0]?.userData.importedParts?.length === 3);
    await page.locator('[data-model-tree-toggle]').first().click();
    const folder = page.locator('.model-tree-cad-assembly').filter({ has: page.locator(':scope > details > summary > .model-tree-group-name', { hasText: 'Arm' }) }).first();
    await expect(folder.locator(':scope > details')).not.toHaveAttribute('open');
    await expect(page.locator('.model-tree-part-button:visible')).toHaveCount(1);
    await folder.locator(':scope > details > summary > .model-tree-toggle').click();
    await expect(page.locator('.model-tree-part-button:visible')).toHaveCount(3);
    await folder.locator(':scope > details > summary > .model-tree-group-name').click();
    expect(await page.evaluate(() => window.__assembly.state.modelSelection.size)).toBe(2);
    await page.evaluate(async () => {
        const api = window.__assembly;
        await api.restoreWorkspaceSnapshot(api.serializeWorkspaceSnapshot());
    });
    await expect(page.locator('.model-tree-cad-assembly > details')).toHaveAttribute('open');
    await expect(page.locator('.model-tree-part-button:visible')).toHaveCount(3);
});

test('실제 STEP Worker는 같은 정밀도로 연속 변환하고 형상·면 정보를 보존한다', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/health');
    const results = await page.evaluate(async () => {
        const worker = new Worker('/2_3DSimulation/step-import-worker.js');
        const source = await (await fetch('/2_3DSimulation/test-assets/3D_model/Conveyor.step')).arrayBuffer();
        const digest = async array => {
            const hash = await crypto.subtle.digest('SHA-256', array);
            return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
        };
        const parse = requestId => new Promise((resolve, reject) => {
            const meshes = [];
            const timeout = setTimeout(() => finish(new Error('STEP conversion timeout')), 40_000);
            const finish = (error, done) => {
                clearTimeout(timeout);
                worker.removeEventListener('message', onMessage);
                worker.removeEventListener('error', onError);
                if (error) reject(error);
                else resolve({ meshes, timings: done.timings });
            };
            const onMessage = ({ data }) => {
                if (data.requestId !== requestId) return;
                if (data.type === 'mesh') meshes.push(data.mesh);
                if (data.type === 'error') finish(new Error(data.message));
                if (data.type === 'done') finish(null, data);
            };
            const onError = event => finish(new Error(event.message));
            worker.addEventListener('message', onMessage);
            worker.addEventListener('error', onError);
            const fileBuffer = source.slice(0);
            worker.postMessage({ type: 'parse', engine: 'large', requestId,
                fileName: 'Conveyor.step', fileBuffer,
                parameters: { linearDeflectionAbsolute: 1, angularDeflection: 0.8 }
            }, [fileBuffer]);
        });
        try {
            const results = [];
            for (const id of [1, 2]) {
                const { meshes, timings } = await parse(id);
                const geometry = [];
                let vertices = 0, triangles = 0;
                for (const mesh of meshes) {
                    vertices += mesh.positions.length / 3;
                    triangles += mesh.indices.length / 3;
                    geometry.push({
                        positions: await digest(mesh.positions.buffer),
                        indices: await digest(mesh.indices.buffer),
                        normals: await digest(mesh.normals.buffer),
                        brepFaces: mesh.brepFaces,
                        partId: mesh.partId, partName: mesh.partName
                    });
                }
                results.push({ vertices, triangles, geometry, timings });
            }
            return results;
        } finally {
            worker.terminate();
        }
    });
    expect(results[0].vertices).toBe(3220);
    expect(results[0].triangles).toBe(2480);
    expect(results[1].geometry).toEqual(results[0].geometry);
    expect(results[0].geometry.every(mesh => mesh.brepFaces?.length > 0)).toBe(true);
    expect(results[1].timings.engineInitMs).toBeLessThan(results[0].timings.engineInitMs);
    for (const result of results) {
        for (const phase of ['engineInitMs', 'readingMs', 'tessellationMs', 'packingMs']) {
            expect(result.timings[phase]).toBeGreaterThanOrEqual(0);
        }
    }
});
