import {
    getDxfInsunitsUnit,
    normalizeCadLinePattern,
    normalizeCadLineTypeName,
    normalizeCadUnit,
    normalizeCad2dDocument
} from './cad2d-core.mjs?v=20260907-cad-style-1';
import {
    boundsFromPoints,
    sampleArc,
    sampleCircle,
    sampleEllipse,
    sampleLine,
    samplePolylineVertices
} from './cad2d-geometry.mjs';

const COLOR_INDEX = Object.freeze({
    1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
    5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0'
});

function parseNumber(value, fallback = 0) {
    const number = Number(String(value ?? '').trim());
    return Number.isFinite(number) ? number : fallback;
}

function pair(code, value) {
    return { code: Number(code), value: String(value ?? '').trim() };
}

function values(records, code) {
    return records.filter((record) => record.code === code).map((record) => record.value);
}

function firstValue(records, code, fallback = '') {
    return records.find((record) => record.code === code)?.value ?? fallback;
}

function firstNumber(records, code, fallback = 0) {
    return parseNumber(firstValue(records, code, fallback), fallback);
}

function pointFromRecords(records, xCode, yCode, startIndex = 0) {
    const xIndex = records.findIndex((record, index) => index >= startIndex && record.code === xCode);
    if (xIndex < 0) return null;
    const yIndex = records.findIndex((record, index) => index > xIndex && record.code === yCode);
    if (yIndex < 0) return null;
    return [parseNumber(records[xIndex].value), parseNumber(records[yIndex].value)];
}

function colorFromDxfIndex(value, fallback) {
    const index = Math.abs(Math.trunc(parseNumber(value, 0)));
    return COLOR_INDEX[index] || fallback;
}

function sectionRecords(pairs) {
    const sections = new Map();
    for (let index = 0; index < pairs.length; index += 1) {
        if (pairs[index].code !== 0 || pairs[index].value.toUpperCase() !== 'SECTION') continue;
        const name = String(pairs[index + 1]?.value || '').toUpperCase();
        const start = index + 2;
        let end = pairs.length;
        for (let cursor = start; cursor < pairs.length; cursor += 1) {
            if (pairs[cursor].code === 0 && pairs[cursor].value.toUpperCase() === 'ENDSEC') {
                end = cursor;
                index = cursor;
                break;
            }
        }
        sections.set(name, pairs.slice(start, end));
    }
    return sections;
}

function linetypeRecords(tablePairs) {
    const lineTypes = new Map();
    for (let index = 0; index < tablePairs.length; index += 1) {
        if (tablePairs[index].code !== 0 || tablePairs[index].value.toUpperCase() !== 'LTYPE') continue;
        const records = [];
        for (let cursor = index + 1; cursor < tablePairs.length; cursor += 1) {
            if (tablePairs[cursor].code === 0) {
                index = cursor - 1;
                break;
            }
            records.push(tablePairs[cursor]);
        }
        const name = normalizeCadLineTypeName(firstValue(records, 2, 'CONTINUOUS'));
        lineTypes.set(name, {
            name,
            pattern: normalizeCadLinePattern(values(records, 49))
        });
    }
    return lineTypes;
}

function layerRecords(tablePairs, lineTypes = new Map()) {
    const layers = [];
    for (let index = 0; index < tablePairs.length; index += 1) {
        if (tablePairs[index].code !== 0 || tablePairs[index].value.toUpperCase() !== 'LAYER') continue;
        const records = [];
        for (let cursor = index + 1; cursor < tablePairs.length; cursor += 1) {
            if (tablePairs[cursor].code === 0) {
                index = cursor - 1;
                break;
            }
            records.push(tablePairs[cursor]);
        }
        const name = firstValue(records, 2, '0');
        const colorIndex = firstNumber(records, 62, 7);
        const linetype = normalizeCadLineTypeName(firstValue(records, 6, 'CONTINUOUS'));
        const lineTypeDefinition = lineTypes.get(linetype);
        layers.push({
            name,
            color: colorFromDxfIndex(colorIndex, '#dbeafe'),
            linetype,
            linePattern: lineTypeDefinition?.pattern || [],
            off: colorIndex < 0
        });
    }
    return layers;
}

