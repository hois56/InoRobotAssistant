const EPSILON = 1e-12;

const flatten = (value) => Array.isArray(value?.[0]) ? value.flat() : Array.from(value || []);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length = (v) => Math.hypot(v[0], v[1], v[2]);
const distance = (a, b) => length(sub(a, b));
const normalize = (v) => {
  const magnitude = length(v);
  return magnitude > EPSILON ? scale(v, 1 / magnitude) : [0, 0, 0];
};
const midpoint = (a, b) => scale(add(a, b), 0.5);
const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

export function averagePoints(points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 4) {
    throw new RangeError('Point count must be between 2 and 4.');
  }
  const normalized = points.map((point) => Array.from(point || [], Number));
  if (normalized.some((point) => point.length !== 3 || !point.every(Number.isFinite))) {
    throw new TypeError('Each circle center must contain three finite coordinates.');
  }
  const total = normalized.reduce((sum, point) => add(sum, point), [0, 0, 0]);
  return scale(total, 1 / normalized.length);
}

function boundsOf(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  points.forEach((point) => {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  });
  return { min, max, diagonal: distance(min, max), center: midpoint(min, max) };
}

function weldPositions(rawPositions, tolerance) {
  const positions = [];
  const sourceToWelded = [];
  const buckets = new Map();
  const inverse = 1 / tolerance;

  for (let index = 0; index < rawPositions.length; index += 1) {
    const point = rawPositions[index];
    const key = `${Math.round(point[0] * inverse)}:${Math.round(point[1] * inverse)}:${Math.round(point[2] * inverse)}`;
    let weldedIndex = buckets.get(key);
    if (weldedIndex === undefined) {
      weldedIndex = positions.length;
      buckets.set(key, weldedIndex);
      positions.push(point);
    }
    sourceToWelded[index] = weldedIndex;
  }
  return { positions, sourceToWelded };
}

function triangleProperties(a, b, c) {
  const normalVector = cross(sub(b, a), sub(c, a));
  const twiceArea = length(normalVector);
  return {
    area: twiceArea * 0.5,
    normal: twiceArea > EPSILON ? scale(normalVector, 1 / twiceArea) : [0, 0, 0],
    centroid: scale(add(add(a, b), c), 1 / 3)
  };
}

function addGraphEdge(graph, a, b) {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a).add(b);
  graph.get(b).add(a);
}

function polylineMidpoint(path, points) {
  let total = 0;
  const segments = [];
  for (let index = 1; index < path.length; index += 1) {
    const segmentLength = distance(points[path[index - 1]], points[path[index]]);
    segments.push(segmentLength);
    total += segmentLength;
  }
  if (total <= EPSILON) return points[path[0]];
  const target = total * 0.5;
  let travelled = 0;
  for (let index = 0; index < segments.length; index += 1) {
    if (travelled + segments[index] >= target) {
      const ratio = (target - travelled) / segments[index];
      return add(points[path[index]], scale(sub(points[path[index + 1]], points[path[index]]), ratio));
    }
    travelled += segments[index];
  }
  return points[path[path.length - 1]];
}

function buildFeatureChains(featureEdges, graph, nodeSet) {
  const visited = new Set();
  const chains = [];

  const follow = (start, next) => {
    const path = [start, next];
    let previous = start;
    let current = next;
    visited.add(edgeKey(start, next));
    while (!nodeSet.has(current)) {
      const neighbors = [...(graph.get(current) || [])];
      const following = neighbors.find((neighbor) => neighbor !== previous && !visited.has(edgeKey(current, neighbor)));
      if (following === undefined) break;
      visited.add(edgeKey(current, following));
      path.push(following);
      previous = current;
      current = following;
      if (current === start) break;
    }
    return path;
  };

  nodeSet.forEach((node) => {
    (graph.get(node) || []).forEach((neighbor) => {
      if (!visited.has(edgeKey(node, neighbor))) {
        const path = follow(node, neighbor);
        chains.push({ path, closed: path[path.length - 1] === path[0] });
      }
    });
  });

  featureEdges.forEach(({ a, b }) => {
    if (visited.has(edgeKey(a, b))) return;
    const path = follow(a, b);
    const closed = path[path.length - 1] === path[0] || (graph.get(path[path.length - 1]) || new Set()).has(path[0]);
    if (closed && path[path.length - 1] !== path[0]) path.push(path[0]);
    chains.push({ path, closed });
  });
  return chains;
}

