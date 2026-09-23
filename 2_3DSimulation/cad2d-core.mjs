import { approximateLength, boundsFromPoints } from './cad2d-geometry.mjs';

export const CAD2D_SCHEMA_VERSION = 1;
export const CAD_UNIT_SCALES_TO_MM = Object.freeze({
    unknown: 1,
    millimeter: 1,
    centimeter: 10,
    meter: 1000,
    inch: 25.4,
    foot: 304.8,
    mil: 0.0254
});

const UNIT_ALIASES = new Map([
    ['auto', 'unknown'], ['unknown', 'unknown'], ['unitless', 'unknown'],
    ['mm', 'millimeter'], ['millimeter', 'millimeter'], ['millimeters', 'millimeter'],
    ['cm', 'centimeter'], ['centimeter', 'centimeter'], ['centimeters', 'centimeter'],
    ['m', 'meter'], ['meter', 'meter'], ['meters', 'meter'],
    ['in', 'inch'], ['inch', 'inch'], ['inches', 'inch'],
    ['ft', 'foot'], ['foot', 'foot'], ['feet', 'foot'],
    ['mil', 'mil'], ['mils', 'mil']
]);

const CAD_LINE_TYPE_FALLBACK_PATTERNS = Object.freeze({
    DOTTED: [0, -1],
    DOT: [0, -1],
    DASHDOT: [6, -2, 0, -2],
    CENTER: [10, -2, 2, -2],
    PHANTOM: [12, -2, 2, -2, 2, -2],
    HIDDEN: [3, -1],
    DASHED: [6, -2],
    BORDER: [6, -2],
    DIVIDE: [6, -2]
});

export function normalizeCadLineTypeName(value, fallback = 'CONTINUOUS') {
    const name = String(value ?? '').trim().toUpperCase();
    return name || fallback;
}

export function normalizeCadLinePattern(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(Number)
        .filter((entry) => Number.isFinite(entry));
}

export function getCadLineDashSpec(linetype, linePattern = []) {
    const name = normalizeCadLineTypeName(linetype);
    const explicitPattern = normalizeCadLinePattern(linePattern);
    let pattern = explicitPattern;
    if (!pattern.length) {
        pattern = CAD_LINE_TYPE_FALLBACK_PATTERNS[name]
            || (name.includes('DOTTED') || name === 'DOT' ? CAD_LINE_TYPE_FALLBACK_PATTERNS.DOTTED : null)
            || (name.includes('DASHDOT') ? CAD_LINE_TYPE_FALLBACK_PATTERNS.DASHDOT : null)
            || (name.includes('CENTER') ? CAD_LINE_TYPE_FALLBACK_PATTERNS.CENTER : null)
            || (name.includes('PHANTOM') ? CAD_LINE_TYPE_FALLBACK_PATTERNS.PHANTOM : null)
            || (name.includes('HIDDEN') ? CAD_LINE_TYPE_FALLBACK_PATTERNS.HIDDEN : null)
            || (name.includes('DASH') || name.includes('BORDER') || name.includes('DIVIDE')
                ? CAD_LINE_TYPE_FALLBACK_PATTERNS.DASHED
                : null)
            || [];
    }
    if (!pattern.some((entry) => entry < 0 || Math.abs(entry) <= 1e-9)) return null;
    const gapSize = Math.abs(pattern.find((entry) => entry < 0) || 0);
    if (!(gapSize > 0)) return null;
    const hasDot = pattern.some((entry) => Math.abs(entry) <= 1e-9);
    const firstDash = pattern.find((entry) => entry > 0);
    const dashSize = hasDot
        ? Math.max(gapSize * 0.12, 0.001)
        : Math.max(Math.abs(firstDash || gapSize), 0.001);
    return { dashSize, gapSize };
}

export function normalizeCadUnit(value) {
    const key = String(value ?? '').trim().toLowerCase();
    return UNIT_ALIASES.get(key) || 'unknown';
}

export function getDxfInsunitsUnit(value) {
    const code = Number(value);
    return ({
        0: 'unknown', 1: 'inch', 2: 'foot', 3: 'mile', 4: 'millimeter',
        5: 'centimeter', 6: 'meter', 7: 'kilometer', 8: 'microinch',
        9: 'mil', 10: 'yard', 11: 'angstrom', 12: 'nanometer',
        13: 'micron', 14: 'decimeter', 15: 'decameter', 16: 'hectometer',
        17: 'gigameter', 18: 'astronomical-unit', 19: 'light-year', 20: 'parsec'
    })[code] || 'unknown';
}

