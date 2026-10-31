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
            const countLogoEdges = () => {
                let count = 0, logoMeshes = 0;
                for (const mesh of meshes) {
                    const groups = mesh.geometry.groups.filter(group => group.materialIndex === 1);
                    const projection = mesh.userData.robotLogoProjection;
                    if (!groups.length && !projection) continue;
                    logoMeshes++;
                    mesh.geometry.computeBoundingBox();
                    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
                    const tolerance = Math.max(1e-6, Math.min(0.02, Math.max(size.x,size.y,size.z) * 1e-5));
                    const key = point => point.map(value => Math.round(value / tolerance)).join(',');
                    const edgeKey = (a,b) => [key(a),key(b)].sort().join('|');
                    const logoEdges = new Set();
                    for (const group of groups) {
                        for (let i=group.start;i<group.start+group.count;i+=3) {
                            const points = [0,1,2].map(offset => new THREE.Vector3().fromBufferAttribute(
                                mesh.geometry.attributes.position,mesh.geometry.index?.getX(i+offset) ?? i+offset).toArray());
                            for (const [a,b] of [[0,1],[1,2],[2,0]]) logoEdges.add(edgeKey(points[a],points[b]));
                        }
                    }
                    const lines = mesh.userData.outlineLine.geometry.attributes.position.array;
                    for(let i=0;i<lines.length;i+=6) {
                        const a=Array.from(lines.slice(i,i+3)),b=Array.from(lines.slice(i+3,i+6));
                        if(logoEdges.has(edgeKey(a,b)))count++;
                        if(projection) {
                            const p=a.map((value,axis)=>(value+b[axis])/2);
                            const rect=p[1]<0?projection.negative:projection.positive;
                            if(Math.abs(p[1])>projection.minDepth && p[0]>rect[0]-1+1e-4 && p[0]<rect[0]+rect[2]+1-1e-4
                                && p[2]>rect[1]-1+1e-4 && p[2]<rect[1]+rect[3]+1-1e-4)count++;
                        }
                    }
                }
                return {count,logoMeshes};
            };
            const logoOutlines = countLogoEdges();
            state.outlineMode = false;
            api.syncModelOutlines();
            const hidden = meshes.every(mesh => !mesh.userData.outlineLine);
            api.selectSceneModel(robot);
            const selected = meshes.every(mesh => mesh.userData.outlineLine?.material.color.getHex() === 0xfacc15);
            const selectedLogoOutlines = countLogoEdges();
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
            // Material slot 1 in a Tool is ordinary geometry, even under a robot.
            const toolRoot = new THREE.Group(), toolGeometry = new THREE.BoxGeometry(40,40,40);
            toolGeometry.clearGroups();
            toolGeometry.addGroup(0,18,0);toolGeometry.addGroup(18,18,1);
            const tool = new THREE.Mesh(toolGeometry,[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial({color:0x108ccf})]);
            toolRoot.add(tool);toolRoot.position.x=10000;toolRoot.userData.attachmentHost=robot;
            robot.add(toolRoot);state.models.push(toolRoot);api.syncModelOutlines();
            const toolBorderCount = tool.userData.outlineLine.geometry.attributes.position.count / 2;
            const arm = meshes.find(mesh => mesh.name === 'J4') || meshes.find(mesh => mesh.name === 'J2');
            const center = new THREE.Box3().setFromObject(arm).getCenter(new THREE.Vector3());
            state.camera.position.copy(center).add(new THREE.Vector3(100, -550, 180));
            state.controls.target.copy(center);
            state.controls.update();
            api.requestRender();
            return { before, after, defaultColor, hidden, selected, faded, restored, openBorderCount, toolBorderCount, logoOutlines, selectedLogoOutlines,
                perMesh: meshes.map(mesh => mesh.userData.outlineLine.geometry.getAttribute('position').count / 2) };
        });
        expect(result.after).toBeLessThan(result.before * 0.9);
        expect(result.perMesh.every(count => count > 0)).toBe(true);
        expect(result.defaultColor).toBe(true);
        expect(result.logoOutlines.logoMeshes).toBeGreaterThan(0);
        expect(result.logoOutlines.count).toBe(0);
        expect(result.selectedLogoOutlines.count).toBe(0);
        expect(result.hidden).toBe(true);
        expect(result.selected).toBe(true);
        expect(result.faded).toBe(true);
        expect(result.restored).toBe(true);
        expect(result.openBorderCount).toBe(4);
        expect(result.toolBorderCount).toBe(12);
        await page.screenshot({ path: test.info().outputPath('robot-outline-detail.png') });
        expect(errors).toEqual([]);
    });
}
