const EPSILON = 1e-9;

function copyState(state) {
    return Array.isArray(state) ? state.map((value) => Number(value)) : [];
}

function finiteState(state, dimension = state?.length) {
    return Array.isArray(state)
        && state.length === dimension
        && state.every((value) => Number.isFinite(value));
}

function normalizeBounds(bounds, dimension) {
    return Array.from({ length: dimension }, (_, index) => {
        const bound = bounds?.[index] || {};
        const min = Number(bound.min);
        const max = Number(bound.max);
        return {
            min: Number.isFinite(min) ? min : -Infinity,
            max: Number.isFinite(max) ? max : Infinity,
            weight: Number.isFinite(Number(bound.weight)) && Number(bound.weight) > 0
                ? Number(bound.weight)
                : 1
        };
    });
}

export function createSeededRandom(seed = 0x1f123bb5) {
    let value = Number(seed) >>> 0;
    return () => {
        value = (value + 0x6D2B79F5) >>> 0;
        let result = Math.imul(value ^ (value >>> 15), 1 | value);
        result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}

export function jointDistance(a, b, bounds = []) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
    return Math.sqrt(a.reduce((sum, value, index) => {
        const range = Number(bounds[index]?.max) - Number(bounds[index]?.min);
        const scale = Number.isFinite(range) && range > EPSILON ? range : 1;
        const weight = Number.isFinite(Number(bounds[index]?.weight)) ? Number(bounds[index].weight) : 1;
        return sum + (((Number(value) - Number(b[index])) / scale) ** 2) * weight;
    }, 0));
}

export function isStateWithinBounds(state, bounds = []) {
    return finiteState(state, bounds.length) && bounds.every((bound, index) => (
        state[index] >= bound.min - EPSILON && state[index] <= bound.max + EPSILON
    ));
}

function steer(from, to, distance, bounds) {
    if (distance <= EPSILON) return copyState(to);
    const ratio = Math.min(1, 1 / distance);
    return from.map((value, index) => {
        const next = value + (to[index] - value) * ratio;
        return Math.min(bounds[index].max, Math.max(bounds[index].min, next));
    });
}

function randomState(bounds, random) {
    return bounds.map((bound) => {
        if (Number.isFinite(bound.min) && Number.isFinite(bound.max)) {
            return bound.min + (bound.max - bound.min) * random();
        }
        return 0;
    });
}

function nearestNode(tree, state, bounds) {
    return tree.reduce((nearest, candidate) => (
        !nearest || jointDistance(candidate.state, state, bounds) < jointDistance(nearest.state, state, bounds)
            ? candidate
            : nearest
    ), null);
}

function traceToRoot(node) {
    const path = [];
    let cursor = node;
    while (cursor) {
        path.push(copyState(cursor.state));
        cursor = cursor.parent;
    }
    return path.reverse();
}

async function checkState(state, bounds, isStateSafe) {
    return isStateWithinBounds(state, bounds)
        && (typeof isStateSafe !== 'function' || await isStateSafe(copyState(state)) !== false);
}

async function checkEdge(from, to, bounds, edgeIsSafe) {
    if (typeof edgeIsSafe !== 'function') return true;
    return await edgeIsSafe(copyState(from), copyState(to), bounds) !== false;
}

