// Compatibility endpoint for pages cached before downloads became public.
// Current pages link directly to GitHub Releases and public PDF files.
const RELEASE_BASE = 'https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/';
const RAW_BASE = 'https://raw.githubusercontent.com/hois56/InoRobotAssistant/main/6_Document/';
const PUBLIC_ASSETS = {
    'software.inorobotlab.display.install': { folder: 'Software', path: 'InoRobotLab/Display/InoRobotLabSetUp_V4R24C4SPC0L23F121_x64.exe' },
    'software.inorobotlab.display.portable': { folder: 'Software', path: 'InoRobotLab/Display/InoRobotLab_V4R24C4SPC0L23F121_x64.zip' },
    'software.inorobottp.display.portable': { folder: 'Software', path: 'InoRobotTP/Display/InoRobotTP_win_x86_V4R24C4SPC0L23F121.zip' },
    'document.edu.display.1': { folder: '6_Document', path: '교육 자료/입문과정/Display/1.로봇 소개(Display).pdf' },
    'document.edu.display.2': { folder: '6_Document', path: '교육 자료/입문과정/Display/2.로봇 기초(Display).pdf' },
    'document.edu.display.3': { folder: '6_Document', path: '교육 자료/입문과정/Display/3.로봇 구조 및 초기 배선(Display).pdf' }
};
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length',
    'Access-Control-Max-Age': '86400'
};

export default {
    async fetch(request) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
        if (Number(request.headers.get('Content-Length') || 0) > 8192) return json({ ok: false }, 413);
        let body;
        try {
            const text = await request.text();
            if (text.length > 8192) return json({ ok: false }, 413);
            body = JSON.parse(text);
        } catch {
            return json({ ok: false, message: 'Invalid request.' }, 400);
        }
        const asset = (typeof body?.assetId === 'string' && PUBLIC_ASSETS[body.assetId])
            || Object.values(PUBLIC_ASSETS).find(asset => asset.folder === (body?.folder || 'Software') && asset.path === body?.path);
        if (!asset || typeof asset.path !== 'string') return json({ ok: false, message: 'File not found.' }, 404);
        const fileName = asset.path.split('/').pop();
        if (asset.folder === 'Software') return json({ ok: true, url: RELEASE_BASE + encodeURIComponent(fileName) });
        const url = RAW_BASE + asset.path.split('/').map(encodeURIComponent).join('/');
        const response = await fetch(url);
        if (!response.ok) return json({ ok: false, message: 'File not found.' }, 404);
        return new Response(response.body, {
            headers: {
                ...CORS_HEADERS,
                'Cache-Control': 'no-store',
                'Content-Type': 'application/pdf',
                'Content-Disposition': `${body?.mode === 'view' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
                ...(response.headers.has('Content-Length') ? { 'Content-Length': response.headers.get('Content-Length') } : {})
            }
        });
    }
};

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
