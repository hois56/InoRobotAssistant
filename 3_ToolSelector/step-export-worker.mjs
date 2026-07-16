import opencascade from 'https://cdn.jsdelivr.net/npm/replicad-opencascadejs@0.23.0/src/replicad_single.js';
import {
  exportSTEP,
  importSTEP,
  setOC
} from 'https://esm.sh/replicad@0.23.0?bundle';
import {
  buildWorldToToolTransform,
  createStepExportFileName
} from './step-export-transform.mjs';

const OPENCASCADE_WASM_URL = 'https://cdn.jsdelivr.net/npm/replicad-opencascadejs@0.23.0/src/replicad_single.wasm';
let cadApiReadyPromise = null;

function reportProgress(message) {
  self.postMessage({ type: 'progress', message });
}

async function ensureCadApi() {
  if (!cadApiReadyPromise) {
    cadApiReadyPromise = opencascade({
      locateFile: () => OPENCASCADE_WASM_URL
    }).then((oc) => {
      setOC(oc);
      return oc;
    }).catch((error) => {
      cadApiReadyPromise = null;
      throw error;
    });
  }
  return cadApiReadyPromise;
}

self.addEventListener('message', async (event) => {
  let shape = null;
  try {
    const { buffer, sourceName, originMm, rotationDegrees } = event.data || {};
    if (!(buffer instanceof ArrayBuffer)) throw new Error('STEP source data is missing.');
    reportProgress('STEP 파일 내보내기 엔진을 준비하는 중입니다.');
    await ensureCadApi();

    reportProgress('STEP 형상을 변환하는 중입니다.');
    shape = await importSTEP(new Blob([buffer], { type: 'application/step' }));
    const transform = buildWorldToToolTransform(originMm, rotationDegrees);
    shape = shape.translate(transform.translation);
    transform.rotations.forEach(({ angleDegrees, axis }) => {
      if (Math.abs(angleDegrees) > 1e-12) shape = shape.rotate(angleDegrees, [0, 0, 0], axis);
    });

    reportProgress('STEP 파일을 생성하는 중입니다.');
    const exportName = createStepExportFileName(sourceName);
    const output = exportSTEP([
      { shape, name: exportName.replace(/\.step$/i, '') }
    ], { unit: 'MM', modelUnit: 'MM' });
    const outputBuffer = await output.arrayBuffer();
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
    shape?.delete?.();
  }
});
