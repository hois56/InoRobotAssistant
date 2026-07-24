import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const collisionModuleUrl = new URL('../2_3DSimulation/collision-system.mjs', import.meta.url);
const viewerModuleUrl = new URL('../2_3DSimulation/main.js', import.meta.url);
const threeModuleUrl = new URL('../3_ToolSelector/vendor/three/three.module.js', import.meta.url);
const threeModuleSpecifier = threeModuleUrl.href;
const collisionSource = await readFile(collisionModuleUrl, 'utf8');
const testableCollisionSource = collisionSource.replace(
    "from 'three';",
    `from '${threeModuleSpecifier}';`
);

assert.notEqual(testableCollisionSource, collisionSource, 'Collision module must retain its browser Three.js import.');

const { MeshCollisionSystem } = await import(
    `data:text/javascript;base64,${Buffer.from(testableCollisionSource).toString('base64')}`
);
const THREE = await import(threeModuleSpecifier);

function createBoxRoot(x) {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    root.position.x = x;
    root.updateMatrixWorld(true);
    return root;
}

const left = createBoxRoot(0);
const right = createBoxRoot(0.5);
const collisionSystem = new MeshCollisionSystem();

assert.ok(collisionSystem.check([left, right]), 'Initial overlap must be detected.');

right.position.x = 3;
right.updateMatrixWorld(true);
assert.equal(collisionSystem.check([left, right]), null, 'Separating meshes must clear the collision.');

right.position.x = 0.5;
right.updateMatrixWorld(true);
assert.ok(
    collisionSystem.check([left, right]),
    'Re-entering an overlap after a transform-cache refresh must be detected.'
);

const robot = new THREE.Group();
const robotLinks = [];
[-3, 0, 3].forEach((x, index) => {
    const link = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    link.name = `J${index + 4}`;
    link.userData.collisionIgnoreAttachedToolContact = index === 2;
    link.position.x = x;
    robot.add(link);
    robotLinks.push(link);
});
const tool = new THREE.Group();
tool.userData.attachmentHost = robot;
const toolMountMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
tool.add(toolMountMesh);
const toolBodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
toolBodyMesh.position.x = -3.25;
tool.add(toolBodyMesh);
tool.position.x = 3.25;
robot.add(tool);

const obstacle = new THREE.Group();
obstacle.add(new THREE.Mesh(new THREE.BoxGeometry(10, 3, 3), new THREE.MeshBasicMaterial()));
[robot, obstacle].forEach((root) => root.updateMatrixWorld(true));

const allHits = new MeshCollisionSystem().checkAll([robot, tool, obstacle]);
assert.equal(
    allHits.filter((hit) => hit.objectA === robot && hit.objectB === obstacle).length,
    3,
    'Every simultaneously colliding robot link must be reported.'
);
assert.ok(
    allHits.some((hit) => hit.objectA === tool && hit.objectB === obstacle),
    'A flange-mounted Tool must be reported when it collides with an obstacle.'
);
assert.ok(
    allHits.some((hit) => hit.objectA === robot && hit.objectB === tool
        && hit.meshA === robotLinks[1] && hit.meshB === toolBodyMesh),
    'A flange-mounted Tool must still be checked against another robot-body link.'
);
assert.equal(
    allHits.some((hit) => hit.objectA === robot && hit.objectB === tool
        && hit.meshA === robotLinks[2] && hit.meshB === toolMountMesh),
    false,
    'The attached Tool/J6 mounting interface must not be reported as a collision.'
);

const scaraRobot = new THREE.Group();
const scaraScrew = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
scaraScrew.name = 'J3 ballscrew';
scaraScrew.userData.collisionIgnoreAttachedToolContact = true;
scaraRobot.add(scaraScrew);
const scaraTool = new THREE.Group();
scaraTool.userData.attachmentHost = scaraRobot;
scaraTool.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
scaraRobot.add(scaraTool);
[scaraRobot, scaraTool].forEach((root) => root.updateMatrixWorld(true));
assert.equal(
    new MeshCollisionSystem().check([scaraRobot, scaraTool]),
    null,
    'A SCARA J3 ballscrew/Tool mounting interface must not report a collision.'
);

const repeatedCad = new THREE.Group();
for (let index = 0; index < 24; index += 1) {
    repeatedCad.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
}
const singleLink = createBoxRoot(0);
[singleLink, repeatedCad].forEach((root) => root.updateMatrixWorld(true));
const repeatedCadHits = new MeshCollisionSystem().checkAll([singleLink, repeatedCad]);
assert.equal(
    repeatedCadHits.length,
    1,
    'One link touching many CAD sub-meshes must produce one representative hit.'
);
assert.equal(
    repeatedCadHits[0].stats.meshPairs,
    1,
    'The representative hit must avoid redundant precise checks against the remaining CAD sub-meshes.'
);

const proxyVisual = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.1),
    new THREE.MeshBasicMaterial()
);
proxyVisual.userData.collisionGeometry = new THREE.BoxGeometry(2, 2, 2);
const proxyObstacle = createBoxRoot(0.75);
[proxyVisual, proxyObstacle].forEach((root) => root.updateMatrixWorld(true));
const proxyHit = new MeshCollisionSystem().check([proxyVisual, proxyObstacle]);
assert.ok(proxyHit, 'A separate collision proxy must participate in collision checks.');
assert.equal(
    proxyHit.meshA === proxyVisual || proxyHit.meshB === proxyVisual,
    true,
    'Collision results must retain the render mesh for highlighting when a proxy is used.'
);

