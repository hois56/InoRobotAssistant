export const CAD_DWG_BRIDGE_DEFAULT_URL = 'http://127.0.0.1:8767';

function cadError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

export async function checkDwgConverterHealth(baseUrl = CAD_DWG_BRIDGE_DEFAULT_URL, timeoutMs = 1200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${String(baseUrl).replace(/\/$/, '')}/health`, {
            method: 'GET',
            signal: controller.signal,
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) return { available: false, status: response.status };
        const payload = await response.json().catch(() => ({}));
        return { available: payload.ready !== false, version: String(payload.version || '') };
    } catch (_) {
        return { available: false, version: '' };
    } finally {
        clearTimeout(timer);
    }
}

export async function convertDwgFile(file, options = {}) {
    const baseUrl = options.baseUrl || CAD_DWG_BRIDGE_DEFAULT_URL;
    const health = await checkDwgConverterHealth(baseUrl, options.timeoutMs || 1200);
    if (!health.available) {
        throw cadError(
            'CAD_DWG_CONVERTER_UNAVAILABLE',
            'DWG 변환기를 찾을 수 없습니다. 로컬 CAD 변환 브리지를 실행한 뒤 다시 시도해 주세요.'
        );
    }
    let response;
    try {
        response = await fetch(`${String(baseUrl).replace(/\/$/, '')}/convert/dwg`, {
            method: 'POST',
            headers: {
                'Content-Type': file?.type || 'application/acad',
                'X-CAD-Filename': encodeURIComponent(file?.name || 'drawing.dwg'),
                'X-CAD-Unit-Override': String(options.unitOverride || 'auto')
            },
            body: await file.arrayBuffer(),
            signal: AbortSignal.timeout(options.timeoutMs || 120000)
        });
    } catch (_) {
        throw cadError('CAD_DWG_CONVERTER_UNAVAILABLE', 'DWG 변환 브리지와 통신할 수 없습니다.');
    }
    if (!response.ok) {
        throw cadError('CAD_DWG_VERSION_UNSUPPORTED', `DWG 변환에 실패했습니다. HTTP ${response.status}.`);
    }
    const payload = await response.json().catch(() => null);
    if (!payload?.document && !payload?.cad2d) {
        throw cadError('CAD_DWG_VERSION_UNSUPPORTED', 'DWG 변환 브리지가 CAD2D 문서를 반환하지 않았습니다.');
    }
    return payload.document || payload.cad2d;
}