function fitCircle(path, points, tolerance, modelDiagonal) {
  const ids = path[path.length - 1] === path[0] ? path.slice(0, -1) : path;
  if (ids.length < 3) return null;
  const a = points[ids[0]];
  const b = points[ids[Math.floor(ids.length / 2)]];
  const c = points[ids[ids.length - 1]];
  const ab = sub(b, a);
  const ac = sub(c, a);
  const normalVector = cross(ab, ac);
  const normalSquared = dot(normalVector, normalVector);
  if (normalSquared <= tolerance * tolerance) return null;

  const offset = scale(add(
    scale(cross(ac, normalVector), dot(ab, ab)),
    scale(cross(normalVector, ab), dot(ac, ac))
  ), 1 / (2 * normalSquared));
  const center = add(a, offset);
  const radius = distance(center, a);
  if (!Number.isFinite(radius) || radius <= tolerance || radius > Math.max(modelDiagonal * 10, tolerance * 100)) return null;

  const normal = normalize(normalVector);
  const radialTolerance = Math.max(tolerance * 20, radius * 0.012);
  const planeTolerance = Math.max(tolerance * 20, modelDiagonal * 1e-5);
  for (const id of ids) {
    const delta = sub(points[id], center);
    if (Math.abs(dot(delta, normal)) > planeTolerance || Math.abs(length(delta) - radius) > radialTolerance) return null;
  }
  return { center, radius };
}

function straightLineForChain(chain, points, tolerance) {
  const ids = chain.closed ? chain.path.slice(0, -1) : chain.path;
  if (chain.closed || ids.length < 2) return null;
  const a = points[ids[0]];
  const b = points[ids[ids.length - 1]];
  const span = distance(a, b);
  if (span <= tolerance) return null;
  const direction = normalize(sub(b, a));
  const maxDeviation = Math.max(tolerance * 20, span * 1e-4);
  for (const id of ids.slice(1, -1)) {
    const relative = sub(points[id], a);
    const projected = scale(direction, dot(relative, direction));
    if (length(sub(relative, projected)) > maxDeviation) return null;
  }
  return { a, b, direction, length: span };
}

function closestLineIntersection(first, second, tolerance, extensionRatio) {
  const offset = sub(first.a, second.a);
  const directionDot = dot(first.direction, second.direction);
  const denominator = 1 - directionDot * directionDot;
  if (denominator < 1e-5) return null;
  const firstOffset = dot(first.direction, offset);
  const secondOffset = dot(second.direction, offset);
  const firstParameter = (directionDot * secondOffset - firstOffset) / denominator;
  const secondParameter = (secondOffset - directionDot * firstOffset) / denominator;
  const firstLimit = first.length * extensionRatio;
  const secondLimit = second.length * extensionRatio;
  if (firstParameter < -firstLimit || firstParameter > first.length + firstLimit) return null;
  if (secondParameter < -secondLimit || secondParameter > second.length + secondLimit) return null;
  const firstPoint = add(first.a, scale(first.direction, firstParameter));
  const secondPoint = add(second.a, scale(second.direction, secondParameter));
  if (distance(firstPoint, secondPoint) > tolerance) return null;
  return midpoint(firstPoint, secondPoint);
}

