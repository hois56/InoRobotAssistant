/* global importScripts, occtimportjs */

const OCCT_IMPORT_BASE_URL = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
const LARGE_OCCT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/occt-wasm@5.3.4/dist/index.js';
const LARGE_OCCT_WASM_URL = 'https://cdn.jsdelivr.net/npm/occt-wasm@5.3.4/dist/occt-wasm.wasm';
const STEP_MESH_CHUNK_TARGET_BYTES = 6 * 1024 * 1024;
const LARGE_STEP_MESH_CHUNK_TARGET_BYTES = 4 * 1024 * 1024;
const STEP_VERTEX_LOOKUP_MAX_BYTES = 16 * 1024 * 1024;
const LARGE_OCCT_IDLE_TIMEOUT_MS = 30_000;
const LARGE_OCCT_RETAIN_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_COLOR = [0.749, 0.78, 0.835];
let occtPromise = null;
let largeOcctModulePromise = null;
let largeOcctKernelPromise = null;
let largeOcctKernel = null;
let largeOcctIdleTimer = null;
let stepImportQueue = Promise.resolve();

function ensureOcctImporter() {
    if (!occtPromise) {
        importScripts(`${OCCT_IMPORT_BASE_URL}occt-import-js.js`);
        if (typeof occtimportjs !== 'function') {
            throw new Error('OpenCascade STEP parser is unavailable.');
        }
        occtPromise = occtimportjs({
            locateFile: (fileName) => `${OCCT_IMPORT_BASE_URL}${fileName}`
        }).catch((error) => {
            occtPromise = null;
            throw error;
        });
    }
    return occtPromise;
}

function ensureLargeOcctModule() {
    if (!largeOcctModulePromise) {
        largeOcctModulePromise = import(LARGE_OCCT_MODULE_URL).catch((error) => {
            largeOcctModulePromise = null;
            throw error;
        });
    }
    return largeOcctModulePromise;
}

function disposeLargeOcctKernel() {
    clearTimeout(largeOcctIdleTimer);
    largeOcctIdleTimer = null;
    const kernel = largeOcctKernel;
    largeOcctKernel = null;
    largeOcctKernelPromise = null;
    kernel?.[Symbol.dispose]?.();
}

function ensureLargeOcctKernel() {
    clearTimeout(largeOcctIdleTimer);
    largeOcctIdleTimer = null;
    if (!largeOcctKernelPromise) {
        largeOcctKernelPromise = ensureLargeOcctModule().then(async ({ OcctKernel }) => {
            largeOcctKernel = await OcctKernel.init({ wasm: LARGE_OCCT_WASM_URL });
            return largeOcctKernel;
        }).catch((error) => {
            disposeLargeOcctKernel();
            throw error;
        });
    }
    return largeOcctKernelPromise;
}

function retainLargeOcctKernel(kernel) {
    // WASM heaps cannot shrink. Do not retain an oversized heap between files.
    if (kernel.getRawModule()?.HEAPU8?.byteLength > LARGE_OCCT_RETAIN_MAX_BYTES) {
        disposeLargeOcctKernel();
        return;
    }
    largeOcctIdleTimer = setTimeout(disposeLargeOcctKernel, LARGE_OCCT_IDLE_TIMEOUT_MS);
}

function measureStepPhase(timings, phase, callback) {
    const startedAt = performance.now();
    try {
        return callback();
    } finally {
        timings[phase] += performance.now() - startedAt;
    }
}

function numericArrayLength(source) {
    if (!source?.length) return 0;
    if (ArrayBuffer.isView(source)) return source.length;
    let length = 0;
    for (let index = 0; index < source.length; index += 1) {
        const value = source[index];
        length += (Array.isArray(value) || ArrayBuffer.isView(value)) ? value.length : 1;
    }
    return length;
}

function copyNumbers(source, target, targetOffset, valueOffset = 0) {
    const flatNumbers = ArrayBuffer.isView(source)
        || (Array.isArray(source) && source.every((value) => typeof value === 'number'));
    if (flatNumbers && valueOffset === 0) {
        target.set(source, targetOffset);
        // The previous Number(value) + 0 copy canonicalized source -0 to +0.
        // Preserve that bit-level result without changing underflowed values.
        for (let index = 0; index < source.length; index += 1) {
            if (Object.is(source[index], -0)) target[targetOffset + index] = 0;
        }
        return targetOffset + source.length;
    }
    if (flatNumbers) {
        for (let index = 0; index < source.length; index += 1) {
            target[targetOffset + index] = source[index] + valueOffset;
        }
        return targetOffset + source.length;
    }
    let offset = targetOffset;
    for (let index = 0; index < source.length; index += 1) {
        const value = source[index];
        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            for (let component = 0; component < value.length; component += 1) {
                target[offset] = Number(value[component]) + valueOffset;
                offset += 1;
            }
        } else {
            target[offset] = Number(value) + valueOffset;
            offset += 1;
        }
    }
    return offset;
}

