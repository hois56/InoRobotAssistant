export const SOLIDWORKS_DISPLAY_TYPE = 'application/vnd.inorobot.solidworks-display';

export function isSolidWorksExtension(extension) {
    return extension === 'sldprt' || extension === 'sldasm';
}

export function solidWorksSelectionPath(file) {
    return file.webkitRelativePath || file.name;
}

function pathSegments(path) {
    return path.replaceAll('\\', '/').split('/').filter(Boolean).map(part => part.toLowerCase());
}

export function indexSolidWorksReferences(files, assemblyPath) {
    const exact = new Map();
    const numbered = new Map();
    const assemblyFolder = pathSegments(assemblyPath).slice(0, -1).join('/');
    const add = (index, name, entry) => {
        if (!index.has(name)) index.set(name, []);
        index.get(name).push(entry);
    };
    for (const { file, path: relativePath } of files) {
        const path = pathSegments(relativePath);
        const name = path.pop();
        if (!name?.endsWith('.sldprt')) continue;
        const entry = { file, path };
        add(exact, name, entry);
        const alias = name.replace(/_\d+(?=\.sldprt$)/, '');
        if (alias !== name) add(numbered, alias, entry);
    }
    return stored => {
        const path = pathSegments(stored);
        const name = path.pop();
        const candidates = exact.get(name) ?? numbered.get(name) ?? [];
        let best = null;
        let bestRank = -1;
        let ambiguous = false;
        for (const entry of candidates) {
            let suffix = 0;
            while (suffix < Math.min(path.length, entry.path.length)
                && path.at(-1 - suffix) === entry.path.at(-1 - suffix)) suffix++;
            const rank = suffix * 2 + Number(entry.path.join('/') === assemblyFolder);
            if (rank > bestRank) {
                bestRank = rank;
                best = entry.file;
                ambiguous = false;
            } else if (rank === bestRank) {
                ambiguous = true;
            }
        }
        return { file: ambiguous ? null : best, ambiguous };
    };
}

export async function readSolidWorksFile(file, references, path = solidWorksSelectionPath(file)) {
    const worker = new Worker(new URL('./solidworks-import-worker.mjs?v=20261121-3', import.meta.url), { type: 'module' });
    try {
        return await new Promise((resolve, reject) => {
            worker.onmessage = ({ data }) => {
                if (data.buffer) resolve(data);
                else reject(Object.assign(new Error(data.error), { code: data.code, reference: data.reference }));
            };
            worker.onerror = event => reject(new Error(event.message || 'SolidWorks worker failed.'));
            worker.onmessageerror = () => reject(new Error('SolidWorks worker returned unreadable data.'));
            worker.postMessage({
                file, path,
                references: references.map(reference => ({ file: reference, path: solidWorksSelectionPath(reference) }))
            });
        });
    } finally {
        worker.terminate();
    }
}

const decoder = new TextDecoder('utf-8', { fatal: true });
const invalid = () => new Error('Invalid SolidWorks display data.');

function placeMesh(buffer, start, mesh, matrix) {
    const { vertices, indices: count, offset } = mesh;
    if (![vertices, count, offset].every(value => Number.isSafeInteger(value) && value >= 0)
        || !vertices || !count || count % 3 || offset % 4
        || !Array.isArray(matrix) || matrix.length !== 12 || !matrix.every(Number.isFinite)) throw invalid();
    const coordinates = vertices * 3;
    const positionsOffset = start + offset;
    const normalsOffset = positionsOffset + coordinates * 4;
    const indicesOffset = normalsOffset + (mesh.normals ? coordinates * 4 : 0);
    if (indicesOffset + count * 4 > buffer.byteLength) throw invalid();

    const local = new Float32Array(buffer, positionsOffset, coordinates);
    const localNormals = mesh.normals ? new Float32Array(buffer, normalsOffset, coordinates) : null;
    const positions = new Float32Array(coordinates);
    const normals = localNormals ? new Float32Array(coordinates) : null;
    const indices = new Uint32Array(buffer, indicesOffset, count).slice();
    const m = matrix;
    for (let i = 0; i < coordinates; i += 3) {
        for (let axis = 0; axis < 3; axis++) {
            const j = axis * 4;
            const point = (m[j] * local[i] + m[j + 1] * local[i + 1] + m[j + 2] * local[i + 2]) * 1000;
            if (!Number.isFinite(point)) throw invalid();
            positions[i + axis] = point;
            if (normals) normals[i + axis] = m[j] * localNormals[i] + m[j + 1] * localNormals[i + 1] + m[j + 2] * localNormals[i + 2];
        }
        if (normals) {
            const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
            if (!Number.isFinite(length)) throw invalid();
            if (length) for (let axis = 0; axis < 3; axis++) normals[i + axis] /= length;
        }
    }
    const mirrored = m[0] * (m[5] * m[10] - m[6] * m[9])
        - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]) < 0;
    for (let i = 0; i < count; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        if (Math.max(a, b, c) >= coordinates) throw invalid();
        let flip = mirrored;
        if (normals) {
            const x = positions[b] - positions[a], y = positions[b + 1] - positions[a + 1], z = positions[b + 2] - positions[a + 2];
            const u = positions[c] - positions[a], v = positions[c + 1] - positions[a + 1], w = positions[c + 2] - positions[a + 2];
            const facing = (y * w - z * v) * (normals[a] + normals[b] + normals[c])
                + (z * u - x * w) * (normals[a + 1] + normals[b + 1] + normals[c + 1])
                + (x * v - y * u) * (normals[a + 2] + normals[b + 2] + normals[c + 2]);
            if (facing) flip = facing < 0;
        }
        if (flip) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    }
    return { positions, normals, indices, translation: [m[3], m[7], m[11]] };
}

export function* solidWorksMeshes(buffer) {
    if (buffer.byteLength < 4) throw invalid();
    const size = new DataView(buffer).getUint32(0, true);
    if (size % 4 || size > buffer.byteLength - 4) throw invalid();
    const start = 4 + size;
    const header = JSON.parse(decoder.decode(new Uint8Array(buffer, 4, size)));
    const assemblies = new Map();
    const ids = new Set();
    for (const node of header.nodes) {
        const { id, parentId, name, mesh: meshIndex } = node;
        if (ids.has(id) || (parentId !== null && !assemblies.has(parentId))) throw invalid();
        ids.add(id);
        const parentPath = assemblies.get(parentId) ?? [];
        if (meshIndex == null) {
            assemblies.set(id, parentId === null ? [] : [...parentPath, { id: 'sw-' + id, name }]);
            continue;
        }
        const mesh = header.meshes[meshIndex];
        if (!mesh || !Array.isArray(mesh.faces) || !mesh.faces.length) throw invalid();
        const geometry = placeMesh(buffer, start, mesh, node.matrix);
        const defaultColor = node.color ?? mesh.color ?? 0xbfc7d1;
        let first = 0;
        const faces = mesh.faces.map((count, index) => {
            const color = node.faceColors?.[index] ?? mesh.faceColors?.[index] ?? defaultColor;
            if (!Number.isSafeInteger(count) || count < 1 || !Number.isInteger(color) || color < 0 || color > 0xffffff) throw invalid();
            const last = first + count - 1;
            const face = { first, last, color };
            first = last + 1;
            return face;
        });
        if (first * 3 !== geometry.indices.length) throw invalid();
        yield { ...geometry, id: 'sw-' + id, name, hidden: Boolean(node.hidden), assemblyPath: parentPath, faces };
    }
}
