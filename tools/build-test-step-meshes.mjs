import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { TEST_MODEL_CATALOG } from '../2_3DSimulation/test-model-catalog.mjs';
import { getStepTessellationParameters } from '../2_3DSimulation/step-tessellation-parameters.mjs';

const require = createRequire(import.meta.url);
const occtimportjs = require('../3_ToolSelector/vendor/occt/occt-import-js.js');
const wasmBinary = readFileSync(new URL('../3_ToolSelector/vendor/occt/occt-import-js.wasm', import.meta.url));
const encode = array => array
    ? Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64')
    : null;
let handleMessage;
let rootName;
let meshes;
vm.runInNewContext(readFileSync(new URL('../2_3DSimulation/step-import-worker.js', import.meta.url), 'utf8'), {
    ArrayBuffer, Float32Array, Uint8Array, Uint16Array, Uint32Array, TextDecoder, TextEncoder, performance,
    importScripts() {},
    occtimportjs: () => occtimportjs({ wasmBinary }),
    self: {
        addEventListener(_type, callback) { handleMessage = callback; },
        postMessage(message, transfer) {
            if (message.type === 'error') throw new Error(message.message);
            if (message.type === 'done') rootName = message.rootName;
            if (message.type === 'mesh') {
                // Match postMessage's snapshot before the worker clears its buckets.
                const { positions, normals, indices, colors, ...metadata } = structuredClone(message.mesh, { transfer });
                meshes.push({
                    ...metadata,
                    positions: encode(positions), normals: encode(normals), colors: encode(colors),
                    indices: encode(indices), indexBytes: indices.BYTES_PER_ELEMENT
                });
            }
        }
    }
});
for (const asset of TEST_MODEL_CATALOG.filter(item => /\.st(?:e)?p$/i.test(item.file))) {
    const fileName = asset.file.split('/').pop();
    const sourceUrl = new URL(`../2_3DSimulation/test-assets/${asset.file}`, import.meta.url);
    const source = readFileSync(sourceUrl);
    const sourceSha256 = createHash('sha256').update(source).digest('hex');
    const parameters = {
        linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio',
        ...getStepTessellationParameters(source.length)
    };
    rootName = '';
    meshes = [];
    const fileBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    await handleMessage({ data: { type: 'parse', engine: 'standard', requestId: 1, fileName, fileBuffer, parameters } });
    if (!rootName || !meshes.length) throw new Error(`${fileName} conversion produced no meshes`);
    const output = gzipSync(JSON.stringify({ version: 1, sourceSha256, parameters, rootName, meshes }), { level: 9 });
    writeFileSync(new URL(`${sourceUrl.href}.mesh.json.gz`), output);
    console.log(`${fileName}: ${meshes.length} meshes, ${output.length} compressed bytes`);
}
