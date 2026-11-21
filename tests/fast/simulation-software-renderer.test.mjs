import test from 'node:test';
import assert from 'node:assert/strict';
import { usesSoftwareRasterizer, renderPacedSoftwareFrame, RenderFrameLimit } from '../../2_3DSimulation/software-renderer.mjs';

function renderer(name, debug = true) {
    const gl = { RENDERER: 7937, getExtension: () => debug ? { UNMASKED_RENDERER_WEBGL: 37446 } : null,
        getParameter: () => name };
    return { getContext: () => gl };
}

test('The optional 60 FPS cap follows both 60 Hz and high-refresh clocks', () => {
    for (const hz of [60, 90, 120, 144, 165, 240]) {
        const limit = new RenderFrameLimit();
        const drawn = Array.from({length: 10 * hz}, (_, i) => i * 1000 / hz)
            .filter(timestamp => limit.permits(Math.round(timestamp * 10) / 10));
        assert.ok(drawn.length >= 599 && drawn.length <= 600, `${hz} Hz rendered ${drawn.length} frames`);
        assert.equal(limit.permits(drawn.at(-1)), false);
        limit.reset();
        assert.equal(limit.permits(0), true);
    }
});

test('The software renderer can draw without an artificial rest interval', () => {
    const cpu = renderer('SwiftShader');
    assert.equal(renderPacedSoftwareFrame(cpu, () => {}, () => 0, 0), true);
    assert.equal(renderPacedSoftwareFrame(cpu, () => {}, () => 5, 0), true);
});

test('VM CPU rasterizers request the existing reduced rendering mode', () => {
    for (const name of [
        'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11)',
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
        'llvmpipe (LLVM 15.0.6, 256 bits)', 'softpipe'
    ]) assert.equal(usesSoftwareRasterizer(renderer(name)), true, name);
});

test('Hardware and unavailable debug information preserve normal rendering', () => {
    for (const name of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)',
        'ANGLE (Intel, Intel UHD Graphics 770)', 'AMD Radeon RX 7900', 'WebKit WebGL']) {
        assert.equal(usesSoftwareRasterizer(renderer(name)), false, name);
    }
    assert.equal(usesSoftwareRasterizer(renderer('WebKit WebGL', false)), false);
    assert.equal(usesSoftwareRasterizer({ getContext() { throw Error('context lost'); } }), false);
});

test('A slow CPU paint leaves a gap after completion for UI and encoder timers', () => {
    const cpu = renderer('SwiftShader');
    let now = 0, paints = 0;
    const paint = () => { paints++; now += 350; };
    assert.equal(renderPacedSoftwareFrame(cpu, paint, () => now), true);
    for (now = 350; now < 500; now += 10) {
        assert.equal(renderPacedSoftwareFrame(cpu, paint, () => now), false);
    }
    assert.equal(paints, 1);
    assert.equal(renderPacedSoftwareFrame(cpu, paint, () => now), true);
    assert.equal(paints, 2);
});

test('CPU windows have separate paint budgets and GPU feedback paints immediately', () => {
    const first = renderer('SwiftShader'), second = renderer('llvmpipe');
    const gpu = renderer('NVIDIA');
    const paint = () => {};
    assert.equal(renderPacedSoftwareFrame(first, paint, () => 0), true);
    assert.equal(renderPacedSoftwareFrame(first, paint, () => 1), false);
    assert.equal(renderPacedSoftwareFrame(second, paint, () => 1), true);
    for (let now = 0; now < 10; now++) assert.equal(renderPacedSoftwareFrame(gpu, paint, () => now), true);
});

test('A busy software GPU keeps UI polling nonblocking instead of queuing more paints', () => {
    let complete = false, paints = 0, deleted = 0, flushed = 0;
    const sync = {};
    const gl = { RENDERER: 7937, getExtension: () => null, getParameter: () => 'SwiftShader',
        SYNC_GPU_COMMANDS_COMPLETE: 37143, TIMEOUT_EXPIRED: 37147,
        fenceSync: () => sync, flush: () => flushed++, deleteSync: value => { assert.equal(value, sync); deleted++; },
        clientWaitSync(value, flags, timeout) {
            assert.equal(value, sync); assert.equal(flags, 0); assert.equal(timeout, 0);
            return complete ? 37148 : 37147;
        } };
    const cpu = { getContext: () => gl };
    const paint = () => paints++;
    assert.equal(renderPacedSoftwareFrame(cpu, paint, () => 0), true);
    for (let now = 150; now < 2000; now += 50) assert.equal(renderPacedSoftwareFrame(cpu, paint, () => now), false);
    assert.equal(paints, 1); assert.equal(flushed, 1); assert.equal(deleted, 0);
    complete = true;
    assert.equal(renderPacedSoftwareFrame(cpu, paint, () => 2000), true);
    assert.equal(paints, 2); assert.equal(deleted, 1); assert.equal(flushed, 2);
});