const openShell = new THREE.Group();
const openShellGeometry = new THREE.BufferGeometry();
openShellGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.1, 0, 0, 0, 0.1, 0,
    4, 0, 0, 4.1, 0, 0, 4, 0.1, 0
], 3));
openShell.add(new THREE.Mesh(openShellGeometry, new THREE.MeshBasicMaterial()));
const enclosingBody = createBoxRoot(0);
[openShell, enclosingBody].forEach((root) => root.updateMatrixWorld(true));
assert.equal(
    new MeshCollisionSystem().check([openShell, enclosingBody]),
    null,
    'An open Tool shell with one vertex inside a body must not be treated as a solid containment collision.'
);

const cachedCollisionSystem = new MeshCollisionSystem();
assert.ok(cachedCollisionSystem.check([left, right]), 'The cached collision setup must begin overlapped.');
assert.equal(cachedCollisionSystem.hitMeshPairCache.size, 1, 'A confirmed collision pair must be retained for continuous JOG checks.');
assert.ok(cachedCollisionSystem.check([left, right]), 'The cached collision pair must remain detectable on the next frame.');

const broadPhaseOnlyTriangle = () => {
    const geometry = new THREE.BufferGeometry();
    // Its AABB overlaps the unit box at one corner, but the entire triangle
    // lies outside the box (x + y + z is always greater than 1.5).
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0.4, 0.6, 0.6,
        0.6, 0.4, 0.6,
        0.6, 0.6, 0.4
    ], 3));
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
};
const cacheObstacle = new THREE.Group();
for (let index = 0; index < 23; index += 1) cacheObstacle.add(broadPhaseOnlyTriangle());
const lastActualContact = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
cacheObstacle.add(lastActualContact);
const cacheProbe = createBoxRoot(0);
[cacheProbe, cacheObstacle].forEach((root) => root.updateMatrixWorld(true));
const continuousJogSystem = new MeshCollisionSystem();
const firstJogHits = continuousJogSystem.checkAll([cacheProbe, cacheObstacle], { now: 0 });
assert.equal(firstJogHits[0].stats.meshPairs, 24, 'The initial frame must discover the last exact CAD contact.');
const repeatedJogHits = continuousJogSystem.checkAll([cacheProbe, cacheObstacle], { now: 16 });
assert.equal(repeatedJogHits[0].stats.meshPairs, 0, 'A sustained collision must reuse its recently confirmed exact pair.');
assert.equal(repeatedJogHits[0].stats.warmHitReuses, 1, 'A sustained collision must avoid a second BVH walk during the warm-hit window.');
const expiredWarmHit = continuousJogSystem.checkAll([cacheProbe, cacheObstacle], { now: 250 });
assert.equal(expiredWarmHit[0].stats.meshPairs, 1, 'A sustained collision must be verified again after the warm-hit window expires.');

const staticLeft = createBoxRoot(0);
const staticRight = createBoxRoot(0.5);
const movingProbe = createBoxRoot(4);
const movingObstacle = createBoxRoot(4.5);
const partialRefreshSystem = new MeshCollisionSystem();
const partialRefreshRoots = [staticLeft, staticRight, movingProbe, movingObstacle];
partialRefreshRoots.forEach((root) => root.updateMatrixWorld(true));
const fullRefreshHits = partialRefreshSystem.checkAll(partialRefreshRoots);
assert.equal(fullRefreshHits.length, 2, 'The initial pass must cache both the static and moving collision pairs.');

movingProbe.position.x = 8;
movingProbe.updateMatrixWorld(true);
const partialRefreshHits = partialRefreshSystem.checkAll(partialRefreshRoots, {
    changedRoots: new Set([movingProbe])
});
assert.equal(partialRefreshHits.length, 1, 'A partial refresh must preserve the static collision while clearing the moved pair.');
assert.equal(
    partialRefreshSystem.lastStats.refreshedModelPairs,
    3,
    'A partial refresh must retest only model pairs that include a changed collision root.'
);

const viewerSource = await readFile(viewerModuleUrl, 'utf8');
assert.match(viewerSource, /checkAll\(getCollisionModels\(\), \{ allowWarmHitReuse: false \}\)/, 'A forced viewer scan must consume every collision hit without stale reuse.');
assert.match(
    viewerSource,
    /function setAttachedToolCollisionHighlight\(model, enabled\)/,
    'A Tool collision must colour every visible Tool mesh, not only the representative contact mesh.'
);
assert.match(
    viewerSource,
    /setAttachedToolCollisionHighlight\(hit\.objectA, true\);\s*setAttachedToolCollisionHighlight\(hit\.objectB, true\);/,
    'Collision feedback must apply the Tool-wide highlight to both collision participants.'
);
assert.match(
    viewerSource,
    /const isAttachedToolMountAssembly = index === manifest\.joints\.length - 1\s*\|\|\s*\(manifest\.robotType === 'scara' && jointDefinition\.name === 'J3'\);/,
    'Every robot type must exclude its final Tool mount, and SCARA must also exclude its J3 ballscrew interface.'
);
assert.match(viewerSource, /ignoredMotionCollisionKeys:\s*new Set\(\)/, 'Motion restart must track every existing collision pair.');
assert.match(viewerSource, /const currentCollisionResults = checkSceneCollisions\(\{ force: true \}\)/, 'Restart must accept the current collision pose.');
const animateSource = viewerSource.slice(viewerSource.indexOf('function animate('), viewerSource.indexOf('function onResize('));
const programStopSource = animateSource.slice(0, animateSource.indexOf('} else if (collisionFresh && asCollisionResults(collision).length && isVirtualControllerActive())'));
assert.doesNotMatch(programStopSource, /restoreCollisionSafeRobotPoses\(movingRobots\)/, 'Program collision stops must retain the detected pose.');

console.log('Mesh collision validation passed: transform-cache refresh, all-hit reporting, Tool/body detection, J6 mount exclusion, false-containment protection, lazy BVH bounds, warm-hit reuse, root-pair caching, and collision breakpoint flow.');
