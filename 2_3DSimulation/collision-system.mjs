import * as THREE from 'three';

// Mesh collision for the simulator.  The render geometry is used directly;
// no box-shaped proxy is introduced.  A small local BVH keeps the expensive
// triangle tests limited to the parts that are actually close together.

const DEFAULT_LEAF_SIZE = 16;
const DEFAULT_EPSILON = 1e-5;
const RAY_DIRECTION = new THREE.Vector3(1, 0.3713906763541037, 0.127000127000127);
RAY_DIRECTION.normalize();

function triangleCountForGeometry(geometry) {
    const position = geometry?.getAttribute?.('position');
    if (!position) return 0;
    return Math.floor((geometry.index?.count ?? position.count) / 3);
}

function readLocalVertex(geometry, vertexIndex, target, offset = 0) {
    const position = geometry.getAttribute('position');
    target[offset] = position.getX(vertexIndex);
    target[offset + 1] = position.getY(vertexIndex);
    target[offset + 2] = position.getZ(vertexIndex);
}

function getTriangleVertexIndex(geometry, triangleIndex, vertexOffset) {
    const index = triangleIndex * 3 + vertexOffset;
    return geometry.index ? geometry.index.getX(index) : index;
}

function readLocalTriangle(geometry, triangleIndex, target) {
    readLocalVertex(geometry, getTriangleVertexIndex(geometry, triangleIndex, 0), target, 0);
    readLocalVertex(geometry, getTriangleVertexIndex(geometry, triangleIndex, 1), target, 3);
    readLocalVertex(geometry, getTriangleVertexIndex(geometry, triangleIndex, 2), target, 6);
    return target;
}

function expandBoundsByTriangle(bounds, triangle) {
    bounds.expandByPoint(new THREE.Vector3(triangle[0], triangle[1], triangle[2]));
    bounds.expandByPoint(new THREE.Vector3(triangle[3], triangle[4], triangle[5]));
    bounds.expandByPoint(new THREE.Vector3(triangle[6], triangle[7], triangle[8]));
}

function triangleBounds(geometry, triangleIndex, target) {
    target.makeEmpty();
    const triangle = readLocalTriangle(geometry, triangleIndex, new Float64Array(9));
    expandBoundsByTriangle(target, triangle);
    return target;
}

function triangleCentroid(geometry, triangleIndex, target) {
    const triangle = readLocalTriangle(geometry, triangleIndex, new Float64Array(9));
    target.set(
        (triangle[0] + triangle[3] + triangle[6]) / 3,
        (triangle[1] + triangle[4] + triangle[7]) / 3,
        (triangle[2] + triangle[5] + triangle[8]) / 3
    );
    return target;
}

function boundsSurfaceArea(bounds) {
    if (bounds.isEmpty()) return 0;
    const sizeX = bounds.max.x - bounds.min.x;
    const sizeY = bounds.max.y - bounds.min.y;
    const sizeZ = bounds.max.z - bounds.min.z;
    return 2 * (sizeX * sizeY + sizeY * sizeZ + sizeZ * sizeX);
}

class GeometryBVH {
    constructor(geometry, leafSize = DEFAULT_LEAF_SIZE) {
        this.geometry = geometry;
        this.leafSize = leafSize;
        this.triangleCount = triangleCountForGeometry(geometry);
        this.localTriangleBounds = new Float64Array(this.triangleCount * 6);
        this.localTriangleCentroids = new Float64Array(this.triangleCount * 3);
        const localTriangle = new Float64Array(9);
        for (let triangleIndex = 0; triangleIndex < this.triangleCount; triangleIndex += 1) {
            readLocalTriangle(geometry, triangleIndex, localTriangle);
            const boundsOffset = triangleIndex * 6;
            this.localTriangleBounds[boundsOffset] = Math.min(localTriangle[0], localTriangle[3], localTriangle[6]);
            this.localTriangleBounds[boundsOffset + 1] = Math.min(localTriangle[1], localTriangle[4], localTriangle[7]);
            this.localTriangleBounds[boundsOffset + 2] = Math.min(localTriangle[2], localTriangle[5], localTriangle[8]);
            this.localTriangleBounds[boundsOffset + 3] = Math.max(localTriangle[0], localTriangle[3], localTriangle[6]);
            this.localTriangleBounds[boundsOffset + 4] = Math.max(localTriangle[1], localTriangle[4], localTriangle[7]);
            this.localTriangleBounds[boundsOffset + 5] = Math.max(localTriangle[2], localTriangle[5], localTriangle[8]);
            const centroidOffset = triangleIndex * 3;
            this.localTriangleCentroids[centroidOffset] = (localTriangle[0] + localTriangle[3] + localTriangle[6]) / 3;
            this.localTriangleCentroids[centroidOffset + 1] = (localTriangle[1] + localTriangle[4] + localTriangle[7]) / 3;
            this.localTriangleCentroids[centroidOffset + 2] = (localTriangle[2] + localTriangle[5] + localTriangle[8]) / 3;
        }
        this.root = this.triangleCount > 0
            ? this.#build(Array.from({ length: this.triangleCount }, (_, index) => index))
            : null;
    }