function normalizeColor(source) {
    if (!Array.isArray(source) || source.length < 3) return DEFAULT_COLOR;
    const divisor = Math.max(source[0], source[1], source[2]) > 1 ? 255 : 1;
    return [source[0] / divisor, source[1] / divisor, source[2] / divisor];
}

function indexStepHierarchy(root, meshes = []) {
    const partByMeshIndex = new Map();
    let fallbackPartIndex = 0;

    const visit = (node, path = [], isRoot = false, assemblyPath = []) => {
        if (!node || typeof node !== 'object') return;
        const rawName = String(node.name || '').trim();
        const partName = rawName || `Part ${fallbackPartIndex + 1}`;
        const partId = isRoot ? null : `cad-part-${path.join('-') || fallbackPartIndex++}`;
        if (!isRoot && Array.isArray(node.meshes)) {
            node.meshes.forEach((meshIndex) => {
                const index = Number(meshIndex);
                if (Number.isInteger(index) && index >= 0) {
                    const multiple = node.meshes.length > 1;
                    partByMeshIndex.set(index, multiple ? {
                        partId: `${partId}-mesh-${index}`,
                        partName: String(meshes[index]?.name || '').trim() || `${partName} ${index + 1}`,
                        assemblyPath: [...assemblyPath, { id: partId, name: partName }],
                        parentPartId: partId,
                        parentPartName: partName,
                        parentAssemblyPath: assemblyPath
                    } : { partId, partName, assemblyPath });
                }
            });
        }
        const children = Array.isArray(node.children) ? node.children : [];
        children.forEach((child, childIndex) => {
            visit(child, [...path, childIndex], false, isRoot ? assemblyPath : [...assemblyPath, { id: partId, name: partName }]);
        });
    };

    visit(root, [], true);
    return partByMeshIndex;
}

function createMeshEntry(meshDefinition, partMeta = {}) {
    const positions = meshDefinition?.attributes?.position?.array;
    const indices = meshDefinition?.index?.array;
    const normals = meshDefinition?.attributes?.normal?.array;
    const positionLength = numericArrayLength(positions);
    const indexLength = numericArrayLength(indices);
    const normalLength = numericArrayLength(normals);
    if (positionLength < 9 || indexLength < 3 || positionLength % 3 !== 0) return null;
    return {
        positions,
        indices,
        normals,
        brepFaces: Array.isArray(meshDefinition.brep_faces) ? meshDefinition.brep_faces : [],
        partId: partMeta.partId || null,
        partName: partMeta.partName || meshDefinition?.name || '',
        assemblyPath: partMeta.assemblyPath || [],
        ...(partMeta.parentPartId ? {
            parentPartId: partMeta.parentPartId,
            parentPartName: partMeta.parentPartName,
            parentAssemblyPath: partMeta.parentAssemblyPath,
            legacyPartMeshIndex: partMeta.legacyPartMeshIndex
        } : {}),
        positionLength,
        indexLength,
        normalLength,
        vertexCount: positionLength / 3
    };
}

function createBucket(color, partId, partName, assemblyPath = []) {
    return {
        color,
        partId,
        partName,
        assemblyPath,
        entries: [],
        brepFaces: [],
        positionLength: 0,
        indexLength: 0,
        vertexCount: 0,
        triangleCount: 0,
        estimatedBytes: 0,
        hasCompleteNormals: true,
        hasCompleteBrepFaces: true
    };
}

function appendEntry(bucket, entry) {
    const triangleOffset = bucket.triangleCount;
    bucket.entries.push(entry);
    bucket.positionLength += entry.positionLength;
    bucket.indexLength += entry.indexLength;
    bucket.vertexCount += entry.vertexCount;
    bucket.triangleCount += Math.floor(entry.indexLength / 3);
    bucket.estimatedBytes += (entry.positionLength + entry.indexLength + entry.normalLength) * 4;
    bucket.hasCompleteNormals = bucket.hasCompleteNormals && entry.normalLength === entry.positionLength;

    if (entry.brepFaces.length === 0) {
        bucket.hasCompleteBrepFaces = false;
        return;
    }
    const entryTriangleCount = Math.floor(entry.indexLength / 3);
    let expectedFirst = 0;
    entry.brepFaces.forEach((face) => {
        const first = Number(face.first);
        const last = Number(face.last);
        if (!Number.isInteger(first) || !Number.isInteger(last)
            || first !== expectedFirst || first < 0 || last < first || last >= entryTriangleCount) {
            bucket.hasCompleteBrepFaces = false;
            return;
        }
        bucket.brepFaces.push({ first: first + triangleOffset, last: last + triangleOffset });
        expectedFirst = last + 1;
    });
    if (expectedFirst !== entryTriangleCount) bucket.hasCompleteBrepFaces = false;
}

