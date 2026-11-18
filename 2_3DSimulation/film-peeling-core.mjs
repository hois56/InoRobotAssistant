import { engine, numbers } from './wasm/engine.mjs';

const gripSides = ['X-', 'X+', 'Y-', 'Y+'];
const errors = ['', '필름을 완전히 박리한 후 파지를 해제하세요.', '파지점이 필름 자유 길이를 초과했습니다.'];

export function getFilmGripLayout(def, point = null) {
    const side = def.filmGripSide || 'X-';
    const buffer = numbers(8);
    if (point) buffer.set(point.slice(0, 2));
    const selected = engine.film_layout(def.filmLength, def.filmWidth, def.filmGripWidth ?? 20,
        (def.filmGripOffset ?? 50) / 100, gripSides.indexOf(side), Boolean(point));
    const [length, width, x, y, z, angle, gripOffset, gripWidth] = numbers(8);
    return { side: gripSides[selected] ?? side, length, width, origin: [x,y,z], angle, gripOffset, gripWidth };
}

export function getFilmPeelFromGrip(state, anchor) {
    const length = engine.film_peel(state.length, state.width, state.gripOffset ?? 0.5, ...anchor);
    if (length < 0) throw new Error('손잡이를 제품 안쪽 방향으로 당기며 들어 올리세요.');
    return length;
}

function packPoints(buffer, start, points) {
    for (let i = 0; i < points.length; i++) buffer.set(points[i], start + 3 * i);
}
function unpackPoints(buffer, start, points) {
    for (let i = 0; i < points.length; i++) {
        const k = start + 3 * i;
        points[i] = [buffer[k], buffer[k+1], buffer[k+2]];
    }
}

export function createFilmState(length, width, rows = 40, columns = 6, { gripOffset = 0.5, gripWidth = width } = {}) {
    const count = (rows + 1) * (columns + 1);
    numbers(3 * count);
    engine.film_grid(rows, columns, length, width);
    const points = new Array(count);
    unpackPoints(numbers(3 * count), 0, points);
    return { length, width, rows, columns, points, previous: points.map(p => [...p]), gripOffset, gripWidth };
}

export function stepFilm(state, peel, seconds, { stiffness = 0.05, damping = 0.96, anchor = null, gripEdge = null, released = false, groundPlane = null } = {}) {
    const { rows, columns, length, width, points, previous } = state;
    const currentStart = 8 + 4 * (columns + 1);
    const previousStart = currentStart + 3 * points.length;
    const size = previousStart + 3 * previous.length;
    const buffer = numbers(size);
    if (anchor) buffer.set(anchor, 0);
    if (groundPlane) {
        buffer.set(groundPlane.normal, 3);
        buffer[6] = groundPlane.offset;
    }
    if (gripEdge) {
        for (let col = 0; col <= columns; col++) {
            const k = 8 + col * 4;
            buffer[k] = Number(Boolean(gripEdge[col]));
            if (gripEdge[col]) buffer.set(gripEdge[col], k + 1);
        }
    }
    packPoints(buffer, currentStart, points);
    packPoints(buffer, previousStart, previous);
    const status = engine.film_step(rows, columns, length, width, peel, seconds, stiffness, damping,
        state.gripOffset ?? 0.5, state.gripWidth ?? width, Boolean(anchor), Boolean(gripEdge), released, Boolean(groundPlane));
    const result = numbers(size);
    if (status === 0) {
        unpackPoints(result, currentStart, points);
        unpackPoints(result, previousStart, previous);
    }
    return { error: errors[status], freeLength: result[7] };
}

export function filmLengthError(state) {
    packPoints(numbers(3 * state.points.length), 0, state.points);
    return engine.film_length_error(state.rows, state.columns, state.length);
}
