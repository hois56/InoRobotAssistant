const STL_LOADER_URL = 'https://esm.sh/three@0.156.1/examples/jsm/loaders/STLLoader.js?bundle';
const FBX_LOADER_URL = 'https://esm.sh/three@0.156.1/examples/jsm/loaders/FBXLoader.js?bundle';
const STL_COLLISION_PROXY_MIN_TRIANGLES = 50000;
let stlLoaderPromise = null;
let fbxLoaderPromise = null;

function getSTLLoader() {
    if (!stlLoaderPromise) stlLoaderPromise = import(STL_LOADER_URL).then((module) => module.STLLoader);
    return stlLoaderPromise;
}

function getFBXLoader() {
    if (!fbxLoaderPromise) fbxLoaderPromise = import(FBX_LOADER_URL).then((module) => module.FBXLoader);
    return fbxLoaderPromise;
}

async function readResponseBuffer(response, requestId) {
    if (!response.body?.getReader) {
        const buffer = await response.arrayBuffer();
        self.postMessage({ type: 'progress', requestId, progress: 100 });
        return buffer;
    }

    const reader = response.body.getReader();
    const chunks = [];
    const total = Number(response.headers.get('content-length')) || 0;
    let loaded = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        self.postMessage({
            type: 'progress',
            requestId,
            progress: total > 0 ? Math.round((loaded / total) * 100) : 0
        });
    }

    const result = new Uint8Array(loaded);
    let offset = 0;
    chunks.forEach((chunk) => {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    });
    self.postMessage({ type: 'progress', requestId, progress: 100 });
    return result.buffer;
}

function cloneTypedArray(source) {
    return source?.slice ? source.slice() : new source.constructor(source);
}

function serializeGeometry(geometry, transferredBuffers = new Set()) {
    const attributes = {};
    const transferables = [];

    Object.entries(geometry.attributes || {}).forEach(([name, attribute]) => {
        const array = cloneTypedArray(attribute.array);
        attributes[name] = {
            array,
            itemSize: attribute.itemSize,
            normalized: attribute.normalized
        };
        if (!transferredBuffers.has(array.buffer)) {
            transferredBuffers.add(array.buffer);
            transferables.push(array.buffer);
        }
    });

    let index = null;
    if (geometry.index?.array) {
        index = cloneTypedArray(geometry.index.array);
        if (!transferredBuffers.has(index.buffer)) {
            transferredBuffers.add(index.buffer);
            transferables.push(index.buffer);
        }
    }

    return {
        data: { attributes, index },
        transferables
    };
}

function serializeMaterial(material) {
    return {
        color: material?.color?.getHex?.() ?? 0xcccccc,
        roughness: Number.isFinite(material?.roughness) ? material.roughness : 0.66,
        metalness: Number.isFinite(material?.metalness) ? material.metalness : 0.06,
        transparent: Boolean(material?.transparent),
        opacity: Number.isFinite(material?.opacity) ? material.opacity : 1,
        side: Number.isInteger(material?.side) ? material.side : 0
    };
}

function serializeObject3D(root) {
    const geometries = [];
    const geometryIds = new Map();
    const transferables = [];
    const transferredBuffers = new Set();

    const getGeometryId = (geometry) => {
        if (!geometry) return null;
        if (geometryIds.has(geometry)) return geometryIds.get(geometry);
        const geometryId = geometries.length;
        const serialized = serializeGeometry(geometry, transferredBuffers);
        geometries.push(serialized.data);
        transferables.push(...serialized.transferables);
        geometryIds.set(geometry, geometryId);
        return geometryId;
    };

    const visit = (object) => {
        const materials = object.isMesh
            ? (Array.isArray(object.material) ? object.material : [object.material]).map(serializeMaterial)
            : [];
        return {
            name: object.name || '',
            type: object.isMesh ? 'mesh' : 'group',
            geometryId: object.isMesh ? getGeometryId(object.geometry) : null,
            materials,
            position: object.position.toArray(),
            quaternion: object.quaternion.toArray(),
            scale: object.scale.toArray(),
            visible: object.visible !== false,
            children: object.children.map(visit)
        };
    };

    return {
        data: { root: visit(root), geometries },
        transferables
    };
}

function getPositionVertex(position, vertexIndex, target) {
    target[0] = position.getX(vertexIndex);
    target[1] = position.getY(vertexIndex);
    target[2] = position.getZ(vertexIndex);
    return target;
}

function getTriangleVertexIndex(geometry, triangleIndex, vertexOffset) {
    const index = triangleIndex * 3 + vertexOffset;
    return geometry.index ? geometry.index.getX(index) : index;
}