function packBucket(bucket) {
    const positions = new Float32Array(bucket.positionLength);
    const indices = bucket.vertexCount <= 65535
        ? new Uint16Array(bucket.indexLength)
        : new Uint32Array(bucket.indexLength);
    const normals = bucket.hasCompleteNormals ? new Float32Array(bucket.positionLength) : null;
    let positionOffset = 0;
    let indexOffset = 0;
    let normalOffset = 0;
    let vertexOffset = 0;

    bucket.entries.forEach((entry) => {
        positionOffset = copyNumbers(entry.positions, positions, positionOffset);
        indexOffset = copyNumbers(entry.indices, indices, indexOffset, vertexOffset);
        if (normals) normalOffset = copyNumbers(entry.normals, normals, normalOffset);
        vertexOffset += entry.vertexCount;
    });

    return {
        positions,
        indices,
        normals,
        color: bucket.color,
        brepFaces: bucket.hasCompleteBrepFaces ? bucket.brepFaces : null,
        partId: bucket.partId,
        partName: bucket.partName,
        assemblyPath: bucket.assemblyPath,
        ...(bucket.entries[0]?.parentPartId ? {
            parentPartId: bucket.entries[0].parentPartId,
            parentPartName: bucket.entries[0].parentPartName,
            parentAssemblyPath: bucket.entries[0].parentAssemblyPath,
            legacyPartMeshIndex: bucket.entries[0].legacyPartMeshIndex
        } : {})
    };
}

function postBucket(bucket, requestId) {
    if (bucket.entries.length === 0) return 0;
    const mesh = packBucket(bucket);
    const transfer = [mesh.positions.buffer, mesh.indices.buffer];
    if (mesh.normals) transfer.push(mesh.normals.buffer);
    self.postMessage({ type: 'mesh', requestId, mesh }, transfer);
    bucket.entries.length = 0;
    bucket.brepFaces.length = 0;
    return 1;
}

function errorMessage(error) {
    return String(error?.message || error || 'STEP worker stopped unexpectedly.');
}

function modernFaceRanges(faceGroups) {
    if (Array.isArray(faceGroups) && faceGroups.length
        && faceGroups.every((face) => Array.isArray(face))) {
        const ranges = faceGroups.map((face) => {
            // Some builds expose the native [indexStart, indexCount, hash]
            // tuples as nested arrays instead of one typed array.
            const indexStart = Number(face[0]);
            const indexCount = Number(face[1]);
            if (!Number.isInteger(indexStart) || !Number.isInteger(indexCount)
                || indexStart < 0 || indexCount < 3
                || indexStart % 3 !== 0 || indexCount % 3 !== 0) return null;
            return {
                first: indexStart / 3,
                last: indexStart / 3 + indexCount / 3 - 1
            };
        }).filter(Boolean);
        return ranges.length ? ranges : null;
    }
    if (Array.isArray(faceGroups) && faceGroups.length
        && faceGroups.every((face) => face && typeof face === 'object')) {
        const ranges = faceGroups.map((face) => {
            const first = Number(face.first ?? face.start);
            const last = face.last != null
                ? Number(face.last)
                : first + Number(face.count) - 1;
            return { first, last };
        }).filter((range) => Number.isInteger(range.first)
            && Number.isInteger(range.last)
            && range.first >= 0
            && range.last >= range.first);
        return ranges.length ? ranges : null;
    }
    if (!(Array.isArray(faceGroups) || ArrayBuffer.isView(faceGroups)) || faceGroups.length < 3) return null;
    const ranges = [];
    for (let index = 0; index + 2 < faceGroups.length; index += 3) {
        // occt-wasm 3.7 returns [indexStart, indexCount, faceHash].
        // The snap pipeline works with triangle ranges, so convert the
        // index-based values before the mesh is split into large chunks.
        const indexStart = Number(faceGroups[index]);
        const indexCount = Number(faceGroups[index + 1]);
        if (!Number.isInteger(indexStart) || !Number.isInteger(indexCount)
            || indexStart < 0 || indexCount < 3
            || indexStart % 3 !== 0 || indexCount % 3 !== 0) continue;
        const first = indexStart / 3;
        const triangleCount = indexCount / 3;
        ranges.push({ first, last: first + triangleCount - 1 });
    }
    return ranges.length ? ranges : null;
}

