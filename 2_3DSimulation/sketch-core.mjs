export const SKETCH_DOCUMENT_SCHEMA_VERSION = 1;

function makeSketchId() {
    return `sketch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function vector3(value, fallback = [0, 0, 0]) {
    const source = Array.isArray(value) ? value : [value?.x, value?.y, value?.z];
    return [0, 1, 2].map((index) => finiteNumber(source?.[index], fallback[index]));
}

function normalizePlane(plane = {}) {
    const type = ['world-xy', 'world-yz', 'world-zx', 'model-face'].includes(plane.type)
        ? plane.type
        : 'world-xy';
    return {
        type,
        origin: vector3(plane.origin),
        xAxis: vector3(plane.xAxis, [1, 0, 0]),
        yAxis: vector3(plane.yAxis, [0, 1, 0]),
        normal: vector3(plane.normal, [0, 0, 1]),
        hostModelId: plane.hostModelId ? String(plane.hostModelId) : null,
        hostFaceId: plane.hostFaceId ? String(plane.hostFaceId) : null
    };
}

export function createSketchDocument(options = {}) {
    return {
        schemaVersion: SKETCH_DOCUMENT_SCHEMA_VERSION,
        id: String(options.id || makeSketchId()),
        name: String(options.name || 'Sketch 1'),
        plane: normalizePlane(options.plane),
        unit: 'millimeter',
        entities: Array.isArray(options.entities) ? options.entities : [],
        constraints: Array.isArray(options.constraints) ? options.constraints : [],
        dimensions: Array.isArray(options.dimensions) ? options.dimensions : [],
        importSources: Array.isArray(options.importSources) ? options.importSources : [],
        settings: {
            gridVisible: options.settings?.gridVisible !== false,
            snapEnabled: options.settings?.snapEnabled !== false
        }
    };
}

export function normalizeSketchDocument(input = {}) {
    const document = createSketchDocument(input);
    document.schemaVersion = SKETCH_DOCUMENT_SCHEMA_VERSION;
    document.name = String(input.name || document.name);
    document.entities = Array.isArray(input.entities) ? input.entities : [];
    document.constraints = Array.isArray(input.constraints) ? input.constraints : [];
    document.dimensions = Array.isArray(input.dimensions) ? input.dimensions : [];
    document.importSources = Array.isArray(input.importSources) ? input.importSources : [];
    return document;
}

export function cloneSketchDocument(document) {
    return normalizeSketchDocument(JSON.parse(JSON.stringify(document || {})));
}

export function addSketchImportSource(document, source = {}) {
    if (!document) return null;
    const record = {
        id: String(source.id || `import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        fileName: String(source.fileName || ''),
        extension: String(source.extension || '').toLowerCase(),
        documentId: String(source.documentId || ''),
        entityCount: Math.max(0, Number(source.entityCount) || 0),
        skippedCount: Math.max(0, Number(source.skippedCount) || 0),
        mode: source.mode === 'reference' ? 'reference' : 'editable'
    };
    document.importSources = [...(document.importSources || []), record];
    return record;
}
