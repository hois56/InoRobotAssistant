const TAU = Math.PI * 2;

export const CAD_DEFAULT_CURVE_SEGMENTS = 64;
export const CAD_MAX_CURVE_SEGMENTS = 512;

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

function asPoint(value) {
    return [Number(value?.[0]) || 0, Number(value?.[1]) || 0];
}

export function sampleLine(start, end) {
    return [asPoint(start), asPoint(end)];
}

export function sampleArc(center, radius, startAngle, endAngle, segments = CAD_DEFAULT_CURVE_SEGMENTS) {
    const origin = asPoint(center);
    const safeRadius = Math.max(Math.abs(Number(radius) || 0), 0.000001);
    let sweep = Number(endAngle) - Number(startAngle);
    if (!Number.isFinite(sweep)) sweep = TAU;
    if (sweep <= 0) sweep += TAU;
    const count = clamp(Math.ceil(Math.abs(sweep) / TAU * segments), 8, CAD_MAX_CURVE_SEGMENTS);
    return Array.from({ length: count + 1 }, (_, index) => {
        const angle = Number(startAngle) + sweep * index / count;
        return [origin[0] + Math.cos(angle) * safeRadius, origin[1] + Math.sin(angle) * safeRadius];
    });
}

export function sampleCircle(center, radius, segments = CAD_DEFAULT_CURVE_SEGMENTS) {
    return sampleArc(center, radius, 0, TAU, segments);
}

export function sampleEllipse(center, majorAxis, ratio = 1, startParam = 0, endParam = TAU, segments = CAD_DEFAULT_CURVE_SEGMENTS) {
    const origin = asPoint(center);
    const major = asPoint(majorAxis);
    const minor = [-major[1] * (Number(ratio) || 1), major[0] * (Number(ratio) || 1)];
    let sweep = Number(endParam) - Number(startParam);
    if (!Number.isFinite(sweep)) sweep = TAU;
    if (sweep <= 0) sweep += TAU;
    const count = clamp(Math.ceil(Math.abs(sweep) / TAU * segments), 8, CAD_MAX_CURVE_SEGMENTS);
    return Array.from({ length: count + 1 }, (_, index) => {
        const parameter = Number(startParam) + sweep * index / count;
        return [
            origin[0] + major[0] * Math.cos(parameter) + minor[0] * Math.sin(parameter),
            origin[1] + major[1] * Math.cos(parameter) + minor[1] * Math.sin(parameter)
        ];
    });
}

export function sampleBulgeArc(start, end, bulge, segments = 16) {
    const a = asPoint(start);
    const b = asPoint(end);
    const value = Number(bulge) || 0;
    if (Math.abs(value) < 1e-9) return sampleLine(a, b);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const chord = Math.hypot(dx, dy);
    if (chord < 1e-9) return [a];
    const theta = 4 * Math.atan(value);
    const radius = chord * (1 + value * value) / (4 * Math.abs(value));
    const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const centerOffset = chord * (1 - value * value) / (4 * value);
    const center = [
        midpoint[0] - dy / chord * centerOffset,
        midpoint[1] + dx / chord * centerOffset
    ];
    const startAngle = Math.atan2(a[1] - center[1], a[0] - center[0]);
    const count = clamp(Math.ceil(Math.abs(theta) / TAU * segments), 4, CAD_MAX_CURVE_SEGMENTS);
    return Array.from({ length: count + 1 }, (_, index) => {
        const angle = startAngle + theta * index / count;
        return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
    });
}

export function samplePolylineVertices(vertices, closed = false, segments = 16) {
    const source = Array.isArray(vertices) ? vertices : [];
    if (source.length === 0) return [];
    const points = [];
    const edgeCount = closed ? source.length : source.length - 1;
    for (let index = 0; index < edgeCount; index += 1) {
        const current = source[index];
        const next = source[(index + 1) % source.length];
        const edge = sampleBulgeArc(current?.point || current, next?.point || next, current?.bulge || 0, segments);
        if (index > 0 && edge.length) edge.shift();
        points.push(...edge);
    }
    if (!closed && points.length === 0) points.push(asPoint(source[0]?.point || source[0]));
    if (closed && points.length > 1) {
        const first = points[0];
        const last = points.at(-1);
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-7) points.push([...first]);
    }
    return points;
}

