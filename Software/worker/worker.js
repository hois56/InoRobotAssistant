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
        // CORS preflight
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

        // 환경변수에서 비밀번호 검증 (코드에 비밀번호 없음)
        if (password !== env.DISPLAY_PASSWORD) {
            return json({ ok: false, message: '비밀번호가 올바르지 않습니다.' }, 401);
        }

        // 경로 검증 (path traversal 방지)
        const safeFolder = (folder || 'Software').replace(/\.\./g, '').replace(/^\/+/, '');
        const safePath = path.replace(/\.\./g, '').replace(/^\/+/, '');
        const encodedPath = safePath.split('/').map(seg => encodeURIComponent(seg)).join('/');

        let downloadUrl;
        if (safeFolder === 'Software') {
            // Software(exe/zip): LFS → media.githubusercontent.com
            downloadUrl = `https://media.githubusercontent.com/media/hois56/InoRobotAssistant/main/Software/${encodedPath}`;
        } else if (mode === 'view') {
            // 미리보기: GitHub blob 뷰어 (브라우저 내 인라인 PDF 표시)
            downloadUrl = `https://github.com/hois56/InoRobotAssistant/blob/main/${safeFolder}/${encodedPath}`;
        } else {
            // 다운로드: raw URL
            downloadUrl = `https://raw.githubusercontent.com/hois56/InoRobotAssistant/main/${safeFolder}/${encodedPath}`;
        }

        return json({ ok: true, url: downloadUrl });
    }
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}