function entityRecords(entityPairs) {
    const entities = [];
    for (let index = 0; index < entityPairs.length; index += 1) {
        const marker = entityPairs[index];
        if (marker.code !== 0) continue;
        const type = marker.value.toUpperCase();
        if (type === 'ENDSEC' || type === 'SEQEND' || type === 'VERTEX') continue;
        const records = [];
        const vertices = [];
        let end = index + 1;
        for (; end < entityPairs.length; end += 1) {
            if (entityPairs[end].code !== 0) {
                records.push(entityPairs[end]);
                continue;
            }
            const nestedType = entityPairs[end].value.toUpperCase();
            if (type === 'POLYLINE' && nestedType === 'VERTEX') {
                const vertexRecords = [];
                end += 1;
                for (; end < entityPairs.length; end += 1) {
                    if (entityPairs[end].code === 0) break;
                    vertexRecords.push(entityPairs[end]);
                }
                const vertex = pointFromRecords(vertexRecords, 10, 20);
                if (vertex) vertices.push({ point: vertex, bulge: firstNumber(vertexRecords, 42, 0) });
                end -= 1;
                continue;
            }
            if (type === 'POLYLINE' && nestedType === 'SEQEND') {
                index = end;
            }
            break;
        }
        entities.push({ type, records, vertices });
        index = Math.max(index, end - 1);
    }
    return entities;
}

function blockDefinitions(blockPairs) {
    const blocks = new Map();
    const pairs = Array.isArray(blockPairs) ? blockPairs : [];
    for (let index = 0; index < pairs.length; index += 1) {
        if (pairs[index].code !== 0 || pairs[index].value.toUpperCase() !== 'BLOCK') continue;

        let bodyStart = index + 1;
        while (bodyStart < pairs.length && pairs[bodyStart].code !== 0) bodyStart += 1;
        const header = pairs.slice(index + 1, bodyStart);
        const name = firstValue(header, 2, '').trim();
        if (!name) continue;

        let end = bodyStart;
        while (end < pairs.length && !(pairs[end].code === 0 && pairs[end].value.toUpperCase() === 'ENDBLK')) {
            end += 1;
        }
        blocks.set(name, {
            name,
            basePoint: [firstNumber(header, 10, 0), firstNumber(header, 20, 0)],
            entities: entityRecords(pairs.slice(bodyStart, end))
        });
        index = end;
    }
    return blocks;
}

