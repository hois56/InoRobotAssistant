// Cache driver detection: querying GL parameters during animation can stall.
const drivers = new WeakMap();
const paintDeadlines = new WeakMap();
const paintFences = new WeakMap();

// Leave the UI/transport event loop time to run after a CPU WebGL paint.
// Measured from completion so a slow paint cannot immediately queue another.
export function renderPacedSoftwareFrame(renderer, draw, clock = () => performance.now()) {
    if (!usesSoftwareRasterizer(renderer)) { draw(); return true; }
    if (clock() < (paintDeadlines.get(renderer) ?? -Infinity)) return false;
    const gl = renderer.getContext();
    const previous = paintFences.get(renderer);
    if (previous) {
        // A zero timeout polls completion without blocking the UI thread.
        const status = gl.clientWaitSync(previous, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) return false;
        gl.deleteSync(previous);
        paintFences.delete(renderer);
    }
    try {
        draw();
        // Do not fill the software GPU queue with frames it cannot consume.
        if (typeof gl.fenceSync === 'function') {
            const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            if (fence) { paintFences.set(renderer, fence); gl.flush(); }
        }
    }
    finally { paintDeadlines.set(renderer, clock() + 150); }
    return true;
}

export function usesSoftwareRasterizer(renderer) {
    if (!renderer) return false;
    if (drivers.has(renderer)) return drivers.get(renderer);
    let software = false;
    try {
        const gl = renderer.getContext();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const name = gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
        software = /swiftshader|llvmpipe|softpipe|microsoft basic render driver/i.test(String(name));
    } catch {
        // A lost or restricted context provides no evidence to lower quality.
    }
    drivers.set(renderer, software);
    return software;
}
