import { CONVEYOR_DIMENSIONS, normalizeConveyorDimensions, resizeConveyorContent } from './conveyor-model.mjs';

// Measured XYZ extents of the catalog STEP files, in mm. Keep the authored origin:
// for example, the base's mounting surface is Z=0 and its feet extend below it.
const MODEL_SIZES = Object.freeze({
    base: [1000, 1000, 500],
    'square-object': [40, 40, 40],
    'square-tray': [200, 200, 200],
    'stage-vac': [200, 200, 200],
    'teaching-kit': [500, 500, 200],
    vision: [200, 200, 200],
    equipment: [1800, 1400, 430],
    'scara-height-base': [207, 170, 200],
    'flat-tray': [240, 240, 176]
});

export function getTestModelDimensionFields(assetId) {
    if (assetId === 'conveyor') return CONVEYOR_DIMENSIONS;
    const size = MODEL_SIZES[assetId];
    return size ? CONVEYOR_DIMENSIONS.map((field, axis) => ({
        key: field.key, label: field.label, value: size[axis], min: .1, max: 10000
    })) : [];
}

export function normalizeTestModelDimensions(assetId, value = {}) {
    if (assetId === 'conveyor') return normalizeConveyorDimensions(value);
    const fields = getTestModelDimensionFields(assetId);
    if (!fields.length) throw new Error('치수를 지정할 수 없는 모델입니다.');
    return Object.fromEntries(fields.map(field => {
        const number = Number(value[field.key] ?? field.value);
        if (!Number.isFinite(number) || number < field.min || number > field.max)
            throw new Error('모델 치수는 입력란에 표시된 범위의 숫자로 입력해 주세요.');
        return [field.key, number];
    }));
}

// Bake into fresh STEP geometry before pivots, snap edges and collision shapes
// are created. Part identities and unit-scale motion frames remain unchanged.
export function resizeTestModelContent(content, assetId, value) {
    if (assetId === 'conveyor') return resizeConveyorContent(content, value);
    const dimensions = normalizeTestModelDimensions(assetId, value);
    const scale = getTestModelDimensionFields(assetId).map(field => dimensions[field.key] / field.value);
    if (scale.every(factor => factor === 1)) return dimensions;
    content.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry) return;
        const geometry = mesh.geometry.clone();
        geometry.scale(...scale);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        mesh.geometry.dispose();
        mesh.geometry = geometry;
    });
    return dimensions;
}
