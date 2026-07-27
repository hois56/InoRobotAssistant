/**
 * Cloudflare Worker
 *
 * Locked downloads are deliberately resolved from an allowlist and streamed
 * from the private R2 bucket. The client never supplies a repository path and
 * the worker never returns a public GitHub URL.
 *
 * Required bindings:
 * - DISPLAY_PASSWORD: secret text variable for locked downloads
 * - LOCKED_ASSETS: private R2 bucket containing the allowlisted release files
 * - ALLOWED_ORIGINS: comma-separated production origins
 */

const MAX_REQUEST_BYTES = 8 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

// R2 object keys are deployment configuration, not user input. Keep this
// table small and explicit so a new locked asset requires a reviewed change.
const LOCKED_ASSETS = Object.freeze({
    'software.inorobotlab.display.portable': {
        key: 'software/InoRobotLab/Display/InoRobotLab_V4R24C4SPC0L18F121_x64.zip',
        fileName: 'InoRobotLab_V4R24C4SPC0L18F121_x64.zip',
        contentType: 'application/zip'
    },
    'software.inorobottp.display.portable': {
        key: 'software/InoRobotTP/Display/InoRobotTP_win_x86_V4R24C4SPC0L18F121.zip',
        fileName: 'InoRobotTP_win_x86_V4R24C4SPC0L18F121.zip',
        contentType: 'application/zip'
    },
    'document.edu.display.1': {
        key: 'document/교육 자료/입문과정/Display/1.로봇 소개(Display).pdf',
        fileName: '1.로봇 소개(Display).pdf',
        contentType: 'application/pdf'
    },
    'document.edu.display.2': {
        key: 'document/교육 자료/입문과정/Display/2.로봇 기초(Display).pdf',
        fileName: '2.로봇 기초(Display).pdf',
        contentType: 'application/pdf'
    },
    'document.edu.display.3': {
        key: 'document/교육 자료/입문과정/Display/3.로봇 구조 및 초기 배선(Display).pdf',
        fileName: '3.로봇 구조 및 초기 배선(Display).pdf',
        contentType: 'application/pdf'
    }
});

// This is intentionally process-local. It is a backstop against bursts; the
// password and asset authorization remain authoritative and should be backed
// by a durable edge rate-limit product for multi-isolate enforcement.
const attemptsByClient = new Map();

export default {
    async fetch(request, env) {
        const requestId = crypto.randomUUID();
        try {
            const allowedOrigin = getAllowedOrigin(request, env);
            if (request.method === 'OPTIONS') {
                if (!allowedOrigin) return new Response('Forbidden', { status: 403 });
                return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
            }

            return await handleDownloadRequest(request, env, allowedOrigin, requestId);
        } catch (error) {
            console.error('download-worker-error', { requestId, name: error?.name || 'Error' });
            return json({ ok: false, message: 'The download service is temporarily unavailable.' }, 500);
        }
    }
};

function getConfiguredOrigins(env) {
    return String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim().replace(/\/$/, ''))
        .filter(Boolean);
}

function getAllowedOrigin(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin) return null;
    const origins = getConfiguredOrigins(env);
    return origins.includes(origin.replace(/\/$/, '')) ? origin : null;
}

function corsHeaders(origin) {
    return origin ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    } : {};
}

async function getVisitorHash(request) {
    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
        || 'unknown-ip';
    const userAgent = request.headers.get('User-Agent') || 'unknown-agent';
    const language = request.headers.get('Accept-Language') || 'unknown-language';
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${ip}|${userAgent}|${language}`)
    );
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function handleDownloadRequest(request, env, origin, requestId) {
    if (!origin) return json({ ok: false, message: 'Request origin is not allowed.' }, 403);
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });
    }
    if (!env.DISPLAY_PASSWORD || !env.LOCKED_ASSETS || typeof env.LOCKED_ASSETS.get !== 'function') {
        audit(requestId, null, 'configuration-missing');
        return json({ ok: false, message: 'Locked downloads are not configured.' }, 503, origin);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
        return json({ ok: false, message: 'Request is too large.' }, 413, origin);
    }

    let body;
    try {
        const raw = await request.text();
        if (raw.length > MAX_REQUEST_BYTES) throw new Error('request-too-large');
        body = JSON.parse(raw);
    } catch {
        return json({ ok: false, message: 'Invalid request.' }, 400, origin);
    }

    const assetId = typeof body?.assetId === 'string' ? body.assetId : '';
    const mode = body?.mode === 'view' ? 'view' : 'download';
    const asset = LOCKED_ASSETS[assetId];
    if (!asset) {
        audit(requestId, assetId, 'asset-rejected');
        return json({ ok: false, message: 'Requested asset is not available.' }, 404, origin);
    }

    const clientKey = await getVisitorHash(request);
    const rate = getRateState(clientKey);
    if (rate.blockedUntil > Date.now()) {
        audit(requestId, assetId, 'rate-limited');
        return json({ ok: false, message: 'Too many attempts. Try again later.' }, 429, origin, {
            'Retry-After': String(Math.ceil((rate.blockedUntil - Date.now()) / 1000))
        });
    }

    const passwordOk = await constantTimePasswordMatch(body?.password, env.DISPLAY_PASSWORD);
    if (!passwordOk) {
        rate.failures += 1;
        rate.lastAttemptAt = Date.now();
        if (rate.failures >= MAX_ATTEMPTS_PER_WINDOW) rate.blockedUntil = Date.now() + RATE_WINDOW_MS;
        audit(requestId, assetId, 'password-rejected');
        return json({ ok: false, message: 'Invalid password.' }, 401, origin);
    }
    attemptsByClient.delete(clientKey);

    const object = await env.LOCKED_ASSETS.get(asset.key);
    if (!object) {
        audit(requestId, assetId, 'asset-missing');
        return json({ ok: false, message: 'Requested asset is not configured.' }, 404, origin);
    }

    audit(requestId, assetId, 'streamed');
    const fileName = asset.fileName;
    const dispositionType = mode === 'view' ? 'inline' : 'attachment';
    return new Response(object.body, {
        status: 200,
        headers: {
            ...corsHeaders(origin),
            'Cache-Control': 'private, no-store',
            'Content-Type': object.httpMetadata?.contentType || asset.contentType,
            'Content-Length': String(object.size),
            'Content-Disposition': `${dispositionType}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            ...(object.httpEtag ? { ETag: object.httpEtag } : {})
        }
    });
}

function getRateState(clientKey) {
    const now = Date.now();
    const current = attemptsByClient.get(clientKey);
    if (!current || now - current.lastAttemptAt > RATE_WINDOW_MS) {
        const fresh = { failures: 0, lastAttemptAt: now, blockedUntil: 0 };
        attemptsByClient.set(clientKey, fresh);
        return fresh;
    }
    return current;
}

async function constantTimePasswordMatch(candidate, expected) {
    if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
    const [candidateDigest, expectedDigest] = await Promise.all([
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(candidate)),
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected))
    ]);
    const a = new Uint8Array(candidateDigest);
    const b = new Uint8Array(expectedDigest);
    let difference = a.length ^ b.length;
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        difference |= (a[index] || 0) ^ (b[index] || 0);
    }
    return difference === 0;
}

function audit(requestId, assetId, outcome) {
    console.info('locked-download', { requestId, assetId: assetId || null, outcome });
}

function json(data, status = 200, origin = null, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...corsHeaders(origin),
            ...extraHeaders
        }
    });
}
