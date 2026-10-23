import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const models = JSON.parse(readFileSync(new URL('../../2_3DSimulation/models/models.json', import.meta.url)))
    .filter(model => model.folder).map(model => model.folder);

for (const model of models) {
    test(`${model} 로고 양쪽 면의 브랜드 색상과 선택·충돌 후 복원을 확인한다`, async ({ page }) => {
        test.setTimeout(120_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (/THREE.WebGLProgram: Shader Error/.test(message.text())) errors.push(message.text());
        });
        await page.route('**/2_3DSimulation/main.js*', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\nwindow.__logoTest = { state, THREE, selectSceneModel, getCollisionMaterials, setCollisionMaterialHighlight, requestRender };` });
        });
        await page.goto('/2_3DSimulation/index.html');
        await page.locator('#model-select').selectOption(`robot:${model}`);
        await page.waitForFunction(() => window.__logoTest?.state.models.some(model => model.userData.tcpFrame));
        const result = await page.evaluate(() => {
            const api = window.__logoTest;
            const { THREE, state } = api;
            const robot = state.models.find(model => model.userData.tcpFrame);
            let logoMesh;
            robot.traverse(mesh => {
                if (mesh.isMesh && (mesh.userData.robotLogoProjection
                    || (Array.isArray(mesh.material) && mesh.material[1]?.color.getHex() === 0x108ccf))) logoMesh = mesh;
            });
            if (!logoMesh) throw new Error('Robot logo material was not applied.');
            const { geometry } = logoMesh;
            const bounds = new THREE.Box3();
            if (logoMesh.userData.robotLogoProjection) {
                const [x, z, width, height] = logoMesh.userData.robotLogoProjection.negative;
                bounds.set(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + width, 0, z + height));
            } else {
                const group = geometry.groups[1];
                for (let i = group.start; i < group.start + group.count; i++) {
                    bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i)));
                }
            }
            const center = logoMesh.localToWorld(bounds.getCenter(new THREE.Vector3()));
            const distance = Math.max(260, (bounds.max.x - bounds.min.x) * 2.4);
            const direction = new THREE.Vector3(0, -1, 0).transformDirection(logoMesh.matrixWorld);
            state.camera.position.copy(center).addScaledVector(direction, distance).add(new THREE.Vector3(0, 0, distance * 0.08));
            state.controls.target.copy(center);
            state.controls.update();
            api.selectSceneModel(null);
            api.countLogoBlue = () => {
                for (const helper of [state.baseJogTransformControls, state.transformControls, robot.userData.toolAxesAtTcp]) {
                    if (helper) helper.visible = false;
                }
                state.renderer.render(state.scene, state.camera);
                const gl = state.renderer.getContext();
                const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
                const pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let blue = 0;
                for (let y = Math.floor(height * 0.3); y < height * 0.7; y += 2) {
                    for (let x = Math.floor(width * 0.25); x < width * 0.75; x += 2) {
                        const i = (y * width + x) * 4;
                        if (pixels[i + 1] > 40 && pixels[i + 2] > 60
                            && pixels[i + 1] > pixels[i] * 1.8 && pixels[i + 2] > pixels[i] * 1.8) blue++;
                    }
                }
                return blue;
            };
            const blueBefore = api.countLogoBlue();
            const materials = api.getCollisionMaterials(logoMesh);
            const before = materials.map(material => material.color.getHex());
            api.selectSceneModel(robot);
            const selected = materials.map(material => material.color.getHex());
            materials.forEach(material => api.setCollisionMaterialHighlight(material, true));
            const collision = materials.map(material => material.color.getHex());
            const blueCollision = api.countLogoBlue();
            materials.forEach(material => api.setCollisionMaterialHighlight(material, false));
            const restored = materials.map(material => material.color.getHex());
            api.selectSceneModel(null);
            const blueRestored = api.countLogoBlue();
            api.requestRender();
            return { before, selected, collision, restored, blueBefore, blueCollision, blueRestored,
                triangleCount: (geometry.index?.count || geometry.attributes.position.count) / 3,
                vertexTriangleCount: geometry.attributes.position.count / 3 };
        });
        expect(result.selected).toEqual(result.before);
        expect(result.collision.every(color => color === 0xef4444)).toBe(true);
        expect(result.restored).toEqual(result.before);
        expect(result.triangleCount).toBe(result.vertexTriangleCount);
        expect(result.blueBefore).toBeGreaterThan(80);
        expect(result.blueCollision).toBeLessThan(result.blueBefore * 0.35);
        expect(result.blueRestored).toBeGreaterThan(result.blueBefore * 0.85);
        await page.screenshot({ path: test.info().outputPath('robot-logo.png') });
        const oppositeBlue = await page.evaluate(() => {
            const api = window.__logoTest;
            const { state } = api;
            state.camera.position.y = state.controls.target.y * 2 - state.camera.position.y;
            state.controls.update();
            const blue = api.countLogoBlue();
            api.requestRender();
            return blue;
        });
        expect(oppositeBlue).toBeGreaterThan(80);
        await page.screenshot({ path: test.info().outputPath('robot-logo-opposite.png') });
        expect(errors).toEqual([]);
    });
}
