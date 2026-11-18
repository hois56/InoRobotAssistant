import { engine, numbers } from './wasm/engine.mjs';

const TAU = Math.PI * 2;
export const CAD_DEFAULT_CURVE_SEGMENTS = 64;
export const CAD_MAX_CURVE_SEGMENTS = 512;

function asPoint(point) {
    return [Number(point?.[0]) || 0, Number(point?.[1]) || 0];
}

function takePoints(data, count, start = 0) {
    return Array.from({ length: count }, (_, i) => [data[start + 2*i], data[start + 2*i + 1]]);
}

function readCurve(count) {
    return takePoints(numbers(2 * count), count);
}

export function sampleLine(start, end) {
    return [asPoint(start), asPoint(end)];
}

export function sampleArc(center, radius, startAngle, endAngle, segments = CAD_DEFAULT_CURVE_SEGMENTS) {
    const [x, y] = asPoint(center);
    const r = Math.max(Math.abs(Number(radius) || 0), 0.000001);
    return readCurve(engine.cad_arc(x, y, r, 0, 1, startAngle, endAngle, segments, false));
}

export function sampleCircle(center, radius, segments = CAD_DEFAULT_CURVE_SEGMENTS) {
    return sampleArc(center, radius, 0, TAU, segments);
}

export function sampleEllipse(center, majorAxis, ratio = 1, startParam = 0, endParam = TAU, segments = CAD_DEFAULT_CURVE_SEGMENTS) {
    return readCurve(engine.cad_arc(...asPoint(center), ...asPoint(majorAxis), Number(ratio) || 1, startParam, endParam, segments, true));
}

export function sampleBulgeArc(start, end, bulge, segments = 16) {
    return readCurve(engine.cad_bulge(...asPoint(start), ...asPoint(end), Number(bulge) || 0, segments));
}

export function samplePolylineVertices(vertices, closed = false, segments = 16) {
    if (!Array.isArray(vertices) || !vertices.length) return [];
    const data = numbers(3 * vertices.length);
    vertices.forEach((vertex, i) => {
        data.set(asPoint(vertex?.point || vertex), 3*i);
        data[3*i+2] = Number(vertex?.bulge) || 0;
    });
    return readCurve(engine.cad_polyline(vertices.length, Boolean(closed), segments));
}

function writePoints(points, clean = false) {
    const data = numbers(Math.max(4, 2 * points.length));
    points.forEach((point, i) => {
        data[2*i] = clean ? Number(point?.[0]) || 0 : Number(point?.[0]);
        data[2*i+1] = clean ? Number(point?.[1]) || 0 : Number(point?.[1]);
    });
}

export function approximateLength(points, closed = false) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    writePoints(points);
    return engine.cad_length(points.length, Boolean(closed));
}

export function boundsFromPoints(points) {
    const valid = Array.isArray(points) ? points.filter(Array.isArray) : [];
    writePoints(valid);
    engine.cad_bounds(valid.length);
    const [x, y, right, top] = numbers(4);
    return { min: [x, y], max: [right, top] };
}

export function pointToSegmentDistance(point, start, end) {
    return engine.cad_segment_distance(...asPoint(point), ...asPoint(start), ...asPoint(end));
}

export function polygonSignedArea(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    writePoints(points);
    return engine.cad_area(points.length);
}

export function pointInPolygon(point, polygon, includeBoundary = true) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    writePoints(polygon, true);
    return Boolean(engine.cad_contains(polygon.length, ...asPoint(point), Boolean(includeBoundary)));
}

const openTypes = new Set(['LINE', 'ARC', 'LWPOLYLINE', 'POLYLINE']);

export function buildCadProfileRegions(entities = []) {
    if (!Array.isArray(entities) || !entities.length) return [];
    const input = [];
    for (const [index, entity] of entities.entries()) {
        if (!entity || entity.selectable === false) continue;
        const closed = entity.closed || entity.type === 'CIRCLE';
        if (!closed && (entities.length > 20000 || !openTypes.has(entity.type))) continue;
        let points = Array.isArray(entity.renderPoints) ? entity.renderPoints : [];
        if (entity.type === 'CIRCLE' && points.length < 3) {
            points = sampleCircle(entity.geometry?.center, entity.geometry?.radius);
        }
        input.push(index, Number(Boolean(closed)), points.length);
        for (const point of points) input.push(...asPoint(point));
    }
    numbers(input.length).set(input);
    const data = numbers(engine.cad_profiles());
    const loops = [], parents = [], children = [];
    let cursor = 0;
    while (cursor < data.length) {
        parents.push(data[cursor++]);
        const signedArea = data[cursor++], idCount = data[cursor++], pointCount = data[cursor++];
        const bounds = { min: [data[cursor], data[cursor+1]], max: [data[cursor+2], data[cursor+3]] };
        cursor += 4;
        const sources = Array.from(data.subarray(cursor, cursor + idCount), i => entities[i]);
        cursor += idCount;
        const entityIds = sources.map(e => e.id);
        const points = takePoints(data, pointCount, cursor);
        cursor += pointCount * 2;
        loops.push({ id: 'cad-loop-' + entityIds.join('-'), entityIds, layerId: sources.find(e => e.layerId)?.layerId || '',
            points, bounds, signedArea, area: Math.abs(signedArea) });
        children.push([]);
    }
    parents.forEach((parent, i) => { if (parent >= 0) children[parent].push(loops[i]); });
    const regions = [];
    for (const [index, outer] of loops.entries()) {
        let depth = 0;
        for (let i = parents[index]; i >= 0; i = parents[i]) depth++;
        if (depth % 2) continue;
        const holes = children[index];
        const area = Math.max(0, outer.area - holes.reduce((total, hole) => total + hole.area, 0));
        if (area > 1e-7) {
            regions.push({ id: 'cad-region-' + outer.id, outerEntityId: outer.entityIds[0], outerEntityIds: [...outer.entityIds],
                holeEntityIds: holes.flatMap(hole => hole.entityIds), entityIds: [...outer.entityIds],
                layerId: outer.layerId, outer, holes, area });
        }
    }
    return regions;
}
