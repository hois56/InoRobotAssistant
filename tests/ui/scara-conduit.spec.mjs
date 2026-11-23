import { expect, test } from '@playwright/test';

test('SCARA의 케이블과 J2 체결부가 조그 중 함께 회전한다', async ({ page }) => {
    test.setTimeout(180_000);
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.scaraConduitTest = { state, THREE, loadArticulatedRobot, setJointAngle };` });
    });
    await page.goto('/2_3DSimulation/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#model-select option[value="robot:IR-S7-60Z20"]')).toHaveCount(1, { timeout: 30_000 });
    const results = await page.evaluate(async () => {
        const { state, THREE, loadArticulatedRobot, setJointAngle } = window.scaraConduitTest;
        const results = [];
        for (const definition of state.catalog.values()) {
            if (definition.robotType !== 'scara') continue;
            const robot = await loadArticulatedRobot(definition);
            const { joints, scaraTube, scaraTubeConnector } = robot.userData;
            const result = { folder: definition.folder, ceiling: definition.kinematicVariant === 'ceiling-scara' };
            result.hasConduit = Boolean(scaraTube);
            result.hasConnector = Boolean(scaraTubeConnector);
            if (scaraTubeConnector) {
                const { group, fitting } = scaraTubeConnector;
                const { sourceEnd, sourceSpan, cableZ, originalPositions } = scaraTube.userData.conduit;
                const angled = fitting.inlet[0] !== 0;
                const capX = sourceEnd.x + sourceSpan;
                const capVertices = [];
                for (let i = 0; i < originalPositions.length; i += 3) {
                    const x = originalPositions[i] - capX;
                    const y = originalPositions[i + 1] - sourceEnd.y;
                    const z = originalPositions[i + 2] - cableZ;
                    if (Math.hypot(x, y, z) < 21 && Math.abs(z - (angled ? x : 0)) < 1) {
                        capVertices.push(i / 3);
                    }
                }
                const cablePositions = scaraTube.geometry.getAttribute('position');
                const inlet = new THREE.Vector3(fitting.inlet[0], 0, fitting.inlet[1] - fitting.seam);
                const capError = () => {
                    const bounds = new THREE.Box3();
                    for (const vertex of capVertices) {
                        bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(cablePositions, vertex));
                    }
                    return capVertices.length
                        ? scaraTube.localToWorld(bounds.getCenter(new THREE.Vector3())).distanceTo(group.localToWorld(inlet.clone()))
                        : Infinity;
                };
                const readPose = () => ({
                    socket: group.getWorldPosition(new THREE.Vector3()),
                    angle: group.getWorldQuaternion(new THREE.Quaternion()),
                    capError: capError()
                });
                const initial = readPose();
                setJointAngle(joints[1], 65, false);
                const j2Pose = readPose();
                setJointAngle(joints[0], -55, false);
                const bothPose = readPose();
                result.j2SocketTravel = initial.socket.distanceTo(j2Pose.socket);
                result.j2ConnectorTurn = initial.angle.angleTo(j2Pose.angle);
                result.j1ConnectorTurn = j2Pose.angle.angleTo(bothPose.angle);
                result.capErrors = [initial.capError, j2Pose.capError, bothPose.capError];
                result.fittingFaces = group.children[0].geometry.getAttribute('position').count / 3;
            }
            results.push(result);
            robot.traverse(object => {
                if (object.isMesh) {
                    for (const material of [].concat(object.material)) material.dispose();
                }
            });
        }
        return results;
    });
    expect(results).toHaveLength(17);
    for (const result of results) {
        expect(result.hasConduit, result.folder).toBe(!result.ceiling);
        expect(result.hasConnector, result.folder).toBe(!result.ceiling);
        if (result.ceiling) continue;
        expect(result.j2SocketTravel, result.folder).toBeLessThan(0.05);
        expect(result.j2ConnectorTurn, result.folder).toBeLessThan(0.001);
        expect(result.j1ConnectorTurn, result.folder).toBeGreaterThan(0.15);
        expect(result.fittingFaces, result.folder).toBeGreaterThan(100);
        for (const error of result.capErrors) expect(error, result.folder).toBeLessThan(1.5);
    }
});