async function yieldPlanner(onYield) {
    if (typeof onYield === 'function') {
        await onYield();
    } else {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

/**
 * Deterministic, callback-driven bidirectional RRT-Connect planner.
 * Collision and kinematics stay outside this module so the planner can be
 * tested independently from Three.js and the browser scene.
 */
export async function planJointPath({
    start,
    goal,
    bounds = [],
    isStateSafe = null,
    edgeIsSafe = null,
    maxNodes = 5000,
    maxTimeMs = 7000,
    goalBias = 0.15,
    stepSize = 0.16,
    random = createSeededRandom(),
    sampleStates = [],
    sampleBias = 0.3,
    shouldCancel = () => false,
    onProgress = null,
    onYield = null,
    yieldEvery = 80
} = {}) {
    const dimension = Array.isArray(start) ? start.length : 0;
    const normalizedBounds = normalizeBounds(bounds, dimension);
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    const fail = (reason, nodes = 0) => ({
        success: false,
        path: [],
        reason,
        nodes,
        elapsedMs: elapsed(),
        direct: false
    });

    if (!finiteState(start, dimension) || !finiteState(goal, dimension) || dimension === 0) {
        return fail('invalid joint state');
    }
    if (!normalizedBounds.every((bound) => bound.min <= bound.max)
        || !isStateWithinBounds(start, normalizedBounds)
        || !isStateWithinBounds(goal, normalizedBounds)) {
        return fail('joint limit exceeded');
    }
    if (!(await checkState(start, normalizedBounds, isStateSafe))) return fail('start state is in collision');
    if (!(await checkState(goal, normalizedBounds, isStateSafe))) return fail('goal state is in collision');
    if (await checkEdge(start, goal, normalizedBounds, edgeIsSafe)) {
        return {
            success: true,
            path: [copyState(start), copyState(goal)],
            reason: '',
            nodes: 2,
            elapsedMs: elapsed(),
            direct: true
        };
    }

    const maximumNodes = Math.max(2, Math.floor(Number(maxNodes) || 5000));
    const maximumTime = Math.max(1, Number(maxTimeMs) || 7000);
    const trees = [
        [{ state: copyState(start), parent: null }],
        [{ state: copyState(goal), parent: null }]
    ];
    const guidedSamples = (sampleStates || [])
        .filter((state) => finiteState(state, dimension) && isStateWithinBounds(state, normalizedBounds))
        .filter((state, index, values) => !values.slice(0, index).some((other) => (
            jointDistance(state, other, normalizedBounds) < 0.002
        )))
        .map(copyState);
    const normalizedSampleBias = Math.max(0, Math.min(1, Number(sampleBias) || 0));
    let guidedSampleIndex = 0;
    let totalNodes = 2;
    let lastProgress = 0;

    const extend = async (tree, target) => {
        const nearest = nearestNode(tree, target, normalizedBounds);
        if (!nearest) return { status: 'trapped', node: null };
        const distance = jointDistance(nearest.state, target, normalizedBounds);
        if (distance <= EPSILON) return { status: 'reached', node: nearest };
        const nextState = steer(nearest.state, target, Math.max(distance, EPSILON) / Math.max(stepSize, EPSILON), normalizedBounds);
        if (!(await checkState(nextState, normalizedBounds, isStateSafe))
            || !(await checkEdge(nearest.state, nextState, normalizedBounds, edgeIsSafe))) {
            return { status: 'trapped', node: null };
        }
        const node = { state: nextState, parent: nearest };
        tree.push(node);
        totalNodes += 1;
        return {
            status: jointDistance(nextState, target, normalizedBounds) <= Math.max(stepSize, EPSILON)
                ? 'reached'
                : 'advanced',
            node
        };
    };

    while (totalNodes < maximumNodes && elapsed() <= maximumTime) {
        if (shouldCancel()) return fail('cancelled', totalNodes);
        const active = trees[0];
        const passive = trees[1];
        const useGuidedSample = guidedSamples.length > 0
            && (guidedSampleIndex < guidedSamples.length || random() < normalizedSampleBias);
        const sample = useGuidedSample
            ? guidedSamples[(guidedSampleIndex++) % guidedSamples.length]
            : random() < goalBias
                ? passive[0].state
                : randomState(normalizedBounds, random);
        const activeResult = await extend(active, sample);
        if (activeResult.node) {
            let passiveResult = await extend(passive, activeResult.node.state);
            while (passiveResult.status === 'advanced' && totalNodes < maximumNodes && elapsed() <= maximumTime) {
                passiveResult = await extend(passive, activeResult.node.state);
            }
            if (passiveResult.status === 'reached' && passiveResult.node) {
                const firstPath = traceToRoot(activeResult.node);
                const secondPath = traceToRoot(passiveResult.node).reverse();
                const path = firstPath.concat(secondPath.slice(1));
                return {
                    success: true,
                    path,
                    reason: '',
                    nodes: totalNodes,
                    elapsedMs: elapsed(),
                    direct: false
                };
            }
        }
        trees.reverse();
        if (totalNodes - lastProgress >= Math.max(1, yieldEvery)) {
            lastProgress = totalNodes;
            if (typeof onProgress === 'function') await onProgress({ nodes: totalNodes, elapsedMs: elapsed() });
            await yieldPlanner(onYield);
        }
    }
    return fail(shouldCancel() ? 'cancelled' : 'route not found within limits', totalNodes);
}

function shortestWaypointGraphPath(adjacency, goalIndex) {
    const costs = new Array(adjacency.length).fill(Infinity);
    const previous = new Array(adjacency.length).fill(-1);
    const pending = new Set(adjacency.map((_, index) => index));
    costs[0] = 0;

    while (pending.size) {
        let current = -1;
        let currentCost = Infinity;
        pending.forEach((index) => {
            if (costs[index] < currentCost) {
                current = index;
                currentCost = costs[index];
            }
        });
        if (current < 0 || !Number.isFinite(currentCost)) break;
        pending.delete(current);
        if (current === goalIndex) break;
        adjacency[current].forEach(({ index, cost }) => {
            if (!pending.has(index)) return;
            const candidateCost = currentCost + cost;
            if (candidateCost < costs[index]) {
                costs[index] = candidateCost;
                previous[index] = current;
            }
        });
    }

    if (!Number.isFinite(costs[goalIndex])) return null;
    const indices = [];
    for (let index = goalIndex; index >= 0; index = previous[index]) {
        indices.push(index);
        if (index === 0) break;
    }
    return indices.at(-1) === 0 ? indices.reverse() : null;
}

/**
 * Finds a short route through supplied, collision-checked transition postures.
 * This is intentionally separate from the random RRT fallback: callers can
 * provide meaningful teaching-like poses (for example, raised clearance poses)
 * and receive only the actual turning points needed to connect them.
 */
export async function planJointWaypointGraph({
    start,
    goal,
    candidates = [],
    bounds = [],
    isStateSafe = null,
    edgeIsSafe = null,
    maxCandidates = 120,
    neighbors = 10,
    maxNeighbors = 24,
    maxTimeMs = 3500,
    shouldCancel = () => false,
    onProgress = null,
    onYield = null,
    yieldEvery = 24
} = {}) {
    const dimension = Array.isArray(start) ? start.length : 0;
    const normalizedBounds = normalizeBounds(bounds, dimension);
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    const fail = (reason, nodeCount = 0, checkedEdges = 0) => ({
        success: false,
        path: [],
        reason,
        nodes: nodeCount,
        checkedEdges,
        elapsedMs: elapsed(),
        direct: false
    });

    if (!finiteState(start, dimension) || !finiteState(goal, dimension) || dimension === 0) {
        return fail('invalid joint state');
    }
    if (!normalizedBounds.every((bound) => bound.min <= bound.max)
        || !isStateWithinBounds(start, normalizedBounds)
        || !isStateWithinBounds(goal, normalizedBounds)) {
        return fail('joint limit exceeded');
    }
    if (!(await checkState(start, normalizedBounds, isStateSafe))) return fail('start state is in collision');
    if (!(await checkState(goal, normalizedBounds, isStateSafe))) return fail('goal state is in collision');
    if (await checkEdge(start, goal, normalizedBounds, edgeIsSafe)) {
        return {
            success: true,
            path: [copyState(start), copyState(goal)],
            reason: '',
            nodes: 2,
            checkedEdges: 1,
            elapsedMs: elapsed(),
            direct: true
        };
    }

    const nodes = [copyState(start), copyState(goal)];
    const candidateLimit = Math.max(0, Math.floor(Number(maxCandidates) || 0));
    const addCandidate = (candidate) => {
        const state = Array.isArray(candidate) ? candidate : candidate?.state;
        if (!finiteState(state, dimension) || !isStateWithinBounds(state, normalizedBounds)) return false;
        if (nodes.some((existing) => jointDistance(existing, state, normalizedBounds) < 0.002)) return false;
        nodes.push(copyState(state));
        return true;
    };
    for (const candidate of candidates) {
        if (nodes.length - 2 >= candidateLimit || shouldCancel() || elapsed() > maxTimeMs) break;
        addCandidate(candidate);
    }
    if (shouldCancel()) return fail('cancelled', nodes.length);
    if (elapsed() > maxTimeMs) return fail('route not found within limits', nodes.length);

    const safeNodes = [nodes[0], nodes[1]];
    let inspected = 0;
    for (let index = 2; index < nodes.length; index += 1) {
        if (shouldCancel()) return fail('cancelled', safeNodes.length);
        if (elapsed() > maxTimeMs) return fail('route not found within limits', safeNodes.length);
        if (await checkState(nodes[index], normalizedBounds, isStateSafe)) safeNodes.push(nodes[index]);
        inspected += 1;
        if (inspected % Math.max(1, yieldEvery) === 0) {
            if (typeof onProgress === 'function') {
                await onProgress({
                    phase: 'transition states',
                    nodes: safeNodes.length,
                    candidates: nodes.length - 2,
                    checkedEdges: 0,
                    elapsedMs: elapsed()
                });
            }
            await yieldPlanner(onYield);
        }
    }
    if (safeNodes.length <= 2) return fail('no safe transition postures', safeNodes.length);

    const adjacency = safeNodes.map(() => []);
    const checkedPairs = new Set(['0:1']);
    let checkedEdges = 1;
    const attachEdge = (from, to) => {
        const cost = jointDistance(safeNodes[from], safeNodes[to], normalizedBounds);
        adjacency[from].push({ index: to, cost });
        adjacency[to].push({ index: from, cost });
    };
    const initialNeighbors = Math.max(1, Math.floor(Number(neighbors) || 1));
    const expandedNeighbors = Math.max(initialNeighbors, Math.floor(Number(maxNeighbors) || initialNeighbors));
    const neighborPasses = [...new Set([initialNeighbors, expandedNeighbors])];

    for (const neighborLimit of neighborPasses) {
        const pairs = [];
        safeNodes.forEach((state, from) => {
            const nearest = safeNodes
                .map((other, to) => ({ to, distance: jointDistance(state, other, normalizedBounds) }))
                .filter(({ to }) => to !== from)
                .sort((left, right) => left.distance - right.distance)
                .slice(0, neighborLimit);
            nearest.forEach(({ to }) => {
                const left = Math.min(from, to);
                const right = Math.max(from, to);
                const key = `${left}:${right}`;
                if (checkedPairs.has(key)) return;
                checkedPairs.add(key);
                pairs.push({ from: left, to: right });
            });
        });
        pairs.sort((left, right) => (
            jointDistance(safeNodes[left.from], safeNodes[left.to], normalizedBounds)
            - jointDistance(safeNodes[right.from], safeNodes[right.to], normalizedBounds)
        ));

        for (const { from, to } of pairs) {
            if (shouldCancel()) return fail('cancelled', safeNodes.length, checkedEdges);
            if (elapsed() > maxTimeMs) return fail('route not found within limits', safeNodes.length, checkedEdges);
            if (await checkEdge(safeNodes[from], safeNodes[to], normalizedBounds, edgeIsSafe)) {
                attachEdge(from, to);
            }
            checkedEdges += 1;
            if (checkedEdges % Math.max(1, yieldEvery) === 0) {
                if (typeof onProgress === 'function') {
                    await onProgress({
                        phase: 'transition links',
                        nodes: safeNodes.length,
                        candidates: nodes.length - 2,
                        checkedEdges,
                        elapsedMs: elapsed()
                    });
                }
                await yieldPlanner(onYield);
            }
        }

        const route = shortestWaypointGraphPath(adjacency, 1);
        if (route) {
            return {
                success: true,
                path: route.map((index) => copyState(safeNodes[index])),
                reason: '',
                nodes: safeNodes.length,
                checkedEdges,
                elapsedMs: elapsed(),
                direct: false
            };
        }
    }
    return fail('route not found through safe transition postures', safeNodes.length, checkedEdges);
}

export async function simplifyJointPath(path, isSegmentSafe, { maxPasses = 3, shouldCancel = () => false } = {}) {
    const result = (path || []).map(copyState);
    if (result.length <= 2 || typeof isSegmentSafe !== 'function') return result;
    for (let pass = 0; pass < Math.max(1, maxPasses); pass += 1) {
        let changed = false;
        let index = 0;
        while (index < result.length - 2) {
            if (shouldCancel()) return result;
            let removed = false;
            for (let candidate = result.length - 1; candidate > index + 1; candidate -= 1) {
                if (await isSegmentSafe(result[index], result[candidate]) !== false) {
                    result.splice(index + 1, candidate - index - 1);
                    changed = true;
                    removed = true;
                    break;
                }
            }
            if (!removed) index += 1;
        }
        if (!changed) break;
    }
    return result;
}

export function splitJointPath(path, bounds = [], maxDistance = 0.2) {
    const result = [];
    const limit = Math.max(EPSILON, Number(maxDistance) || 0.2);
    (path || []).forEach((state, index) => {
        if (index === 0) {
            result.push(copyState(state));
            return;
        }
        const previous = result[result.length - 1];
        const distance = jointDistance(previous, state, bounds);
        const segments = Math.max(1, Math.ceil(distance / limit));
        for (let segment = 1; segment <= segments; segment += 1) {
            const alpha = segment / segments;
            result.push(state.map((value, jointIndex) => previous[jointIndex] + (value - previous[jointIndex]) * alpha));
        }
    });
    return result;
}
