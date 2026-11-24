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
        if (folder === 'IR-S7-50Z20') {
            const finishes = await page.evaluate(() => {
                const { state, THREE } = window.__scaraColorTest;
                const robot = state.models.find(model => model.userData.tcpFrame);
                const parts = new Map();
                robot.traverse(mesh => {
                    if (mesh.isMesh) parts.set(mesh.name, new THREE.Mesh(mesh.geometry, mesh.material));
                });
                function sample(name, origin, direction) {
                    const mesh = parts.get(name);
                    const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
                    const [hit] = ray.intersectObject(mesh, false);
                    const material = [].concat(mesh.material)[hit.face.materialIndex];
                    return { color: material.color.getHexString(), metalness: material.metalness };
                }
                const down = [0, 0, -1], side = [0, -1, 0];
                return {
                    lens: sample('J2', [274, 0, 360], down),
                    topPlate: sample('J2', [255, 12, 360], down),
                    upperRing: sample('J2', [225, 100, 273], side),
                    baseNut: sample('P0', [-113, 100, 32], side),
                    baseFoot: sample('P0', [-113, 100, 14], side),
                    basePaint: sample('P0', [-80, 20, 100], down),
                    caps: [-95.25, -127.25].map(z => sample('P0', [-200, -12, z], [1, 0, 0])),
                    sleeves: [-95.25, -127.25].map(z => sample('P0', [-150, 100, z], side)),
                    shaft: sample('J4', [500, 100, 350], side),
                    collars: [35, 395].map(z => sample('J4', [500, 100, z], side))
                };
            });
            expect(finishes.lens.color).toBe('ff8200');
            expect([finishes.topPlate.color, finishes.basePaint.color]).toEqual(['d8d7df', 'd8d7df']);
            for (const material of [finishes.upperRing, finishes.baseNut, finishes.baseFoot, ...finishes.caps]) {
                expect(material.color).toBe('292c2f');
            }
            for (const material of finishes.sleeves) {
                expect(material.color).toBe('c4c8cc');
                expect(material.metalness).toBeGreaterThan(0.4);
            }
            for (const material of [finishes.shaft, ...finishes.collars]) {
                expect(material.color).toBe('eff1f3');
                expect(material.metalness).toBeGreaterThan(0.85);
            }
        }
        const result = await page.evaluate(() => {
            const api = window.__scaraColorTest, { state, THREE } = api;
            const robot = state.models.find(model => model.userData.tcpFrame);
            let link, spindle, carriageColors;
            const accented = [], bodyColors = [], tubeColors = [];
            robot.traverse(mesh => {
                if (!mesh.isMesh) return;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                if (mesh.name === 'J4') {
                    const { metalness, roughness, envMap, envMapIntensity } = materials[0];
                    spindle = { metalness, roughness, reflections: Boolean(envMap), envMapIntensity };
                }
                if (mesh.name === 'J3') {
                    const carriage = new THREE.Mesh(mesh.geometry, mesh.material);
                    const x = robot.userData.manifest.tcp[0] + 0.37;
                    carriageColors = [400, 50].map(z => {
                        const ray = new THREE.Raycaster(new THREE.Vector3(x, 150, z), new THREE.Vector3(0, -1, 0));
                        const [hit] = ray.intersectObject(carriage, false);
                        return hit ? materials[hit.face.materialIndex].color.getHex() : null;
                    });
                }
                if (/^(P0|J[1-4])$/.test(mesh.name)) bodyColors.push([mesh.name, materials[0].color.getHex()]);
                if (mesh.name === 'CD conduit') tubeColors.push(materials[0].color.getHex());
                if (mesh.geometry.userData.robotJointAccentColor !== undefined) { accented.push(mesh.name); link = mesh; }
            });
            if (!link) return { accented };
            const g = link.geometry, p = g.attributes.position;
            let area = 0, maxGrayZ = -Infinity;
            const connector = robot.userData.scaraTubeConnector;
            const p2Geometries = [g];
            if (connector && !connector.fitting.cableFaces) p2Geometries.push(connector.group.children[0].geometry);
            for (const { attributes: { position } } of p2Geometries) {
                for (let i = 0; i < position.count; i += 3) {
                    const a = new THREE.Vector3().fromBufferAttribute(position, i);
                    const b = new THREE.Vector3().fromBufferAttribute(position, i + 1).sub(a);
                    const c = new THREE.Vector3().fromBufferAttribute(position, i + 2).sub(a);
                    area += b.cross(c).length() / 2;
                }
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
            return { accented, bodyColors, tubeColors, spindle, carriageColors, before, selected, collision, restored, maxGrayZ, area };
        });
        expect(result.accented).toEqual(['J2']);
        expect(result.bodyColors.length).toBeGreaterThanOrEqual(4);
        for (const [name, color] of result.bodyColors) {
            expect(color, name).toBe(name === 'J4' ? 0xeff1f3 : 0xd8d7df);
        }
        expect(result.spindle.metalness).toBeGreaterThan(0.85);
        expect(result.spindle.roughness).toBeGreaterThanOrEqual(0.5);
        expect(result.spindle.reflections).toBe(true);
        expect(result.spindle.envMapIntensity).toBeGreaterThan(0);
        expect(result.spindle.envMapIntensity).toBeLessThan(1);
        if (result.carriageColors) {
            const hasSpindleSurface = ['IR-S35-80Z42', 'IR-S35-100Z42', 'IR-S60-120Z40'].includes(folder);
            expect(result.carriageColors).toEqual([hasSpindleSurface ? 0xeff1f3 : null, 0xd8d7df]);
        }
        expect(result.tubeColors.every(color => color === 0x292c2f)).toBe(true);
        const coverMaterials = [0xd8d7df, ROBOT_LOGO_FACES[`${folder}/P2.stl`] ? 0x108ccf : 0xd8d7df, 0xb6b6bb];
        expect(result.before.slice(0, 3)).toEqual(coverMaterials);
        expect(result.before.slice(3).sort()).toEqual(folder === 'IR-S7-50Z20' ? [0x292c2f, 0xff8200].sort() : []);
        expect(result.selected).toEqual(result.before);
        expect(result.collision).toEqual(result.before.map(() => 0xef4444));
        expect(result.restored).toEqual(result.before);
        expect(result.maxGrayZ).toBeCloseTo(mask.endZ, 3);
        expect(Math.abs(result.area - originalArea) / originalArea).toBeLessThan(1e-6);
        await page.screenshot({ path: test.info().outputPath(`${folder}.png`), clip: { x: 330, y: 180, width: 850, height: 580 } });
    });
}