    #build(triangleIndices) {
        const bounds = new THREE.Box3();
        const centroidBounds = new THREE.Box3();
        triangleIndices.forEach((triangleIndex) => {
            const boundsOffset = triangleIndex * 6;
            bounds.min.x = Math.min(bounds.min.x, this.localTriangleBounds[boundsOffset]);
            bounds.min.y = Math.min(bounds.min.y, this.localTriangleBounds[boundsOffset + 1]);
            bounds.min.z = Math.min(bounds.min.z, this.localTriangleBounds[boundsOffset + 2]);
            bounds.max.x = Math.max(bounds.max.x, this.localTriangleBounds[boundsOffset + 3]);
            bounds.max.y = Math.max(bounds.max.y, this.localTriangleBounds[boundsOffset + 4]);
            bounds.max.z = Math.max(bounds.max.z, this.localTriangleBounds[boundsOffset + 5]);
            const centroidOffset = triangleIndex * 3;
            centroidBounds.min.x = Math.min(centroidBounds.min.x, this.localTriangleCentroids[centroidOffset]);
            centroidBounds.min.y = Math.min(centroidBounds.min.y, this.localTriangleCentroids[centroidOffset + 1]);
            centroidBounds.min.z = Math.min(centroidBounds.min.z, this.localTriangleCentroids[centroidOffset + 2]);
            centroidBounds.max.x = Math.max(centroidBounds.max.x, this.localTriangleCentroids[centroidOffset]);
            centroidBounds.max.y = Math.max(centroidBounds.max.y, this.localTriangleCentroids[centroidOffset + 1]);
            centroidBounds.max.z = Math.max(centroidBounds.max.z, this.localTriangleCentroids[centroidOffset + 2]);
        });

        const node = { bounds, left: null, right: null, triangles: null };
        if (triangleIndices.length <= this.leafSize) {
            node.triangles = triangleIndices;
            return node;
        }

        const centroidSize = centroidBounds.getSize(new THREE.Vector3());
        let axis = 0;
        if (centroidSize.y > centroidSize.x && centroidSize.y >= centroidSize.z) axis = 1;
        else if (centroidSize.z > centroidSize.x && centroidSize.z > centroidSize.y) axis = 2;

