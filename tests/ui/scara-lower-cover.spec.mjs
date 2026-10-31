import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SCARA_LOWER_COVERS } from '../../2_3DSimulation/scara-lower-cover-faces.mjs';
import { ROBOT_LOGO_FACES } from '../../2_3DSimulation/robot-logo-material-core.mjs';

for (const [folder, mask] of Object.entries(SCARA_LOWER_COVERS)) {
    const stl = readFileSync(new URL(`../../2_3DSimulation/models/${folder}/P2.stl`, import.meta.url));
    let originalArea = 0;
    for (let i = 0; i < mask.triangleCount; i++) {
        const p = [0, 1, 2].map(j => [0, 1, 2].map(k => stl.readFloatLE(96 + i * 50 + j * 12 + k * 4)));
        const u = p[1].map((v, k) => v - p[0][k]), v = p[2].map((v, k) => v - p[0][k]);
        originalArea += Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) / 2;
    }
    test(`${folder} 몸체·J2 하단 회색과 원래 형상을 유지한다`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1500, height: 950 });
        await page.route('**/2_3DSimulation/main.js*', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\nwindow.__scaraColorTest = { state, THREE, selectSceneModel, getCollisionMaterials, setCollisionMaterialHighlight };` });
        });
        await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
        await page.locator('#model-select').selectOption(`robot:${folder}`);
        await page.waitForFunction(() => window.__scaraColorTest?.state.models.some(model => model.userData.tcpFrame));
        const result = await page.evaluate(() => {
            const api = window.__scaraColorTest, { state, THREE } = api;
            const robot = state.models.find(model => model.userData.tcpFrame);
            let link;
            const accented = [], bodyColors = [], tubeColors = [];
            robot.traverse(mesh => {
                if (!mesh.isMesh) return;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                if (/^(P0|J[1-4])$/.test(mesh.name)) bodyColors.push(materials[0].color.getHex());
                if (mesh.name === 'CD conduit') tubeColors.push(materials[0].color.getHex());
                if (materials[2]) { accented.push(mesh.name); link = mesh; }
            });
            if (!link) return { accented };
            const g = link.geometry, p = g.attributes.position;
            let area = 0, maxGrayZ = -Infinity;
            for (let i = 0; i < p.count; i += 3) {
                const a = new THREE.Vector3().fromBufferAttribute(p, i);
                const b = new THREE.Vector3().fromBufferAttribute(p, i + 1).sub(a);
                const c = new THREE.Vector3().fromBufferAttribute(p, i + 2).sub(a);
                area += b.cross(c).length() / 2;
            }
            const group = g.groups.find(group => group.materialIndex === 2);
            for (let i = group.start; i < group.start + group.count; i++) maxGrayZ = Math.max(maxGrayZ, p.getZ(g.index.getX(i)));
            const materials = api.getCollisionMaterials(link);
            const before = materials.map(material => material.color.getHex());
            api.selectSceneModel(robot);
            const selected = materials.map(material => material.color.getHex());
            materials.forEach(material => api.setCollisionMaterialHighlight(material, true));
            const collision = materials.map(material => material.color.getHex());
            materials.forEach(material => api.setCollisionMaterialHighlight(material, false));
            const restored = materials.map(material => material.color.getHex());
            api.selectSceneModel(null);
            g.computeBoundingBox();
            const bounds = g.boundingBox, width = bounds.max.x - bounds.min.x;
            const target = link.localToWorld(new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, 0, bounds.min.z + width * 0.26));
            state.controls.target.copy(target);
            state.camera.position.copy(target).add(new THREE.Vector3(width * 0.1, -width * 1.6, width * 0.05));
            state.controls.update();
            state.renderer.render(state.scene, state.camera);
            return { accented, bodyColors, tubeColors, before, selected, collision, restored, maxGrayZ, area };
        });
        expect(result.accented).toEqual(['J2']);
        expect(result.bodyColors.length).toBeGreaterThanOrEqual(4);
        expect(result.bodyColors.every(color => color === 0xd8d7df)).toBe(true);
        expect(result.tubeColors.every(color => color === 0x292c2f)).toBe(true);
        expect(result.before).toEqual([0xd8d7df, ROBOT_LOGO_FACES[`${folder}/P2.stl`] ? 0x108ccf : 0xd8d7df, 0xb6b6bb]);
        expect(result.selected).toEqual(result.before);
        expect(result.collision).toEqual([0xef4444, 0xef4444, 0xef4444]);
        expect(result.restored).toEqual(result.before);
        expect(result.maxGrayZ).toBeCloseTo(mask.endZ, 3);
        expect(Math.abs(result.area - originalArea) / originalArea).toBeLessThan(1e-6);
        await page.screenshot({ path: test.info().outputPath(`${folder}.png`), clip: { x: 330, y: 180, width: 850, height: 580 } });
    });
}