function getCompleteLargeMeshFaceRanges(mesh) {
    const triangleCount = Math.floor(mesh.indices.length / 3);
    const faceRanges = modernFaceRanges(mesh.faceGroups);
    if (!faceRanges?.length || faceRanges[0].first !== 0) return null;
    let expectedFirst = 0;
    for (const face of faceRanges) {
        if (face.first !== expectedFirst || face.last >= triangleCount) return null;
        expectedFirst = face.last + 1;
    }
    return expectedFirst === triangleCount ? faceRanges : null;
}

function groupLargeMeshTriangleRanges(mesh, faceColors = null) {
    const triangleCount = Math.floor(mesh.indices.length / 3);
    const completeFaceRanges = getCompleteLargeMeshFaceRanges(mesh);
    const ranges = completeFaceRanges?.map((range, index) => (
        faceColors ? { ...range, color: faceColors[index] } : range
    )) || Array.from(
        { length: Math.ceil((triangleCount * 84) / LARGE_STEP_MESH_CHUNK_TARGET_BYTES) },
        (_, chunkIndex) => {
            const trianglesPerChunk = Math.max(1, Math.floor(LARGE_STEP_MESH_CHUNK_TARGET_BYTES / 84));
            const first = chunkIndex * trianglesPerChunk;
            return { first, last: Math.min(first + trianglesPerChunk - 1, triangleCount - 1) };
        }
    );
    const groups = [];
    let current = [];
    let estimatedBytes = 0;
    ranges.forEach((range) => {
        const rangeBytes = (range.last - range.first + 1) * 84 + (faceColors ? 96 : 0);
        if (current.length && estimatedBytes + rangeBytes > LARGE_STEP_MESH_CHUNK_TARGET_BYTES) {
            groups.push(current);
            current = [];
            estimatedBytes = 0;
        }
        current.push(range);
        estimatedBytes += rangeBytes;
    });
    if (current.length) groups.push(current);
    return { groups, preservesFaces: Boolean(completeFaceRanges) };
}

function createLargeMeshChunk(mesh, triangleRanges, preservesFaces = true, vertexLookup = null) {
    const localByGlobal = vertexLookup ? null : new Map();
    const globalVertices = [];
    const triangleCount = triangleRanges.reduce(
        (total, range) => total + range.last - range.first + 1,
        0
    );
    const uint32Indices = new Uint32Array(triangleCount * 3);
    const brepFaces = [];
    let indexOffset = 0;
    triangleRanges.forEach((range) => {
        const faceFirst = indexOffset / 3;
        for (let triangleIndex = range.first; triangleIndex <= range.last; triangleIndex += 1) {
            const sourceOffset = triangleIndex * 3;
            for (let corner = 0; corner < 3; corner += 1) {
                const globalIndex = mesh.indices[sourceOffset + corner];
                // Zero means unseen; stored indices are shifted by one. The
                // bounded scratch array avoids hashing every triangle corner.
                let localIndex = vertexLookup
                    ? (vertexLookup[globalIndex] || 0) - 1
                    : localByGlobal.get(globalIndex);
                if (localIndex === undefined || localIndex === -1) {
                    localIndex = globalVertices.length;
                    if (vertexLookup) vertexLookup[globalIndex] = localIndex + 1;
                    else localByGlobal.set(globalIndex, localIndex);
                    globalVertices.push(globalIndex);
                }
                uint32Indices[indexOffset] = localIndex;
                indexOffset += 1;
            }
        }
        if (preservesFaces) brepFaces.push({ first: faceFirst, last: indexOffset / 3 - 1 });
    });

    const positions = new Float32Array(globalVertices.length * 3);
    const hasNormals = mesh.normals instanceof Float32Array
        && mesh.normals.length === mesh.positions.length;
    const normals = hasNormals ? new Float32Array(positions.length) : null;
    globalVertices.forEach((globalIndex, localIndex) => {
        if (vertexLookup) vertexLookup[globalIndex] = 0;
        const sourceOffset = globalIndex * 3;
        const targetOffset = localIndex * 3;
        positions[targetOffset] = mesh.positions[sourceOffset];
        positions[targetOffset + 1] = mesh.positions[sourceOffset + 1];
        positions[targetOffset + 2] = mesh.positions[sourceOffset + 2];
        if (normals) {
            normals[targetOffset] = mesh.normals[sourceOffset];
            normals[targetOffset + 1] = mesh.normals[sourceOffset + 1];
            normals[targetOffset + 2] = mesh.normals[sourceOffset + 2];
        }
    });
    const indices = globalVertices.length <= 65535
        ? new Uint16Array(uint32Indices)
        : uint32Indices;
    return { positions, indices, normals, brepFaces: preservesFaces ? brepFaces : null };
}

