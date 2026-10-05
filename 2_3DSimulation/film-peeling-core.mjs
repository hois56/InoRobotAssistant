// A rectangular film lattice in mm. Rows run from the leading edge to the
// bonded trailing edge. End rows are constrained; free rows obey distance,
// bending, gravity and damping constraints with an explicit puller or after
// release. The built-in preview uses a smooth bend. Adhesion is kinematic.
export function getFilmGripLayout(def, point = null) {
    const l = def.filmLength, w = def.filmWidth;
    let side = def.filmGripSide || 'X-', offset = (def.filmGripOffset ?? 50) / 100;
    if (point) {
        const distances = { 'X-': Math.abs(point[0]), 'X+': Math.abs(point[0] - l), 'Y-': Math.abs(point[1] + w / 2), 'Y+': Math.abs(point[1] - w / 2) };
        side = Object.keys(distances).sort((a, b) => distances[a] - distances[b])[0];
        offset = side === 'X-' ? 0.5 + point[1] / w : side === 'X+' ? 0.5 - point[1] / w : side === 'Y-' ? 1 - point[0] / l : point[0] / l;
    }
    const across = side.startsWith('Y');
    const origin = side === 'X+' ? [l, 0, 0] : side === 'Y-' ? [l / 2, -w / 2, 0] : side === 'Y+' ? [l / 2, w / 2, 0] : [0, 0, 0];
    return { side, length: across ? w : l, width: across ? l : w, origin,
        angle: side === 'X+' ? Math.PI : side === 'Y-' ? Math.PI / 2 : side === 'Y+' ? -Math.PI / 2 : 0,
        gripOffset: Math.max(0, Math.min(1, offset)), gripWidth: Math.min(def.filmGripWidth ?? 20, across ? l : w) };
}

export function getFilmPeelFromGrip(state, anchor) {
    const y = anchor[1] - state.width * ((state.gripOffset ?? 0.5) - 0.5);
    const [x, , z] = anchor;
    if (Math.hypot(x, y, z) < 1e-8) return 0;
    if (x <= 1e-8) throw new Error('손잡이를 제품 안쪽 방향으로 당기며 들어 올리세요.');
    // The peeled length must reach from the adhesion front to the held patch.
    const length = (x * x + y * y + z * z) / (2 * x);
    return length >= state.length - 1e-9 ? state.length : length;
}

export function createFilmState(length, width, rows = 40, columns = 6, { gripOffset = 0.5, gripWidth = width } = {}) {
    const points = [], previous = [];
    for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
        const point = [length * row / rows, width * (column / columns - 0.5), 0];
        points.push(point); previous.push([...point]);
    }
    return { length, width, rows, columns, points, previous, gripOffset, gripWidth };
}

