import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseDxfBuffer } from '../2_3DSimulation/dxf-parser-core.mjs';
import { getDxfInsunitsUnit, normalizeCad2dDocument } from '../2_3DSimulation/cad2d-core.mjs';
import { buildCadProfileRegions, pointInPolygon } from '../2_3DSimulation/cad2d-geometry.mjs';

const fixturePath = new URL('../test-fixtures/cad/ascii-basic.dxf', import.meta.url);
const fixture = await fs.readFile(fixturePath);
const document = await parseDxfBuffer(fixture, {
    fileName: 'ascii-basic.dxf',
    size: fixture.byteLength,
    lastModified: 0,
    sourceKey: 'fixture-ascii-basic'
});

assert.equal(document.schemaVersion, 1);
assert.equal(document.source.sourceUnit, 'millimeter');
assert.equal(getDxfInsunitsUnit(4), 'millimeter');
assert.ok(document.entities.length >= 6, 'expected supported DXF entities');
assert.ok(document.entities.some((entity) => entity.type === 'LINE'));
assert.ok(document.entities.some((entity) => entity.type === 'ARC'));
assert.ok(document.entities.some((entity) => entity.type === 'CIRCLE' && entity.closed));
assert.ok(document.entities.some((entity) => entity.type === 'LWPOLYLINE' && entity.closed));
assert.ok(document.entities.some((entity) => entity.type === 'POLYLINE' && entity.closed));
assert.ok(document.entities.some((entity) => entity.type === 'ELLIPSE'));
assert.ok(!document.entities.some((entity) => entity.type === 'SPLINE'));
assert.ok(document.warnings.some((warning) => warning.type === 'SPLINE'));
assert.ok(document.entities.every((entity) => entity.id && entity.renderPoints.every((point) => point.every(Number.isFinite))));
assert.ok(document.drawing.bounds.max[0] > document.drawing.bounds.min[0]);
assert.ok(document.drawing.bounds.max[1] > document.drawing.bounds.min[1]);
assert.ok(document.warnings.some((warning) => warning.code === 'CAD_ENTITY_SKIPPED'));

const blockFixture = Buffer.from(`0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
BLOCKS
0
BLOCK
2
BOX
70
0
10
1
20
2
0
LINE
8
0
10
0
20
0
11
10
21
0
0
CIRCLE
8
0
10
5
20
5
40
2
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
8
0
2
BOX
10
100
20
200
41
2
42
2
50
90
0
ENDSEC
0
EOF
`, 'ascii');
const blockDocument = await parseDxfBuffer(blockFixture, {
    fileName: 'block-fixture.dxf',
    size: blockFixture.byteLength,
    sourceKey: 'fixture-block'
});
assert.equal(blockDocument.entities.length, 2, 'expected INSERT block geometry to be expanded');
assert.equal(blockDocument.drawing.blocks.find((block) => block.name === 'BOX')?.entityCount, 2);
const expandedLine = blockDocument.entities.find((entity) => entity.type === 'LINE');
assert.deepEqual(expandedLine.geometry.start, [104, 198]);
assert.deepEqual(expandedLine.geometry.end, [104, 218]);
assert.deepEqual(expandedLine.blockPath, ['BOX']);

const profileRegions = buildCadProfileRegions(document.entities);
const holedRegion = profileRegions.find((region) => region.holeEntityIds.length > 0);
assert.ok(holedRegion, 'expected a profile face with an inner hole');
assert.ok(holedRegion.holes.some((hole) => hole.entityIds.some((id) => (
    document.entities.find((entity) => entity.id === id)?.type === 'CIRCLE'
))));
assert.ok(pointInPolygon([60, 35], holedRegion.outer.points), 'hole center should be inside the outer face');
assert.equal(holedRegion.holes.length, 1);

const stitchedRegions = buildCadProfileRegions([
    { id: 'line-a', type: 'LINE', layerId: 'layer-0', renderPoints: [[0, 0], [20, 0]] },
    { id: 'line-b', type: 'LINE', layerId: 'layer-0', renderPoints: [[20, 0], [20, 10]] },
    { id: 'line-c', type: 'LINE', layerId: 'layer-0', renderPoints: [[20, 10], [0, 10]] },
    { id: 'line-d', type: 'LINE', layerId: 'layer-0', renderPoints: [[0, 10], [0, 0]] }
]);
assert.equal(stitchedRegions.length, 1, 'expected separate LINE entities to form a selectable face');
assert.equal(stitchedRegions[0].outerEntityIds.length, 4);

const inchDocument = normalizeCad2dDocument({
    source: { fileName: 'inch.dxf', extension: 'dxf', sourceUnit: 'inch' },
    sourceKey: 'inch-fixture',
    unit: 'inch',
    entities: [{ type: 'LINE', handle: '1', layer: '0', geometry: { kind: 'line', start: [0, 0], end: [1, 0] }, renderPoints: [[0, 0], [1, 0]] }]
});
assert.equal(inchDocument.source.unitScale, 25.4);
assert.equal(inchDocument.entities[0].length, 25.4);
assert.deepEqual(inchDocument.entities[0].renderPoints[1], [25.4, 0]);

await assert.rejects(
    () => parseDxfBuffer(Buffer.from('AutoCAD Binary DXF\0', 'ascii')),
    (error) => error.code === 'CAD_DXF_BINARY_UNSUPPORTED'
);

console.log(`2D CAD import validation passed: ${document.entities.length} entities, ${document.drawing.layers.length} layers`);
