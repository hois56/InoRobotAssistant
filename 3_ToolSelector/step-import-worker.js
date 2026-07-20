const OCCT_IMPORT_BASE_URL = './vendor/occt/';
const OCCT_IMPORT_SCRIPT_URL = `${OCCT_IMPORT_BASE_URL}occt-import-js.js`;
const ISO_STEP_TOKEN = Uint8Array.from([... 'ISO-10303-21;'].map((character) => character.charCodeAt(0)));
const CARTESIAN_POINT_TOKEN = Uint8Array.from([... 'CARTESIAN_POINT'].map((character) => character.charCodeAt(0)));
const MANIFOLD_TOKEN = Uint8Array.from([... 'MANIFOLD_SOLID_BREP'].map((character) => character.charCodeAt(0)));
const FACETED_TOKEN = Uint8Array.from([... 'FACETED_BREP'].map((character) => character.charCodeAt(0)));
const LATIN1_DECODER = new TextDecoder('iso-8859-1');

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

function findBytes(line, token, start = 0) {
  outer: for (let index = start; index <= line.length - token.length; index += 1) {
    for (let tokenIndex = 0; tokenIndex < token.length; tokenIndex += 1) {
      if (line[index + tokenIndex] !== token[tokenIndex]) continue outer;
    }
    return index;
  }
  return -1;
}

function lastByte(line, value) {
  for (let index = line.length - 1; index >= 0; index -= 1) {
    if (line[index] === value) return index;
  }
  return -1;
}

function readEntityId(line) {
  let index = 0;
  while (index < line.length && (line[index] === 32 || line[index] === 9)) index += 1;
  if (line[index] !== 35) return null;
  index += 1;
  const start = index;
  while (index < line.length && line[index] >= 48 && line[index] <= 57) index += 1;
  if (index === start || line[index] !== 61) return null;
  const id = Number.parseInt(new TextDecoder().decode(line.subarray(start, index)), 10);
  return Number.isInteger(id) ? id : null;
}

function parseAsciiNumber(line, start, end) {
  let index = start;
  while (index < end && (line[index] === 32 || line[index] === 9)) index += 1;
  let sign = 1;
  if (line[index] === 45 || line[index] === 43) {
    if (line[index] === 45) sign = -1;
    index += 1;
  }
  let integer = 0;
  let hasDigits = false;
  while (index < end && line[index] >= 48 && line[index] <= 57) {
    integer = integer * 10 + line[index] - 48;
    hasDigits = true;
    index += 1;
  }
  let fraction = 0;
  let scale = 1;
  if (line[index] === 46) {
    index += 1;
    while (index < end && line[index] >= 48 && line[index] <= 57) {
      fraction = fraction * 10 + line[index] - 48;
      scale *= 10;
      hasDigits = true;
      index += 1;
    }
  }
  if (!hasDigits) return Number.NaN;
  let exponent = 0;
  if (line[index] === 69 || line[index] === 101 || line[index] === 68 || line[index] === 100) {
    index += 1;
    let exponentSign = 1;
    if (line[index] === 45 || line[index] === 43) {
      if (line[index] === 45) exponentSign = -1;
      index += 1;
    }
    let exponentValue = 0;
    let exponentDigits = false;
    while (index < end && line[index] >= 48 && line[index] <= 57) {
      exponentValue = exponentValue * 10 + line[index] - 48;
      exponentDigits = true;
      index += 1;
    }
    if (exponentDigits) exponent = exponentSign * exponentValue;
  }
  return sign * (integer + fraction / scale) * 10 ** exponent;
}

function readCartesianPoint(line) {
  if (findBytes(line, CARTESIAN_POINT_TOKEN) < 0) return null;
  const open = lastByte(line, 40);
  const close = lastByte(line, 41);
  if (open < 0 || close <= open) return null;
  const commaToken = Uint8Array.of(44);
  const firstComma = findBytes(line, commaToken, open + 1);
  if (firstComma < 0 || firstComma >= close) return null;
  const secondComma = findBytes(line, commaToken, firstComma + 1);
  if (secondComma < 0 || secondComma >= close) return null;
  const point = [
    parseAsciiNumber(line, open + 1, firstComma),
    parseAsciiNumber(line, firstComma + 1, secondComma),
    parseAsciiNumber(line, secondComma + 1, close)
  ];
  return point.every(Number.isFinite) ? point : null;
}

function readQuotedName(line, tokenIndex) {
  const quoteToken = Uint8Array.of(39);
  const quoteStart = findBytes(line, quoteToken, tokenIndex);
  if (quoteStart < 0) return '';
  let quoteEnd = quoteStart + 1;
  while (quoteEnd < line.length) {
    quoteEnd = findBytes(line, quoteToken, quoteEnd);
    if (quoteEnd < 0) return '';
    if (line[quoteEnd + 1] !== 39) break;
    quoteEnd += 2;
  }
  return LATIN1_DECODER.decode(line.slice(quoteStart + 1, quoteEnd)).replaceAll("''", "'").trim();
}

function scanFastPreview(fileBuffer, fileName) {
  const parts = [];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let pointCount = 0;
  let line = new Uint8Array(4096);
  let lineLength = 0;
  let nextProgress = 16 * 1024 * 1024;
  const source = new Uint8Array(fileBuffer);
  if (findBytes(source.subarray(0, Math.min(source.length, 128)), ISO_STEP_TOKEN) < 0) {
    return { success: false, fastPreview: true, rootName: fileName || 'STEP Assembly', parts: [] };
  }

  const processLine = (lineBytes) => {
    const point = readCartesianPoint(lineBytes);
    if (point) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
      pointCount += 1;
    }

    const manifoldIndex = findBytes(lineBytes, MANIFOLD_TOKEN);
    const facetedIndex = manifoldIndex < 0 ? findBytes(lineBytes, FACETED_TOKEN) : -1;
    const rootIndex = manifoldIndex >= 0 ? manifoldIndex : facetedIndex;
    if (rootIndex < 0 || pointCount === 0) return;
    parts.push({
      name: readQuotedName(lineBytes, rootIndex) || `Part ${String(parts.length + 1).padStart(4, '0')}`,
      rootEntityId: readEntityId(lineBytes),
      min: min.slice(),
      max: max.slice(),
      pointCount
    });
    min = [Infinity, Infinity, Infinity];
    max = [-Infinity, -Infinity, -Infinity];
    pointCount = 0;
  };

  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (value === 10) {
      processLine(line.subarray(0, lineLength));
      lineLength = 0;
    } else if (value !== 13) {
      if (lineLength === line.length) {
        const expanded = new Uint8Array(line.length * 2);
        expanded.set(line);
        line = expanded;
      }
      line[lineLength] = value;
      lineLength += 1;
    }
    if (index + 1 >= nextProgress) {
      self.postMessage({
        type: 'progress',
        message: `대용량 STEP 빠른 프리뷰 분석 중입니다. ${Math.round(((index + 1) / Math.max(source.length, 1)) * 100)}%`
      });
      nextProgress += 16 * 1024 * 1024;
    }
  }
  if (lineLength > 0) processLine(line.subarray(0, lineLength));
  return { success: parts.length > 0, fastPreview: true, rootName: fileName || 'STEP Assembly', parts };
}

self.addEventListener('message', async (event) => {
  try {
    const { buffer, options, fastPreview, fileName } = event.data || {};
    if (!(buffer instanceof ArrayBuffer)) throw new Error('STEP source data is missing.');

    if (fastPreview) {
      const preview = scanFastPreview(buffer, fileName);
      if (preview.success) self.postMessage({ type: 'fast-preview', result: preview });
    }

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
