import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('접합부 AO는 틈만 강조하고 평면·배경·조작 표시의 밝기는 유지한다', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (/THREE.WebGLProgram: Shader Error/.test(message.text())) errors.push(message.text());
    });
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__aoTest = { state, THREE, renderSimulationScene: typeof renderSimulationScene === 'function' ? renderSimulationScene : (renderer, camera) => renderer.render(state.scene, camera) };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__aoTest?.state.renderer);
    const result = await page.evaluate(() => {
        const { state, THREE, renderSimulationScene } = window.__aoTest;
        const previous = { scene: state.scene, models: state.models };
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0e14);
        scene.add(new THREE.AmbientLight(0xffffff, 2));
        const material = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.7, metalness: 0 });
        const floor = new THREE.Mesh(new THREE.BoxGeometry(600, 600, 20), material);
        floor.position.z = -10;
        const block = new THREE.Mesh(new THREE.BoxGeometry(160, 160, 160), material);
        block.position.z = 80;
        const marker = new THREE.Mesh(new THREE.SphereGeometry(9), new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false }));
        marker.position.set(90, -90, 4);
        marker.renderOrder = 99;
        scene.add(floor, block, marker);
        state.scene = scene;
        state.models = [floor, block];
        const cameras = [new THREE.PerspectiveCamera(45, state.camera.aspect, 0.1, 1e7),
            new THREE.OrthographicCamera(-500 * state.camera.aspect, 500 * state.camera.aspect, 500, -500, 1, 10000)];
        const samples = [];
        const images = {};
        for (const camera of cameras) {
            camera.up.set(0, 0, 1);
            camera.position.set(450, -650, 550);
            camera.lookAt(0, 0, 20);
            const capture = () => {
                const gl = state.renderer.getContext();
                const points = [[0, -84, 0], [220, -180, 0], [0, 0, 160], [90, -90, 4]];
                const pixels = points.map(point => {
                    const p = new THREE.Vector3(...point).project(camera);
                    const pixel = new Uint8Array(4);
                    gl.readPixels(Math.floor((p.x + 1) * 0.5 * gl.drawingBufferWidth),
                        Math.floor((p.y + 1) * 0.5 * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                    return [...pixel];
                });
                const background = new Uint8Array(4);
                gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, background);
                return [...pixels, [...background]];
            };
            state.renderer.render(scene, camera);
            const before = capture();
            if (camera.isPerspectiveCamera) images.before = state.renderer.domElement.toDataURL('image/png');
            renderSimulationScene(state.renderer, camera);
            const after = capture();
            if (camera.isPerspectiveCamera) images.after = state.renderer.domElement.toDataURL('image/png');
            samples.push({ before, after, visible: [floor.visible, block.visible, marker.visible], material: floor.material === material });
        }
        // Materials already used by AO must also remain unchanged when faded.
        material.transparent = true;
        material.opacity = 0.5;
        material.needsUpdate = true;
        state.renderer.render(scene, cameras[0]);
        const transparentBefore = state.renderer.domElement.toDataURL('image/png');
        renderSimulationScene(state.renderer, cameras[0]);
        const transparentAfter = state.renderer.domElement.toDataURL('image/png');
        state.scene = previous.scene;
        state.models = previous.models;
        state.renderer.render(state.scene, state.camera);
        floor.geometry.dispose(); block.geometry.dispose(); marker.geometry.dispose();
        material.dispose(); marker.material.dispose();
        return { samples, images, transparentUnchanged: transparentBefore === transparentAfter };
    });
    for (const [name, url] of Object.entries(result.images)) {
        await writeFile(test.info().outputPath(`contact-ao-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log('Contact AO samples:', JSON.stringify(result.samples));
    for (const { before, after, visible, material } of result.samples) {
        const brightness = pixel => pixel.slice(0, 3).reduce((sum, value) => sum + value, 0) / 3;
        expect(brightness(before[0]) - brightness(after[0])).toBeGreaterThan(2);
        expect(brightness(after[0])).toBeGreaterThan(brightness(before[0]) * 0.75);
        for (const index of [1, 2, 3, 4]) expect(Math.abs(brightness(after[index]) - brightness(before[index]))).toBeLessThanOrEqual(2);
        expect(visible).toEqual([true, true, true]);
        expect(material).toBe(true);
    }
    expect(errors).toEqual([]);
    expect(result.transparentUnchanged).toBe(true);
});
