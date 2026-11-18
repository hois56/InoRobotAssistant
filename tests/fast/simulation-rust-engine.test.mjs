import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCadProfileRegions, sampleBulgeArc, samplePolylineVertices } from '../../2_3DSimulation/cad2d-geometry.mjs';
import { scaraInverse } from '../../2_3DSimulation/inverse-kinematics.mjs';
import { planJointPath } from '../../2_3DSimulation/path-planning-core.mjs';
import { parseStl } from '../../2_3DSimulation/stl-core.mjs';
import { engine, evaluateOlpExpression, numbers } from '../../2_3DSimulation/wasm/engine.mjs';
import { dragPanel, fitPanel, panelResizeEdge, resizePanel, stackPanels } from '../../2_3DSimulation/wasm/panels.mjs';

test('panel resizing and dragging preserve the opposite edge and fit a smaller viewport', () => {
    const canvas = { left: 5, top: 50, width: 480, height: 280 };
    const rect = { left: 110, top: 60, right: 390, bottom: 290 };
    assert.equal(panelResizeEdge(rect, 112, 61), 'nw');
    assert.equal(panelResizeEdge(rect, 370, 200), '');
    const box = fitPanel('model-browser-panel', canvas, rect, 260, 300, 240);
    assert.deepEqual(box, { left: 105, top: 10, width: 300, height: 260, minWidth: 260, minHeight: 260 });
    assert.deepEqual(resizePanel({ ...box, edge: 'nw', canvasWidth:480, canvasHeight:280 }, 300, 20), [145,10,260,260]);
    assert.deepEqual(dragPanel(-12,90,300,260,canvas), [0,20]);
});

test('focus respects closed and detached panels and reserves the work origin layer', () => {
    const document = {};
    const nodes = new Map();
    for (const id of ['jog-panel','model-browser-panel','work-origin-dialog','equipment-dialog','vision-panel']) {
        nodes.set(id, { id, ownerDocument: document, open: true, classList:{contains:()=>false}, style:{} });
    }
    nodes.get('equipment-dialog').open = false;
    nodes.get('vision-panel').ownerDocument = {};
    const order = stackPanels([...nodes.keys()], 'jog-panel', id => nodes.get(id), document);
    assert.deepEqual(order, ['model-browser-panel','work-origin-dialog','jog-panel']);
    assert.deepEqual(order.map(id=>nodes.get(id).style.zIndex), ['70','91','72']);
});

test('minimum IK damping gives a finite correction for coincident prismatic axes', () => {
    numbers(23).set([0,0,0, 1,0,0, 0,0,0, 1,1,0,0,0,0,0, 1,1,0,0,0,0,0]);
    assert.ok(engine.ik_step(2, 0, 400, 0.00001, 12, Math.PI / 36));
    for (const delta of numbers(2)) assert.ok(Math.abs(delta - 0.5) < 1e-5);
});

test('nested OLP evaluation preserves raw arguments, register lookups and exceptions', () => {
    const missing = Symbol('missing');
    const failure = new Error('register could not be read');
    const runtime = {
        runtimeError: message => new Error(message),
        readSymbol(name) { if (name === 'broken') throw failure; return 4; },
        callBuiltinSync(name, args, raw) {
            if (name !== 'Nested') return missing;
            assert.deepEqual(raw, ['R[1+1] * -2', '"한글😀"']);
            assert.deepEqual(args, [-8, '한글😀']);
            return evaluateOlpExpression('3 / (1 + 2)', runtime, missing);
        }
    };
    assert.equal(evaluateOlpExpression('Nested(R[1+1] * -2, "한글😀") + " mm"', runtime, missing), '1 mm');
    assert.throws(() => evaluateOlpExpression('broken + 1', runtime, missing), error => error === failure);
    assert.throws(() => evaluateOlpExpression('1 / 0', runtime, missing), /Division by zero/);
    assert.equal(evaluateOlpExpression('ON + --2', runtime, missing), 3);
});