export function approximateLength(points, closed = false) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
        length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
    }
    if (closed && points.length > 2) {
        const first = points[0];
        const last = points.at(-1);
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-7) {
            length += Math.hypot(first[0] - last[0], first[1] - last[1]);
        }
    }
    return length;
}

export function boundsFromPoints(points) {
    const valid = (Array.isArray(points) ? points : []).filter((point) => (
        Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
    ));
    if (valid.length === 0) return { min: [0, 0], max: [0, 0] };
    const bounds = valid.reduce((result, point) => ({
        minX: Math.min(result.minX, Number(point[0])),
        minY: Math.min(result.minY, Number(point[1])),
        maxX: Math.max(result.maxX, Number(point[0])),
        maxY: Math.max(result.maxY, Number(point[1]))
    }), {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
    });
    return {
        min: [bounds.minX, bounds.minY],
        max: [bounds.maxX, bounds.maxY]
    };
}

export function pointToSegmentDistance(point, start, end) {
    const px = Number(point?.[0]) || 0;
    const py = Number(point?.[1]) || 0;
    const ax = Number(start?.[0]) || 0;
    const ay = Number(start?.[1]) || 0;
    const bx = Number(end?.[0]) || 0;
    const by = Number(end?.[1]) || 0;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const parameter = lengthSquared > 1e-12
        ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1)
        : 0;
    return Math.hypot(px - (ax + parameter * dx), py - (ay + parameter * dy));
}

export function polygonSignedArea(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    let area = 0;
    const count = points.length > 1
        && Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1e-7
        ? points.length - 1
        : points.length;
    for (let index = 0; index < count; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % count];
        area += current[0] * next[1] - next[0] * current[1];
    }
    return area / 2;
}

function cleanPolygonPoints(points) {
    const cleaned = [];
    (Array.isArray(points) ? points : []).forEach((point) => {
        const next = asPoint(point);
        const previous = cleaned.at(-1);
        if (!previous || Math.hypot(next[0] - previous[0], next[1] - previous[1]) > 1e-7) {
            cleaned.push(next);
        }
    });
    if (cleaned.length > 1) {
        const first = cleaned[0];
        const last = cleaned.at(-1);
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-7) cleaned.pop();
    }
    return cleaned;
}

function cadEntityPathPoints(entity) {
    if (!entity || entity.selectable === false) return [];
    if (entity.type === 'CIRCLE' && (!Array.isArray(entity.renderPoints) || entity.renderPoints.length < 3)) {
        return sampleCircle(entity.geometry?.center, entity.geometry?.radius);
    }
    return Array.isArray(entity.renderPoints) ? entity.renderPoints : [];
}

function makeCadLoop(points, entityIds, layerId) {
    const cleaned = cleanPolygonPoints(points);
    if (cleaned.length < 3) return null;
    const signedArea = polygonSignedArea(cleaned);
    if (Math.abs(signedArea) <= 1e-7) return null;
    return {
        id: `cad-loop-${entityIds.join('-')}`,
        entityIds: [...entityIds],
        layerId: layerId || '',
        points: cleaned,
        bounds: boundsFromPoints(cleaned),
        signedArea,
        area: Math.abs(signedArea)
    };
}

function pointsMatch(left, right, epsilon = 1e-5) {
    return Boolean(left && right)
        && Math.hypot(Number(left[0]) - Number(right[0]), Number(left[1]) - Number(right[1])) <= epsilon;
}

function reverseCadPath(points) {
    return [...points].reverse();
}

