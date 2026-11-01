import { test, expect } from '@playwright/test';

test('대형 CAD와 떨어진 Tool은 충돌 정책을 반복 검사하지 않고 실제 접촉은 감지한다', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
const collisionPerf = { policyCalls: 0 };
const originalCollisionMeshPolicy = shouldCheckSceneCollisionMeshes;
shouldCheckSceneCollisionMeshes = (...args) => {
    if (args[0]?.userData?.collisionPerfCad || args[2]?.userData?.collisionPerfCad) collisionPerf.policyCalls++;
    return originalCollisionMeshPolicy(...args);
};
window.__collisionPerf = { state, THREE, collisionPerf, equipmentApp, ensureWorkspaceModelId, createPrimitiveShapeRoot,
    markSceneCollisionDirty, checkSceneCollisions };
` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__collisionPerf);
    await page.locator('#model-select').selectOption('robot:IR-R10H-120');
    await page.waitForFunction(() => window.__collisionPerf.state.activeArticulatedModel?.userData.tcpFrame);

    const result = await page.evaluate(() => {
        const a = window.__collisionPerf;
        const robot = a.state.activeArticulatedModel;
        const tool = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: '성능 검사 Tool' });
        tool.userData.attachmentHost = robot;
        tool.userData.placement = 'tcp';
        tool.position.set(10_000, 0, 0);
        a.state.scene.add(tool);
        a.state.models.push(tool);

        const cad = new a.THREE.Group();
        cad.userData.modelName = '성능 검사 CAD';
        cad.userData.collisionPerfCad = true;
        cad.userData.uploaded = true;
        cad.userData.placement = 'scene';
        cad.userData.importedParts = [];
        const geometry = new a.THREE.BoxGeometry(20, 20, 20);
        const material = new a.THREE.MeshStandardMaterial();
        for (let index = 0; index < 600; index++) {
            const mesh = new a.THREE.Mesh(geometry, material);
            mesh.userData.modelPartId = `collision-perf-${index}`;
            mesh.userData.modelPartName = `성능 검사 부품 ${index}`;
            mesh.position.set(30_000 + index * 30, 0, 0);
            cad.add(mesh);
            cad.userData.importedParts.push(mesh);
        }
        a.state.scene.add(cad);
        a.state.models.push(cad);
        const cadId = a.ensureWorkspaceModelId(cad);
        for (let index = 1; index <= 20; index++) a.equipmentApp.save({
            id: `collision-perf-object-${index}`,
            type: 'OBJECT',
            movingRef: `equipment-model:${cadId}/${index}`
        });
        a.state.collision.enabled = true;

        const scan = () => {
            a.collisionPerf.policyCalls = 0;
            a.markSceneCollisionDirty();
            const started = performance.now();
            const hits = a.checkSceneCollisions({ force: true }) || [];
            return {
                policyCalls: a.collisionPerf.policyCalls,
                elapsedMs: performance.now() - started,
                contacts: hits.filter(hit => (hit.objectA === tool && hit.objectB === cad)
                    || (hit.objectA === cad && hit.objectB === tool)).length,
                highlights: a.state.collision.highlightedMaterials.size
            };
        };
        const far = scan();
        cad.children.forEach((mesh, index) => {
            mesh.position.x = index < 300 ? 9_000 - index * 30 : 11_000 + (index - 300) * 30;
        });
        const gap = scan();
        cad.children[0].position.copy(tool.position);
        const touching = scan();
        cad.children[0].visible = false;
        const hidden = scan();
        cad.children[0].visible = true;
        cad.children[0].position.x = 10_050;
        const separated = scan();
        cad.children[0].geometry = new a.THREE.BoxGeometry(100, 20, 20);
        const expanded = scan();
        return { far, gap, touching, hidden, separated, expanded };
    });

    console.log('collision-broad-phase-profile ' + JSON.stringify(result));
    expect(result.far.contacts).toBe(0);
    expect(result.gap.contacts).toBe(0);
    expect(result.far.policyCalls, '멀리 떨어진 CAD는 부품별 충돌 정책 검사에서 제외한다').toBe(0);
    expect(result.gap.policyCalls, '조립품 경계 안의 빈 공간도 부품 경계로 제외한다').toBe(0);
    expect(result.touching.contacts).toBeGreaterThan(0);
    expect(result.touching.policyCalls).toBeLessThanOrEqual(2);
    expect(result.touching.highlights).toBeGreaterThan(0);
    expect(result.hidden.contacts).toBe(0);
    expect(result.separated.contacts).toBe(0);
    expect(result.expanded.contacts).toBeGreaterThan(0);
    expect(errors).toEqual([]);
});