test('STL imports retain per-facet colours, normals, solid names and byte offsets', () => {
    const bytes = new Uint8Array(84 + 100);
    bytes.set(new TextEncoder().encode('COLOR='));
    bytes.set([255, 0, 0, 128], 6);
    const view = new DataView(bytes.buffer);
    view.setUint32(80, 2, true);
    for (const [i, colour] of [0x8000, 0x7c00].entries()) {
        const face = 84 + i * 50;
        view.setFloat32(face + 8, 1, true);
        view.setFloat32(face + 24, 1, true);
        view.setFloat32(face + 40, 1, true);
        view.setUint16(face + 48, colour, true);
    }
    const wrapped = new Uint8Array(bytes.length + 5);
    wrapped.set(bytes, 5);
    const binary = parseStl(wrapped.subarray(5));
    assert.equal(binary.alpha, 128 / 255);
    assert.deepEqual([...binary.geometry.attributes.color.array], [...Array(3).fill([1, 0, 0]).flat(), ...Array(3).fill([0, 0, 1]).flat()]);
    assert.deepEqual([...binary.geometry.attributes.normal.array], Array(6).fill([0, 0, 1]).flat());
    assert.equal(binary.collisionGeometry, null);
    const ascii = parseStl(new TextEncoder().encode('solid frame\nfacet normal 0 0 1\nouter loop\nvertex -2e1 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid frame\nsolid second\nendsolid second'));
    assert.deepEqual(ascii.groups, [{ name: 'frame', start: 0, count: 3 }, { name: 'second', start: 3, count: 0 }]);
    assert.deepEqual([...ascii.geometry.attributes.position.array], [-20,0,0, 1,0,0, 0,1,0]);
    assert.throws(() => parseStl(bytes.subarray(0, 100)), /truncated/);
});

test('CAD stitching keeps the source entities, holes and islands selectable', () => {
    const square = (id, lo, hi) => ({ id, closed: true, layerId: 'profile', type: 'LWPOLYLINE',
        renderPoints: [[lo, lo], [hi, lo], [hi, hi], [lo, hi], [lo, lo]] });
    const perimeter = square('frame', 0, 10).renderPoints;
    const edges = perimeter.slice(1).map((p, i) => ({ id: 'line-' + i, type: 'LINE',
        renderPoints: i % 2 ? [p, perimeter[i]] : [perimeter[i], p] }));
    const regions = buildCadProfileRegions([...edges, square('hole', 2, 8), square('island', 4, 6)]);
    assert.deepEqual(regions.map(r => r.area).sort((a, b) => a - b), [4, 64]);
    const outer = regions.find(r => r.area === 64);
    assert.deepEqual(outer.outerEntityIds, edges.map(edge => edge.id));
    assert.deepEqual(outer.holeEntityIds, ['hole']);
    const arc = sampleBulgeArc([0, 0], [2, 0], -1);
    const polyline = samplePolylineVertices([{ point: [0, 0], bulge: -1 }, { point: [2, 0] }, { point: [3, 0] }]);
    assert.deepEqual(polyline, [...arc, [3, 0]]);
    assert.ok(Math.abs(arc[(arc.length - 1) / 2][1] - 1) < 1e-12);
});

test('SCARA inverse honours the requested elbow and assigns the reachable wrist turn', () => {
    const joints = [0, 0, 0, 0].map(() => ({ angle: 0, definition: { min: -180, max: 180 } }));
    const manifest = { structure: [100, 100], tcp: [0, 0, 20] };
    for (const sign of [-1, 1]) {
        const { angles } = scaraInverse(joints, manifest, { x: 100, y: 100, z: 15 }, { x: 0, y: 0, z: 0 }, sign, NaN);
        assert.ok(Math.abs(angles[1] - sign * 90) < 1e-9);
        assert.ok(Math.abs(angles[0] + angles[1] + angles[3]) < 1e-9);
        assert.equal(angles[2], -5);
    }
    assert.match(scaraInverse(joints, manifest, { x: 300, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0, NaN).reason, /reach/);
});

test('joint searches keep independent state while scene collision checks yield', async () => {
    async function plan(y) {
        let first = true;
        return planJointPath({ start: [0, y], goal: [10, y], bounds: [{ min: 0, max: 10 }, { min: 0, max: 10 }],
            sampleStates: [[5, y + 1]], onYield() {}, async edgeIsSafe() {
                await Promise.resolve();
                if (first) { first = false; return false; }
                return true;
            } });
    }
    const results = await Promise.all([plan(1), plan(8)]);
    results.forEach(({ success, path }, i) => {
        const y = i ? 8 : 1;
        assert.equal(success, true);
        assert.deepEqual(path[0], [0, y]);
        assert.deepEqual(path.at(-1), [10, y]);
    });
});
