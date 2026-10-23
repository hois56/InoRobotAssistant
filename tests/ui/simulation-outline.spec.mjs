import { test, expect } from '@playwright/test';

for (const model of ['IR-R10H-120', 'IR-R20H-120', 'IR-GS60-120Z40', 'IR-TS4-35Z15']) {
    test(`${model} 외곽선은 잔선을 줄이고 기본 색상·선택·투명도를 유지한다`, async ({ page }) => {
        test.setTimeout(120_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/2_3DSimulation/main.js*', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\nwindow.__outlineTest = { state, THREE, selectSceneModel, syncModelOutlines, applyModelTransparencyVisual, buildCleanOutlinePositions, requestRender };` });
        });
        await page.goto('/2_3DSimulation/index.html');
        await page.locator('#model-select').selectOption(`robot:${model}`);
        await page.waitForFunction(() => window.__outlineTest?.state.models.some(model => model.userData.tcpFrame));
        const result = await page.evaluate(() => {
            const api = window.__outlineTest;
            const { state, THREE } = api;
            const robot = state.models.find(model => model.userData.tcpFrame);
            api.selectSceneModel(null);
            state.outlineMode = true;
            api.syncModelOutlines();
            let before = 0;
            let after = 0;
            const meshes = [];
            robot.traverse(mesh => {
                if (!mesh.isMesh || !mesh.userData.outlineLine) return;
                meshes.push(mesh);
                before += api.buildCleanOutlinePositions(mesh.geometry.attributes.position.array, mesh.geometry.index?.array, {
                    minimumAspectRatio: 0.01
                }).length / 6;
                after += mesh.userData.outlineLine.geometry.getAttribute('position').count / 2;
            });
            const defaultColor = meshes.every(mesh => mesh.userData.outlineLine.material.color.getHex() === 0x5c626b);
            state.outlineMode = false;
            api.syncModelOutlines();
            const hidden = meshes.every(mesh => !mesh.userData.outlineLine);
            api.selectSceneModel(robot);
            const selected = meshes.every(mesh => mesh.userData.outlineLine?.material.color.getHex() === 0xfacc15);
            api.selectSceneModel(null);
            state.outlineMode = true;
            api.syncModelOutlines();
            api.applyModelTransparencyVisual(robot, null, 50);
            const faded = meshes.every(mesh => Math.abs(mesh.userData.outlineLine.material.opacity - 0.475) < 1e-6);
            api.applyModelTransparencyVisual(robot, null, 0);
            const restored = meshes.every(mesh => Math.abs(mesh.userData.outlineLine.material.opacity - 0.95) < 1e-6);

            // An open imported surface must retain its actual border.
            const surface = new THREE.Group();
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial());
            surface.add(plane);
            surface.position.x = 10000;
            state.models.push(surface);
            state.scene.add(surface);
            api.syncModelOutlines();
            const openBorderCount = plane.userData.outlineLine.geometry.attributes.position.count / 2;
            const arm = meshes.find(mesh => mesh.name === 'J4') || meshes.find(mesh => mesh.name === 'J2');
            const center = new THREE.Box3().setFromObject(arm).getCenter(new THREE.Vector3());
            state.camera.position.copy(center).add(new THREE.Vector3(100, -550, 180));
            state.controls.target.copy(center);
            state.controls.update();
            api.requestRender();
            return { before, after, defaultColor, hidden, selected, faded, restored, openBorderCount,
                perMesh: meshes.map(mesh => mesh.userData.outlineLine.geometry.getAttribute('position').count / 2) };
        });
        expect(result.after).toBeLessThan(result.before * 0.9);
        expect(result.perMesh.every(count => count > 0)).toBe(true);
        expect(result.defaultColor).toBe(true);
        expect(result.hidden).toBe(true);
        expect(result.selected).toBe(true);
        expect(result.faded).toBe(true);
        expect(result.restored).toBe(true);
        expect(result.openBorderCount).toBe(4);
        await page.screenshot({ path: test.info().outputPath('robot-outline-detail.png') });
        expect(errors).toEqual([]);
    });
}
