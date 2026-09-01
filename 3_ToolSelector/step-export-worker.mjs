import {
  buildWorldToToolTransform,
  createStepExportFileName,
  normalizeCadColorHex
} from './step-export-transform.mjs';

const OCCT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/occt-wasm@3.7.0/dist/index.js';
const OCCT_WASM_URL = 'https://cdn.jsdelivr.net/npm/occt-wasm@3.7.0/dist/occt-wasm.wasm';
const LARGE_STEP_DIRECT_EXPORT_MIN_BYTES = 100 * 1024 * 1024;
const DEFAULT_CAD_COLOR = [0.392, 0.443, 0.545];
let occtModulePromise = null;

function reportProgress(message) {
  self.postMessage({ type: 'progress', message });
}

function ensureOcctModule() {
  if (!occtModulePromise) {
    occtModulePromise = import(OCCT_MODULE_URL).catch((error) => {
      occtModulePromise = null;
      throw error;
    });
  }
  return occtModulePromise;
}

function normalizePartName(value) {
  return String(value || '')
    .trim()
    .replace(/:\d+$/, '')
    .replace(/\s+#\d+$/, '')
    .toLowerCase();
}

function colorHexToRgb(value) {
  const color = normalizeCadColorHex(value);
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255
  ];
}

function collectXcafParts(document) {
  const parts = [];
  const visit = (label, path) => {
    const info = document.getLabelInfo(label);
    const children = document.getChildren(label);
    if (children.length) {
      const partCountBeforeChildren = parts.length;
      children.forEach((child, index) => visit(child, [...path, index]));
      if (parts.length === partCountBeforeChildren && info?.shapeHandle != null) {
        parts.push({ ...info, path });
      }
      return;
    }
    if (info?.shapeHandle != null) parts.push({ ...info, path });
  };
  document.getRoots().forEach((root, index) => visit(root, [index]));
  return parts;
}

function normalizeCadParts(cadParts) {
  return (Array.isArray(cadParts) ? cadParts : []).map((part, index) => ({
    name: String(part?.name || `Part ${index + 1}`),
    sourceName: String(part?.sourceName || part?.name || '').trim(),
    color: normalizeCadColorHex(part?.color),
    enabled: part?.enabled === true
  }));
}

function areAllCadPartsEnabled(cadParts) {
  const parts = normalizeCadParts(cadParts);
  return parts.length === 0 || parts.every((part) => part.enabled);
}

function findSourcePart(sourceParts, cadPart, usedSourceIndexes) {
  const sourceKey = normalizePartName(cadPart.sourceName || cadPart.name);
  if (!sourceKey) return null;
  const sourceIndex = sourceParts.findIndex((sourcePart, index) => (
    !usedSourceIndexes.has(index)
      && normalizePartName(sourcePart.name) === sourceKey
  ));
  if (sourceIndex < 0) return null;
  usedSourceIndexes.add(sourceIndex);
  return { sourcePart: sourceParts[sourceIndex], sourceIndex };
}

function createExportEntries(sourceParts, cadParts) {
  const normalizedParts = normalizeCadParts(cadParts);
  const enabledParts = normalizedParts.filter((part) => part.enabled);
  if (normalizedParts.length && !enabledParts.length) throw new Error('No STEP parts selected for export.');
  if (!sourceParts.length) throw new Error('STEP assembly contains no exportable parts.');

  const allPartsEnabled = normalizedParts.length === 0
    || normalizedParts.every((part) => part.enabled);
  const usedSourceIndexes = new Set();
  const matchedParts = normalizedParts.map((part) => findSourcePart(sourceParts, part, usedSourceIndexes));

  // The imported display mesh count is not the STEP assembly part count. When
  // every visible part is selected, export every XCAF leaf instead of relying
  // on a false solid-count equality check.
  if (allPartsEnabled) {
    return sourceParts.map((sourcePart, sourceIndex) => {
      const matchIndex = matchedParts.findIndex((match) => match?.sourceIndex === sourceIndex);
      const cadPart = matchIndex >= 0 ? normalizedParts[matchIndex] : null;
      return {
        shapeHandle: sourcePart.shapeHandle,
        name: cadPart?.name || sourcePart.name || `Part ${sourceIndex + 1}`,
        color: sourcePart.hasColor ? sourcePart.color : colorHexToRgb(cadPart?.color),
        sourceIndex
      };
    });
  }

  const entries = [];
  normalizedParts.forEach((cadPart, partIndex) => {
    if (!cadPart.enabled) return;
    const match = matchedParts[partIndex];
    if (match) {
      entries.push({
        shapeHandle: match.sourcePart.shapeHandle,
        name: cadPart.name,
        color: match.sourcePart.hasColor ? match.sourcePart.color : colorHexToRgb(cadPart.color),
        sourceIndex: match.sourceIndex
      });
    }
  });

  // If names are unavailable but both importers expose the same number of
  // assembly parts, retain the UI order as a deterministic fallback.
  if (entries.length !== enabledParts.length && normalizedParts.length === sourceParts.length) {
    return normalizedParts.flatMap((cadPart, index) => cadPart.enabled ? [{
      shapeHandle: sourceParts[index].shapeHandle,
      name: cadPart.name,
      color: sourceParts[index].hasColor ? sourceParts[index].color : colorHexToRgb(cadPart.color),
      sourceIndex: index
    }] : []);
  }
  if (entries.length !== enabledParts.length) throw new Error('Selected STEP parts could not be matched.');
  return entries;
}

