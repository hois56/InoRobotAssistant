// Overall dimensions of the catalog Conveyor.step, including feet and guides (mm).
export const CONVEYOR_DIMENSIONS = Object.freeze([
    { key: 'length', label: '길이', value: 500, min: 300, max: 10000 },
    { key: 'width', label: '너비', value: 200, min: 160, max: 10000 },
    { key: 'height', label: '높이', value: 200, min: 120, max: 10000 }
].map(Object.freeze));

export function normalizeConveyorDimensions(value = {}) {
    return Object.fromEntries(CONVEYOR_DIMENSIONS.map(field => {
        const number = Number(value[field.key] ?? field.value);
        if (!Number.isFinite(number) || number < field.min || number > field.max)
            throw new Error('컨베이어 치수는 입력란에 표시된 범위의 숫자로 입력해 주세요.');
        return [field.key, number];
    }));
}

function partTransform(name, { length, width, height }) {
    const dx = (length - 500) / 2, dy = (width - 200) / 2, dz = height - 200;
    const scale = [1, 1, 1], offset = [0, 0, dz];
    let match;
    if (/^Endless_belt_/.test(name)) {
        scale[1] = (width - 100) / 100;
        return { scale, offset, belt: true, dx, straightScale: (length - 60) / 440 };
    } else if ((match = /^(Roller|Shaft)_(-?220)_/.exec(name))) {
        offset[0] = Math.sign(Number(match[2])) * dx;
        scale[1] = match[1] === 'Roller' ? (width - 100) / 100 : (width - 44) / 156;
    } else if ((match = /^Bearing_(-?220)_(-?1)$/.exec(name))) {
        offset[0] = Math.sign(Number(match[1])) * dx;
        offset[1] = Number(match[2]) * dy;
    } else if ((match = /^(Side_frame|Guide_rail)_(-?1)$/.exec(name))) {
        scale[0] = match[1] === 'Side_frame' ? (length - 20) / 480 : (length - 70) / 430;
        offset[1] = Number(match[2]) * dy;
    } else if ((match = /^Guide_post_(-?1)_(-?\d+)$/.exec(name))) {
        offset[0] = Number(match[2]) * ((length - 60) / 440 - 1);
        offset[1] = Number(match[1]) * dy;
    } else if (name === 'Belt_support_deck') {
        scale[0] = (length - 100) / 400;
        scale[1] = (width - 100) / 100;
    } else if ((match = /^Deck_cross_support_(-?140)$/.exec(name))) {
        offset[0] = Math.sign(Number(match[1])) * dx;
        scale[1] = (width - 96) / 104;
    } else if ((match = /^Deck_support_bracket_(-?140)_(-?1)$/.exec(name))) {
        offset[0] = Math.sign(Number(match[1])) * dx;
        offset[1] = Number(match[2]) * dy;
    } else if ((match = /^(Column|Mount_pad)_(-?200)_(-?1)$/.exec(name))) {
        offset[0] = Math.sign(Number(match[2])) * dx;
        offset[1] = Number(match[3]) * dy;
        scale[2] = match[1] === 'Column' ? (height - 78) / 122 : 1;
        offset[2] = 8 * (1 - scale[2]);
    } else if ((match = /^Bottom_long_rail_(-?1)$/.exec(name))) {
        scale[0] = (length - 120) / 380;
        offset[1] = Number(match[1]) * dy;
        offset[2] = 0;
    } else if ((match = /^Bottom_cross_rail_(-?200)$/.exec(name))) {
        offset[0] = Math.sign(Number(match[1])) * dx;
        scale[1] = (width - 96) / 104;
        offset[2] = 0;
    } else if (['Gearbox', 'Drive_motor', 'Motor_terminal_cover'].includes(name)) {
        offset[0] = dx;
        offset[1] = -dy;
    } else {
        throw new Error('컨베이어 모델의 부품을 확인할 수 없습니다.');
    }
    return { scale, offset };
}

// Apply once to a freshly parsed catalog STEP, before part pivots/edges are built.
// Geometry stays in mm and motion frames retain unit scale, including after reload.
export function resizeConveyorContent(content, value) {
    const dimensions = normalizeConveyorDimensions(value);
    if (CONVEYOR_DIMENSIONS.every(field => dimensions[field.key] === field.value)) return dimensions;
    content.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry) return;
        const transform = partTransform(mesh.userData.cadPartName || mesh.name, dimensions);
        const geometry = mesh.geometry.clone();
        geometry.scale(...transform.scale);
        if (transform.belt) {
            // Extend the straight span and translate each curved end without changing its radius.
            const positions = geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const x = positions.getX(i);
                positions.setX(i, Math.abs(x) <= 220 ? x * transform.straightScale : x + Math.sign(x) * transform.dx);
            }
            positions.needsUpdate = true;
        }
        geometry.translate(...transform.offset);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        mesh.geometry.dispose();
        mesh.geometry = geometry;
    });
    return dimensions;
}
