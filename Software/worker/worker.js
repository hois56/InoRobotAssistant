/**
 * Cloudflare Worker
 * - Password-gated download URL helper
 * - Main-site visitor counter with 5-minute duplicate suppression
 *
 * Required bindings:
 * - DISPLAY_PASSWORD: secret text variable for locked downloads
 * - VISITOR_KV: Cloudflare KV namespace for visitor totals and short-lived seen keys
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

const VISITOR_START_COUNT = 721;
const VISITOR_WINDOW_SECONDS = 5 * 60;
const VISITOR_TOTAL_KEY = 'visitor:total';
const VISITOR_SEEN_PREFIX = 'visitor:seen:';

export default {
    async fetch(request, env) {
        try {
            if (request.method === 'OPTIONS') {
                return new Response(null, { status: 204, headers: CORS_HEADERS });
            }

            const url = new URL(request.url);
            if (url.pathname === '/visit' || url.pathname === '/visits') {
                return handleVisit(request, env);
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

async function handleVisit(request, env) {
    if (request.method !== 'GET' && request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    const store = env.VISITOR_KV;
    if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') {
        return json({
            ok: false,
            total: VISITOR_START_COUNT,
            counted: false,
            deduped: true,
            storage: 'missing-or-invalid-kv-binding',
            message: 'VISITOR_KV must be configured as a KV Namespace binding.'
        }, 500);
    }

    const currentTotal = await getCurrentTotal(store);

    if (request.method === 'GET') {
        return json({
            ok: true,
            total: currentTotal,
            counted: false,
            deduped: false
        });
    }

    const visitorHash = await getVisitorHash(request);
    const seenKey = `${VISITOR_SEEN_PREFIX}${visitorHash}`;
    const wasSeen = await store.get(seenKey);

    if (wasSeen) {
        return json({
            ok: true,
            total: currentTotal,
            counted: false,
            deduped: true
        });
    }

    const nextTotal = currentTotal + 1;
    await store.put(VISITOR_TOTAL_KEY, String(nextTotal));
    await store.put(seenKey, String(Date.now()), { expirationTtl: VISITOR_WINDOW_SECONDS });

    return json({
        ok: true,
        total: nextTotal,
        counted: true,
        deduped: false
    });
}

async function getCurrentTotal(store) {
    const storedTotal = await store.get(VISITOR_TOTAL_KEY);
    const parsedTotal = Number.parseInt(storedTotal || '', 10);

    if (!Number.isFinite(parsedTotal)) {
        return VISITOR_START_COUNT;
    }

    return Math.max(VISITOR_START_COUNT, parsedTotal);
}

async function getVisitorHash(request) {
    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
        || 'unknown-ip';
    const userAgent = request.headers.get('User-Agent') || 'unknown-agent';
    const language = request.headers.get('Accept-Language') || 'unknown-language';
    const source = `${ip}|${userAgent}|${language}`;
    const bytes = new TextEncoder().encode(source);
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

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
        const downloadUrl = `https://media.githubusercontent.com/media/hois56/InoRobotAssistant/main/Software/${encodedPath}`;
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
