import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { geometryEdges } from '../../3_ToolSelector/tool-engine.mjs';

const THREE = await import(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url).href);

// The Rust edges must reproduce three.js EdgesGeometry bit for bit, in the same order.
function same(name, geometry, angle) {
    const native = geometryEdges(geometry.getAttribute('position'), geometry.getIndex(), angle);
    assert.ok(native, name + ' should use the engine');
    const reference = new THREE.EdgesGeometry(geometry, angle).getAttribute('position').array;
    assert.equal(native.length, reference.length, name);
    assert.ok(Buffer.from(native.buffer).equals(Buffer.from(reference.buffer, reference.byteOffset, reference.byteLength)), name);
    return native.length / 6;
}

function stlGeometry(file) {
    const stl = readFileSync(new URL(`../../2_3DSimulation/models/${file}`, import.meta.url));
    const count = stl.readUInt32LE(80);
    const positions = Float32Array.from({ length: count * 9 }, (_, i) => stl.readFloatLE(84 + Math.floor(i / 9) * 50 + 12 + i % 9 * 4));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
}

test('Rust part outlines match three.js EdgesGeometry for indexed, non-indexed and CAD meshes', () => {
    const shapes = [
        ['box', new THREE.BoxGeometry(40, 30, 20, 3, 2, 2)],
        ['sphere', new THREE.SphereGeometry(18, 32, 16)],
        ['torus knot', new THREE.TorusKnotGeometry(14, 4, 128, 16)],
        ['cylinder', new THREE.CylinderGeometry(8, 12, 40, 24, 3)],
        ['non-indexed sphere', new THREE.SphereGeometry(10, 20, 12).toNonIndexed()],
        ['robot link STL', stlGeometry('IR-R10H-120/P2.stl')]
    ];
    let edges = 0;
    for (const [name, geometry] of shapes) {
        for (const angle of [1, 28, 60, 90]) edges += same(`${name} at ${angle}°`, geometry, angle);
    }
    assert.ok(edges > 1000);

    // Interleaved attributes, a third face on one edge, duplicate and degenerate triangles.
    const interleaved = new THREE.InterleavedBuffer(new Float32Array([
        0, 0, 0, 9, 10, 0, 0, 9, 0, 10, 0, 9, 0, 10, 0, 9, 0, 0, 10, 9, 0, 0, 5, 9
    ]), 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
    geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 4, 0, 1, 2, 1, 1, 3, 2, 5, 0]);
    same('interleaved fan with a shared edge and duplicates', geometry, 28);
});

test('input three.js handles differently falls back to EdgesGeometry', () => {
    const broken = new THREE.SphereGeometry(10, 8, 6);
    broken.getAttribute('position').setXYZ(1, NaN, 0, 0);
    assert.equal(geometryEdges(broken.getAttribute('position'), broken.getIndex(), 28), null);
    const outside = new THREE.BufferGeometry();
    outside.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    outside.setIndex([0, 1, 7]);
    assert.equal(geometryEdges(outside.getAttribute('position'), outside.getIndex(), 28), null);
    const partial = new THREE.BufferGeometry();
    partial.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
    assert.equal(geometryEdges(partial.getAttribute('position'), null, 28), null);
});