// Build a small voxelized surface proxy for uploaded STL files. The original
// geometry remains the render mesh; this proxy is only used by collision
// detection. Occupied cells are derived from triangle AABBs so the expensive
// collision BVH never has to index every render triangle.
function createSTLCollisionProxy(geometry, gridSize = 8) {
    const position = geometry?.getAttribute?.('position');
    const triangleCount = Math.floor((geometry.index?.count ?? position?.count ?? 0) / 3);
    if (!position || triangleCount <= STL_COLLISION_PROXY_MIN_TRIANGLES) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) return null;

    const sizeX = Math.max(bounds.max.x - bounds.min.x, 1e-6);
    const sizeY = Math.max(bounds.max.y - bounds.min.y, 1e-6);
    const sizeZ = Math.max(bounds.max.z - bounds.min.z, 1e-6);
    const cellX = sizeX / gridSize;
    const cellY = sizeY / gridSize;
    const cellZ = sizeZ / gridSize;
    const occupied = new Set();
    const first = [0, 0, 0];
    const second = [0, 0, 0];
    const third = [0, 0, 0];

    const cellIndex = (value, minimum, cellSize) => Math.max(
        0,
        Math.min(gridSize - 1, Math.floor((value - minimum) / cellSize))
    );
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
        getPositionVertex(position, getTriangleVertexIndex(geometry, triangleIndex, 0), first);
        getPositionVertex(position, getTriangleVertexIndex(geometry, triangleIndex, 1), second);
        getPositionVertex(position, getTriangleVertexIndex(geometry, triangleIndex, 2), third);
        const minX = cellIndex(Math.min(first[0], second[0], third[0]), bounds.min.x, cellX);
        const minY = cellIndex(Math.min(first[1], second[1], third[1]), bounds.min.y, cellY);
        const minZ = cellIndex(Math.min(first[2], second[2], third[2]), bounds.min.z, cellZ);
        const maxX = cellIndex(Math.max(first[0], second[0], third[0]), bounds.min.x, cellX);
        const maxY = cellIndex(Math.max(first[1], second[1], third[1]), bounds.min.y, cellY);
        const maxZ = cellIndex(Math.max(first[2], second[2], third[2]), bounds.min.z, cellZ);
        for (let z = minZ; z <= maxZ; z += 1) {
            for (let y = minY; y <= maxY; y += 1) {
                for (let x = minX; x <= maxX; x += 1) {
                    occupied.add(x + gridSize * (y + gridSize * z));
                }
            }
        }
    }

    if (!occupied.size) return null;
    const vertices = new Float32Array(occupied.size * 8 * 3);
    const indices = new Uint32Array(occupied.size * 12 * 3);
    let vertexOffset = 0;
    let indexOffset = 0;
    const addBox = (x, y, z) => {
        const minX = bounds.min.x + x * cellX;
        const minY = bounds.min.y + y * cellY;
        const minZ = bounds.min.z + z * cellZ;
        const maxX = x === gridSize - 1 ? bounds.max.x : minX + cellX;
        const maxY = y === gridSize - 1 ? bounds.max.y : minY + cellY;
        const maxZ = z === gridSize - 1 ? bounds.max.z : minZ + cellZ;
        const boxVertices = [
            [minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ],
            [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]
        ];
        boxVertices.forEach(([vx, vy, vz]) => {
            vertices[vertexOffset++] = vx;
            vertices[vertexOffset++] = vy;
            vertices[vertexOffset++] = vz;
        });
        const boxIndices = [
            0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
            0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
            0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
        ];
        boxIndices.forEach((index) => {
            indices[indexOffset++] = index + (vertexOffset / 3) - 8;
        });
    };
    occupied.forEach((key) => {
        const x = key % gridSize;
        const y = Math.floor(key / gridSize) % gridSize;
        const z = Math.floor(key / (gridSize * gridSize));
        addBox(x, y, z);
    });
    return {
        attributes: {
            position: { array: vertices, itemSize: 3, normalized: false }
        },
        index: { array: indices }
    };
}

self.addEventListener('message', async (event) => {
    const payload = event.data || {};
    if (!['parse-stl', 'parse-stl-buffer', 'parse-fbx'].includes(payload.type)
        || !payload.requestId
        || (payload.type !== 'parse-stl-buffer' && !payload.url)) return;

    const { requestId } = payload;
    try {
        let buffer = payload.buffer;
        if (payload.type !== 'parse-stl-buffer') {
            const url = new URL(payload.url, self.location.href);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load model (${response.status}).`);
            buffer = await readResponseBuffer(response, requestId);
        }
        if (payload.type === 'parse-stl' || payload.type === 'parse-stl-buffer') {
            const STLLoader = await getSTLLoader();
            const geometry = new STLLoader().parse(buffer);
            const serialized = serializeGeometry(geometry);
            const collisionProxy = payload.includeCollisionProxy
                ? createSTLCollisionProxy(geometry)
                : null;
            const proxySerialized = collisionProxy
                ? serializeGeometry(collisionProxy)
                : { data: null, transferables: [] };
            self.postMessage({
                type: 'done',
                requestId,
                geometry: serialized.data,
                collisionGeometry: proxySerialized.data
            }, [...serialized.transferables, ...proxySerialized.transferables]);
        } else {
            const FBXLoader = await getFBXLoader();
            self.postMessage({ type: 'progress', requestId, progress: 100, phase: 'parsing' });
            const object = new FBXLoader().parse(buffer, '');
            const serialized = serializeObject3D(object);
            self.postMessage({ type: 'done', requestId, model: serialized.data }, serialized.transferables);
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            requestId,
            message: error?.message || 'STL worker failed.'
        });
    }
});
