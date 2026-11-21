import { getDxfInsunitsUnit, normalizeCadUnit, normalizeCad2dDocument } from './cad2d-core.mjs?v=20260922-cad-text-1';
import { engine } from './wasm/engine.mjs';
import { dxfData, readDrawing } from './wasm/dxf-host.mjs';

export function isBinaryDxfBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
    dxfData(engine, bytes.subarray(0, 22));
    return Boolean(engine.dxf_binary_signature());
}

function decodeDxfBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    // Exporters can leave an ANSI_949 header in a drawing written as UTF-8.
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        dxfData(engine, bytes);
        const encoding = ['utf-8', 'euc-kr', 'windows-1252'][engine.dxf_encoding()];
        try { return new TextDecoder(encoding).decode(bytes); }
        catch { return new TextDecoder().decode(bytes); }
    }
}

export function parseDxfText(text, options = {}) {
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    const segments = Math.min(Math.max(Number(options.curveSegments) || 64, 16), 512);
    const limit = Math.min(Math.max(Number(options.maxExpandedEntities) || 100000, 1000), 500000);
    const { entities, layers, blocks, warnings, skippedCount, units, cadVersion } = readDrawing(engine, source, segments, limit);
    const requestedUnit = options.unitOverride && options.unitOverride !== 'auto'
        ? normalizeCadUnit(options.unitOverride) : getDxfInsunitsUnit(units);
    return normalizeCad2dDocument({
        source: {
            fileName: options.fileName || '', extension: 'dxf', size: options.size || source.length,
            lastModified: options.lastModified || 0, sha256: options.sha256 || '', sourceUnit: requestedUnit, cadVersion
        },
        sourceKey: options.sourceKey || options.sha256 || ((options.fileName || 'dxf') + '|' + source.length),
        unit: requestedUnit, layers, blocks, entities, warnings, skippedCount,
        parser: 'dxf-native-worker', parserVersion: '1.1.0'
    });
}

export async function parseDxfBuffer(buffer, options = {}) {
    if (isBinaryDxfBuffer(buffer)) {
        const error = new Error('Binary DXF is not supported in the browser parser. Save the file as ASCII DXF.');
        error.code = 'CAD_DXF_BINARY_UNSUPPORTED';
        throw error;
    }
    return parseDxfText(decodeDxfBuffer(buffer), options);
}
