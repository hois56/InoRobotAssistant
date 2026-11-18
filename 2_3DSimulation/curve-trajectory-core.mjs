// Geometry only. Units are millimetres; source curves are already in world space.
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const mix = (a, b, t) => t <= 1e-12 ? a.slice() : t >= 1 - 1e-12 ? b.slice() : a.map((v, i) => v + (b[i] - v) * t);
const fail = message => { throw new Error(message); };

export function curveLength(points) {
    return points.reduce((sum, p, i) => sum + (i ? distance(points[i - 1], p) : 0), 0);
}

function cleanCurve(curve) {
    const points = [];
    for (const p of curve.points || []) {
        if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) fail('곡선 좌표가 올바르지 않습니다.');
        if (!points.length || distance(points.at(-1), p) > 1e-7) points.push(p.slice());
    }
    if (points.length < 2) fail('길이가 있는 모서리 또는 곡선을 선택하세요.');
    if (curve.closed && distance(points[0], points.at(-1)) > 1e-7) points.push(points[0].slice());
    return points;
}

function pointSegmentDistance(p, a, b) {
    const length2 = distance(a, b) ** 2;
    const t = length2 ? Math.max(0, Math.min(1, p.reduce((sum, v, i) => sum + (v - a[i]) * (b[i] - a[i]), 0) / length2)) : 0;
    return distance(p, mix(a, b, t));
}

// Iterative Douglas-Peucker: tolerance bounds deviation from the imported polyline.
function simplify(points, tolerance) {
    const keep = new Set([0, points.length - 1]);
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        let maximum = tolerance, index = -1;
        for (let i = a + 1; i < b; i++) {
            const d = pointSegmentDistance(points[i], points[a], points[b]);
            if (d > maximum) { maximum = d; index = i; }
        }
        if (index >= 0) { keep.add(index); stack.push([a, index], [index, b]); }
    }
    return [...keep].sort((a, b) => a - b).map(i => points[i]);
}

export function generateCurveTrajectory(curves, {
    step = 10, tolerance = 0.1, mode = 'uniform', joinTolerance = 0.1,
    reverse = false, startOffset = 0, endOffset = 0, maxPoints = 2000
} = {}) {
    if (!Array.isArray(curves) || !curves.length) fail('모서리 또는 곡선을 선택하세요.');
    if (![step, tolerance, joinTolerance, startOffset, endOffset].every(Number.isFinite)
        || step <= 0 || tolerance <= 0 || joinTolerance < 0 || startOffset < 0 || endOffset < 0
        || !['uniform', 'chord'].includes(mode) || !Number.isInteger(maxPoints) || maxPoints < 2) fail('궤적 설정값을 확인하세요.');
    let points = cleanCurve(curves[0]);
    if (curves.length > 1 && !curves[0].closed) {
        const next = cleanCurve(curves[1]);
        const gap = p => Math.min(distance(p, next[0]), distance(p, next.at(-1)));
        if (gap(points[0]) < gap(points.at(-1))) points.reverse();
    }
    for (const curve of curves.slice(1)) {
        const next = cleanCurve(curve);
        // Selection order determines the route; orient each joined edge toward its neighbour.
        if (distance(points.at(-1), next.at(-1)) < distance(points.at(-1), next[0])) next.reverse();
        if (distance(points.at(-1), next[0]) > joinTolerance) fail('연결되지 않은 곡선입니다. 연결 순서대로 선택하세요.');
        if (distance(points.at(-1), next[0]) > 1e-7) points.push(next[0]);
        points.push(...next.slice(1));
    }
    if (reverse) points.reverse();
    const length = curveLength(points);
    if (startOffset + endOffset >= length - 1e-7) fail('시작·끝 오프셋이 곡선 길이보다 큽니다.');
    const trimmed = [];
    let travelled = 0;
    for (let i = 1; i < points.length; i++) {
        const segment = distance(points[i - 1], points[i]);
        const begin = Math.max(travelled, startOffset), end = Math.min(travelled + segment, length - endOffset);
        if (end > begin + 1e-9) {
            if (!trimmed.length) trimmed.push(mix(points[i - 1], points[i], (begin - travelled) / segment));
            trimmed.push(mix(points[i - 1], points[i], (end - travelled) / segment));
        }
        travelled += segment;
    }
    const vertices = mode === 'chord' ? simplify(trimmed, tolerance) : trimmed;
    const result = [vertices[0]];
    for (let i = 1; i < vertices.length; i++) {
        const count = Math.max(1, Math.ceil(distance(vertices[i - 1], vertices[i]) / step));
        if (result.length + count > maxPoints) fail('궤적 포인트가 너무 많습니다. 간격 또는 허용 오차를 늘리세요.');
        for (let j = 1; j <= count; j++) result.push(mix(vertices[i - 1], vertices[i], j / count));
    }
    return { points: result, length: curveLength(result), sourceLength: length };
}
