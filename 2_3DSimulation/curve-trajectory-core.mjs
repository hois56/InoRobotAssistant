import { engine, numbers } from './wasm/engine.mjs';

export function curveLength(points) {
    return points.reduce((sum, point, i) => sum + (i ? Math.hypot(...points[i-1].map((value, axis) => value-point[axis])) : 0), 0);
}

export function generateCurveTrajectory(curves, {
    step = 10, tolerance = 0.1, mode = 'uniform', joinTolerance = 0.1,
    reverse = false, startOffset = 0, endOffset = 0, maxPoints = 2000
} = {}) {
    if (!Array.isArray(curves) || !curves.length) throw new Error('모서리 또는 곡선을 선택하세요.');
    if (![step, tolerance, joinTolerance, startOffset, endOffset].every(Number.isFinite)
        || step <= 0 || tolerance <= 0 || joinTolerance < 0 || startOffset < 0 || endOffset < 0
        || !['uniform', 'chord'].includes(mode) || !Number.isInteger(maxPoints) || maxPoints < 2) {
        throw new Error('궤적 설정값을 확인하세요.');
    }
    const values = [];
    for (const curve of curves) {
        const points = curve.points || [];
        values.push(points.length, Number(Boolean(curve.closed)));
        for (const p of points) {
            if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) throw new Error('곡선 좌표가 올바르지 않습니다.');
            values.push(p[0], p[1], p[2]);
        }
    }
    numbers(values.length).set(values);
    const count = engine.curve_trajectory(step, tolerance, mode === 'chord', joinTolerance,
        reverse, startOffset, endOffset, Math.min(maxPoints, 0x7fffffff));
    if (count < 0) throw new Error(['', '길이가 있는 모서리 또는 곡선을 선택하세요.',
        '연결되지 않은 곡선입니다. 연결 순서대로 선택하세요.', '시작·끝 오프셋이 곡선 길이보다 큽니다.',
        '궤적 포인트가 너무 많습니다. 간격 또는 허용 오차를 늘리세요.'][-count]);
    const result = numbers(2 + count * 3);
    const points = Array.from({ length: count }, (_, i) => Array.from(result.subarray(2+i*3, 5+i*3)));
    return { points, length: result[0], sourceLength: result[1] };
}
