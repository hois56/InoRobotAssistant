const VISITOR_START_COUNT = 1800;
const VISITOR_WINDOW_SECONDS = 5 * 60;
const VISITOR_TOTAL_KEY = 'visitor:total';
const VISITOR_SEEN_PREFIX = 'visitor:seen:';

export default {
    async fetch(request, env) {
        const origin = getAllowedOrigin(request, env);

        if (request.method === 'OPTIONS') {
            if (!origin) return new Response('Forbidden', { status: 403 });
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        return handleVisit(request, env, origin);
    }
};

function getAllowedOrigin(request, env) {
    const requestOrigin = request.headers.get('Origin');
    if (!requestOrigin) return null;

    const allowedOrigins = String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim().replace(/\/$/, ''))
        .filter(Boolean);

    return allowedOrigins.includes(requestOrigin.replace(/\/$/, '')) ? requestOrigin : null;
}

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

async function handleVisit(request, env, origin) {
    if (!origin) return json({ ok: false, message: 'Request origin is not allowed.' }, 403);
    if (request.method !== 'GET' && request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });
    }

    const store = env.VISITOR_KV;
    if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') {
        return json({ ok: false, total: VISITOR_START_COUNT, counted: false }, 503, origin);
    }

    const currentTotal = await getCurrentTotal(store);
    if (request.method === 'GET') {
        return json({ ok: true, total: currentTotal, counted: false, deduped: false }, 200, origin);
    }

    const visitorHash = await getVisitorHash(request);
    const seenKey = `${VISITOR_SEEN_PREFIX}${visitorHash}`;
    if (await store.get(seenKey)) {
        return json({ ok: true, total: currentTotal, counted: false, deduped: true }, 200, origin);
    }

    const nextTotal = currentTotal + 1;
    await store.put(VISITOR_TOTAL_KEY, String(nextTotal));
    await store.put(seenKey, String(Date.now()), { expirationTtl: VISITOR_WINDOW_SECONDS });
    return json({ ok: true, total: nextTotal, counted: true, deduped: false }, 200, origin);
}

async function getCurrentTotal(store) {
    const storedTotal = await store.get(VISITOR_TOTAL_KEY);
    const parsedTotal = Number.parseInt(storedTotal || '', 10);
    return Number.isFinite(parsedTotal) ? Math.max(VISITOR_START_COUNT, parsedTotal) : VISITOR_START_COUNT;
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

function json(data, status = 200, origin = null) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...(origin ? corsHeaders(origin) : {})
        }
    });
}
