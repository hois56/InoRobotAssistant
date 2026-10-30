import { test, expect } from '@playwright/test';

async function setup(page, { performanceMode = false, largeStep = false } = {}) {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        let source = (await response.text()).replace(/\binit\(\);\s*$/, 'window.__colorReady = init();\n');
        if (performanceMode) source = source.replace('const LARGE_MODEL_PERFORMANCE_MIN_BYTES = 100 * MEBIBYTE;', 'const LARGE_MODEL_PERFORMANCE_MIN_BYTES = 0;');
        if (largeStep) source = source.replace('const STEP_LARGE_FILE_ENGINE_MIN_BYTES = 50 * MEBIBYTE;', 'const STEP_LARGE_FILE_ENGINE_MIN_BYTES = 0;');
        await route.fulfill({ response, body: source + '\nwindow.__colors = { state, handle3DImport, getImportedModelColor, THREE, readStepImportCache, getStepImportCacheKey, getStepTessellationParameters, getLargeStepTessellationParameters, createStepMeshFromWorker };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__colorReady && window.__colors);
    await page.evaluate(() => window.__colorReady);
}

async function upload(page, name, buffer) {
    await page.locator('#input-import-3d').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
    await page.evaluate(() => { window.__colorFile = window.__colors.state.pendingImportFile; });
    await page.locator('#import-placement').selectOption('scene');
    await page.locator('#btn-confirm-import').click();
    await page.waitForFunction(name => window.__colors.state.models.some(model => model.userData.modelName === name)
        && window.__colors.state.fileImportLoads.size === 0, name);
}

async function materials(page, name) {
    return page.evaluate(name => {
        const model = window.__colors.state.models.find(model => model.userData.modelName === name);
        const result = [];
        model.traverse(mesh => {
            if (!mesh.isMesh || mesh.userData.outlineSource) return;
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                result.push({ color: material.color.toArray(), hex: material.color.getHexString(),
                    vertexColors: material.vertexColors, roughness: material.roughness,
                    metalness: material.metalness, opacity: material.opacity });
            }
        });
        return result;
    }, name);
}

test('일반 glTF는 원래 재질·검정색·정점 색상을 유지하고 테스트 모델에만 구분 색상을 적용한다', async ({ page }) => {
    test.setTimeout(90_000);
    await setup(page);
    const data = Buffer.concat([
        Buffer.from(new Float32Array([0, 0, 0, 40, 0, 0, 0, 30, 20]).buffer),
        Buffer.from(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]).buffer)
    ]);
    const gltf = JSON.stringify({
        asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }],
        nodes: [{ mesh: 0 }, { mesh: 1, translation: [50, 0, 0] }],
        buffers: [{ byteLength: data.length, uri: 'data:application/octet-stream;base64,' + data.toString('base64') }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [40, 30, 20] },
            { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' }
        ],
        materials: [
            { pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], roughnessFactor: 0.29, metallicFactor: 0.17 } },
            { alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.6], roughnessFactor: 0.73, metallicFactor: 0.04 } }
        ],
        meshes: [
            { primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
            { primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, material: 1 }] }
        ]
    });
    await upload(page, 'Original.gltf', Buffer.from(gltf));
    const original = await materials(page, 'Original.gltf');
    expect(original.map(material => material.color)).toEqual([[0, 0, 0], [1, 1, 1]]);
    expect(original.map(material => material.vertexColors)).toEqual([false, true]);
    expect(original.map(material => material.roughness)).toEqual([0.29, 0.73]);
    expect(original.map(material => material.metalness)).toEqual([0.17, 0.04]);
    expect(original.map(material => material.opacity)).toEqual([1, 0.6]);
    await upload(page, 'Renamed.gltf', Buffer.from(gltf));
    expect(await materials(page, 'Renamed.gltf')).toEqual(original);
    const testColor = await page.evaluate(async gltf => {
        const api = window.__colors;
        await api.handle3DImport({ file: new File([gltf], 'Test.gltf'), placement: 'scene', testModel: true });
        return new api.THREE.Color(api.getImportedModelColor('Test.gltf')).getHexString();
    }, gltf);
    expect((await materials(page, 'Test.gltf')).map(material => material.hex)).toEqual([testColor, testColor]);
});

