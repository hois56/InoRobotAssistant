import { test, expect } from '@playwright/test';

test('R16 J3 뒤의 분리 조각을 제거하고 갱신된 모델과 충돌 형상을 불러온다', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1500, height: 950 });
    const requests = [];
    page.on('request', request => {
        if (request.url().includes('/IR-R16-210/P3.stl')) requests.push(request.url());
    });
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__r16MeshTest = { state, THREE, selectSceneModel };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#model-select').selectOption('robot:IR-R16-210');
    await page.waitForFunction(() => window.__r16MeshTest?.state.models.some(model => model.userData.tcpFrame));
    const result = await page.evaluate(() => {
        const { state, THREE, selectSceneModel } = window.__r16MeshTest;
        const robot = state.models.find(model => model.userData.tcpFrame);
        let joint;
        robot.traverse(mesh => { if (mesh.isMesh && mesh.name === 'J3') joint = mesh; });
        const minX = geometry => {
            const p = geometry.attributes.position;
            let min = Infinity;
            for (let i = 0; i < p.count; i++) min = Math.min(min, p.getX(i));
            return min;
        };
        selectSceneModel(null);
        const target = robot.localToWorld(new THREE.Vector3(80, 40, 1410));
        state.controls.target.copy(target);
        state.camera.position.copy(target).add(new THREE.Vector3(-300, 800, 300));
        state.controls.update();
        state.renderer.render(state.scene, state.camera);
        return { renderMinX: minX(joint.geometry),
            collisionMinX: joint.userData.collisionGeometry ? minX(joint.userData.collisionGeometry) : null };
    });
    expect(requests.some(url => url.endsWith('P3.stl?v=20261031-j3-clean-1'))).toBe(true);
    expect(result.renderMinX).toBeGreaterThan(0);
    expect(result.collisionMinX).not.toBeNull();
    expect(result.collisionMinX).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath('r16-j3-clean.png') });
});
