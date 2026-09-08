export const PRIMITIVE_SHAPE_SCHEMA_VERSION = 1;

export const PRIMITIVE_SHAPE_TYPES = Object.freeze([
    'box',
    'cone',
    'cylinder',
    'sphere'
]);

export const PRIMITIVE_SHAPE_LIMITS = Object.freeze({
    min: 0.1,
    max: 100000
});

export const PRIMITIVE_SHAPE_DEFAULT_DIMENSIONS = Object.freeze({
    box: Object.freeze({ x: 100, y: 100, z: 100 }),
    cone: Object.freeze({ x: 100, y: 100, z: 100 }),
    cylinder: Object.freeze({ x: 100, y: 100, z: 100 }),
    sphere: Object.freeze({ x: 100, y: 100, z: 100 })
});

export const PRIMITIVE_SHAPE_DISPLAY_NAMES = Object.freeze({
    box: '사각형',
    cone: '원뿔형',
    cylinder: '원통형',
    sphere: '구'
});

export function normalizePrimitiveShapeType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    return PRIMITIVE_SHAPE_TYPES.includes(normalized) ? normalized : null;
}

function normalizePrimitiveShapeNameIndex(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function finiteDimension(value) {
    const number = Number(value);
    if (!Number.isFinite(number)
        || number < PRIMITIVE_SHAPE_LIMITS.min
        || number > PRIMITIVE_SHAPE_LIMITS.max) {
        throw new RangeError(
            `Primitive dimensions must be finite and between ${PRIMITIVE_SHAPE_LIMITS.min} and ${PRIMITIVE_SHAPE_LIMITS.max} mm.`
        );
    }
    return number;
}

export function normalizePrimitiveShapeDimensions(type, dimensions = {}) {
    const normalizedType = normalizePrimitiveShapeType(type);
    if (!normalizedType) throw new TypeError('Unsupported primitive shape type.');
    const fallback = PRIMITIVE_SHAPE_DEFAULT_DIMENSIONS[normalizedType];
    const values = {
        x: finiteDimension(dimensions.x ?? fallback.x),
        y: finiteDimension(dimensions.y ?? fallback.y),
        z: finiteDimension(dimensions.z ?? fallback.z)
    };
    if (normalizedType === 'cylinder' || normalizedType === 'cone') {
        values.y = values.x;
    } else if (normalizedType === 'sphere') {
        values.y = values.x;
        values.z = values.x;
    }
    return values;
}

export function updatePrimitiveShapeDimension(type, dimensions, axis, value) {
    if (!['x', 'y', 'z'].includes(axis)) throw new TypeError('Unsupported primitive dimension axis.');
    return normalizePrimitiveShapeDimensions(type, {
        ...dimensions,
        [axis]: value,
        ...((type === 'cylinder' || type === 'cone') && axis === 'y' ? { x: value } : {}),
        ...(type === 'sphere' ? { x: value, y: value, z: value } : {})
    });
}

export function primitiveShapeGeometrySpec(type, dimensions = {}) {
    const normalizedType = normalizePrimitiveShapeType(type);
    const size = normalizePrimitiveShapeDimensions(normalizedType, dimensions);
    if (normalizedType === 'box') {
        return { type: normalizedType, width: size.x, depth: size.y, height: size.z, baseZ: 0 };
    }
    if (normalizedType === 'cylinder' || normalizedType === 'cone') {
        return {
            type: normalizedType,
            radius: size.x / 2,
            diameter: size.x,
            height: size.z,
            baseZ: 0,
            axis: 'z-up'
        };
    }
    return {
        type: normalizedType,
        radius: size.x / 2,
        diameter: size.x,
        baseZ: 0,
        centerZ: size.z / 2,
        axis: 'z-up'
    };
}

export function primitiveShapeDisplayName(type) {
    const normalizedType = normalizePrimitiveShapeType(type);
    return normalizedType ? PRIMITIVE_SHAPE_DISPLAY_NAMES[normalizedType] : '도형';
}

export function isPrimitiveShapeRecord(record) {
    return record?.kind === 'primitive-shape'
        && Boolean(normalizePrimitiveShapeType(record.primitiveShapeType));
}

export function normalizePrimitiveShapeRecord(record = {}) {
    const primitiveShapeType = normalizePrimitiveShapeType(record.primitiveShapeType);
    if (!primitiveShapeType) return null;
    return {
        kind: 'primitive-shape',
        workspaceModelId: typeof record.workspaceModelId === 'string' ? record.workspaceModelId : null,
        name: String(record.name || primitiveShapeDisplayName(primitiveShapeType)),
        primitiveShapeNameIndex: normalizePrimitiveShapeNameIndex(record.primitiveShapeNameIndex),
        primitiveShapeType,
        primitiveShapeDimensions: normalizePrimitiveShapeDimensions(
            primitiveShapeType,
            record.primitiveShapeDimensions
        ),
        transform: record.transform || null,
        visible: record.visible !== false,
        materialColor: String(record.materialColor || '#bfc7d5')
    };
}

export function serializePrimitiveShapeRecord({
    workspaceModelId = null,
    name = '',
    primitiveShapeNameIndex = null,
    primitiveShapeType,
    primitiveShapeDimensions,
    transform = null,
    visible = true,
    materialColor = '#bfc7d5'
} = {}) {
    const normalized = normalizePrimitiveShapeRecord({
        kind: 'primitive-shape',
        workspaceModelId,
        name,
        primitiveShapeNameIndex,
        primitiveShapeType,
        primitiveShapeDimensions,
        transform,
        visible,
        materialColor
    });
    if (!normalized) throw new TypeError('Cannot serialize an unsupported primitive shape.');
    return normalized;
}