function postLargeMeshChunks(mesh, message, requestId, partMeta = {}) {
    const { groups, preservesFaces } = groupLargeMeshTriangleRanges(mesh, partMeta.surfaceFaceColors);
    const vertexCount = mesh.positions.length / 3;
    const vertexLookup = vertexCount * 4 <= STEP_VERTEX_LOOKUP_MAX_BYTES
        ? new Uint32Array(vertexCount)
        : null;
    groups.forEach((triangleRanges, chunkIndex) => {
        const materialGroups = [];
        let indexStart = 0;
        triangleRanges.forEach((range) => {
            const count = (range.last - range.first + 1) * 3;
            if (range.color) {
                const previous = materialGroups.at(-1);
                if (previous && previous.color.every((value, index) => value === range.color[index])) previous.count += count;
                else materialGroups.push({ start: indexStart, count, color: range.color });
            }
            indexStart += count;
        });
        const workerMesh = {
            ...createLargeMeshChunk(mesh, triangleRanges, preservesFaces, vertexLookup),
            ...(materialGroups.length ? { materialGroups } : {}),
            color: Array.isArray(partMeta.color) && partMeta.color.length === 3
                ? partMeta.color.map(Number)
                : DEFAULT_COLOR,
            partId: partMeta.partId || 'cad-large-whole',
            partName: partMeta.partName || message.fileName || 'STEP Assembly',
            assemblyPath: partMeta.assemblyPath || [],
            largeModelChunk: true,
            chunkIndex,
            chunkCount: groups.length
        };
        const transfer = [workerMesh.positions.buffer, workerMesh.indices.buffer];
        if (workerMesh.normals) transfer.push(workerMesh.normals.buffer);
        self.postMessage({ type: 'mesh', requestId, mesh: workerMesh }, transfer);
    });
    return groups.length;
}

function composeStepPlacement(parent, local) {
    const result = new Array(12).fill(0);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 4; col += 1) {
            result[row * 4 + col] = col === 3 ? parent[row * 4 + 3] : 0;
            for (let k = 0; k < 3; k += 1) {
                result[row * 4 + col] += parent[row * 4 + k] * local[k * 4 + col];
            }
        }
    }
    return result;
}

function collectXcafParts(document, labelNames = new Map()) {
    const parts = [];
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const ancestors = new Set();
    const roots = document.getRoots();
    const visit = (label, path, parentPlacement, inheritedColor, assemblyPath = [], labelPath = []) => {
        if (ancestors.has(label)) throw new Error('Cyclic STEP assembly reference.');
        ancestors.add(label);
        try {
            const instance = document.getLabelInfo(label);
            const referred = instance.isComponent ? document.getReferredLabel?.(label) : null;
            const prototype = referred == null ? instance : document.getLabelInfo(referred);
            labelNames.set(label, instance.name || '');
            if (referred != null) labelNames.set(referred, prototype.name || '');
            const currentLabelPath = [...labelPath, label];
            const children = document.getChildren(referred ?? label);
            const local = document.getLocation?.(label) || identity;
            const placement = composeStepPlacement(parentPlacement, local);
            const color = instance.hasColor ? instance.color
                : prototype.hasColor ? prototype.color : inheritedColor;
            const instanceName = String(instance.name || '').trim();
            const prototypeName = String(prototype.name || '').trim();
            const name = (instanceName && !/^NAUO\d+$/i.test(instanceName) ? instanceName : prototypeName)
                || instanceName || 'Part ' + (parts.length + 1);
            if (children.length) {
                // The single document root is represented by the imported model.
                const childPath = path.length === 1 && roots.length === 1 ? assemblyPath
                    : [...assemblyPath, { id: 'cad-xcaf-' + path.join('-'), name }];
                children.forEach((child, index) => visit(child, [...path, index], placement, color, childPath, currentLabelPath));
                return;
            }
            if (prototype.shapeHandle != null) {
                parts.push({
                    partId: 'cad-xcaf-' + path.join('-'),
                    partName: name,
                    assemblyPath,
                    labelPath: currentLabelPath.join('/'),
                    shapeHandle: prototype.shapeHandle,
                    placement: document.getLocation ? placement : null,
                    color: color || DEFAULT_COLOR
                });
            }
        } finally {
            ancestors.delete(label);
        }
    };
    roots.forEach((label, index) => visit(label, [index], identity, null));
    return parts;
}

