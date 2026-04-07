/**
 * Cloudflare Worker - Display Version Password Verification
 *
 * Environment Variables (Cloudflare Dashboard > Workers > Settings > Variables):
 *   DISPLAY_PASSWORD = "2206"  (또는 원하는 비밀번호로 변경)
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ ok: false, message: '잘못된 요청입니다.' }, 400);
        }

        const { password, path, folder, mode } = body;

        if (!password || !path) {
            return json({ ok: false, message: '필수 항목이 누락되었습니다.' }, 400);
        }

        if (password !== env.DISPLAY_PASSWORD) {
            return json({ ok: false, message: '비밀번호가 올바르지 않습니다.' }, 401);
        }

        const safeFolder = (folder || 'Software').replace(/\.\./g, '').replace(/^\/+/, '');
        const safePath = path.replace(/\.\./g, '').replace(/^\/+/, '');
        const encodedPath = safePath.split('/').map(seg => encodeURIComponent(seg)).join('/');

        if (safeFolder === 'Software') {
            // Software(exe/zip): LFS → URL 반환
            const downloadUrl = `https://media.githubusercontent.com/media/hois56/InoRobotAssistant/main/Software/${encodedPath}`;
            return json({ ok: true, url: downloadUrl });
        }

        // Manual PDF: raw URL로 파일 가져오기
        const rawUrl = `https://raw.githubusercontent.com/hois56/InoRobotAssistant/main/${safeFolder}/${encodedPath}`;
        const fileRes = await fetch(rawUrl);

        if (!fileRes.ok) {
            return json({ ok: false, message: '파일을 찾을 수 없습니다.' }, 404);
        }

        const fileName = safePath.split('/').pop();
        const disposition = mode === 'view'
            ? `inline; filename="${fileName}"`
            : `attachment; filename="${fileName}"`;

        return new Response(fileRes.body, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': disposition,
                ...CORS_HEADERS,
            }
        });
    }
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}
