import { test, expect } from '@playwright/test';

test('실제 로봇 설치면 접촉은 허용하고 베이스 침범은 화면과 경로 검사에 반영한다', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}
window.__mountContact = { THREE, state, getArticulatedRobots, checkSceneCollisions,
    markSceneCollisionDirty, ensureWorkspaceModelId, ensureModelTreeId, createAutoPathCollisionEvaluator };` });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__mountContact);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__mountContact.getArticulatedRobots().length === 1);
    const result = await page.evaluate(() => {
        const a = window.__mountContact, T = a.THREE;
        const robot = a.getArticulatedRobots()[0];
        let base;
        robot.traverse(mesh => { if (mesh.userData.collisionRole === 'robot-mounted-base') base = mesh; });
        robot.updateMatrixWorld(true);
        const bounds = base.geometry.boundingBox;
        const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
        const mount = base.userData.collisionMountPlane;
        const floor = new T.Group();
        floor.userData = { modelName: '장착면 검사 베이스', placement: 'scene', primitiveShape: true, collisionEnabled: true };
        base.matrixWorld.decompose(floor.position, floor.quaternion, floor.scale);
        const slab = new T.Mesh(new T.BoxGeometry(size.x + 20, size.y + 20, 10), new T.MeshStandardMaterial());
        slab.position.set(center.x, center.y, mount.z - mount.inwardSign * 5);
        floor.add(slab);
        a.ensureWorkspaceModelId(floor);
        a.ensureModelTreeId(floor);
        a.state.scene.add(floor);
        a.state.models.push(floor);
        a.state.collision.enabled = true;
        const angles = robot.userData.joints.map(joint => joint.angle);
        const scan = () => {
            a.markSceneCollisionDirty();
            const hits = a.checkSceneCollisions({ force: true });
            return { hits: hits.length, baseHits: hits.filter(hit => hit.meshA === base || hit.meshB === base).length,
                safe: a.createAutoPathCollisionEvaluator(robot, angles).isSafe(angles) };
        };
        const touching = scan();
        slab.position.z += mount.inwardSign;
        const penetrating = scan();
        slab.position.z -= mount.inwardSign;
        const restored = scan();
        return { baseEnabled: base.userData.collisionDisabled !== true, touching, penetrating, restored };
    });
    expect(result.baseEnabled).toBe(true);
    expect(result.touching).toEqual({ hits: 0, baseHits: 0, safe: true });
    expect(result.penetrating.baseHits).toBeGreaterThan(0);
    expect(result.penetrating.safe).toBe(false);
    expect(result.restored).toEqual({ hits: 0, baseHits: 0, safe: true });
    expect(errors).toEqual([]);
});