function readGlbStyleJson(fs, path) {
    const stream = fs.open(path, 'r');
    try {
        const header = new Uint8Array(20);
        if (fs.read(stream, header, 0, header.length, 0) !== header.length) throw new Error('Incomplete STEP color metadata.');
        const view = new DataView(header.buffer);
        const length = view.getUint32(12, true);
        if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
            || view.getUint32(16, true) !== 0x4e4f534a || length > view.getUint32(8, true) - 20) {
            throw new Error('Invalid STEP color metadata.');
        }
        // Copy only the JSON chunk. The potentially large binary geometry is
        // kept in the native temporary file and unlinked without a JS copy.
        const bytes = new Uint8Array(length);
        if (fs.read(stream, bytes, 0, length, 20) !== length) throw new Error('Incomplete STEP color metadata.');
        return JSON.parse(new TextDecoder().decode(bytes));
    } finally {
        fs.close(stream);
    }
}

function readXcafSurfaceStyles(kernel, document, labelNames, parameters) {
    const result = new Map();
    if (!document.exportGLTF || !document.setName) return result;
    const fs = kernel.getRawModule().FS;
    const renamed = [];
    try {
        // Names are not unique in CAD assemblies. Temporary label tags let the
        // native style traversal identify each instance without matching names.
        for (const [label, name] of labelNames) {
            document.setName(label, `__inorobot_color_${label}`);
            renamed.push([label, name]);
        }
        const gltf = document.exportGLTF({
            linearDeflection: Number(parameters.linearDeflectionAbsolute) || 1,
            angularDeflection: Number(parameters.angularDeflection) || 0.8,
            fs: {
                readFile(path) {
                    try { return readGlbStyleJson(fs, path); }
                    catch (error) { fs.unlink(path); throw error; }
                },
                unlink(path) { fs.unlink(path); }
            }
        });
        const visit = (index, path = []) => {
            const node = gltf.nodes[index];
            const match = /^__inorobot_color_(\d+)$/.exec(node.name || '');
            const labelPath = match ? [...path, Number(match[1])] : path;
            if (node.mesh !== undefined) {
                const styles = gltf.meshes[node.mesh].primitives
                    .filter((primitive) => primitive.mode === undefined || primitive.mode === 4)
                    .map((primitive) => {
                        const color = gltf.materials?.[primitive.material]?.pbrMetallicRoughness?.baseColorFactor;
                        return {
                            color: Array.isArray(color) && color.length >= 3 ? color.slice(0, 3) : null,
                            indexCount: gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count
                        };
                    });
                result.set(labelPath.join('/'), styles);
            }
            (node.children || []).forEach((child) => visit(child, labelPath));
        };
        (gltf.scenes[gltf.scene || 0]?.nodes || []).forEach((index) => visit(index));
        return result;
    } finally {
        renamed.forEach(([label, name]) => document.setName(label, name));
    }
}

function resolveLargeStepSurfaceColors(mesh, part, styles) {
    if (!styles?.length) return part;
    const faces = getCompleteLargeMeshFaceRanges(mesh);
    if (!faces || faces.length !== styles.length || faces.some((face, index) => (
        (face.last - face.first + 1) * 3 !== styles[index].indexCount
    ))) throw new Error('STEP surface colors do not match the imported faces.');
    const colors = styles.map((style) => style.color || part.color || DEFAULT_COLOR);
    const color = colors[0];
    return {
        ...part, color,
        ...(colors.some((entry) => entry.some((value, index) => value !== color[index]))
            ? { surfaceFaceColors: colors } : {})
    };
}