function identityAffine() {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function composeAffine(parent, local) {
    return {
        a: parent.a * local.a + parent.c * local.b,
        b: parent.b * local.a + parent.d * local.b,
        c: parent.a * local.c + parent.c * local.d,
        d: parent.b * local.c + parent.d * local.d,
        tx: parent.a * local.tx + parent.c * local.ty + parent.tx,
        ty: parent.b * local.tx + parent.d * local.ty + parent.ty
    };
}

function transformPoint(point, transform) {
    const x = parseNumber(point?.[0], 0);
    const y = parseNumber(point?.[1], 0);
    return [
        transform.a * x + transform.c * y + transform.tx,
        transform.b * x + transform.d * y + transform.ty
    ];
}

function transformVector(vector, transform) {
    const x = parseNumber(vector?.[0], 0);
    const y = parseNumber(vector?.[1], 0);
    return [
        transform.a * x + transform.c * y,
        transform.b * x + transform.d * y
    ];
}

function transformEntity(entity, transform, blockPath = []) {
    if (!entity) return null;
    const renderPoints = (entity.renderPoints || []).map((point) => transformPoint(point, transform));
    const geometry = { ...(entity.geometry || {}) };
    ['start', 'end', 'center'].forEach((key) => {
        if (Array.isArray(geometry[key])) geometry[key] = transformPoint(geometry[key], transform);
    });
    ['majorAxis', 'direction'].forEach((key) => {
        if (Array.isArray(geometry[key])) geometry[key] = transformVector(geometry[key], transform);
    });
    if (Array.isArray(geometry.points)) geometry.points = geometry.points.map((point) => transformPoint(point, transform));
    if (Array.isArray(geometry.vertices)) {
        geometry.vertices = geometry.vertices.map((vertex) => ({
            ...vertex,
            point: transformPoint(vertex.point, transform)
        }));
    }

    const scaleX = Math.hypot(transform.a, transform.b);
    const scaleY = Math.hypot(transform.c, transform.d);
    if (Number.isFinite(geometry.radius) && Math.abs(scaleX - scaleY) <= 1e-7) {
        geometry.radius = Math.abs(geometry.radius * scaleX);
    }
    if (Number.isFinite(geometry.elevation)) geometry.elevation = 0;

    return {
        ...entity,
        sourceSpace: 'block',
        blockPath: [...blockPath],
        geometry,
        renderPoints,
        bounds: boundsFromPoints(renderPoints)
    };
}

function insertTransform(record, block) {
    const rotation = firstNumber(record.records, 50, 0) * Math.PI / 180;
    const scaleX = firstNumber(record.records, 41, 1);
    const scaleY = firstNumber(record.records, 42, 1);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const transform = {
        a: cos * scaleX,
        b: sin * scaleX,
        c: -sin * scaleY,
        d: cos * scaleY,
        tx: firstNumber(record.records, 10, 0),
        ty: firstNumber(record.records, 20, 0)
    };
    const basePoint = block?.basePoint || [0, 0];
    transform.tx -= transform.a * basePoint[0] + transform.c * basePoint[1];
    transform.ty -= transform.b * basePoint[0] + transform.d * basePoint[1];
    return transform;
}

function baseEntity(record, index, layerMap, lineTypes) {
    const layer = firstValue(record.records, 8, '0');
    const layerData = layerMap.get(layer) || {
        color: '#dbeafe',
        linetype: 'CONTINUOUS',
        linePattern: [],
        off: false
    };
    const colorValue = firstValue(record.records, 62, '');
    const color = colorValue === '' ? layerData.color : colorFromDxfIndex(colorValue, layerData.color);
    const requestedLinetype = normalizeCadLineTypeName(firstValue(record.records, 6, 'BYLAYER'));
    const linetype = requestedLinetype === 'BYLAYER'
        ? normalizeCadLineTypeName(layerData.linetype)
        : requestedLinetype;
    const lineTypeDefinition = lineTypes.get(linetype);
    const linePattern = lineTypeDefinition?.pattern?.length
        ? lineTypeDefinition.pattern
        : requestedLinetype === 'BYLAYER' ? layerData.linePattern : [];
    return {
        type: record.type,
        handle: firstValue(record.records, 5, `#${index + 1}`),
        layer,
        color,
        linetype,
        linePattern,
        geometry: {},
        renderPoints: [],
        warningCodes: layerData.off ? ['CAD_LAYER_OFF'] : []
    };
}

function parseLwPolyline(base, record, curveSegments) {
    const vertices = [];
    let pending = null;
    record.records.forEach((item) => {
        if (item.code === 10) {
            pending = { point: [parseNumber(item.value), 0], bulge: 0 };
            vertices.push(pending);
        } else if (item.code === 20 && pending) pending.point[1] = parseNumber(item.value);
        else if (item.code === 42 && pending) pending.bulge = parseNumber(item.value);
    });
    const closed = (firstNumber(record.records, 70, 0) & 1) === 1;
    const points = samplePolylineVertices(vertices, closed, Math.max(8, Math.ceil(curveSegments / 4)));
    return {
        ...base,
        closed,
        geometry: { kind: 'polyline', vertices, points, closed, elevation: firstNumber(record.records, 38, 0) },
        renderPoints: points,
        bounds: boundsFromPoints(points)
    };
}

function parsePolyline(base, record, curveSegments) {
    const vertices = Array.isArray(record.vertices) ? record.vertices : [];
    const closed = (firstNumber(record.records, 70, 0) & 1) === 1;
    const points = samplePolylineVertices(vertices, closed, Math.max(8, Math.ceil(curveSegments / 4)));
    return {
        ...base,
        closed,
        geometry: { kind: 'polyline', vertices, points, closed, elevation: firstNumber(record.records, 30, 0) },
        renderPoints: points,
        bounds: boundsFromPoints(points)
    };
}

function parseEntity(record, index, layerMap, lineTypes, curveSegments) {
    const base = baseEntity(record, index, layerMap, lineTypes);
    const x = (code) => firstNumber(record.records, code, 0);
    const y = (code) => firstNumber(record.records, code, 0);
    switch (record.type) {
        case 'LINE': {
            const start = [x(10), y(20)];
            const end = [firstNumber(record.records, 11, start[0]), firstNumber(record.records, 21, start[1])];
            return { ...base, geometry: { kind: 'line', start, end }, renderPoints: sampleLine(start, end), bounds: boundsFromPoints([start, end]) };
        }
        case 'LWPOLYLINE': return parseLwPolyline(base, record, curveSegments);
        case 'POLYLINE': return parsePolyline(base, record, curveSegments);
        case 'ARC': {
            const center = [x(10), y(20)];
            const radius = Math.abs(x(40));
            const startAngle = x(50) * Math.PI / 180;
            const endAngle = x(51) * Math.PI / 180;
            const points = sampleArc(center, radius, startAngle, endAngle, curveSegments);
            return { ...base, geometry: { kind: 'arc', center, radius, startAngle, endAngle }, renderPoints: points, bounds: boundsFromPoints(points) };
        }
        case 'CIRCLE': {
            const center = [x(10), y(20)];
            const radius = Math.abs(x(40));
            const points = sampleCircle(center, radius, curveSegments);
            return { ...base, closed: true, geometry: { kind: 'circle', center, radius, points, closed: true }, renderPoints: points, bounds: boundsFromPoints(points) };
        }
        case 'ELLIPSE': {
            const center = [x(10), y(20)];
            const majorAxis = [x(11), y(21)];
            const ratio = Math.abs(x(40)) || 1;
            const startParam = x(41);
            const endParam = x(42) || Math.PI * 2;
            const closed = Math.abs(endParam - startParam) >= Math.PI * 2 - 1e-5;
            const points = sampleEllipse(center, majorAxis, ratio, startParam, endParam, curveSegments);
            return { ...base, closed, geometry: { kind: 'ellipse', center, majorAxis, ratio, startParam, endParam, closed }, renderPoints: points, bounds: boundsFromPoints(points) };
        }
        case 'POINT': {
            const point = [x(10), y(20)];
            return { ...base, renderType: 'point', geometry: { kind: 'point', point }, renderPoints: [point], bounds: boundsFromPoints([point]) };
        }
        case 'RAY':
        case 'XLINE': {
            const origin = [x(10), y(20)];
            const direction = [firstNumber(record.records, 11, 1), firstNumber(record.records, 21, 0)];
            const length = 10000;
            const magnitude = Math.hypot(direction[0], direction[1]) || 1;
            const end = [origin[0] + direction[0] / magnitude * length, origin[1] + direction[1] / magnitude * length];
            return { ...base, geometry: { kind: record.type.toLowerCase(), origin, direction }, renderPoints: sampleLine(origin, end), bounds: boundsFromPoints([origin, end]), warningCodes: [...base.warningCodes, 'CAD_INFINITE_LINE_CLIPPED'] };
        }
        default:
            return null;
    }
}

function detectUnit(headerPairs) {
    for (let index = 0; index < headerPairs.length - 1; index += 1) {
        if (headerPairs[index].code === 9 && headerPairs[index].value.toUpperCase() === '$INSUNITS') {
            for (let cursor = index + 1; cursor < Math.min(headerPairs.length, index + 8); cursor += 1) {
                if (headerPairs[cursor].code === 70) return getDxfInsunitsUnit(parseNumber(headerPairs[cursor].value));
            }
        }
    }
    return 'unknown';
}

export function isBinaryDxfBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
    const signature = new TextDecoder().decode(bytes.slice(0, 22));
    return signature.startsWith('AutoCAD Binary DXF');
}

