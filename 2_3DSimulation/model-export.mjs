const STL_HEADER_BYTES = 80;
const STL_RECORD_BYTES = 50;

function toPoint(value) {
    if (Array.isArray(value)) return value.slice(0, 3).map(Number);
    if (value && typeof value === 'object') return [Number(value.x), Number(value.y), Number(value.z)];
    return [NaN, NaN, NaN];
}

function cross(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0]
    ];
}

function subtract(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function vectorLength(value) {
    return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value) {
    const length = vectorLength(value);
    return length > 1e-12 ? value.map((component) => component / length) : [0, 0, 1];
}

function normalizedTriangle(triangle) {
    const a = toPoint(triangle?.a);
    const b = toPoint(triangle?.b);
    const c = toPoint(triangle?.c);
    if (![...a, ...b, ...c].every(Number.isFinite)) return null;
    const normal = cross(subtract(b, a), subtract(c, a));
    if (vectorLength(normal) <= 1e-12) return null;
    return { a, b, c, normal: normalize(normal) };
}

export function normalizeModelExportTriangles(triangles = []) {
    return (Array.isArray(triangles) ? triangles : [])
        .map(normalizedTriangle)
        .filter(Boolean);
}

export function createBinaryStl(triangles = []) {
    const faces = normalizeModelExportTriangles(triangles);
    if (!faces.length) throw new Error('No exportable triangles were found.');

    const buffer = new ArrayBuffer(STL_HEADER_BYTES + 4 + faces.length * STL_RECORD_BYTES);
    const header = new Uint8Array(buffer, 0, STL_HEADER_BYTES);
    const headerText = new TextEncoder().encode('InoRobot Assistant generated STL');
    header.set(headerText.slice(0, STL_HEADER_BYTES));
    const view = new DataView(buffer);
    view.setUint32(STL_HEADER_BYTES, faces.length, true);

    faces.forEach((face, index) => {
        const offset = STL_HEADER_BYTES + 4 + index * STL_RECORD_BYTES;
        [...face.normal, ...face.a, ...face.b, ...face.c].forEach((value, componentIndex) => {
            view.setFloat32(offset + componentIndex * 4, value, true);
        });
        view.setUint16(offset + 48, 0, true);
    });
    return buffer;
}

function formatStepReal(value) {
    const normalized = Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
    if (Object.is(normalized, -0)) return '0.0';
    const text = String(normalized).replace('e-', 'E-').replace('e+', 'E+');
    return text.includes('.') || text.includes('E') ? text : `${text}.0`;
}

function formatStepPoint(point) {
    return `(${point.map(formatStepReal).join(',')})`;
}

function escapeStepString(value) {
    return String(value || 'Model').replace(/'/g, "''");
}

function pointKey(point) {
    return point.map((value) => formatStepReal(value)).join(',');
}

function stepTimestamp() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function createFacetedStep(triangles = [], name = 'Generated Model') {
    const faces = normalizeModelExportTriangles(triangles);
    if (!faces.length) throw new Error('No exportable triangles were found.');

    const safeName = escapeStepString(name);
    const pointByKey = new Map();
    const points = [];
    const getPointIndex = (point) => {
        const key = pointKey(point);
        const existing = pointByKey.get(key);
        if (existing !== undefined) return existing;
        const index = points.length;
        points.push(point);
        pointByKey.set(key, index);
        return index;
    };

    const facePointIndexes = faces.map((face) => [
        getPointIndex(face.a),
        getPointIndex(face.b),
        getPointIndex(face.c)
    ]);
    const pointIds = points.map((_, index) => 100 + index);
    let nextId = 100 + pointIds.length;
    const faceRecords = faces.map((face, index) => {
        const [a, b, c] = facePointIndexes[index];
        const loopId = nextId++;
        const boundId = nextId++;
        const normalId = nextId++;
        const referenceId = nextId++;
        const placementId = nextId++;
        const planeId = nextId++;
        const faceId = nextId++;
        return {
            face,
            pointIds: [pointIds[a], pointIds[b], pointIds[c]],
            loopId,
            boundId,
            normalId,
            referenceId,
            placementId,
            planeId,
            faceId
        };
    });
    const shellId = nextId++;
    const brepId = nextId++;

    const pointEntities = points.map((point, index) => (
        `#${pointIds[index]}=CARTESIAN_POINT('',${formatStepPoint(point)});`
    ));
    const faceEntities = faceRecords.flatMap((record) => {
        const [a, b, c] = record.pointIds;
        const normal = record.face.normal;
        const reference = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const projectedReference = normalize(subtract(reference, normal.map((component) => component * (
            reference[0] * normal[0] + reference[1] * normal[1] + reference[2] * normal[2]
        ))));
        return [
            `#${record.loopId}=POLY_LOOP('',(#${a},#${b},#${c}));`,
            `#${record.boundId}=FACE_OUTER_BOUND('',#${record.loopId},.T.);`,
            `#${record.normalId}=DIRECTION('',${formatStepPoint(normal)});`,
            `#${record.referenceId}=DIRECTION('',${formatStepPoint(projectedReference)});`,
            `#${record.placementId}=AXIS2_PLACEMENT_3D('',#${a},#${record.normalId},#${record.referenceId});`,
            `#${record.planeId}=PLANE('',#${record.placementId});`,
            `#${record.faceId}=FACE_SURFACE('',(#${record.boundId}),#${record.planeId},.T.);`
        ];
    });
    const faceIdList = faceRecords.map((record) => `#${record.faceId}`).join(',');

    const header = [
        'ISO-10303-21;',
        'HEADER;',
        "FILE_DESCRIPTION(('InoRobot Assistant faceted model'),'2;1');",
        `FILE_NAME('${safeName}.step','${stepTimestamp()}',('InoRobot Assistant'),(''),'InoRobot Assistant','InoRobot Assistant','');`,
        "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 2 1 1 1 }'));",
        'ENDSEC;',
        'DATA;'
    ];
    const data = [
        "#1=APPLICATION_CONTEXT('automotive_design');",
        "#2=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2001,#1);",
        "#3=PRODUCT_CONTEXT('',#1,'mechanical');",
        `#4=PRODUCT('${safeName}','${safeName}','Generated faceted model',(#3));`,
        "#5=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',#4,.NOT_KNOWN.);",
        "#6=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');",
        "#7=PRODUCT_DEFINITION('design','',#5,#6);",
        "#8=PRODUCT_DEFINITION_SHAPE('','',#7);",
        `#9=SHAPE_DEFINITION_REPRESENTATION(#8,#10);`,
        `#10=SHAPE_REPRESENTATION('',(#${brepId}),#13);`,
        `#12=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),#15,'distance_accuracy_value','confusion accuracy');`,
        "#13=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#12))GLOBAL_UNIT_ASSIGNED_CONTEXT((#15,#16,#17))REPRESENTATION_CONTEXT('',''));",
        "#15=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));",
        "#16=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));",
        "#17=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());",
        ...pointEntities,
        ...faceEntities,
        `#${shellId}=CLOSED_SHELL('${safeName}',(${faceIdList}));`,
        `#${brepId}=FACETED_BREP('${safeName}',#${shellId});`
    ];
    return [...header, ...data, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}

export function sanitizeModelExportName(value, fallback = 'generated-model') {
    const sanitized = String(value || '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    return sanitized || fallback;
}