test('색상이 저장된 STL은 정점 색상을 사용하고 색상 없는 STL은 기본 색상을 사용한다', async ({ page }) => {
    test.setTimeout(90_000);
    await setup(page);
    const colored = Buffer.alloc(134);
    colored.write('COLOR=', 0, 'ascii');
    colored.set([255, 0, 0, 255], 6);
    colored.writeUInt32LE(1, 80);
    [0, 0, 1, 0, 0, 0, 40, 0, 0, 0, 30, 20].forEach((value, index) => colored.writeFloatLE(value, 84 + index * 4));
    colored.writeUInt16LE(0x8000, 132);
    await upload(page, 'Colored.stl', colored);
    const original = await materials(page, 'Colored.stl');
    expect(original[0].vertexColors).toBe(true);
    expect(original[0].hex).toBe('ffffff');
    expect(await page.evaluate(() => {
        let colors;
        window.__colors.state.models.find(model => model.userData.modelName === 'Colored.stl').traverse(mesh => {
            if (mesh.isMesh && !mesh.userData.outlineSource) colors = Array.from(mesh.geometry.getAttribute('color').array);
        });
        return colors;
    })).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0]);
    const plain = Buffer.from(colored);
    plain.fill(0, 0, 80);
    await upload(page, 'Plain.stl', plain);
    const fallback = await materials(page, 'Plain.stl');
    expect(fallback[0].vertexColors).toBe(false);
    expect(fallback[0].hex).toBe('bfc7d5');
});

test('일반 STEP는 부품 원래 색상을 첫 가져오기와 캐시 재사용에서 유지한다', async ({ page }) => {
    test.setTimeout(90_000);
    await setup(page);
    const source = await page.evaluate(async () => {
        const { OcctKernel } = await import('https://cdn.jsdelivr.net/npm/occt-wasm@5.3.4/dist/index.js');
        const kernel = await OcctKernel.init({ wasm: 'https://cdn.jsdelivr.net/npm/occt-wasm@5.3.4/dist/occt-wasm.wasm' });
        const doc = kernel.createXCAFDocument();
        try {
            doc.addShape(kernel.makeBox(10, 20, 30), { name: 'Red', color: [1, 0, 0] });
            doc.addShape(kernel.makeBox(15, 25, 35), { name: 'Blue', color: [0, 0, 1] });
            return doc.exportSTEP();
        } finally { doc.close(); kernel[Symbol.dispose](); }
    });
    await upload(page, 'Original.step', Buffer.from(source));
    expect((await materials(page, 'Original.step')).map(material => material.color)).toEqual([[1, 0, 0], [0, 0, 1]]);
    await expect.poll(() => page.evaluate(async () => {
        const api = window.__colors, file = window.__colorFile;
        const parameters = api.getStepTessellationParameters(file.size, 'auto');
        return Boolean(await api.readStepImportCache(api.getStepImportCacheKey(file, parameters, 'auto')));
    })).toBe(true);
    const cached = await page.evaluate(async () => {
        const model = await window.__colors.handle3DImport({
            file: window.__colorFile, placement: 'scene'
        });
        const result = [];
        model.traverse(mesh => { if (mesh.isMesh && !mesh.userData.outlineSource) result.push(mesh.material.color.toArray()); });
        return { colors: result, cacheHit: model.children[0].userData.importTimings.cacheHit };
    });
    expect(cached).toEqual({ colors: [[1, 0, 0], [0, 0, 1]], cacheHit: true });
    // Rendering also preserves worker-supplied colors in large-model mode.
    expect(await page.evaluate(() => {
        const api = window.__colors;
        const mesh = api.createStepMeshFromWorker({
            positions: new Float32Array([0, 0, 0, 40, 0, 0, 0, 30, 20]),
            indices: new Uint32Array([0, 1, 2]), color: [0.2, 0.4, 0.6]
        }, 0, 'scene', true);
        const result = mesh.material.color.toArray();
        mesh.geometry.dispose(); mesh.material.dispose();
        return result;
    })).toEqual([0.2, 0.4, 0.6]);
});