function buildStitchedCadLoops(entities) {
    const edges = (Array.isArray(entities) ? entities : [])
        .filter((entity) => entity?.selectable !== false
            && !entity.closed
            && ['LINE', 'ARC', 'LWPOLYLINE', 'POLYLINE'].includes(entity.type))
        .map((entity) => ({
            entity,
            points: cleanPolygonPoints(cadEntityPathPoints(entity))
        }))
        .filter((edge) => edge.points.length >= 2);
    const unused = new Set(edges);
    const loops = [];
    while (unused.size) {
        const seed = unused.values().next().value;
        unused.delete(seed);
        const points = [...seed.points];
        const entityIds = [seed.entity.id];
        let layerId = seed.entity.layerId;
        const startPoint = points[0];
        let closed = false;
        for (let guard = 0; guard < edges.length; guard += 1) {
            const endPoint = points.at(-1);
            if (points.length >= 3 && pointsMatch(endPoint, startPoint)) {
                closed = true;
                break;
            }
            const candidate = [...unused]
                .filter((edge) => pointsMatch(edge.points[0], endPoint) || pointsMatch(edge.points.at(-1), endPoint))
                .sort((left, right) => {
                    const leftDistance = Math.hypot(left.points[0][0] - endPoint[0], left.points[0][1] - endPoint[1]);
                    const rightDistance = Math.hypot(right.points[0][0] - endPoint[0], right.points[0][1] - endPoint[1]);
                    return leftDistance - rightDistance;
                })[0];
            if (!candidate) break;
            unused.delete(candidate);
            const oriented = pointsMatch(candidate.points[0], endPoint)
                ? candidate.points
                : reverseCadPath(candidate.points);
            points.push(...oriented.slice(1));
            entityIds.push(candidate.entity.id);
            if (!layerId) layerId = candidate.entity.layerId;
        }
        if (closed) {
            const loop = makeCadLoop(points, entityIds, layerId);
            if (loop) loops.push(loop);
        } else {
            // Put an unfinished chain back into the pool so another seed can
            // still use its remaining edges when a branch was encountered.
            entityIds.slice(1).forEach((entityId) => {
                const edge = edges.find((candidate) => candidate.entity.id === entityId);
                if (edge) unused.add(edge);
            });
        }
    }
    return loops;
}

function pointOnPolygonBoundary(point, start, end, epsilon = 1e-6) {
    const px = Number(point?.[0]) || 0;
    const py = Number(point?.[1]) || 0;
    const ax = Number(start?.[0]) || 0;
    const ay = Number(start?.[1]) || 0;
    const bx = Number(end?.[0]) || 0;
    const by = Number(end?.[1]) || 0;
    const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
    if (Math.abs(cross) > epsilon) return false;
    return px >= Math.min(ax, bx) - epsilon && px <= Math.max(ax, bx) + epsilon
        && py >= Math.min(ay, by) - epsilon && py <= Math.max(ay, by) + epsilon;
}

export function pointInPolygon(point, polygon, includeBoundary = true) {
    const points = cleanPolygonPoints(polygon);
    if (points.length < 3) return false;
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
        const current = points[index];
        const prior = points[previous];
        if (includeBoundary && pointOnPolygonBoundary(point, prior, current)) return true;
        const intersects = ((current[1] > point[1]) !== (prior[1] > point[1]))
            && point[0] < (prior[0] - current[0]) * (point[1] - current[1])
                / ((prior[1] - current[1]) || Number.EPSILON) + current[0];
        if (intersects) inside = !inside;
    }
    return inside;
}

function loopSamplePoint(loop) {
    const points = loop?.points || [];
    if (!points.length) return [0, 0];
    const average = points.reduce((result, point) => [result[0] + point[0], result[1] + point[1]], [0, 0])
        .map((value) => value / points.length);
    if (pointInPolygon(average, points, false)) return average;
    return points[0];
}

