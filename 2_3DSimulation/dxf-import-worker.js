import { parseDxfBuffer } from './dxf-parser-core.mjs?v=20260907-cad-dxf-3';

self.addEventListener('message', async (event) => {
    const payload = event.data || {};
    if (payload.type !== 'parse') return;
    const requestId = payload.requestId;
    try {
        self.postMessage({ type: 'progress', requestId, phase: 'DXF group records', percent: 20 });
        const document = await parseDxfBuffer(payload.buffer, payload.options || {});
        self.postMessage({ type: 'progress', requestId, phase: 'CAD geometry', percent: 90 });
        self.postMessage({ type: 'success', requestId, document });
    } catch (error) {
        self.postMessage({
            type: 'error',
            requestId,
            code: error?.code || 'CAD_DXF_PARSE_FAILED',
            message: error?.message || 'DXF parsing failed.'
        });
    }
});
