import { writeFile } from 'node:fs/promises';

// Millimetres, Z up, origin at the centre of the bottom mounting face.
// The unbroken work surface matches the 3 x 3 tray's Z=176 mm floor.
const entities = [];
const add = entity => `#${entities.push(entity)}`;
const refs = values => `(${values.join(',')})`;
const number = value => Number(value.toFixed(6)).toString().replace(/^(-?\d+)$/, '$1.');
const point = coordinates => add(`CARTESIAN_POINT('',(${coordinates.map(number).join(',')}))`);
const direction = coordinates => add(`DIRECTION('',(${coordinates.map(number).join(',')}))`);
const axis = add(`AXIS2_PLACEMENT_3D('',${point([0, 0, 0])},${direction([0, 0, 1])},${direction([1, 0, 0])})`);
const application = add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${application})`);
const productContext = add(`PRODUCT_CONTEXT('',${application},'mechanical')`);
const definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${application},'design')`);
const lengthUnit = add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))');
const angleUnit = add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))');
const solidAngleUnit = add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${lengthUnit},'distance_accuracy_value','')`);
const context = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${lengthUnit},${angleUnit},${solidAngleUnit})) REPRESENTATION_CONTEXT('',''))`);

function product(name, representation) {
    const item = add(`PRODUCT('${name}','${name}','',(${productContext}))`);
    const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${item})`);
    const definition = add(`PRODUCT_DEFINITION('design','',${formation},${definitionContext})`);
    const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);
    add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`);
    add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${item}))`);
    return definition;
}

// Polygons are counterclockwise from above; every face is wound outwards.
function prism(name, polygon, bottom, top) {
    const lower = polygon.map(([x, y]) => point([x, y, bottom]));
    const upper = polygon.map(([x, y]) => point([x, y, top]));
    const face = (vertices, normal, reference) => {
        const loop = add(`POLY_LOOP('',${refs(vertices)})`);
        const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`);
        const placement = add(`AXIS2_PLACEMENT_3D('',${vertices[0]},${direction(normal)},${direction(reference)})`);
        const plane = add(`PLANE('',${placement})`);
        return add(`FACE_SURFACE('',(${bound}),${plane},.T.)`);
    };
    const faces = [face([...lower].reverse(), [0, 0, -1], [1, 0, 0]), face(upper, [0, 0, 1], [1, 0, 0])];
    for (let index = 0; index < polygon.length; index++) {
        const next = (index + 1) % polygon.length;
        const dx = polygon[next][0] - polygon[index][0], dy = polygon[next][1] - polygon[index][1];
        faces.push(face([lower[index], lower[next], upper[next], upper[index]], [dy, -dx, 0], [dx, dy, 0]));
    }
    const shell = add(`CLOSED_SHELL('',${refs(faces)})`);
    const solid = add(`FACETED_BREP('${name}',${shell})`);
    const representation = add(`FACETED_BREP_SHAPE_REPRESENTATION('${name}',(${axis},${solid}),${context})`);
    return { name, representation, definition: product(name, representation) };
}

function rectangle(x, y, width, depth, chamfer = 0) {
    const left = x - width / 2, right = x + width / 2;
    const front = y - depth / 2, back = y + depth / 2;
    return chamfer ? [
        [left + chamfer, front], [right - chamfer, front],
        [right, front + chamfer], [right, back - chamfer],
        [right - chamfer, back], [left + chamfer, back],
        [left, back - chamfer], [left, front + chamfer]
    ] : [[left, front], [right, front], [right, back], [left, back]];
}

function regularPolygon(x, y, radius, sides) {
    return Array.from({ length: sides }, (_, index) => {
        const angle = index * 2 * Math.PI / sides;
        return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
    });
}

const parts = [
    prism('Work_surface_240x240_Z176', rectangle(0, 0, 240, 240, 6), 164, 176),
    prism('Base_plate_200x200', rectangle(0, 0, 200, 200, 8), 0, 8),
    prism('Column_front', rectangle(0, -38, 80, 4), 8, 156),
    prism('Column_back', rectangle(0, 38, 80, 4), 8, 156),
    prism('Column_left', rectangle(-38, 0, 4, 72), 8, 156),
    prism('Column_right', rectangle(38, 0, 4, 72), 8, 156),
    prism('Upper_support_plate', rectangle(0, 0, 160, 160, 8), 156, 164)
];
for (const x of [-78, 78]) for (const y of [-78, 78]) {
    parts.push(prism(`Mounting_washer_${x}_${y}`, regularPolygon(x, y, 7, 24), 8, 10));
    parts.push(prism(`Mounting_bolt_${x}_${y}`, regularPolygon(x, y, 5, 6), 10, 14));
}
const assemblyRepresentation = add(`SHAPE_REPRESENTATION('Flat_Tray_Module',(${axis}),${context})`);
const assemblyDefinition = product('Flat_Tray_Module_240x240x176mm', assemblyRepresentation);
for (const [index, part] of parts.entries()) {
    const occurrence = add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('${index + 1}','${part.name}','',${assemblyDefinition},${part.definition},$)`);
    const placement = add(`PRODUCT_DEFINITION_SHAPE('Placement','',${occurrence})`);
    const transform = add(`ITEM_DEFINED_TRANSFORMATION('','',${axis},${axis})`);
    const relationship = add(`(REPRESENTATION_RELATIONSHIP('','',${part.representation},${assemblyRepresentation}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${transform}) SHAPE_REPRESENTATION_RELATIONSHIP())`);
    add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${relationship},${placement})`);
}

const step = [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('Flat tray module with an uninterrupted vision picking surface'),'2;1');",
    "FILE_NAME('Flat_Tray_Module.step','2026-11-07T00:00:00',('InoRobot Assistant'),(''),'InoRobot Assistant','InoRobot Assistant','');",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));", 'ENDSEC;', 'DATA;',
    ...entities.map((entity, index) => `#${index + 1} = ${entity};`),
    'ENDSEC;', 'END-ISO-10303-21;', ''
].join('\n');
const output = new URL('../2_3DSimulation/test-assets/3D_model/Flat_Tray_Module.step', import.meta.url);
await writeFile(output, step);
console.log(`Flat tray: ${parts.length} parts, 240 x 240 mm work surface, Z=176 mm.`);