export function buildCadProfileRegions(entities = []) {
    const sourceEntities = Array.isArray(entities) ? entities : [];
    const loops = sourceEntities
        .filter((entity) => entity?.selectable !== false && (entity.closed || entity.type === 'CIRCLE'))
        .map((entity) => makeCadLoop(
            cadEntityPathPoints(entity),
            [entity.id],
            entity.layerId
        ))
        .filter(Boolean);
    // A large layout can contain tens of thousands of independent LINE
    // entities. Trying every open edge against every other edge here makes
    // profile discovery quadratic and can freeze the viewer. Closed CAD
    // entities remain selectable in that case; stitching is reserved for
    // normal-sized sketches where it is useful for creating a face.
    if (sourceEntities.length <= 20000) loops.push(...buildStitchedCadLoops(sourceEntities));
    if (!loops.length) return [];

    const parentGridSize = 128;
    const allLoopBounds = boundsFromPoints(loops.flatMap((loop) => [loop.bounds.min, loop.bounds.max]));
    const spanX = Math.max(allLoopBounds.max[0] - allLoopBounds.min[0], 1e-9);
    const spanY = Math.max(allLoopBounds.max[1] - allLoopBounds.min[1], 1e-9);
    const grid = new Map();
    const largeLoops = [];
    const cellKey = (x, y) => `${x}:${y}`;
    const toCellX = (value) => Math.min(parentGridSize - 1, Math.max(0,
        Math.floor((value - allLoopBounds.min[0]) / spanX * parentGridSize)));
    const toCellY = (value) => Math.min(parentGridSize - 1, Math.max(0,
        Math.floor((value - allLoopBounds.min[1]) / spanY * parentGridSize)));
    loops.forEach((loop, loopIndex) => {
        const minX = toCellX(loop.bounds.min[0]);
        const maxX = toCellX(loop.bounds.max[0]);
        const minY = toCellY(loop.bounds.min[1]);
        const maxY = toCellY(loop.bounds.max[1]);
        const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
        if (cellCount > 4096) {
            largeLoops.push(loopIndex);
            return;
        }
        for (let x = minX; x <= maxX; x += 1) {
            for (let y = minY; y <= maxY; y += 1) {
                const key = cellKey(x, y);
                const candidates = grid.get(key) || [];
                candidates.push(loopIndex);
                grid.set(key, candidates);
            }
        }
    });
    const parents = loops.map((loop, loopIndex) => {
        const sample = loopSamplePoint(loop);
        const candidates = new Set([
            ...(grid.get(cellKey(toCellX(sample[0]), toCellY(sample[1]))) || []),
            ...largeLoops
        ]);
        return [...candidates]
            .filter((candidateIndex) => {
                const candidate = loops[candidateIndex];
                return candidateIndex !== loopIndex
                    && candidate.area > loop.area + 1e-7
                    && sample[0] >= candidate.bounds.min[0] - 1e-7
                    && sample[0] <= candidate.bounds.max[0] + 1e-7
                    && sample[1] >= candidate.bounds.min[1] - 1e-7
                    && sample[1] <= candidate.bounds.max[1] + 1e-7
                    && pointInPolygon(sample, candidate.points, false);
            })
            .sort((left, right) => loops[left].area - loops[right].area)[0] ?? -1;
    });
    const depths = loops.map((_, index) => {
        let depth = 0;
        let parent = parents[index];
        const visited = new Set();
        while (parent >= 0 && !visited.has(parent)) {
            visited.add(parent);
            depth += 1;
            parent = parents[parent];
        }
        return depth;
    });

    return loops
        .map((outer, index) => ({ outer, index }))
        .filter(({ index }) => depths[index] % 2 === 0)
        .map(({ outer, index }) => {
            const holes = loops.filter((_, candidateIndex) => parents[candidateIndex] === index && depths[candidateIndex] === depths[index] + 1);
            const outerEntityIds = outer.entityIds;
            return {
                id: `cad-region-${outer.id}`,
                outerEntityId: outerEntityIds[0],
                outerEntityIds: [...outerEntityIds],
                holeEntityIds: holes.flatMap((hole) => hole.entityIds),
                entityIds: [...outerEntityIds],
                layerId: outer.layerId,
                outer,
                holes,
                area: Math.max(0, outer.area - holes.reduce((sum, hole) => sum + hole.area, 0))
            };
        })
        .filter((region) => region.area > 1e-7);
}
