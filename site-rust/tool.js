// Tool Selector adapter for its Rust computations (site-rust/src/edges.rs).
// Only the Tool Selector loads this module, so other pages stay lighter.
let instance;
function wasm() {
    if (!instance) {
        const encoded = '__SITE_WASM__';
        const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(encoded)
            : Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        instance = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
    }
    return instance;
}

// Segment end points of `new THREE.EdgesGeometry(geometry, thresholdAngle)`
// from its position and index attributes, or null for input left to three.js.
export function geometryEdges(position, index, thresholdAngle = 1) {
    if (!position || position.itemSize !== 3) return null;
    const count = position.count;
    const indexCount = index ? index.count : count;
    if (!Number.isInteger(count) || !Number.isInteger(indexCount) || indexCount % 3) return null;
    const e = wasm();
    // Reserving can grow the memory, so take each view after its call.
    const positionAddress = e.edge_positions(count * 3);
    const positions = new Float64Array(e.memory.buffer, positionAddress, count * 3);
    if (!position.isInterleavedBufferAttribute && !position.normalized && ArrayBuffer.isView(position.array)) {
        positions.set(position.array.subarray(0, count * 3));
    } else {
        for (let vertex = 0; vertex < count; vertex++) {
            positions[vertex * 3] = position.getX(vertex);
            positions[vertex * 3 + 1] = position.getY(vertex);
            positions[vertex * 3 + 2] = position.getZ(vertex);
        }
    }
    if (index) {
        const address = e.edge_indices(indexCount);
        const indices = new Uint32Array(e.memory.buffer, address, indexCount);
        for (let i = 0; i < indexCount; i++) {
            const value = index.getX(i);
            if (!Number.isInteger(value) || value < 0) {
                e.edge_release();
                return null;
            }
            indices[i] = value;
        }
    }
    try {
        // EdgesGeometry compares normals with cos(DEG2RAD * thresholdAngle).
        const length = e.edge_build(index ? 1 : 0, indexCount, Math.cos(Math.PI / 180 * thresholdAngle));
        return length < 0 ? null : new Float32Array(new Float64Array(e.memory.buffer, e.edge_lines(), length));
    } finally {
        e.edge_release();
    }
}