async function parseLargeStepFile(message, requestId) {
    const startedAt = performance.now();
    const kernel = await ensureLargeOcctKernel();
    const timings = { engineInitMs: performance.now() - startedAt, readingMs: 0, tessellationMs: 0, packingMs: 0 };
    let completed = false;
    let shape = null;
    let document = null;
    let sourceBuffer = message.fileBuffer;
    try {
        self.postMessage({ type: 'progress', requestId, phase: 'reading' });
        // Keep the original transferred buffer. Decoding a large STEP file to
        // a JavaScript string here creates another ~2x-sized representation and
        // makes otherwise valid 100-500 MB files fail before OCCT can read them.
        message.fileBuffer = null;

        // Read the assembly first: a successful single-shape import discards
        // the part identities even when the source contains a full assembly.
        let parts = [];
        const labelNames = new Map();
        if (typeof kernel.importXCAFFromSTEP === 'function') {
            try {
                document = measureStepPhase(timings, 'readingMs', () => kernel.importXCAFFromSTEP(sourceBuffer));
                parts = measureStepPhase(timings, 'readingMs', () => collectXcafParts(document, labelNames));
            } catch (error) {
                console.warn('XCAF STEP hierarchy import failed; trying direct import.', error);
                document?.close();
                document = null;
                kernel.releaseAll();
            }
        }
        if (parts.length) {
            sourceBuffer = null;
            self.postMessage({ type: 'progress', requestId, phase: 'tessellating', partIndex: 0, partCount: parts.length });
            const surfaceStyles = measureStepPhase(timings, 'tessellationMs', () => (
                readXcafSurfaceStyles(kernel, document, labelNames, message.parameters || {})
            ));
            let meshCount = 0;
            for (let index = 0; index < parts.length; index += 1) {
                const part = parts[index];
                self.postMessage({ type: 'progress', requestId, phase: 'tessellating',
                    partIndex: index, partCount: parts.length, partName: part.partName });
                let placedShape = null;
                try {
                    if (part.placement) placedShape = kernel.located(part.shapeHandle, part.placement);
                    const mesh = measureStepPhase(timings, 'tessellationMs', () => kernel.meshShape(placedShape ?? part.shapeHandle, {
                        linearDeflection: Number(message.parameters?.linearDeflectionAbsolute) || 1,
                        angularDeflection: Number(message.parameters?.angularDeflection) || 0.8
                    }));
                    if (!mesh?.positions?.length || !mesh?.indices?.length) {
                        throw new Error('STEP part contains no triangulated mesh: ' + part.partName);
                    }
                    const coloredPart = resolveLargeStepSurfaceColors(mesh, part, surfaceStyles.get(part.labelPath));
                    meshCount += measureStepPhase(timings, 'packingMs', () => postLargeMeshChunks(mesh, message, requestId, coloredPart));
                } finally {
                    if (placedShape != null) kernel.release(placedShape);
                    kernel.release(part.shapeHandle);
                }
            }
            self.postMessage({ type: 'done', requestId, rootName: message.fileName || 'STEP Assembly',
                meshCount, partCount: parts.length, failedPartCount: 0, segmented: true,
                timings: { ...timings, totalMs: performance.now() - startedAt } });
            completed = true;
            return;
        }
        // Close the assembly before the fallback so two representations are
        // never retained together. Part conversion errors above must propagate.
        if (document) {
            document.close();
            document = null;
            kernel.releaseAll();
        }
        shape = measureStepPhase(timings, 'readingMs', () => kernel.importStep(sourceBuffer));
        sourceBuffer = null;

        self.postMessage({ type: 'progress', requestId, phase: 'tessellating' });
        const mesh = measureStepPhase(timings, 'tessellationMs', () => kernel.meshShape(shape, {
            linearDeflection: Number(message.parameters?.linearDeflectionAbsolute) || 1,
            angularDeflection: Number(message.parameters?.angularDeflection) || 0.8
        }));
        if (!(mesh?.positions instanceof Float32Array) || mesh.positions.length < 9
            || !(mesh.indices instanceof Uint32Array) || mesh.indices.length < 3) {
            throw new Error('The STEP file contains no triangulated mesh.');
        }

        kernel.release(shape);
        shape = null;

        self.postMessage({ type: 'progress', requestId, phase: 'packing', sourceMeshCount: 1 });
        const meshCount = measureStepPhase(timings, 'packingMs', () => postLargeMeshChunks(mesh, message, requestId));
        self.postMessage({
            type: 'done',
            requestId,
            rootName: message.fileName || 'STEP Assembly',
            meshCount,
            timings: { ...timings, totalMs: performance.now() - startedAt }
        });
        completed = true;
    } finally {
        try {
            if (shape != null) kernel.release(shape);
            document?.close();
            kernel.releaseAll();
        } catch (error) {
            completed = false;
            throw error;
        } finally {
            sourceBuffer = null;
            if (completed) retainLargeOcctKernel(kernel);
            else disposeLargeOcctKernel();
        }
    }
}

function indexLegacyStepMeshes(meshes, parts) {
    const buckets = new Map(), output = [];
    const flush = bucket => { if (bucket?.indexes.length) output.push(bucket); };
    meshes.forEach((mesh, index) => {
        const meta = parts.get(index) || { partId: `cad-mesh-${index}` };
        const entry = createMeshEntry(mesh, meta);
        if (!entry) return;
        const partId = meta.parentPartId || meta.partId;
        const key = `${partId}\u0000${normalizeColor(mesh.color).map(value => value.toFixed(5)).join(',')}`;
        const bytes = (entry.positionLength + entry.indexLength + entry.normalLength) * 4;
        let bucket = buckets.get(key);
        if (bucket?.indexes.length && bucket.bytes + bytes > STEP_MESH_CHUNK_TARGET_BYTES) {
            flush(bucket); bucket = null;
        }
        if (!bucket) { bucket = { partId, indexes: [], bytes: 0 }; buckets.set(key, bucket); }
        bucket.indexes.push(index); bucket.bytes += bytes;
        if (bucket.bytes >= STEP_MESH_CHUNK_TARGET_BYTES) { flush(bucket); buckets.set(key, null); }
    });
    buckets.forEach(flush);
    const counts = new Map(), result = new Map();
    output.forEach(bucket => {
        const index = counts.get(bucket.partId) || 0;
        bucket.indexes.forEach(sourceIndex => result.set(sourceIndex, index));
        counts.set(bucket.partId, index + 1);
    });
    return result;
}

