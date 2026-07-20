const STL_LOADER_URL = 'https://esm.sh/three@0.156.1/examples/jsm/loaders/STLLoader.js?bundle';
const FBX_LOADER_URL = 'https://esm.sh/three@0.156.1/examples/jsm/loaders/FBXLoader.js?bundle';
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

self.addEventListener('message', async (event) => {
    const payload = event.data || {};
    if (!['parse-stl', 'parse-fbx'].includes(payload.type)
        || !payload.requestId || !payload.url) return;

    const { requestId } = payload;
    try {
        const url = new URL(payload.url, self.location.href);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load model (${response.status}).`);
        const buffer = await readResponseBuffer(response, requestId);
        if (payload.type === 'parse-stl') {
            const STLLoader = await getSTLLoader();
            const geometry = new STLLoader().parse(buffer);
            const serialized = serializeGeometry(geometry);
            self.postMessage({ type: 'done', requestId, geometry: serialized.data }, serialized.transferables);
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
