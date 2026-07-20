const OCCT_IMPORT_BASE_URL = './vendor/occt/';
const OCCT_IMPORT_SCRIPT_URL = `${OCCT_IMPORT_BASE_URL}occt-import-js.js`;

let occtPromise = null;

function reportProgress(message) {
  self.postMessage({ type: 'progress', message });
}

function ensureOcctImporter() {
  if (!occtPromise) {
    if (typeof self.occtimportjs !== 'function') importScripts(OCCT_IMPORT_SCRIPT_URL);
    if (typeof self.occtimportjs !== 'function') throw new Error('OpenCascade STEP parser is unavailable.');
    occtPromise = self.occtimportjs({
      locateFile: (fileName) => `${OCCT_IMPORT_BASE_URL}${fileName}`
    });
  }
  return occtPromise;
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
    children.forEach((child, childIndex) => visit(child, [...path, childIndex], false));
  };

  visit(root, [], true);
  return partByMeshIndex;
}

function toTypedArray(value, ArrayType) {
  if (!value) return new ArrayType();
  if (value instanceof ArrayType) return value;
  if (ArrayBuffer.isView(value)) return ArrayType.from(value);
  if (!Array.isArray(value[0])) return ArrayType.from(value);

  let length = 0;
  for (const row of value) length += row.length;
  const result = new ArrayType(length);
  let offset = 0;
  for (const row of value) {
    result.set(row, offset);
    offset += row.length;
  }
  return result;
}

function compactMesh(mesh, partMeta, transferables) {
  const positions = toTypedArray(mesh?.attributes?.position?.array, Float32Array);
  const normals = toTypedArray(mesh?.attributes?.normal?.array, Float32Array);
  const indices = toTypedArray(mesh?.index?.array, Uint32Array);
  transferables.push(positions.buffer, indices.buffer);
  if (normals.length) transferables.push(normals.buffer);

  return {
    name: mesh?.name || '',
    partId: partMeta?.partId || null,
    partName: partMeta?.partName || mesh?.name || '',
    color: mesh?.color || null,
    brep_faces: Array.isArray(mesh?.brep_faces) ? mesh.brep_faces : [],
    attributes: {
      position: { array: positions },
      ...(normals.length ? { normal: { array: normals } } : {})
    },
    index: { array: indices }
  };
}

self.addEventListener('message', async (event) => {
  try {
    const { buffer, options } = event.data || {};
    if (!(buffer instanceof ArrayBuffer)) throw new Error('STEP source data is missing.');

    reportProgress('STEP 파일을 불러오는 중입니다.');
    const occt = await ensureOcctImporter();
    const result = occt.ReadStepFile(new Uint8Array(buffer), options || null);
    if (!result?.success || !Array.isArray(result.meshes)) throw new Error('CAD file could not be read.');

    reportProgress('STEP 파일을 불러오는 중입니다.');
    const transferables = [];
    const partByMeshIndex = indexStepHierarchy(result.root);
    const compactResult = {
      success: true,
      rootName: result.root?.name || 'STEP Assembly',
      meshes: result.meshes.map((mesh, index) => compactMesh(
        mesh,
        partByMeshIndex.get(index) || {
          partId: `cad-mesh-${index}`,
          partName: mesh?.name || `Part ${index + 1}`
        },
        transferables
      ))
    };
    self.postMessage({ type: 'complete', result: compactResult }, transferables);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error?.message || String(error),
      stack: error?.stack || ''
    });
  }
});
