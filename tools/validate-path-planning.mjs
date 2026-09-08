import assert from 'node:assert/strict';
import {
    createSeededRandom,
    isStateWithinBounds,
    jointDistance,
    planJointWaypointGraph,
    planJointPath,
    simplifyJointPath,
    splitJointPath
} from '../2_3DSimulation/path-planning-core.mjs';

const bounds = [
    { min: 0, max: 10 },
    { min: 0, max: 10 }
];

const alwaysSafe = () => true;

const open = await planJointPath({
    start: [1, 1],
    goal: [9, 9],
    bounds,
    isStateSafe: alwaysSafe,
    edgeIsSafe: async () => true
});
assert.equal(open.success, true, 'open space should use a direct path');
assert.equal(open.direct, true, 'open space should report a direct path');
assert.deepEqual(open.path, [[1, 1], [9, 9]]);

const blockedState = (state) => !(state[0] > 4 && state[0] < 6 && state[1] > 2 && state[1] < 8);
const blockedEdge = (from, to) => {
    const distance = jointDistance(from, to, bounds);
    const samples = Math.max(1, Math.ceil(distance / 0.03));
    return Array.from({ length: samples }, (_, index) => {
        const alpha = (index + 1) / samples;
        return to.map((value, axis) => from[axis] + (value - from[axis]) * alpha);
    }).every(blockedState);
};
const detour = await planJointPath({
    start: [1, 5],
    goal: [9, 5],
    bounds,
    isStateSafe: blockedState,
    edgeIsSafe: blockedEdge,
    maxNodes: 2000,
    maxTimeMs: 3000,
    stepSize: 0.12,
    random: createSeededRandom(12345),
    yieldEvery: 100
});
assert.equal(detour.success, true, 'planner should route around a blocked corridor');
assert.equal(detour.direct, false);
assert.ok(detour.path.length > 2, 'detour should contain an intermediate waypoint');
assert.ok(detour.path.every((state) => isStateWithinBounds(state, bounds)), 'all detour states must remain bounded');
for (let index = 1; index < detour.path.length; index += 1) {
    assert.equal(blockedEdge(detour.path[index - 1], detour.path[index]), true, 'detour edges must remain safe');
}

const taughtDetour = await planJointWaypointGraph({
    start: [1, 5],
    goal: [9, 5],
    candidates: [[1, 1], [9, 1], [9, 9], [1, 9]],
    bounds,
    isStateSafe: blockedState,
    edgeIsSafe: blockedEdge,
    maxCandidates: 4,
    neighbors: 4,
    maxNeighbors: 4,
    maxTimeMs: 1000
});
assert.equal(taughtDetour.success, true, 'safe transition postures should form a usable taught detour');
assert.equal(taughtDetour.direct, false);
assert.ok(taughtDetour.path.length > 2, 'the waypoint graph must retain its required transition point');
for (let index = 1; index < taughtDetour.path.length; index += 1) {
    assert.equal(
        blockedEdge(taughtDetour.path[index - 1], taughtDetour.path[index]),
        true,
        'every taught transition edge must be collision-free'
    );
}

const invalidStart = await planJointPath({
    start: [5, 5],
    goal: [9, 5],
    bounds,
    isStateSafe: blockedState,
    edgeIsSafe: blockedEdge
});
assert.equal(invalidStart.success, false);
assert.match(invalidStart.reason, /collision/);

const unsimplified = [[0, 0], [1, 1], [2, 1], [3, 0]];
const simplified = await simplifyJointPath(unsimplified, async (from, to) => (
    !(from[0] === 0 && to[0] === 3)
));
assert.equal(simplified[0][0], 0);
assert.equal(simplified.at(-1)[0], 3);
assert.ok(simplified.length > 2, 'unsafe shortcut must preserve an intermediate waypoint');
const split = splitJointPath([[0, 0], [10, 0]], bounds, 0.25);
assert.equal(split[0][0], 0);
assert.equal(split.at(-1)[0], 10);
assert.ok(split.length > 2, 'large joint changes must be split');

console.log('Path planning validation passed.');