        triangleIndices.sort((left, right) => {
            return this.localTriangleCentroids[left * 3 + axis]
                - this.localTriangleCentroids[right * 3 + axis];
        });
        const middle = Math.floor(triangleIndices.length / 2);
        node.left = this.#build(triangleIndices.slice(0, middle));
        node.right = this.#build(triangleIndices.slice(middle));
        return node;
    }

    readTriangleWorld(mesh, triangleIndex, target, local = new Float64Array(9)) {
        readLocalTriangle(this.geometry, triangleIndex, local);
        const matrix = mesh.matrixWorld.elements;
        for (let vertex = 0; vertex < 3; vertex += 1) {
            const source = vertex * 3;
            const x = local[source];
            const y = local[source + 1];
            const z = local[source + 2];
            const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
            const invW = Math.abs(w) > Number.EPSILON ? 1 / w : 1;
            target[source] = (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * invW;
            target[source + 1] = (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * invW;
            target[source + 2] = (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * invW;
        }
        return target;
    }
}

function axisValue(triangle, vertex, axis) {
    return triangle[vertex * 3 + axis];
}

function trianglesHaveAabbOverlap(left, right, epsilon) {
    for (let axis = 0; axis < 3; axis += 1) {
        let leftMin = Infinity;
        let leftMax = -Infinity;
        let rightMin = Infinity;
        let rightMax = -Infinity;
        for (let vertex = 0; vertex < 3; vertex += 1) {
            const leftValue = axisValue(left, vertex, axis);
            const rightValue = axisValue(right, vertex, axis);
            leftMin = Math.min(leftMin, leftValue);
            leftMax = Math.max(leftMax, leftValue);
            rightMin = Math.min(rightMin, rightValue);
            rightMax = Math.max(rightMax, rightValue);
        }
        if (leftMax < rightMin - epsilon || rightMax < leftMin - epsilon) return false;
    }
    return true;
}

function dot(ax, ay, az, bx, by, bz) {
    return ax * bx + ay * by + az * bz;
}

function segmentTriangleIntersection(segment, startVertex, endVertex, triangle, epsilon) {
    const startOffset = startVertex * 3;
    const endOffset = endVertex * 3;
    const directionX = segment[endOffset] - segment[startOffset];
    const directionY = segment[endOffset + 1] - segment[startOffset + 1];
    const directionZ = segment[endOffset + 2] - segment[startOffset + 2];
    const edge1X = triangle[3] - triangle[0];
    const edge1Y = triangle[4] - triangle[1];
    const edge1Z = triangle[5] - triangle[2];
    const edge2X = triangle[6] - triangle[0];
    const edge2Y = triangle[7] - triangle[1];
    const edge2Z = triangle[8] - triangle[2];
    const pX = directionY * edge2Z - directionZ * edge2Y;
    const pY = directionZ * edge2X - directionX * edge2Z;
    const pZ = directionX * edge2Y - directionY * edge2X;
    const determinant = dot(edge1X, edge1Y, edge1Z, pX, pY, pZ);
    if (Math.abs(determinant) <= epsilon) return false;

    const inverseDeterminant = 1 / determinant;
    const tX = segment[startOffset] - triangle[0];
    const tY = segment[startOffset + 1] - triangle[1];
    const tZ = segment[startOffset + 2] - triangle[2];
    const u = dot(tX, tY, tZ, pX, pY, pZ) * inverseDeterminant;
    if (u < -epsilon || u > 1 + epsilon) return false;
    const qX = tY * edge1Z - tZ * edge1Y;
    const qY = tZ * edge1X - tX * edge1Z;
    const qZ = tX * edge1Y - tY * edge1X;
    const v = dot(directionX, directionY, directionZ, qX, qY, qZ) * inverseDeterminant;
    if (v < -epsilon || u + v > 1 + epsilon) return false;
    const distance = dot(edge2X, edge2Y, edge2Z, qX, qY, qZ) * inverseDeterminant;
    return distance >= -epsilon && distance <= 1 + epsilon;
}

function pointInTriangle2D(px, py, triangle, axisA, axisB, epsilon) {
    const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
    const d1 = sign(px, py, axisValue(triangle, 0, axisA), axisValue(triangle, 0, axisB), axisValue(triangle, 1, axisA), axisValue(triangle, 1, axisB));
    const d2 = sign(px, py, axisValue(triangle, 1, axisA), axisValue(triangle, 1, axisB), axisValue(triangle, 2, axisA), axisValue(triangle, 2, axisB));
    const d3 = sign(px, py, axisValue(triangle, 2, axisA), axisValue(triangle, 2, axisB), axisValue(triangle, 0, axisA), axisValue(triangle, 0, axisB));
    return !((d1 < -epsilon || d2 < -epsilon || d3 < -epsilon)
        && (d1 > epsilon || d2 > epsilon || d3 > epsilon));
}

function orient2D(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsOverlap2D(a, b, c, d, epsilon) {
    const o1 = orient2D(a[0], a[1], b[0], b[1], c[0], c[1]);
    const o2 = orient2D(a[0], a[1], b[0], b[1], d[0], d[1]);
    const o3 = orient2D(c[0], c[1], d[0], d[1], a[0], a[1]);
    const o4 = orient2D(c[0], c[1], d[0], d[1], b[0], b[1]);
    if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
        && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
    const within = (value, min, max) => value >= Math.min(min, max) - epsilon && value <= Math.max(min, max) + epsilon;
    if (Math.abs(o1) <= epsilon && within(c[0], a[0], b[0]) && within(c[1], a[1], b[1])) return true;
    if (Math.abs(o2) <= epsilon && within(d[0], a[0], b[0]) && within(d[1], a[1], b[1])) return true;
    if (Math.abs(o3) <= epsilon && within(a[0], c[0], d[0]) && within(a[1], c[1], d[1])) return true;
    if (Math.abs(o4) <= epsilon && within(b[0], c[0], d[0]) && within(b[1], c[1], d[1])) return true;
    return false;
}

function coplanarTrianglesOverlap(left, right, normal, epsilon) {
    const absolute = [Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])];
    const droppedAxis = absolute[0] >= absolute[1] && absolute[0] >= absolute[2]
        ? 0 : absolute[1] >= absolute[2] ? 1 : 2;
    const axes = droppedAxis === 0 ? [1, 2] : droppedAxis === 1 ? [0, 2] : [0, 1];
    for (let vertex = 0; vertex < 3; vertex += 1) {
        if (pointInTriangle2D(axisValue(left, vertex, axes[0]), axisValue(left, vertex, axes[1]), right, axes[0], axes[1], epsilon)) return true;
        if (pointInTriangle2D(axisValue(right, vertex, axes[0]), axisValue(right, vertex, axes[1]), left, axes[0], axes[1], epsilon)) return true;
    }
    for (let leftEdge = 0; leftEdge < 3; leftEdge += 1) {
        const leftNext = (leftEdge + 1) % 3;
        const leftStart = [axisValue(left, leftEdge, axes[0]), axisValue(left, leftEdge, axes[1])];
        const leftEnd = [axisValue(left, leftNext, axes[0]), axisValue(left, leftNext, axes[1])];
        for (let rightEdge = 0; rightEdge < 3; rightEdge += 1) {
            const rightNext = (rightEdge + 1) % 3;
            const rightStart = [axisValue(right, rightEdge, axes[0]), axisValue(right, rightEdge, axes[1])];
            const rightEnd = [axisValue(right, rightNext, axes[0]), axisValue(right, rightNext, axes[1])];
            if (segmentsOverlap2D(leftStart, leftEnd, rightStart, rightEnd, epsilon)) return true;
        }
    }
    return false;
}

function trianglesIntersect(left, right, epsilon = DEFAULT_EPSILON) {
    if (!trianglesHaveAabbOverlap(left, right, epsilon)) return false;

    for (let edge = 0; edge < 3; edge += 1) {
        const next = (edge + 1) % 3;
        if (segmentTriangleIntersection(left, edge, next, right, epsilon)) return true;
        if (segmentTriangleIntersection(right, edge, next, left, epsilon)) return true;
    }

    const normalX = (left[4] - left[1]) * (left[8] - left[2]) - (left[5] - left[2]) * (left[7] - left[1]);
    const normalY = (left[5] - left[2]) * (left[6] - left[0]) - (left[3] - left[0]) * (left[8] - left[2]);
    const normalZ = (left[3] - left[0]) * (left[7] - left[1]) - (left[4] - left[1]) * (left[6] - left[0]);
    const otherNormalX = (right[4] - right[1]) * (right[8] - right[2]) - (right[5] - right[2]) * (right[7] - right[1]);
    const otherNormalY = (right[5] - right[2]) * (right[6] - right[0]) - (right[3] - right[0]) * (right[8] - right[2]);
    const otherNormalZ = (right[3] - right[0]) * (right[7] - right[1]) - (right[4] - right[1]) * (right[6] - right[0]);
    const normalCrossX = normalY * otherNormalZ - normalZ * otherNormalY;
    const normalCrossY = normalZ * otherNormalX - normalX * otherNormalZ;
    const normalCrossZ = normalX * otherNormalY - normalY * otherNormalX;
    const parallel = Math.hypot(normalCrossX, normalCrossY, normalCrossZ) <= epsilon;
    const planeDistance = Math.abs(dot(
        normalX, normalY, normalZ,
        right[0] - left[0], right[1] - left[1], right[2] - left[2]
    ));
    const normalLength = Math.max(Math.hypot(normalX, normalY, normalZ), epsilon);
    return parallel && planeDistance <= epsilon * normalLength
        && coplanarTrianglesOverlap(left, right, [normalX, normalY, normalZ], epsilon);
}

function rayBoxIntersection(origin, direction, bounds, epsilon) {
    let near = -Infinity;
    let far = Infinity;
    for (let axis = 0; axis < 3; axis += 1) {
        const originValue = origin[axis];
        const directionValue = direction[axis];
        const min = bounds.min.getComponent(axis);
        const max = bounds.max.getComponent(axis);
        if (Math.abs(directionValue) <= epsilon) {
            if (originValue < min - epsilon || originValue > max + epsilon) return false;
            continue;
        }
        const first = (min - originValue) / directionValue;
        const second = (max - originValue) / directionValue;
        near = Math.max(near, Math.min(first, second));
        far = Math.min(far, Math.max(first, second));
        if (near > far + epsilon) return false;
    }
    return far >= Math.max(near, 0) - epsilon;
}

function rayTriangleDistance(origin, direction, triangle, epsilon) {
    const start = [origin[0], origin[1], origin[2]];
    const directionX = direction[0];
    const directionY = direction[1];
    const directionZ = direction[2];
    const edge1X = triangle[3] - triangle[0];
    const edge1Y = triangle[4] - triangle[1];
    const edge1Z = triangle[5] - triangle[2];
    const edge2X = triangle[6] - triangle[0];
    const edge2Y = triangle[7] - triangle[1];
    const edge2Z = triangle[8] - triangle[2];
    const pX = directionY * edge2Z - directionZ * edge2Y;
    const pY = directionZ * edge2X - directionX * edge2Z;
    const pZ = directionX * edge2Y - directionY * edge2X;
    const determinant = dot(edge1X, edge1Y, edge1Z, pX, pY, pZ);
    if (Math.abs(determinant) <= epsilon) return null;
    const inverse = 1 / determinant;
    const tX = start[0] - triangle[0];
    const tY = start[1] - triangle[1];
    const tZ = start[2] - triangle[2];
    const u = dot(tX, tY, tZ, pX, pY, pZ) * inverse;
    if (u < -epsilon || u > 1 + epsilon) return null;
    const qX = tY * edge1Z - tZ * edge1Y;
    const qY = tZ * edge1X - tX * edge1Z;
    const qZ = tX * edge1Y - tY * edge1X;
    const v = dot(directionX, directionY, directionZ, qX, qY, qZ) * inverse;
    if (v < -epsilon || u + v > 1 + epsilon) return null;
    const distance = dot(edge2X, edge2Y, edge2Z, qX, qY, qZ) * inverse;
    return distance >= epsilon ? distance : null;
}

function pointInsideMesh(point, mesh, bvh, epsilon, getWorldBounds = null) {
    const origin = [point.x, point.y, point.z];
    const direction = [RAY_DIRECTION.x, RAY_DIRECTION.y, RAY_DIRECTION.z];
    const rootBounds = getWorldBounds?.(bvh.root) || bvh.root?.bounds.clone().applyMatrix4(mesh.matrixWorld);
    if (!rootBounds || !rayBoxIntersection(origin, direction, rootBounds, epsilon)) return false;
    const stack = [bvh.root];
    const triangle = new Float64Array(9);
    const localTriangle = new Float64Array(9);
    const hits = [];
    while (stack.length) {
        const node = stack.pop();
        const nodeBounds = getWorldBounds?.(node) || node.bounds.clone().applyMatrix4(mesh.matrixWorld);
        if (!rayBoxIntersection(origin, direction, nodeBounds, epsilon)) continue;
        if (node.triangles) {
            node.triangles.forEach((triangleIndex) => {
                bvh.readTriangleWorld(mesh, triangleIndex, triangle, localTriangle);
                const distance = rayTriangleDistance(origin, direction, triangle, epsilon);
                if (distance !== null) hits.push(distance);
            });
        } else {
            if (node.left) stack.push(node.left);
            if (node.right) stack.push(node.right);
        }
    }
    hits.sort((left, right) => left - right);
    let uniqueHitCount = 0;
    let previous = -Infinity;
    hits.forEach((distance) => {
        if (distance - previous > epsilon * 10) {
            uniqueHitCount += 1;
            previous = distance;
        }
    });
    return uniqueHitCount % 2 === 1;
}

function worldBoundsContain(outer, inner, epsilon) {
    return outer.min.x <= inner.min.x + epsilon
        && outer.min.y <= inner.min.y + epsilon
        && outer.min.z <= inner.min.z + epsilon
        && outer.max.x >= inner.max.x - epsilon
        && outer.max.y >= inner.max.y - epsilon
        && outer.max.z >= inner.max.z - epsilon;
}

function geometryVertexKey(geometry, vertexIndex) {
    const position = geometry.getAttribute('position');
    // STL geometry is normally non-indexed, so use quantized positions rather
    // than vertex indices when pairing the two sides of an edge.
    const precision = 1e6;
    return `${Math.round(position.getX(vertexIndex) * precision)},${Math.round(position.getY(vertexIndex) * precision)},${Math.round(position.getZ(vertexIndex) * precision)}`;
}

function geometryHasClosedSurface(bvh) {
    if (typeof bvh.hasClosedSurface === 'boolean') return bvh.hasClosedSurface;
    const edgeCounts = new Map();
    const addEdge = (first, second) => {
        if (first === second) return false;
        const key = first < second ? `${first}|${second}` : `${second}|${first}`;
        const count = (edgeCounts.get(key) || 0) + 1;
        // A manifold closed surface has exactly two faces on every edge.
        if (count > 2) return false;
        edgeCounts.set(key, count);
        return true;
    };
    for (let triangleIndex = 0; triangleIndex < bvh.triangleCount; triangleIndex += 1) {
        const first = geometryVertexKey(bvh.geometry, getTriangleVertexIndex(bvh.geometry, triangleIndex, 0));
        const second = geometryVertexKey(bvh.geometry, getTriangleVertexIndex(bvh.geometry, triangleIndex, 1));
        const third = geometryVertexKey(bvh.geometry, getTriangleVertexIndex(bvh.geometry, triangleIndex, 2));
        if (!addEdge(first, second) || !addEdge(second, third) || !addEdge(third, first)) {
            bvh.hasClosedSurface = false;
            return false;
        }
    }
    bvh.hasClosedSurface = edgeCounts.size > 0 && [...edgeCounts.values()].every((count) => count === 2);
    return bvh.hasClosedSurface;
}

function getWorldNodeBounds(collider, bvh, node) {
    if (!node) return null;
    if (!collider.nodeBounds || collider.nodeBoundsBvh !== bvh) {
        collider.nodeBounds = new Map();
        collider.nodeBoundsBvh = bvh;
    }
    let bounds = collider.nodeBounds.get(node);
    if (!bounds) {
        bounds = node.bounds.clone().applyMatrix4(collider.mesh.matrixWorld);
        collider.nodeBounds.set(node, bounds);
    }
    return bounds;
}

function hasMatrixWorldChanged(meshEntry) {
    const elements = meshEntry.mesh.matrixWorld.elements;
    if (!meshEntry.matrixWorldSnapshot) return true;
    for (let index = 0; index < 16; index += 1) {
        if (meshEntry.matrixWorldSnapshot[index] !== elements[index]) return true;
    }
    return false;
}

function meshPairIntersects(colliderA, colliderB, epsilon, stats) {
    const { mesh: meshA, bvh: bvhA, collider: meshColliderA } = colliderA;
    const { mesh: meshB, bvh: bvhB, collider: meshColliderB } = colliderB;
    if (!bvhA.root || !bvhB.root || !meshColliderA.worldBounds || !meshColliderB.worldBounds) return null;
    const getBoundsA = (node) => getWorldNodeBounds(meshColliderA, bvhA, node);
    const getBoundsB = (node) => getWorldNodeBounds(meshColliderB, bvhB, node);
    const rootA = meshColliderA.worldBounds;
    const rootB = meshColliderB.worldBounds;
    if (!rootA || !rootB) return null;
    if (!rootA.intersectsBox(rootB)) return null;

    const stack = [[bvhA.root, bvhB.root]];
    const triangleA = new Float64Array(9);
    const triangleB = new Float64Array(9);
    const localTriangleA = new Float64Array(9);
    const localTriangleB = new Float64Array(9);
    while (stack.length) {
        const [nodeA, nodeB] = stack.pop();
        const boundsA = getBoundsA(nodeA);
        const boundsB = getBoundsB(nodeB);
        if (!boundsA || !boundsB) continue;
        if (!boundsA.intersectsBox(boundsB)) continue;
        if (nodeA.triangles && nodeB.triangles) {
            for (const indexA of nodeA.triangles) {
                bvhA.readTriangleWorld(meshA, indexA, triangleA, localTriangleA);
                for (const indexB of nodeB.triangles) {
                    stats.triangleTests += 1;
                    bvhB.readTriangleWorld(meshB, indexB, triangleB, localTriangleB);
                    if (trianglesIntersect(triangleA, triangleB, epsilon)) {
                        const point = new THREE.Vector3(
                            (triangleA[0] + triangleA[3] + triangleA[6]) / 3,
                            (triangleA[1] + triangleA[4] + triangleA[7]) / 3,
                            (triangleA[2] + triangleA[5] + triangleA[8]) / 3
                        );
                        return { meshA, meshB, triangleA: indexA, triangleB: indexB, point, kind: 'surface' };
                    }
                }
            }
            continue;
        }
        if (nodeA.triangles || (!nodeB.triangles && boundsSurfaceArea(boundsA) < boundsSurfaceArea(boundsB))) {
            if (nodeB.left) stack.push([nodeA, nodeB.left]);
            if (nodeB.right) stack.push([nodeA, nodeB.right]);
        } else {
            if (nodeA.left) stack.push([nodeA.left, nodeB]);
            if (nodeA.right) stack.push([nodeA.right, nodeB]);
        }
    }

    // Surface intersection alone misses a completely enclosed solid. Do not
    // use a ray-parity result for open/non-manifold STL shells: it can report
    // a false "inside" result while a Tool passes near J5. A containment
    // check is valid only when the *whole* other mesh is bounded by, and the
    // containing mesh is a closed, two-sided surface.
    if (worldBoundsContain(rootB, rootA, epsilon) && geometryHasClosedSurface(bvhB)) {
        const firstTriangleA = readLocalTriangle(bvhA.geometry, 0, localTriangleA);
        const pointA = new THREE.Vector3(firstTriangleA[0], firstTriangleA[1], firstTriangleA[2]).applyMatrix4(meshA.matrixWorld);
        if (pointInsideMesh(pointA, meshB, bvhB, epsilon, getBoundsB)) {
            return { meshA, meshB, triangleA: 0, triangleB: 0, point: pointA, kind: 'containment' };
        }
    }
    if (worldBoundsContain(rootA, rootB, epsilon) && geometryHasClosedSurface(bvhA)) {
        const firstTriangleB = readLocalTriangle(bvhB.geometry, 0, localTriangleB);
        const pointB = new THREE.Vector3(firstTriangleB[0], firstTriangleB[1], firstTriangleB[2]).applyMatrix4(meshB.matrixWorld);
        if (pointInsideMesh(pointB, meshA, bvhA, epsilon, getBoundsA)) {
            return { meshA, meshB, triangleA: 0, triangleB: 0, point: pointB, kind: 'containment' };
        }
    }
    return null;
}

function isVisibleInHierarchy(object) {
    let current = object;
    while (current) {
        if (current.visible === false) return false;
        current = current.parent;
    }
    return true;
}

function isDescendantOf(object, ancestor) {
    let current = object;
    while (current) {
        if (current === ancestor) return true;
        current = current.parent;
    }
    return false;
}

function isAttachedModelDescendant(object, root) {
    let current = object.parent;
    while (current && current !== root) {
        if (current.userData?.attachmentHost) return true;
        current = current.parent;
    }
    return false;
}

function isAttachedToolMountContact(leftRoot, leftMesh, rightRoot, rightMesh) {
    const leftIsTool = leftRoot?.userData?.attachmentHost === rightRoot;
    const rightIsTool = rightRoot?.userData?.attachmentHost === leftRoot;
    if (!leftIsTool && !rightIsTool) return false;
    const robotMesh = leftIsTool ? rightMesh : leftMesh;
    return robotMesh?.userData?.collisionIgnoreAttachedToolContact === true;
}

export class MeshCollisionSystem {
    constructor({
        epsilon = DEFAULT_EPSILON,
        leafSize = DEFAULT_LEAF_SIZE,
        persistentHitGraceMs = 240
    } = {}) {
        this.epsilon = epsilon;
        this.leafSize = leafSize;
        this.persistentHitGraceMs = persistentHitGraceMs;
        this.geometryCache = new Map();
        this.geometryBoundsCache = new Map();
        this.meshCache = new Map();
        // During a continuous JOG move, the same link usually continues to
        // touch the same obstacle mesh. Remember that exact pair so a frame
        // can confirm it first instead of searching every CAD sub-mesh again.
        this.hitMeshPairCache = new Map();
        // Most models are static while a robot is moving. Keep their last
        // root-pair result so continuous JOG checks only revisit pairs that
        // include the model whose pose changed.
        this.rootPairHitCache = new Map();
        this.lastStats = { modelPairs: 0, refreshedModelPairs: 0, warmHitReuses: 0, meshPairs: 0, triangleTests: 0, bvhCount: 0, collisionCount: 0 };
    }

    getGeometryBVH(geometry) {
        if (!geometry || triangleCountForGeometry(geometry) <= 0) return null;
        const key = geometry.uuid || geometry;
        let bvh = this.geometryCache.get(key);
        if (!bvh || bvh.geometry !== geometry) {
            bvh = new GeometryBVH(geometry, this.leafSize);
            this.geometryCache.set(key, bvh);
        }
        return bvh;
    }

    getGeometryBounds(geometry) {
        if (!geometry || triangleCountForGeometry(geometry) <= 0) return null;
        const key = geometry.uuid || geometry;
        let bounds = this.geometryBoundsCache.get(key);
        if (!bounds || bounds.geometry !== geometry) {
            if (!geometry.boundingBox && typeof geometry.computeBoundingBox === 'function') {
                geometry.computeBoundingBox();
            }
            if (!geometry.boundingBox || typeof geometry.boundingBox.isEmpty !== 'function' || geometry.boundingBox.isEmpty()) return null;
            bounds = { geometry, bounds: geometry.boundingBox.clone() };
            this.geometryBoundsCache.set(key, bounds);
        }
        return bounds.bounds;
    }

    collectMeshes(root) {
        if (!root || root.userData?.collisionEnabled === false || !isVisibleInHierarchy(root)) return [];
        root.updateMatrixWorld(false);
        let cachedMeshes = this.meshCache.get(root);
        if (!cachedMeshes) {
            cachedMeshes = [];
            root.traverse((child) => {
                if (!child.isMesh
                    || child.userData.collisionDisabled
                    || isAttachedModelDescendant(child, root)
                    || !isVisibleInHierarchy(child)) return;
                const localBounds = this.getGeometryBounds(child.geometry);
                if (localBounds) cachedMeshes.push({
                    mesh: child,
                    geometry: child.geometry,
                    localBounds
                });
            });
            this.meshCache.set(root, cachedMeshes);
        }
        return cachedMeshes
            .filter(({ mesh, localBounds }) => (
                isDescendantOf(mesh, root) && isVisibleInHierarchy(mesh) && localBounds
            ))
            .map((collider) => {
                if (collider.geometry !== collider.mesh.geometry) {
                    collider.geometry = collider.mesh.geometry;
                    collider.localBounds = this.getGeometryBounds(collider.geometry);
                    collider.nodeBounds = null;
                    collider.nodeBoundsBvh = null;
                }
                if (!collider.localBounds) return null;
                if (hasMatrixWorldChanged(collider)) {
                    collider.worldBounds = collider.localBounds.clone().applyMatrix4(collider.mesh.matrixWorld);
                    // Node bounds are transformed lazily. Clear the entries
                    // from the previous pose so a JOG move never reuses a
                    // stale world-space branch of the BVH.
                    collider.nodeBounds = null;
                    collider.nodeBoundsBvh = null;
                    collider.matrixWorldSnapshot = collider.mesh.matrixWorld.elements.slice();
                }
                return collider;
            })
            .filter(Boolean);
    }

    meshPairCacheKey(leftRoot, leftMesh, rightRoot) {
        return `${leftRoot.uuid}|${leftMesh.uuid}|${rightRoot.uuid}`;
    }

    rootPairCacheKey(leftRoot, rightRoot) {
        return leftRoot.uuid < rightRoot.uuid
            ? `${leftRoot.uuid}|${rightRoot.uuid}`
            : `${rightRoot.uuid}|${leftRoot.uuid}`;
    }

    checkMeshPair(leftMesh, rightMesh, stats) {
        if (!leftMesh.worldBounds || !rightMesh.worldBounds) return null;
        if (!leftMesh.worldBounds.intersectsBox(rightMesh.worldBounds)) return null;
        const bvhA = this.getGeometryBVH(leftMesh.geometry);
        const bvhB = this.getGeometryBVH(rightMesh.geometry);
        if (!bvhA?.root || !bvhB?.root) return null;
        stats.bvhCount = this.geometryCache.size;
        stats.meshPairs += 1;
        return meshPairIntersects(
            { mesh: leftMesh.mesh, bvh: bvhA, collider: leftMesh },
            { mesh: rightMesh.mesh, bvh: bvhB, collider: rightMesh },
            this.epsilon,
            stats
        );
    }

    checkRootPair(left, right, includeSelf, stats, {
        now = performance.now(),
        allowWarmHitReuse = true
    } = {}) {
        // A link only needs one representative contact with this model pair.
        // Continuing to inspect every overlapping CAD sub-mesh is redundant
        // and becomes expensive when several links collide at once.
        const hits = [];
        const reportedLeftMeshes = new Set();
        const rightMeshesByUuid = new Map(right.meshes.map((entry) => [entry.mesh.uuid, entry]));

        for (const leftMesh of left.meshes) {
            if (reportedLeftMeshes.has(leftMesh.mesh)) continue;
            const cacheKey = this.meshPairCacheKey(left.root, leftMesh.mesh, right.root);
            const cachedEntry = this.hitMeshPairCache.get(cacheKey);
            const cachedRightMesh = cachedEntry
                ? rightMeshesByUuid.get(cachedEntry.rightMeshUuid)
                : null;
            if (cachedRightMesh
                && !isAttachedToolMountContact(left.root, leftMesh.mesh, right.root, cachedRightMesh.mesh)) {
                const canReuseWarmHit = allowWarmHitReuse
                    && cachedEntry.hit
                    && Number.isFinite(cachedEntry.lastConfirmedAt)
                    && now - cachedEntry.lastConfirmedAt < this.persistentHitGraceMs
                    && leftMesh.worldBounds?.intersectsBox(cachedRightMesh.worldBounds);
                if (canReuseWarmHit) {
                    // While a link remains inside the same coarse mesh bounds,
                    // retain its confirmed contact briefly. Re-running the
                    // full triangle/BVH walk every render interval is the
                    // source of visible JOG stutter on complex CAD models.
                    hits.push({ ...cachedEntry.hit, objectA: left.root, objectB: right.root });
                    stats.warmHitReuses += 1;
                    reportedLeftMeshes.add(leftMesh.mesh);
                    continue;
                }
                const cachedHit = this.checkMeshPair(leftMesh, cachedRightMesh, stats);
                if (cachedHit) {
                    cachedEntry.hit = cachedHit;
                    cachedEntry.lastConfirmedAt = now;
                    hits.push({ ...cachedHit, objectA: left.root, objectB: right.root });
                    reportedLeftMeshes.add(leftMesh.mesh);
                    continue;
                }
            }
            this.hitMeshPairCache.delete(cacheKey);
            for (const rightMesh of right.meshes) {
                if (rightMesh === cachedRightMesh) continue;
                if (!includeSelf && left.root === right.root) continue;
                if (left.root === right.root
                    && (isDescendantOf(leftMesh.mesh, rightMesh.mesh) || isDescendantOf(rightMesh.mesh, leftMesh.mesh))) continue;
                // The marked Tool mounting assembly (J6, or SCARA J3
                // ballscrew/J4) is a shared mechanical interface. Exclude
                // only that contact; other Tool-to-link combinations remain.
                if (isAttachedToolMountContact(left.root, leftMesh.mesh, right.root, rightMesh.mesh)) continue;
                const hit = this.checkMeshPair(leftMesh, rightMesh, stats);
                if (hit) {
                    hits.push({ ...hit, objectA: left.root, objectB: right.root });
                    this.hitMeshPairCache.set(cacheKey, {
                        leftRoot: left.root,
                        rightRoot: right.root,
                        rightMeshUuid: rightMesh.mesh.uuid,
                        hit,
                        lastConfirmedAt: now
                    });
                    reportedLeftMeshes.add(leftMesh.mesh);
                    break;
                }
            }
        }
        return hits;
    }

    check(objects, options = {}) {
        return this.checkAll(objects, options)[0] || null;
    }

    checkAll(objects, {
        includeSelf = false,
        changedRoots = null,
        now = performance.now(),
        allowWarmHitReuse = true
    } = {}) {
        const roots = Array.isArray(objects) ? objects.filter(Boolean) : [];
        const activeRoots = new Set(roots);
        for (const root of this.meshCache.keys()) {
            if (!activeRoots.has(root)) this.meshCache.delete(root);
        }
        const colliders = roots.map((root) => ({ root, meshes: this.collectMeshes(root) }))
            .filter((collider) => collider.meshes.length);
        const activeColliderRoots = new Set(colliders.map(({ root }) => root));
        for (const [key, entry] of this.hitMeshPairCache) {
            if (!activeColliderRoots.has(entry.leftRoot) || !activeColliderRoots.has(entry.rightRoot)) {
                this.hitMeshPairCache.delete(key);
            }
        }
        for (const [key, entry] of this.rootPairHitCache) {
            if (!activeColliderRoots.has(entry.leftRoot) || !activeColliderRoots.has(entry.rightRoot)) {
                this.rootPairHitCache.delete(key);
            }
        }
        const activeGeometries = new Set(
            colliders.flatMap((collider) => collider.meshes.map(({ geometry }) => geometry))
        );
        for (const [key, bvh] of this.geometryCache) {
            if (!activeGeometries.has(bvh.geometry)) this.geometryCache.delete(key);
        }
        for (const [key, entry] of this.geometryBoundsCache) {
            if (!activeGeometries.has(entry.geometry)) this.geometryBoundsCache.delete(key);
        }
        const stats = {
            modelPairs: 0,
            refreshedModelPairs: 0,
            warmHitReuses: 0,
            meshPairs: 0,
            triangleTests: 0,
            bvhCount: this.geometryCache.size,
            collisionCount: 0
        };
        const hits = [];
        const changed = changedRoots instanceof Set ? changedRoots : null;

        for (let leftIndex = 0; leftIndex < colliders.length; leftIndex += 1) {
            const left = colliders[leftIndex];
            const rightStart = includeSelf ? leftIndex : leftIndex + 1;
            for (let rightIndex = rightStart; rightIndex < colliders.length; rightIndex += 1) {
                const right = colliders[rightIndex];
                if (left === right) continue;
                if (left.root.userData?.collisionGroup
                    && left.root.userData.collisionGroup === right.root.userData?.collisionGroup
                    && left.root.userData?.collisionGroup === 'ignore-self') continue;
                stats.modelPairs += 1;
                // A Tool is kept as its own collision root even when it is
                // parented to a robot flange. The host root excludes that
                // Tool's meshes in collectMeshes(), so this pair detects
                // Tool-to-robot-body contact without duplicating the Tool.
                const pairKey = this.rootPairCacheKey(left.root, right.root);
                const mustRefresh = !changed || changed.has(left.root) || changed.has(right.root);
                let pairHits = this.rootPairHitCache.get(pairKey)?.hits;
                if (mustRefresh || !pairHits) {
                    stats.refreshedModelPairs += 1;
                    pairHits = this.checkRootPair(left, right, includeSelf, stats, { now, allowWarmHitReuse });
                    this.rootPairHitCache.set(pairKey, {
                        leftRoot: left.root,
                        rightRoot: right.root,
                        hits: pairHits
                    });
                }
                pairHits.forEach((hit) => hits.push({ ...hit, stats }));
            }
        }
        stats.collisionCount = hits.length;
        stats.bvhCount = this.geometryCache.size;
        this.lastStats = stats;
        return hits;
    }

    clear() {
        this.geometryCache.clear();
        this.geometryBoundsCache.clear();
        this.meshCache.clear();
        this.hitMeshPairCache.clear();
        this.rootPairHitCache.clear();
        this.lastStats = { modelPairs: 0, refreshedModelPairs: 0, warmHitReuses: 0, meshPairs: 0, triangleTests: 0, bvhCount: 0, collisionCount: 0 };
    }
}

export { triangleCountForGeometry, trianglesIntersect };