export function buildStepSnapCandidates(meshDefinition, options = {}) {
  const flatPositions = flatten(meshDefinition.attributes?.position?.array);
  if (flatPositions.length < 9 || flatPositions.length % 3 !== 0) return { candidates: [], stats: {} };
  const rawPositions = [];
  for (let index = 0; index < flatPositions.length; index += 3) {
    rawPositions.push([flatPositions[index], flatPositions[index + 1], flatPositions[index + 2]]);
  }
  const rawBounds = boundsOf(rawPositions);
  const weldTolerance = options.weldTolerance || Math.max(rawBounds.diagonal * 1e-7, 1e-6);
  const { positions, sourceToWelded } = weldPositions(rawPositions, weldTolerance);
  const flatIndices = flatten(meshDefinition.index?.array);
  const sourceIndices = flatIndices.length ? flatIndices : rawPositions.map((_, index) => index);
  const triangles = [];
  for (let index = 0; index + 2 < sourceIndices.length; index += 3) {
    const ids = [sourceToWelded[sourceIndices[index]], sourceToWelded[sourceIndices[index + 1]], sourceToWelded[sourceIndices[index + 2]]];
    if (new Set(ids).size < 3) continue;
    const properties = triangleProperties(positions[ids[0]], positions[ids[1]], positions[ids[2]]);
    if (properties.area <= EPSILON) continue;
    triangles.push({ ids, sourceIndex: Math.floor(index / 3), ...properties });
  }

  const featureEdgeMap = new Map();
  const faceCenters = [];
  const brepFaces = Array.isArray(meshDefinition.brep_faces) ? meshDefinition.brep_faces : [];

  if (brepFaces.length) {
    const trianglesBySourceIndex = new Map(triangles.map((triangle) => [triangle.sourceIndex, triangle]));
    brepFaces.forEach((face, faceIndex) => {
      const faceTriangles = [];
      for (let sourceIndex = face.first; sourceIndex <= face.last; sourceIndex += 1) {
        const triangle = trianglesBySourceIndex.get(sourceIndex);
        if (triangle) faceTriangles.push(triangle);
      }
      const localEdges = new Map();
      let area = 0;
      let weightedCenter = [0, 0, 0];
      faceTriangles.forEach((triangle) => {
        area += triangle.area;
        weightedCenter = add(weightedCenter, scale(triangle.centroid, triangle.area));
        [[0, 1], [1, 2], [2, 0]].forEach(([from, to]) => {
          const a = triangle.ids[from];
          const b = triangle.ids[to];
          const key = edgeKey(a, b);
          const entry = localEdges.get(key) || { a, b, count: 0 };
          entry.count += 1;
          localEdges.set(key, entry);
        });
      });
      localEdges.forEach((edge, key) => {
        if (edge.count === 1) featureEdgeMap.set(key, { a: edge.a, b: edge.b });
      });
      if (area > EPSILON) faceCenters.push({ type: 'face-center', point: scale(weightedCenter, 1 / area), source: { faceIndex } });
    });
  } else {
    const allEdges = new Map();
    triangles.forEach((triangle, triangleIndex) => {
      [[0, 1], [1, 2], [2, 0]].forEach(([from, to]) => {
        const a = triangle.ids[from];
        const b = triangle.ids[to];
        const key = edgeKey(a, b);
        const entry = allEdges.get(key) || { a, b, triangles: [] };
        entry.triangles.push(triangleIndex);
        allEdges.set(key, entry);
      });
    });
    const sharpCosine = Math.cos((options.sharpAngleDegrees || 28) * Math.PI / 180);
    allEdges.forEach((edge, key) => {
      const adjacent = edge.triangles;
      if (adjacent.length !== 2 || dot(triangles[adjacent[0]].normal, triangles[adjacent[1]].normal) < sharpCosine) {
        featureEdgeMap.set(key, { a: edge.a, b: edge.b });
      }
    });
  }

  const featureEdges = [...featureEdgeMap.values()];
  const graph = new Map();
  featureEdges.forEach(({ a, b }) => addGraphEdge(graph, a, b));
  const endpointIds = new Set();
  const vertexIds = new Set();
  const cornerCosine = -Math.cos((options.cornerAngleDegrees || 28) * Math.PI / 180);
  graph.forEach((neighbors, id) => {
    if (neighbors.size === 1) endpointIds.add(id);
    else if (neighbors.size !== 2) vertexIds.add(id);
    else {
      const [first, second] = [...neighbors];
      const firstDirection = normalize(sub(positions[first], positions[id]));
      const secondDirection = normalize(sub(positions[second], positions[id]));
      if (dot(firstDirection, secondDirection) > cornerCosine) vertexIds.add(id);
    }
  });
  const nodeSet = new Set([...endpointIds, ...vertexIds]);
  const chains = buildFeatureChains(featureEdges, graph, nodeSet);
  const chainEndpointIds = new Set(endpointIds);
  chains.forEach((chain) => {
    if (chain.closed || chain.path.length < 2) return;
    chainEndpointIds.add(chain.path[0]);
    chainEndpointIds.add(chain.path[chain.path.length - 1]);
  });

  const candidates = [];
  const dedupeMaps = new Map();
  const dedupeTolerance = Math.max(rawBounds.diagonal * 1e-6, weldTolerance * 2);
  const addCandidate = (candidate) => {
    if (!candidate?.point?.every(Number.isFinite)) return;
    const inverse = 1 / dedupeTolerance;
    const key = `${Math.round(candidate.point[0] * inverse)}:${Math.round(candidate.point[1] * inverse)}:${Math.round(candidate.point[2] * inverse)}`;
    if (!dedupeMaps.has(candidate.type)) dedupeMaps.set(candidate.type, new Set());
    if (dedupeMaps.get(candidate.type).has(key)) return;
    dedupeMaps.get(candidate.type).add(key);
    candidates.push(candidate);
  };

  chainEndpointIds.forEach((id) => addCandidate({ type: 'endpoint', point: positions[id], source: { vertexId: id } }));
  vertexIds.forEach((id) => addCandidate({ type: 'vertex', point: positions[id], source: { vertexId: id } }));
  faceCenters.forEach(addCandidate);

  const straightLines = [];
  chains.forEach((chain, chainIndex) => {
    if (!chain.closed) addCandidate({ type: 'edge-midpoint', point: polylineMidpoint(chain.path, positions), source: { chainIndex } });
    const circle = fitCircle(chain.path, positions, weldTolerance, rawBounds.diagonal);
    if (circle) addCandidate({ type: 'circle-center', point: circle.center, source: { chainIndex, radiusMm: circle.radius } });
    const line = straightLineForChain(chain, positions, weldTolerance);
    if (line && straightLines.length < (options.maxStraightLines || 500)) straightLines.push(line);
  });

  addCandidate({ type: 'shape-center', point: rawBounds.center, source: { kind: 'bounding-box' } });
  if (Array.isArray(options.solidCenter) && options.solidCenter.length === 3) {
    addCandidate({ type: 'shape-center', point: options.solidCenter.map(Number), source: { kind: 'solid-centroid' } });
  }

  const virtualTolerance = Math.max(rawBounds.diagonal * 1e-5, weldTolerance * 50);
  const maxVirtualPairs = options.maxVirtualPairs || 20000;
  const maxVirtualCandidates = options.maxVirtualCandidates || 400;
  const physicalSnapPoints = candidates.map((candidate) => candidate.point);
  let testedPairs = 0;
  let virtualCount = 0;
  for (let firstIndex = 0; firstIndex < straightLines.length && virtualCount < maxVirtualCandidates; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < straightLines.length && virtualCount < maxVirtualCandidates; secondIndex += 1) {
      testedPairs += 1;
      if (testedPairs > maxVirtualPairs) break;
      const point = closestLineIntersection(straightLines[firstIndex], straightLines[secondIndex], virtualTolerance, options.virtualExtensionRatio || 1.5);
      if (!point) continue;
      if (physicalSnapPoints.some((physicalPoint) => distance(physicalPoint, point) <= dedupeTolerance * 2)) continue;
      const before = candidates.length;
      addCandidate({ type: 'virtual-intersection', point, source: { firstLine: firstIndex, secondLine: secondIndex } });
      if (candidates.length > before) virtualCount += 1;
    }
    if (testedPairs > maxVirtualPairs) break;
  }

  const maxPerType = {
    endpoint: 5000,
    vertex: 10000,
    'edge-midpoint': 10000,
    'face-center': 5000,
    'circle-center': 2000,
    'shape-center': 20,
    'virtual-intersection': maxVirtualCandidates,
    ...(options.maxPerType || {})
  };
  const counts = {};
  const limitedCandidates = candidates.filter((candidate) => {
    counts[candidate.type] = (counts[candidate.type] || 0) + 1;
    return counts[candidate.type] <= (maxPerType[candidate.type] || Infinity);
  });

  return {
    candidates: limitedCandidates,
    stats: {
      weldedVertexCount: positions.length,
      triangleCount: triangles.length,
      featureEdgeCount: featureEdges.length,
      faceCount: brepFaces.length,
      candidateCount: limitedCandidates.length
    }
  };
}