export function stableCadHash(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createCadEntityId(documentKey, handle, index) {
    const normalizedHandle = String(handle || '').trim().toUpperCase();
    return `${stableCadHash(`${documentKey}|${normalizedHandle}|${index}`)}-${normalizedHandle || index}`;
}

function clonePoint(point) {
    return [Number(point?.[0]) || 0, Number(point?.[1]) || 0];
}

function clonePoints(points) {
    return (Array.isArray(points) ? points : []).map(clonePoint);
}

function scalePoint(point, scale) {
    return [point[0] * scale, point[1] * scale];
}

function scaleGeometry(geometry, scale) {
    if (!geometry || typeof geometry !== 'object') return {};
    const result = { ...geometry };
    ['start', 'end', 'center', 'point', 'majorAxis', 'direction', 'insertionPoint', 'alignmentPoint'].forEach((key) => {
        if (Array.isArray(result[key])) result[key] = scalePoint(clonePoint(result[key]), scale);
    });
    ['radius', 'majorRadius', 'minorRadius', 'elevation', 'height', 'textHeight', 'textWidth', 'referenceWidth', 'lineHeight'].forEach((key) => {
        if (result[key] !== undefined) result[key] = (Number(result[key]) || 0) * scale;
    });
    if (Array.isArray(result.anchorOffset)) result.anchorOffset = scalePoint(clonePoint(result.anchorOffset), scale);
    if (Array.isArray(result.points)) result.points = clonePoints(result.points).map((point) => scalePoint(point, scale));
    if (Array.isArray(result.vertices)) {
        result.vertices = result.vertices.map((vertex) => ({
            ...vertex,
            point: scalePoint(clonePoint(vertex.point), scale),
            bulge: Number(vertex.bulge) || 0
        }));
    }
    return result;
}

function normalizeLayerName(name) {
    const value = String(name ?? '').trim();
    return value || '0';
}

function colorForLayer(layer, index) {
    if (layer?.color) return String(layer.color);
    const palette = ['#38bdf8', '#fbbf24', '#f472b6', '#a78bfa', '#34d399', '#fb7185', '#c084fc'];
    return palette[index % palette.length];
}

function normalizeEntity(raw, index, documentKey, layerMap, unitScale) {
    const type = String(raw?.type || 'UNKNOWN').toUpperCase();
    const layerName = normalizeLayerName(raw?.layer || raw?.layerName);
    const layer = layerMap.get(layerName) || {
        id: `layer-${stableCadHash(`${documentKey}|${layerName}`)}`,
        name: layerName,
        color: colorForLayer(null, layerMap.size),
        visible: true,
        off: false,
        entityCount: 0
    };
    layer.entityCount += 1;
    layerMap.set(layerName, layer);
    const id = String(raw?.id || createCadEntityId(documentKey, raw?.handle, index));
    const geometry = scaleGeometry(raw?.geometry || {}, unitScale);
    const sourceRenderPoints = clonePoints(raw?.renderPoints || geometry.points || []);
    const renderPoints = sourceRenderPoints.map((point) => scalePoint(point, unitScale));
    const bounds = raw?.bounds || boundsFromPoints(sourceRenderPoints);
    const closed = Boolean(raw?.closed || geometry.closed);
    const rawLinetype = String(raw?.linetype || raw?.lineType || '').trim();
    const requestedLinetype = normalizeCadLineTypeName(rawLinetype || layer.linetype);
    const linetype = requestedLinetype === 'BYLAYER'
        ? normalizeCadLineTypeName(layer.linetype)
        : requestedLinetype;
    const useLayerPattern = !rawLinetype || requestedLinetype === 'BYLAYER';
    const linePattern = normalizeCadLinePattern(
        Array.isArray(raw?.linePattern) && raw.linePattern.length
            ? raw.linePattern
            : useLayerPattern ? layer.linePattern : []
    ).map((entry) => entry * unitScale);
    return {
        id,
        index,
        type,
        renderType: String(raw?.renderType || (type === 'POINT' ? 'point' : 'line')),
        handle: String(raw?.handle || `#${index + 1}`),
        layerId: layer.id,
        layerName,
        color: String(raw?.color || layer.color),
        linetype,
        linePattern,
        sourceSpace: String(raw?.sourceSpace || 'modelspace'),
        blockPath: Array.isArray(raw?.blockPath) ? raw.blockPath.map(String) : [],
        geometry,
        renderPoints,
        bounds: {
            min: scalePoint(clonePoint(bounds.min), unitScale),
            max: scalePoint(clonePoint(bounds.max), unitScale)
        },
        length: Number(raw?.length) > 0 ? Number(raw.length) * unitScale : approximateLength(renderPoints, closed),
        closed,
        selectable: raw?.selectable !== false,
        warningCodes: Array.isArray(raw?.warningCodes) ? [...raw.warningCodes] : []
    };
}

export function boundsForCadEntities(entities) {
    const points = (Array.isArray(entities) ? entities : []).flatMap((entity) => [
        entity?.bounds?.min,
        entity?.bounds?.max
    ]).filter(Boolean);
    return boundsFromPoints(points);
}

export function normalizeCad2dDocument(input = {}) {
    const source = input.source || {};
    const requestedUnit = normalizeCadUnit(input.unit || source.sourceUnit || source.unit);
    const unitScale = Number(input.unitScale) > 0
        ? Number(input.unitScale)
        : CAD_UNIT_SCALES_TO_MM[requestedUnit] || CAD_UNIT_SCALES_TO_MM.unknown;
    const documentKey = String(input.documentId || input.sourceKey || stableCadHash({
        name: source.fileName || source.name || 'cad-document',
        hash: source.sha256 || source.sourceHash || '',
        size: source.size || 0
    }));
    const layerMap = new Map();
    (Array.isArray(input.layers) ? input.layers : []).forEach((layer, index) => {
        const name = normalizeLayerName(typeof layer === 'string' ? layer : layer?.name);
        layerMap.set(name, {
            id: String(layer?.id || `layer-${stableCadHash(`${documentKey}|${name}`)}`),
            name,
            color: colorForLayer(layer, index),
            linetype: normalizeCadLineTypeName(layer?.linetype || layer?.lineType),
            linePattern: normalizeCadLinePattern(layer?.linePattern),
            visible: layer?.visible !== false,
            off: Boolean(layer?.off),
            entityCount: 0
        });
    });
    const entities = (Array.isArray(input.entities) ? input.entities : [])
        .map((entity, index) => normalizeEntity(entity, index, documentKey, layerMap, unitScale))
        .filter((entity) => entity.renderPoints.length > 0 || entity.geometry?.center);
    const layers = [...layerMap.values()].map((layer) => ({
        ...layer,
        visible: layer.visible && !layer.off
    }));
    const warnings = Array.isArray(input.warnings) ? input.warnings.map((warning) => (
        typeof warning === 'string' ? { code: 'CAD_ENTITY_SKIPPED', message: warning } : { ...warning }
    )) : [];
    if (requestedUnit === 'unknown') {
        warnings.push({ code: 'CAD_UNIT_UNKNOWN', message: 'CAD drawing unit is unknown; millimeter scale was assumed.' });
    }
    return {
        schemaVersion: CAD2D_SCHEMA_VERSION,
        documentId: documentKey,
        source: {
            fileName: String(source.fileName || source.name || ''),
            extension: String(source.extension || '').toLowerCase(),
            size: Math.max(0, Number(source.size) || 0),
            lastModified: Math.max(0, Number(source.lastModified) || 0),
            sha256: String(source.sha256 || source.sourceHash || ''),
            cadVersion: String(source.cadVersion || input.cadVersion || ''),
            sourceUnit: requestedUnit,
            targetUnit: 'millimeter',
            unitScale,
            parser: String(source.parser || input.parser || 'dxf-native'),
            parserVersion: String(source.parserVersion || input.parserVersion || '1.0.0')
        },
        drawing: {
            activeSpace: String(input.activeSpace || 'modelspace'),
            bounds: boundsForCadEntities(entities),
            layers,
            blocks: Array.isArray(input.blocks) ? input.blocks : []
        },
        entities,
        warnings,
        skippedCount: Math.max(0, Number(input.skippedCount) || 0)
    };
}

export function cadEntityDisplayData(entity) {
    if (!entity) return null;
    return {
        type: entity.type,
        handle: entity.handle,
        layer: entity.layerName,
        length: Number(entity.length) || 0,
        closed: Boolean(entity.closed),
        bounds: entity.bounds,
        geometry: entity.geometry
    };
}