function transformShape(kernel, shapeHandle, transform) {
  let transformed = kernel.translate(
    shapeHandle,
    transform.translation[0],
    transform.translation[1],
    transform.translation[2]
  );
  transform.rotations.forEach(({ angleDegrees, axis }) => {
    if (Math.abs(angleDegrees) <= 1e-12) return;
    transformed = kernel.rotate(
      transformed,
      { point: [0, 0, 0], direction: axis },
      angleDegrees * Math.PI / 180
    );
  });
  return transformed;
}

function exportDirectStep(kernel, buffer, transform) {
  const sourceShape = kernel.importStep(buffer);
  const transformedShape = transformShape(kernel, sourceShape, transform);
  return {
    outputText: kernel.exportStep(transformedShape),
    sourceShape,
    transformedShape
  };
}

self.addEventListener('message', async (event) => {
  let kernel = null;
  let sourceDocument = null;
  let outputDocument = null;
  let directSourceShape = null;
  let directTransformedShape = null;
  let outputText = '';
  try {
    const { buffer, sourceName, originMm, rotationDegrees, cadParts } = event.data || {};
    if (!(buffer instanceof ArrayBuffer)) throw new Error('STEP source data is missing.');
    reportProgress('STEP 파일 내보내기 엔진을 준비하는 중입니다.');
    const { OcctKernel } = await ensureOcctModule();
    kernel = await OcctKernel.init({ wasm: OCCT_WASM_URL });
    const allPartsEnabled = areAllCadPartsEnabled(cadParts);
    const transform = buildWorldToToolTransform(originMm, rotationDegrees);

    // The large-file importer intentionally keeps STEP data binary to avoid a
    // second, string-sized copy. Use the same low-memory path for export when
    // every displayed part is selected (the large-file UI exposes one whole
    // model group), so large files do not fail during TextDecoder allocation.
    if (allPartsEnabled && buffer.byteLength >= LARGE_STEP_DIRECT_EXPORT_MIN_BYTES) {
      reportProgress('STEP 형상을 변환하는 중입니다.');
      ({ outputText, sourceShape: directSourceShape, transformedShape: directTransformedShape } = exportDirectStep(kernel, buffer, transform));
      reportProgress('STEP 파일을 생성하는 중입니다.');
      const exportName = createStepExportFileName(sourceName);
      const outputBuffer = new TextEncoder().encode(outputText).buffer;
      self.postMessage({
        type: 'complete',
        fileName: exportName,
        buffer: outputBuffer
      }, [outputBuffer]);
      return;
    }

    try {
      reportProgress('STEP 형상을 변환하는 중입니다.');
      const stepText = new TextDecoder().decode(new Uint8Array(buffer));
      sourceDocument = kernel.importXCAFFromSTEP(stepText);
      const sourceParts = collectXcafParts(sourceDocument);
      const exportEntries = createExportEntries(sourceParts, cadParts);

      reportProgress('STEP 형상을 변환하는 중입니다.');
      outputDocument = kernel.createXCAFDocument();
      exportEntries.forEach((entry) => {
        const transformed = transformShape(kernel, entry.shapeHandle, transform);
        outputDocument.addShape(transformed, {
          name: entry.name,
          color: entry.color || DEFAULT_CAD_COLOR
        });
      });

      reportProgress('STEP 파일을 생성하는 중입니다.');
      outputText = outputDocument.exportSTEP();
    } catch (error) {
      // Some valid STEP files do not expose an XCAF assembly tree. If the UI
      // has all parts enabled, fall back to direct shape export instead of
      // rejecting the file because its metadata cannot be reconstructed.
      if (!allPartsEnabled) throw error;
      outputDocument?.close?.();
      outputDocument = null;
      sourceDocument?.close?.();
      sourceDocument = null;
      reportProgress('STEP 형상을 변환하는 중입니다.');
      ({ outputText, sourceShape: directSourceShape, transformedShape: directTransformedShape } = exportDirectStep(kernel, buffer, transform));
      reportProgress('STEP 파일을 생성하는 중입니다.');
    }

    const exportName = createStepExportFileName(sourceName);
    const outputBuffer = new TextEncoder().encode(outputText).buffer;
    self.postMessage({
      type: 'complete',
      fileName: exportName,
      buffer: outputBuffer
    }, [outputBuffer]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error?.message || String(error),
      stack: error?.stack || ''
    });
  } finally {
    outputDocument?.close?.();
    sourceDocument?.close?.();
    if (directTransformedShape != null) kernel?.release?.(directTransformedShape);
    if (directSourceShape != null) kernel?.release?.(directSourceShape);
    kernel?.[Symbol.dispose]?.();
  }
});
