import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { ROBOT_JOINT_ACCENTS } from '../../2_3DSimulation/robot-joint-accent-faces.mjs';
import { ROBOT_LOGO_FACES } from '../../2_3DSimulation/robot-logo-material-core.mjs';

for (const [folder, mask] of Object.entries(ROBOT_JOINT_ACCENTS)) {
const stl = readFileSync(new URL(`../../2_3DSimulation/models/${folder}/${mask.mesh || 'P4.stl'}`, import.meta.url));
let originalArea = 0;
for (let i = 0; i < stl.readUInt32LE(80); i++) {
    const p = [0, 1, 2].map(j => [0, 1, 2].map(k => stl.readFloatLE(96 + i * 50 + j * 12 + k * 4)));
    const u = p[1].map((v, k) => v - p[0][k]), v = p[2].map((v, k) => v - p[0][k]);
    originalArea += Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) / 2;
}

test(`${folder} 몸체·연결부 색상과 로고가 선택·충돌 후에도 유지된다`, async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__accentTest = { state, THREE, selectSceneModel, getCollisionMaterials, setCollisionMaterialHighlight };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#model-select').selectOption(`robot:${folder}`);
    await page.waitForFunction(() => window.__accentTest?.state.models.some(model => model.userData.tcpFrame));
    const result = await page.evaluate(({ endX }) => {
        const api = window.__accentTest;
        const { state, THREE } = api;
        const robot = state.models.find(model => model.userData.tcpFrame);
        let joint;
        const accented = [];
        const bodyColors = [];
        robot.traverse(mesh => {
            if (mesh.isMesh && /^(P0|J[1-6])$/.test(mesh.name)) {
                bodyColors.push((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).color.getHex());
            }
            if (mesh.isMesh && Array.isArray(mesh.material) && mesh.material[2]) { accented.push(mesh.name); joint = mesh; }
        });
        if (!joint) return { accented };
        const geometry = joint.geometry;
        const p = geometry.attributes.position;
        let area = 0;
        for (let i = 0; i < p.count; i += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(p, i);
            const b = new THREE.Vector3().fromBufferAttribute(p, i + 1).sub(a);
            const c = new THREE.Vector3().fromBufferAttribute(p, i + 2).sub(a);
            area += b.cross(c).length() / 2;
        }
        const accentGroup = geometry.groups.find(group => group.materialIndex === 2);
        let maxX = -Infinity, boundaryVertices = 0;
        const accentBounds = new THREE.Box3();
        for (let i = accentGroup.start; i < accentGroup.start + accentGroup.count; i++) {
            maxX = Math.max(maxX, p.getX(i));
            accentBounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, i));
            if (p.getX(i) === endX) boundaryVertices++;
        }
        const materials = api.getCollisionMaterials(joint);
        const before = materials.map(material => material.color.getHex());
        api.selectSceneModel(robot);
        const selected = materials.map(material => material.color.getHex());
        materials.forEach(material => api.setCollisionMaterialHighlight(material, true));
        const collision = materials.map(material => material.color.getHex());
        materials.forEach(material => api.setCollisionMaterialHighlight(material, false));
        const restored = materials.map(material => material.color.getHex());
        api.selectSceneModel(null);
        const target = joint.localToWorld(accentBounds.getCenter(new THREE.Vector3()));
        const distance = Math.max(220, Math.max(...accentBounds.getSize(new THREE.Vector3()).toArray()) * 2.4);
        state.camera.position.copy(target).add(new THREE.Vector3(-30, -distance, 35));
        state.controls.target.copy(target);
        state.controls.update();
        state.renderer.render(state.scene, state.camera);
        return { accented, bodyColors, before, selected, collision, restored, area, maxX, boundaryVertices,
            accentCount: accentGroup.count };
    }, mask);
    expect(result.accented).toEqual([mask.mesh === 'P3.stl' ? 'J3' : 'J4']);
    expect(result.bodyColors).toEqual(Array(7).fill(0xd8d7df));
    // R4H uses a projected logo; its unused material slot keeps the body color.
    expect(result.before.slice(1)).toEqual([ROBOT_LOGO_FACES[`${folder}/${mask.mesh || 'P4.stl'}`] ? 0x108ccf : 0xd8d7df, 0x009cde]);
    expect(result.selected).toEqual(result.before);
    expect(result.collision).toEqual([0xef4444, 0xef4444, 0xef4444]);
    expect(result.restored).toEqual(result.before);
    expect(Math.abs(result.area - originalArea) / originalArea).toBeLessThan(1e-6);
    expect(result.maxX).toBe(mask.endX);
    expect(result.boundaryVertices).toBeGreaterThan(2);
    expect(result.accentCount).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath('r4-joint-accent.png'), clip: { x: 430, y: 230, width: 600, height: 560 } });
    await page.evaluate(() => {
        const { state } = window.__accentTest;
        state.camera.position.y = state.controls.target.y * 2 - state.camera.position.y;
        state.controls.update();
        state.renderer.render(state.scene, state.camera);
    });
    await page.screenshot({ path: test.info().outputPath('r4-joint-accent-opposite.png'), clip: { x: 430, y: 230, width: 600, height: 560 } });
    await page.evaluate(() => {
        const { state, THREE } = window.__accentTest;
        const robot = state.models.find(model => model.userData.tcpFrame);
        const bounds = new THREE.Box3();
        robot.traverse(mesh => { if (mesh.isMesh) bounds.expandByObject(mesh); });
        const target = bounds.getCenter(new THREE.Vector3());
        const size = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
        state.camera.position.copy(target).add(new THREE.Vector3(size * 0.6, -size * 1.8, size * 0.5));
        state.controls.target.copy(target);
        state.controls.update();
        state.renderer.render(state.scene, state.camera);
    });
    await page.screenshot({ path: test.info().outputPath('r4-body-color.png') });
});
}
