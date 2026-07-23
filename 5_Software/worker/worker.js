/**
 * Cloudflare Worker
 * - Password-gated download URL helper
 *
 * Required bindings:
 * - DISPLAY_PASSWORD: secret text variable for locked downloads
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

export default {
    async fetch(request, env) {
        try {
            if (request.method === 'OPTIONS') {
                return new Response(null, { status: 204, headers: CORS_HEADERS });
            }

            return handleDownloadRequest(request, env);
        } catch (error) {
            return json({
                ok: false,
                message: error instanceof Error ? error.message : 'Worker runtime error.'
            }, 500);
        }
    }
};

async function handleDownloadRequest(request, env) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, message: 'Invalid request.' }, 400);
    }

    const { password, path, folder, mode } = body;

    if (!password || !path) {
        return json({ ok: false, message: 'Missing required fields.' }, 400);
    }

    if (password !== env.DISPLAY_PASSWORD) {
        return json({ ok: false, message: 'Invalid password.' }, 401);
    }

    const safeFolder = (folder || 'Software').replace(/\.\./g, '').replace(/^\/+/, '');
    const safePath = path.replace(/\.\./g, '').replace(/^\/+/, '');
    const encodedPath = safePath.split('/').map(seg => encodeURIComponent(seg)).join('/');

    if (safeFolder === 'Software') {
        const downloadUrl = `https://media.githubusercontent.com/media/hois56/InoRobotAssistant/main/5_Software/${encodedPath}`;
        return json({ ok: true, url: downloadUrl });
    }

    const rawUrl = `https://raw.githubusercontent.com/hois56/InoRobotAssistant/main/${safeFolder}/${encodedPath}`;
    const fileRes = await fetch(rawUrl);

    if (!fileRes.ok) {
        return json({ ok: false, message: 'File not found.' }, 404);
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

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}
