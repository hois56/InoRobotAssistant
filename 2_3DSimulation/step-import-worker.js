/* global importScripts, occtimportjs */

const OCCT_IMPORT_BASE_URL = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
const LARGE_OCCT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/occt-wasm@3.7.0/dist/index.js';
const LARGE_OCCT_WASM_URL = 'https://cdn.jsdelivr.net/npm/occt-wasm@3.7.0/dist/occt-wasm.wasm';
const STEP_MESH_CHUNK_TARGET_BYTES = 6 * 1024 * 1024;
const LARGE_STEP_MESH_CHUNK_TARGET_BYTES = 4 * 1024 * 1024;
const DEFAULT_COLOR = [0.749, 0.78, 0.835];
let occtPromise = null;
let largeOcctModulePromise = null;

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

function numericArrayLength(source) {
    if (!source?.length) return 0;
    let length = 0;
    for (let index = 0; index < source.length; index += 1) {
        const value = source[index];
        length += (Array.isArray(value) || ArrayBuffer.isView(value)) ? value.length : 1;
    }
    return length;
}

function copyNumbers(source, target, targetOffset, valueOffset = 0) {
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

function indexStepHierarchy(root) {
    const partByMeshIndex = new Map();
    let fallbackPartIndex = 0;

    const visit = (node, path = [], isRoot = false) => {
        if (!node || typeof node !== 'object') return;
        const rawName = String(node.name || '').trim();
        const partName = rawName || `Part ${fallbackPartIndex + 1}`;
        const partId = isRoot ? null : `cad-part-${path.join('-') || fallbackPartIndex++}`;
        if (!isRoot && Array.isArray(node.meshes)) {
            node.meshes.forEach((meshIndex) => {
                const index = Number(meshIndex);
                if (Number.isInteger(index) && index >= 0) {
                    partByMeshIndex.set(index, { partId, partName });
                }
            });
        }
        const children = Array.isArray(node.children) ? node.children : [];
        children.forEach((child, childIndex) => {
            visit(child, [...path, childIndex], false);
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
        positionLength,
        indexLength,
        normalLength,
        vertexCount: positionLength / 3
    };
}

function createBucket(color, partId, partName) {
    return {
        color,
        partId,
        partName,
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
        partName: bucket.partName
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

function groupLargeMeshTriangleRanges(mesh) {
    const triangleCount = Math.floor(mesh.indices.length / 3);
    const completeFaceRanges = getCompleteLargeMeshFaceRanges(mesh);
    const ranges = completeFaceRanges || Array.from(
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
        const rangeBytes = (range.last - range.first + 1) * 84;
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

function createLargeMeshChunk(mesh, triangleRanges, preservesFaces = true) {
    const localByGlobal = new Map();
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
                let localIndex = localByGlobal.get(globalIndex);
                if (localIndex === undefined) {
                    localIndex = globalVertices.length;
                    localByGlobal.set(globalIndex, localIndex);
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
    const { groups, preservesFaces } = groupLargeMeshTriangleRanges(mesh);
    groups.forEach((triangleRanges, chunkIndex) => {
        const workerMesh = {
            ...createLargeMeshChunk(mesh, triangleRanges, preservesFaces),
            color: Array.isArray(partMeta.color) && partMeta.color.length === 3
                ? partMeta.color.map(Number)
                : DEFAULT_COLOR,
            partId: partMeta.partId || 'cad-large-whole',
            partName: partMeta.partName || message.fileName || 'STEP Assembly',
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

function collectXcafParts(document) {
    const parts = [];
    const visit = (label, path) => {
        const info = document.getLabelInfo(label);
        const children = document.getChildren(label);
        const partName = String(info.name || '').trim() || `Part ${parts.length + 1}`;
        const partId = `cad-xcaf-${path.join('-') || parts.length}`;
        if (children.length) {
            const partCountBeforeChildren = parts.length;
            children.forEach((child, childIndex) => visit(child, [...path, childIndex]));
            if (parts.length === partCountBeforeChildren && info.shapeHandle != null) {
                parts.push({
                    partId,
                    partName,
                    shapeHandle: info.shapeHandle,
                    color: info.hasColor ? info.color : DEFAULT_COLOR
                });
            }
            return;
        }
        if (info.shapeHandle != null) {
            parts.push({
                partId,
                partName,
                shapeHandle: info.shapeHandle,
                color: info.hasColor ? info.color : DEFAULT_COLOR
            });
        }
    };

    document.getRoots().forEach((label, rootIndex) => visit(label, [rootIndex]));
    return parts;
}

async function parseLargeStepFile(message, requestId) {
    const { OcctKernel } = await ensureLargeOcctModule();
    const kernel = await OcctKernel.init({ wasm: LARGE_OCCT_WASM_URL });
    let shape = null;
    let document = null;
    let sourceBuffer = message.fileBuffer;
    try {
        self.postMessage({ type: 'progress', requestId, phase: 'reading' });
        // Keep the original transferred buffer. Decoding a large STEP file to
        // a JavaScript string here creates another ~2x-sized representation and
        // makes otherwise valid 100-500 MB files fail before OCCT can read them.
        message.fileBuffer = null;

        // The single-shape import is the lowest-memory large-file path. Try it
        // before XCAF so a successful import never keeps both an assembly
        // document and a second STEP representation alive at once.
        let directImportError = null;
        try {
            shape = kernel.importStep(sourceBuffer);
            sourceBuffer = null;
        } catch (error) {
            directImportError = error;
        }

        // XCAF preserves the STEP assembly tree. It remains a fallback for
        // files that the direct importer rejects before producing a shape.
        if (shape == null) {
            try {
                if (typeof kernel.importXCAFFromSTEP === 'function') {
                    document = kernel.importXCAFFromSTEP(sourceBuffer);
                    const parts = collectXcafParts(document);
                    if (parts.length) {
                        let meshCount = 0;
                        let failedPartCount = 0;
                        for (let index = 0; index < parts.length; index += 1) {
                            const part = parts[index];
                            self.postMessage({
                                type: 'progress',
                                requestId,
                                phase: 'tessellating',
                                partIndex: index,
                                partCount: parts.length,
                                partName: part.partName
                            });
                            try {
                                const mesh = kernel.meshShape(part.shapeHandle, {
                                    linearDeflection: Number(message.parameters?.linearDeflectionAbsolute) || 1,
                                    angularDeflection: Number(message.parameters?.angularDeflection) || 0.8
                                });
                                meshCount += postLargeMeshChunks(mesh, message, requestId, part);
                            } catch (error) {
                                failedPartCount += 1;
                                console.warn('Skipped XCAF STEP part:', part.partName, error);
                            } finally {
                                kernel.release(part.shapeHandle);
                            }
                        }
                        if (meshCount > 0) {
                            self.postMessage({
                                type: 'done',
                                requestId,
                                rootName: message.fileName || 'STEP Assembly',
                                meshCount,
                                partCount: parts.length,
                                failedPartCount,
                                segmented: true
                            });
                            return;
                        }
                    }
                }
            } catch (error) {
                console.warn('XCAF STEP hierarchy import failed after direct import.', error);
            } finally {
                document?.close();
                document = null;
            }
        }

        if (shape == null) {
            throw directImportError || new Error('The STEP file could not be imported.');
        }

        self.postMessage({ type: 'progress', requestId, phase: 'tessellating' });
        const mesh = kernel.meshShape(shape, {
            linearDeflection: Number(message.parameters?.linearDeflectionAbsolute) || 1,
            angularDeflection: Number(message.parameters?.angularDeflection) || 0.8
        });
        if (!(mesh?.positions instanceof Float32Array) || mesh.positions.length < 9
            || !(mesh.indices instanceof Uint32Array) || mesh.indices.length < 3) {
            throw new Error('The STEP file contains no triangulated mesh.');
        }

        kernel.release(shape);
        shape = null;

        self.postMessage({ type: 'progress', requestId, phase: 'packing', sourceMeshCount: 1 });
        const meshCount = postLargeMeshChunks(mesh, message, requestId);
        self.postMessage({
            type: 'done',
            requestId,
            rootName: message.fileName || 'STEP Assembly',
            meshCount
        });
    } finally {
        if (shape != null) kernel.release(shape);
        document?.close();
        sourceBuffer = null;
        kernel[Symbol.dispose]?.();
    }
}

self.addEventListener('message', async (event) => {
    const message = event.data || {};
    const requestId = message.requestId;
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
        const result = occt.ReadStepFile(new Uint8Array(message.fileBuffer), message.parameters || null);
        if (!result?.success || !Array.isArray(result.meshes)) {
            throw new Error('OpenCascade could not convert this STEP file.');
        }

        self.postMessage({ type: 'progress', requestId, phase: 'packing', sourceMeshCount: result.meshes.length });
        const partByMeshIndex = indexStepHierarchy(result.root);
        const buckets = new Map();
        let outputMeshCount = 0;
        for (let index = 0; index < result.meshes.length; index += 1) {
            const meshDefinition = result.meshes[index];
            const partMeta = partByMeshIndex.get(index) || {
                partId: `cad-mesh-${index}`,
                partName: meshDefinition?.name || `Part ${index + 1}`
            };
            const entry = createMeshEntry(meshDefinition, partMeta);
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
                bucket = createBucket(color, entry.partId, entry.partName);
                buckets.set(bucketKey, bucket);
            }
            if (!bucket) {
                bucket = createBucket(color, entry.partId, entry.partName);
                buckets.set(bucketKey, bucket);
            }
            appendEntry(bucket, entry);
            if (bucket.estimatedBytes >= STEP_MESH_CHUNK_TARGET_BYTES) {
                outputMeshCount += postBucket(bucket, requestId);
                buckets.set(bucketKey, createBucket(color, entry.partId, entry.partName));
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
            meshCount: outputMeshCount
        });
    } catch (error) {
        self.postMessage({ type: 'error', requestId, message: errorMessage(error) });
    }
});