export function stepFilm(state, peel, seconds, { stiffness = 0.05, damping = 0.96, anchor = null, gripEdge = null, released = false, groundPlane = null } = {}) {
    const { length, width, rows, columns, points, previous } = state;
    const rowWidth = columns + 1, ds = length / rows, dw = width / columns;
    const freeLength = Math.max(0, Math.min(length, peel));
    if (released && freeLength < length) return { error: '필름을 완전히 박리한 후 파지를 해제하세요.', freeLength };
    // The built-in test puller follows a continuous bend, instead of allowing
    // an unsupported cloth to sag back onto the product between grid steps.
    const angle = Math.PI * (2 / 3 - Math.max(0, Math.min(1, stiffness)) / 6);
    const radius = freeLength / angle;
    const curve = row => {
        const s = Math.max(0, freeLength - row * ds), theta = radius ? s / radius : 0;
        return s ? [freeLength - radius * Math.sin(theta), radius * (1 - Math.cos(theta))] : [row * ds, 0];
    };
    if (!released && (!anchor && !gripEdge || freeLength === 0)) {
        for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
            const [x, z] = curve(row), i = row * rowWidth + column;
            points[i] = [x, width * (column / columns - 0.5), z];
            previous[i] = [...points[i]];
        }
        return { error: '', freeLength };
    }
    const freeRow = Math.ceil(freeLength / ds);
    const [endX, endZ] = curve(0);
    const gripY = width * ((state.gripOffset ?? 0.5) - 0.5);
    const end = anchor || [endX, gripY, endZ];
    const distance = Math.hypot(freeLength - end[0], end[1] - gripY, end[2]);
    if (!released && freeLength < length && distance > freeLength * 1.005) return { error: '파지점이 필름 자유 길이를 초과했습니다.', freeLength };
    const fixed = index => {
        const row = Math.floor(index / rowWidth), column = index % rowWidth;
        const y = width * (column / columns - 0.5);
        const inGrip = Math.abs(y - gripY) <= (state.gripWidth ?? width) / 2 || column === Math.round((state.gripOffset ?? 0.5) * columns);
        if (row === 0 && !released && inGrip) return gripEdge?.[column] || [end[0], end[1] + y - gripY, end[2]];
        if (row >= freeRow && freeLength < length) return [row * ds, width * (column / columns - 0.5), 0];
        return null;
    };
    const dt = Math.min(1 / 60, Math.max(0, seconds));
    const decay = damping ** (dt * 60);
    for (let i = 0; i < points.length; i++) {
        const pin = fixed(i);
        if (pin) { points[i] = pin; previous[i] = [...pin]; continue; }
        const old = [...points[i]];
        for (let k = 0; k < 3; k++) points[i][k] += (points[i][k] - previous[i][k]) * decay;
        const gravity = groundPlane?.normal || [0, 0, 1];
        const norm = Math.hypot(...gravity) || 1;
        for (let k = 0; k < 3; k++) points[i][k] -= gravity[k] / norm * 9810 * dt * dt;
        previous[i] = old;
    }
    const constrain = (a, b, rest, strength = 1) => {
        const p = points[a], q = points[b], delta = q.map((v, i) => v - p[i]);
        const magnitude = Math.hypot(...delta); if (magnitude < 1e-10) return;
        const wa = fixed(a) ? 0 : 1, wb = fixed(b) ? 0 : 1;
        if (!wa && !wb) return;
        const factor = (magnitude - rest) / magnitude * strength / (wa + wb);
        for (let k = 0; k < 3; k++) { p[k] += delta[k] * factor * wa; q[k] -= delta[k] * factor * wb; }
    };
    for (let iteration = 0; iteration < 24; iteration++) {
        for (let row = 0; row < rows; row++) for (let column = 0; column <= columns; column++) {
            const i = row * rowWidth + column;
            const partialFront = !released && freeLength < length && row < freeRow && row + 1 === freeRow;
            if (partialFront) {
                // Pin the sub-grid adhesion front; the rest of this segment
                // stays bonded without snapping the peel position to a row.
                const p = points[i], front = [freeLength, width * (column / columns - 0.5), 0];
                const delta = p.map((v, k) => v - front[k]), distance = Math.hypot(...delta);
                const rest = freeLength - row * ds;
                if (!fixed(i) && distance > 1e-10) for (let k = 0; k < 3; k++) p[k] = front[k] + delta[k] * rest / distance;
            } else constrain(i, i + rowWidth, ds);
            if (column < columns) {
                constrain(i, i + 1, dw);
                constrain(i, i + rowWidth + 1, Math.hypot(ds, dw));
                constrain(i + 1, i + rowWidth, Math.hypot(ds, dw));
            }
            if (row + 2 <= rows) constrain(i, i + 2 * rowWidth, 2 * ds, stiffness);
        }
        for (let i = 0; i < points.length; i++) {
            const pin = fixed(i); if (pin) points[i] = pin;
            // Product surface collision. Full CAD/self collision is a separate path.
            else if (points[i][0] >= 0 && points[i][0] <= length && Math.abs(points[i][1]) <= width / 2) points[i][2] = Math.max(0.3, points[i][2]);
            if (!pin && groundPlane) {
                const n = groundPlane.normal;
                const signed = n.reduce((sum, value, k) => sum + value * points[i][k], groundPlane.offset);
                const norm = n.reduce((sum, value) => sum + value * value, 0);
                if (signed < 0 && norm > 0) for (let k = 0; k < 3; k++) points[i][k] -= signed * n[k] / norm;
            }
        }
    }
    return { error: '', freeLength };
}

export function filmLengthError(state) {
    const stride = state.columns + 1, rest = state.length / state.rows;
    let max = 0;
    for (let row = 0; row < state.rows; row++) for (let col = 0; col <= state.columns; col++) {
        const a = state.points[row * stride + col], b = state.points[(row + 1) * stride + col];
        max = Math.max(max, Math.abs(Math.hypot(...b.map((v, i) => v - a[i])) - rest));
    }
    return max;
}
