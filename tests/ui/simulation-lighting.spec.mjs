import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('CAD 면 명암을 강화하면서 일반·대형 모델의 어두운 면도 식별할 수 있다', async ({ page }) => {
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__lightingTest = { state, THREE };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__lightingTest?.state.renderer);
    const result = await page.evaluate(() => {
        const { state, THREE } = window.__lightingTest;
        const scene = new THREE.Scene();
        scene.background = state.scene.background.clone();
        const lights = state.scene.children.filter(child => child.isLight).map(light => light.clone());
        lights.forEach(light => { light.castShadow = false; scene.add(light); });
        const camera = new THREE.PerspectiveCamera(45, state.camera.aspect, 1, 10000);
        camera.up.set(0, 0, 1);
        camera.position.set(500, -700, 500);
        camera.lookAt(0, 0, 0);
        const renderer = state.renderer;
        const exposure = renderer.toneMappingExposure;
        const original = lights.map(light => ({ intensity: light.intensity, position: light.position.clone() }));
        const metrics = [];
        const images = {};
        for (const [Material, color] of [[THREE.MeshStandardMaterial, 0x95b765], [THREE.MeshLambertMaterial, 0x95b765], [THREE.MeshStandardMaterial, 0xd9dde3]]) {
            const material = new Material({ color });
            if (material.isMeshStandardMaterial) { material.roughness = 0.64; material.metalness = 0.06; }
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(240, 240, 240), material);
            scene.add(mesh);
            const samples = {};
            for (const mode of ['before', 'after']) {
                lights.forEach((light, index) => {
                    light.intensity = mode === 'before' ? [0.6, 1.25, 0.5][index] : original[index].intensity;
                    light.position.copy(mode === 'before'
                        ? new THREE.Vector3(...[[0, 0, 0], [1500, -1000, 2500], [-1500, 1200, 1000]][index])
                        : original[index].position);
                });
                renderer.toneMappingExposure = mode === 'before' ? 2.3 : exposure;
                renderer.render(scene, camera);
                const gl = renderer.getContext();
                samples[mode] = [[120, 0, 0], [0, -120, 0], [0, 0, 120]].map(point => {
                    const p = new THREE.Vector3(...point).project(camera);
                    const rgba = new Uint8Array(4);
                    gl.readPixels(Math.floor((p.x + 1) / 2 * gl.drawingBufferWidth),
                        Math.floor((p.y + 1) / 2 * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
                    return (rgba[0] * 0.2126 + rgba[1] * 0.7152 + rgba[2] * 0.0722) / 255;
                });
                if (material.isMeshStandardMaterial) images[`${color.toString(16)}-${mode}`] = renderer.domElement.toDataURL('image/png');
            }
            metrics.push({ color, ...samples });
            scene.remove(mesh);
            mesh.geometry.dispose();
            material.dispose();
        }
        renderer.toneMappingExposure = exposure;
        renderer.render(state.scene, state.camera);
        return { metrics, images };
    });
    for (const [mode, url] of Object.entries(result.images)) {
        await writeFile(test.info().outputPath(`lighting-${mode}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log('Face luminance (side/front/top):', JSON.stringify(result.metrics));
    for (const { color, before, after } of result.metrics) {
        const spread = values => Math.max(...values) - Math.min(...values);
        const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
        expect(spread(after)).toBeGreaterThan(spread(before) + 0.03);
        expect(average(after)).toBeGreaterThanOrEqual(average(before));
        expect(Math.min(...after)).toBeGreaterThan(color === 0x95b765 ? 0.48 : 0.65);
        expect(Math.max(...after)).toBeLessThan(0.95);
    }
});