async function handleStepImportMessage(event) {
    const message = event.data || {};
    const requestId = message.requestId;
    const startedAt = performance.now();
    try {
        if (message.type === 'parse' && message.engine === 'large') {
            await parseLargeStepFile(message, requestId);
            return;
        }
        const occt = await ensureOcctImporter();
        if (message.type === 'init') {
            self.postMessage({ type: 'ready' });
            return;
        }
        if (message.type !== 'parse') return;

        self.postMessage({ type: 'progress', requestId, phase: 'tessellating' });
        const tessellationStartedAt = performance.now();
        const result = occt.ReadStepFile(new Uint8Array(message.fileBuffer), message.parameters || null);
        const tessellationMs = performance.now() - tessellationStartedAt;
        if (!result?.success || !Array.isArray(result.meshes)) {
            throw new Error('OpenCascade could not convert this STEP file.');
        }

        self.postMessage({ type: 'progress', requestId, phase: 'packing', sourceMeshCount: result.meshes.length });
        const packingStartedAt = performance.now();
        const partByMeshIndex = indexStepHierarchy(result.root, result.meshes);
        const legacyMeshIndexes = [...partByMeshIndex.values()].some(part => part.parentPartId)
            ? indexLegacyStepMeshes(result.meshes, partByMeshIndex) : new Map();
        const buckets = new Map();
        let outputMeshCount = 0;
        for (let index = 0; index < result.meshes.length; index += 1) {
            const meshDefinition = result.meshes[index];
            const partMeta = partByMeshIndex.get(index) || {
                partId: `cad-mesh-${index}`,
                partName: meshDefinition?.name || `Part ${index + 1}`
            };
            const entry = createMeshEntry(meshDefinition, { ...partMeta, legacyPartMeshIndex: legacyMeshIndexes.get(index) });
            const color = normalizeColor(meshDefinition?.color);
            result.meshes[index] = null;
            if (!entry) continue;

            const colorKey = color.map((component) => component.toFixed(5)).join(',');
            const bucketKey = `${entry.partId}\u0000${colorKey}`;
            let bucket = buckets.get(bucketKey);
            const entryBytes = (entry.positionLength + entry.indexLength + entry.normalLength) * 4;
            if (bucket?.entries.length > 0
                && bucket.estimatedBytes + entryBytes > STEP_MESH_CHUNK_TARGET_BYTES) {
                outputMeshCount += postBucket(bucket, requestId);
                bucket = createBucket(color, entry.partId, entry.partName, entry.assemblyPath);
                buckets.set(bucketKey, bucket);
            }
            if (!bucket) {
                bucket = createBucket(color, entry.partId, entry.partName, entry.assemblyPath);
                buckets.set(bucketKey, bucket);
            }
            appendEntry(bucket, entry);
            if (bucket.estimatedBytes >= STEP_MESH_CHUNK_TARGET_BYTES) {
                outputMeshCount += postBucket(bucket, requestId);
                buckets.set(bucketKey, createBucket(color, entry.partId, entry.partName, entry.assemblyPath));
            }
        }
        buckets.forEach((bucket) => {
            outputMeshCount += postBucket(bucket, requestId);
        });
        if (outputMeshCount === 0) throw new Error('The STEP file contains no triangulated mesh.');

        self.postMessage({
            type: 'done',
            requestId,
            rootName: result.root?.name || 'STEP Assembly',
            meshCount: outputMeshCount,
            timings: {
                tessellationMs,
                packingMs: performance.now() - packingStartedAt,
                totalMs: performance.now() - startedAt
            }
        });
    } catch (error) {
        self.postMessage({ type: 'error', requestId, message: errorMessage(error) });
    }
}

// Initialization awaits must not allow two imports to share live kernel state.
self.addEventListener('message', (event) => {
    const job = stepImportQueue.then(() => handleStepImportMessage(event));
    stepImportQueue = job.catch(() => {});
    return job;
});
