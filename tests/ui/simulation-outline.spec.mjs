import { test, expect } from '@playwright/test';

test('로봇 STL의 불필요한 외곽선을 줄이고 선택·표시 전환을 유지한다', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__outlineTest = { state, THREE, selectSceneModel, syncModelOutlines, requestRender };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
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
            const legacy = new THREE.EdgesGeometry(mesh.geometry, 28);
            before += legacy.getAttribute('position').count / 2;
            after += mesh.userData.outlineLine.geometry.getAttribute('position').count / 2;
            legacy.dispose();
        });
        state.outlineMode = false;
        api.syncModelOutlines();
        const hidden = meshes.every(mesh => !mesh.userData.outlineLine);
        api.selectSceneModel(robot);
        const selected = meshes.every(mesh => mesh.userData.outlineLine?.material.color.getHex() === 0xfacc15);
        api.selectSceneModel(null);
        state.outlineMode = true;
        api.syncModelOutlines();
        const arm = meshes.find(mesh => mesh.name === 'J4');
        const center = new THREE.Box3().setFromObject(arm).getCenter(new THREE.Vector3());
        state.camera.position.copy(center).add(new THREE.Vector3(100, -550, 180));
        state.controls.target.copy(center);
        state.controls.update();
        api.requestRender();
        return { before, after, hidden, selected, perMesh: meshes.map(mesh => mesh.userData.outlineLine.geometry.getAttribute('position').count / 2) };
    });
    expect(result.after).toBeLessThan(result.before * 0.8);
    expect(result.perMesh.every(count => count > 0)).toBe(true);
    expect(result.hidden).toBe(true);
    expect(result.selected).toBe(true);
    await page.waitForTimeout(200);
    await page.screenshot({ path: test.info().outputPath('robot-outline-detail.png') });
    expect(errors).toEqual([]);
});