test('대용량 STEP 경로의 표면·부품·검정색은 같은 이름의 부품과 캐시에서도 유지한다', async ({ page }) => {
    test.setTimeout(180_000);
    await setup(page, { performanceMode: true, largeStep: true });
    const source = await page.evaluate(async () => {
        const { OcctKernel } = await import('https://cdn.jsdelivr.net/npm/occt-wasm@5.3.4/dist/index.js');
        const kernel = await OcctKernel.init({ wasm: 'https://cdn.jsdelivr.net/npm/occt-wasm@5.3.4/dist/occt-wasm.wasm' });
        const doc = kernel.createXCAFDocument();
        try {
            const box = kernel.makeBox(10, 20, 30);
            const label = doc.addShape(box, { name: 'Same name', color: [0.8, 0.2, 0.1] });
            doc.addSubShape(label, kernel.getSubShapes(box, 'face')[1], { color: [0, 0, 1] });
            doc.addShape(kernel.makeBox(15, 25, 35), { name: 'Same name', color: [0.1, 0.3, 0.8] });
            doc.addShape(kernel.makeBox(8, 8, 8), { name: 'Black', color: [0, 0, 0] });
            doc.addShape(kernel.makeCylinder(5, 20), { name: 'Plain' });
            return doc.exportSTEP();
        } finally { doc.close(); kernel[Symbol.dispose](); }
    });
    await upload(page, 'Large-colors.step', Buffer.from(source));
    const expected = [[0.8, 0.2, 0.1], [0, 0, 1], [0.1, 0.3, 0.8], [0, 0, 0], [0.749, 0.78, 0.835]];
    const checkColors = actual => {
        expect(actual).toHaveLength(expected.length);
        actual.forEach((color, index) => color.forEach((value, component) => expect(value).toBeCloseTo(expected[index][component], 5)));
    };
    checkColors((await materials(page, 'Large-colors.step')).map(material => material.color));
    const blueFaceX = await page.evaluate(() => {
        const model = window.__colors.state.models.find(model => model.userData.modelName === 'Large-colors.step');
        const values = [];
        model.traverse(mesh => {
            if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
            for (const group of mesh.geometry.groups) {
                if (mesh.material[group.materialIndex].color.getHexString() !== '0000ff') continue;
                for (let index = group.start; index < group.start + group.count; index++) {
                    values.push(mesh.geometry.getAttribute('position').getX(mesh.geometry.index.getX(index)));
                }
            }
        });
        return values;
    });
    expect(blueFaceX).toHaveLength(6);
    expect(blueFaceX.every(value => Math.abs(value - 10) < 1e-6)).toBe(true);
    const before = await page.evaluate(() => {
        const model = window.__colors.state.models.find(model => model.userData.modelName === 'Large-colors.step');
        return { partCount: model.userData.importedParts.length, size: model.userData.sourceFileSize, largeModelMode: model.userData.largeModelMode };
    });
    expect(before.partCount).toBe(4);
    expect(before.size).toBeGreaterThan(0);
    expect(before.largeModelMode).toBe(true);
    await expect.poll(() => page.evaluate(async () => {
        const api = window.__colors, file = window.__colorFile;
        const parameters = api.getLargeStepTessellationParameters(file.size, 'auto');
        return Boolean(await api.readStepImportCache(api.getStepImportCacheKey(file, parameters, 'auto')));
    })).toBe(true);
    const cached = await page.evaluate(async () => {
        const api = window.__colors;
        const model = await api.handle3DImport({ file: window.__colorFile, placement: 'scene' });
        const colors = [];
        model.traverse(mesh => {
            if (!mesh.isMesh || mesh.userData.outlineSource) return;
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) colors.push(material.color.toArray());
        });
        return { colors, cacheHit: model.children[0].userData.importTimings.cacheHit };
    });
    expect(cached.cacheHit).toBe(true);
    checkColors(cached.colors);
});