export function parseDxfText(text, options = {}) {
    const sourceText = String(text ?? '').replace(/^\uFEFF/, '');
    if (!sourceText.trim()) {
        const error = new Error('The DXF drawing is empty.');
        error.code = 'CAD_EMPTY_DRAWING';
        throw error;
    }
    const rawLines = sourceText.replace(/\r\n?/g, '\n').split('\n');
    const pairs = [];
    const warnings = [];
    for (let index = 0; index + 1 < rawLines.length; index += 2) {
        const code = Number(rawLines[index].trim());
        if (!Number.isInteger(code)) {
            warnings.push({ code: 'CAD_DXF_PARSE_FAILED', message: `Invalid group code at line ${index + 1}.` });
            continue;
        }
        pairs.push(pair(code, rawLines[index + 1]));
    }
    if (rawLines.length % 2 === 1 && rawLines.at(-1).trim()) {
        warnings.push({ code: 'CAD_DXF_PARSE_FAILED', message: 'The final DXF group was incomplete and was ignored.' });
    }
    if (pairs.length < 4) {
        const error = new Error('The DXF drawing has too few group records.');
        error.code = 'CAD_DXF_PARSE_FAILED';
        throw error;
    }
    const sections = sectionRecords(pairs);
    const tablePairs = sections.get('TABLES') || [];
    const lineTypes = linetypeRecords(tablePairs);
    const layerMap = new Map(layerRecords(tablePairs, lineTypes).map((layer) => [layer.name, layer]));
    const records = entityRecords(sections.get('ENTITIES') || []);
    const blocks = blockDefinitions(sections.get('BLOCKS') || []);
    const curveSegments = Math.min(Math.max(Number(options.curveSegments) || 64, 16), 512);
    const maxExpandedEntities = Math.min(
        Math.max(Number(options.maxExpandedEntities) || 100000,
            1000),
        500000
    );
    let skippedCount = 0;
    const entities = [];
    const skippedTypes = new Map();
    const addSkipped = (type, message = `Unsupported DXF entity: ${type}.`) => {
        skippedCount += 1;
        const normalizedType = String(type || 'UNKNOWN').toUpperCase();
        const existing = skippedTypes.get(normalizedType);
        if (existing) {
            existing.count += 1;
            return;
        }
        const warning = { code: 'CAD_ENTITY_SKIPPED', message, type: normalizedType, count: 1 };
        skippedTypes.set(normalizedType, warning);
        warnings.push(warning);
    };
    let expansionLimitWarningAdded = false;
    const appendEntity = (entity) => {
        if (!entity) return;
        if (entities.length >= maxExpandedEntities) {
            if (!expansionLimitWarningAdded) {
                expansionLimitWarningAdded = true;
                warnings.push({
                    code: 'CAD_ENTITY_LIMIT_REACHED',
                    message: `DXF entity expansion was limited to ${maxExpandedEntities} visible entities.`
                });
            }
            addSkipped(entity.type, `DXF entity expansion limit reached; skipped ${entity.type}.`);
            return;
        }
        entities.push(entity);
    };
    const expandBlock = (blockName, parentTransform, blockPath, stack) => {
        const block = blocks.get(blockName);
        if (!block) {
            addSkipped('INSERT', `DXF block definition not found: ${blockName}.`);
            return;
        }
        if (stack.includes(blockName)) {
            warnings.push({
                code: 'CAD_BLOCK_CYCLE',
                message: `Cyclic DXF block reference was ignored: ${[...stack, blockName].join(' -> ')}.`,
                type: 'INSERT'
            });
            skippedCount += 1;
            return;
        }
        const nextStack = [...stack, blockName];
        block.entities.forEach((record, recordIndex) => {
            if (record.type === 'INSERT') {
                const nestedName = firstValue(record.records, 2, '').trim();
                const nestedBlock = blocks.get(nestedName);
                if (!nestedBlock) {
                    addSkipped('INSERT', `DXF block definition not found: ${nestedName}.`);
                    return;
                }
                expandBlock(
                    nestedName,
                    composeAffine(parentTransform, insertTransform(record, nestedBlock)),
                    [...blockPath, nestedName],
                    nextStack
                );
                return;
            }
            const parsed = parseEntity(record, recordIndex, layerMap, lineTypes, curveSegments);
            if (parsed) appendEntity(transformEntity(parsed, parentTransform, blockPath));
            else addSkipped(record.type);
        });
    };

    records.forEach((record, index) => {
        if (record.type === 'INSERT') {
            const blockName = firstValue(record.records, 2, '').trim();
            const block = blocks.get(blockName);
            if (!block) {
                addSkipped('INSERT', `DXF block definition not found: ${blockName}.`);
                return;
            }
            expandBlock(blockName, insertTransform(record, block), [blockName], []);
            return;
        }
        const parsed = parseEntity(record, index, layerMap, lineTypes, curveSegments);
        if (parsed) appendEntity(parsed);
        else addSkipped(record.type);
    });
    if (entities.length === 0) {
        const error = new Error('The DXF drawing has no supported visible entities.');
        error.code = 'CAD_EMPTY_DRAWING';
        throw error;
    }
    const detectedUnit = detectUnit(sections.get('HEADER') || []);
    const requestedUnit = options.unitOverride && options.unitOverride !== 'auto'
        ? normalizeCadUnit(options.unitOverride)
        : detectedUnit;
    return normalizeCad2dDocument({
        source: {
            fileName: options.fileName || '',
            extension: 'dxf',
            size: options.size || sourceText.length,
            lastModified: options.lastModified || 0,
            sha256: options.sha256 || '',
            sourceUnit: requestedUnit,
            cadVersion: firstValue(sections.get('HEADER') || [], 1, '')
        },
        sourceKey: options.sourceKey || options.sha256 || `${options.fileName || 'dxf'}|${sourceText.length}`,
        unit: requestedUnit,
        layers: [...layerMap.entries()].map(([name, layer]) => ({ name, ...layer })),
        blocks: [...blocks.values()].map((block) => ({
            name: block.name,
            basePoint: [...block.basePoint],
            entityCount: block.entities.length
        })),
        entities,
        warnings,
        skippedCount,
        parser: 'dxf-native-worker',
        parserVersion: '1.1.0'
    });
}

export async function parseDxfBuffer(buffer, options = {}) {
    if (isBinaryDxfBuffer(buffer)) {
        const error = new Error('Binary DXF is not supported in the browser parser. Save the file as ASCII DXF.');
        error.code = 'CAD_DXF_BINARY_UNSUPPORTED';
        throw error;
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
    return parseDxfText(text, options);
}
