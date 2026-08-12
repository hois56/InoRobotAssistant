const VISITOR_START_COUNT = 1800;
const VISITOR_MIGRATION_FLOOR = 2031;
const VISITOR_WINDOW_SECONDS = 5 * 60;
const VISITOR_IP_WINDOW_LIMIT = 10;
const VISITOR_TOTAL_KEY = 'visitor:total';
const VISITOR_SEEN_PREFIX = 'visitor:seen:';
const VISITOR_COUNTER_OBJECT_NAME = 'site-total-v1';

export default {
    async fetch(request, env) {
        const origin = getAllowedOrigin(request, env);
        const url = new URL(request.url);

        if (url.pathname !== '/visit') {
            return json({ ok: false, message: 'Not Found' }, 404, origin);
        }

        if (request.method === 'OPTIONS') {
            if (!origin) return new Response('Forbidden', { status: 403 });
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        if (!origin) return json({ ok: false, message: 'Request origin is not allowed.' }, 403);
        if (request.method !== 'GET' && request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });
        }
        if (!env.VISITOR_COUNTER) {
            return json({ ok: false, total: await getLegacyTotal(env), counted: false }, 503, origin);
        }

        try {
            const stub = getCounterStub(env.VISITOR_COUNTER);
            const identity = request.method === 'POST'
                ? await getVisitorIdentity(request, env)
                : null;
            const payload = identity
                ? {
                    action: 'visit',
                    visitorHash: identity.visitorHash,
                    ipHash: identity.ipHash,
                    legacySeenUntil: await getLegacySeenUntil(env, identity.legacyHash)
                }
                : { action: 'read' };
            const response = await stub.fetch('https://visitor-counter.internal/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (identity && result?.ok) {
                await markLegacySeen(env, identity.legacyHash);
            }
            return json(result, response.status, origin);
        } catch (error) {
            console.error('visitor-counter-request-failed', {
                message: error?.message || String(error)
            });
            return json({ ok: false, total: await getLegacyTotal(env), counted: false }, 503, origin);
        }
    }
};

export class VisitorCounter {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sql = state.storage.sql;

        state.blockConcurrencyWhile(async () => {
            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS counter_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    total INTEGER NOT NULL,
                    legacy_imported_total INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS seen_visitors (
                    visitor_hash TEXT PRIMARY KEY,
                    ip_hash TEXT NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS seen_visitors_expires_at_idx
                    ON seen_visitors (expires_at);
                CREATE INDEX IF NOT EXISTS seen_visitors_ip_expires_at_idx
                    ON seen_visitors (ip_hash, expires_at);
            `);

            const legacyTotal = await getLegacyTotal(env);
            const now = Date.now();
            state.storage.transactionSync(() => {
                const current = this.getState();
                if (!current) {
                    this.sql.exec(
                        `INSERT INTO counter_state
                            (id, total, legacy_imported_total, created_at, updated_at)
                         VALUES (1, ?, ?, ?, ?)`,
                        legacyTotal,
                        legacyTotal,
                        now,
                        now
                    );
                } else {
                    this.reconcileLegacyTotal(current, legacyTotal, now);
                }
            });
        });
    }

    async fetch(request) {
        if (request.method !== 'POST') {
            return json({ ok: false, message: 'Method Not Allowed' }, 405);
        }

        const payload = await request.json().catch(() => null);
        if (!payload || (payload.action !== 'read' && payload.action !== 'visit')) {
            return json({ ok: false, message: 'Invalid counter action.' }, 400);
        }
        if (payload.action === 'visit'
            && (!isValidHash(payload.visitorHash) || !isValidHash(payload.ipHash))) {
            return json({ ok: false, message: 'Invalid visitor hash.' }, 400);
        }

        const legacyTotal = await getLegacyTotal(this.env);
        const now = Date.now();
        const result = this.state.storage.transactionSync(() => {
            let current = this.getState();
            if (!current) {
                this.sql.exec(
                    `INSERT INTO counter_state
                        (id, total, legacy_imported_total, created_at, updated_at)
                     VALUES (1, ?, ?, ?, ?)`,
                    legacyTotal,
                    legacyTotal,
                    now,
                    now
                );
                current = this.getState();
            }

            current = this.reconcileLegacyTotal(current, legacyTotal, now);
            if (payload.action === 'read') {
                return { ok: true, total: current.total, counted: false, deduped: false };
            }

            this.sql.exec('DELETE FROM seen_visitors WHERE expires_at <= ?', now);
            const seen = this.sql.exec(
                'SELECT expires_at FROM seen_visitors WHERE visitor_hash = ?',
                payload.visitorHash
            ).toArray()[0] || null;
            if (seen && Number(seen.expires_at) > now) {
                return {
                    ok: true,
                    total: current.total,
                    counted: false,
                    deduped: true,
                    rateLimited: false
                };
            }

            const legacySeenUntil = Math.min(
                toInteger(payload.legacySeenUntil, 0),
                now + (VISITOR_WINDOW_SECONDS * 1000)
            );
            if (legacySeenUntil > now) {
                this.sql.exec(
                    `INSERT INTO seen_visitors (visitor_hash, ip_hash, expires_at)
                     VALUES (?, ?, ?)
                     ON CONFLICT(visitor_hash) DO UPDATE SET
                        ip_hash = excluded.ip_hash,
                        expires_at = MAX(seen_visitors.expires_at, excluded.expires_at)`,
                    payload.visitorHash,
                    payload.ipHash,
                    legacySeenUntil
                );
                return {
                    ok: true,
                    total: current.total,
                    counted: false,
                    deduped: true,
                    rateLimited: false
                };
            }

            const activeForIp = this.sql.exec(
                `SELECT COUNT(*) AS active_count
                 FROM seen_visitors
                 WHERE ip_hash = ? AND expires_at > ?`,
                payload.ipHash,
                now
            ).toArray()[0] || { active_count: 0 };
            if (toInteger(activeForIp?.active_count, 0) >= VISITOR_IP_WINDOW_LIMIT) {
                return {
                    ok: true,
                    total: current.total,
                    counted: false,
                    deduped: false,
                    rateLimited: true
                };
            }

            const nextTotal = current.total + 1;
            const expiresAt = now + (VISITOR_WINDOW_SECONDS * 1000);
            this.sql.exec(
                `INSERT INTO seen_visitors (visitor_hash, ip_hash, expires_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(visitor_hash) DO UPDATE SET
                    ip_hash = excluded.ip_hash,
                    expires_at = excluded.expires_at`,
                payload.visitorHash,
                payload.ipHash,
                expiresAt
            );
            this.sql.exec(
                'UPDATE counter_state SET total = ?, updated_at = ? WHERE id = 1',
                nextTotal,
                now
            );
            return {
                ok: true,
                total: nextTotal,
                counted: true,
                deduped: false,
                rateLimited: false
            };
        });

        return json(result);
    }

    getState() {
        const row = this.sql.exec(
            'SELECT total, legacy_imported_total FROM counter_state WHERE id = 1'
        ).toArray()[0] || null;
        if (!row) return null;
        return {
            total: Math.max(VISITOR_MIGRATION_FLOOR, toInteger(row.total, VISITOR_MIGRATION_FLOOR)),
            legacyImportedTotal: Math.max(0, toInteger(row.legacy_imported_total, 0))
        };
    }

    reconcileLegacyTotal(current, legacyTotal, now) {
        if (legacyTotal <= current.legacyImportedTotal) return current;

        const delta = legacyTotal - current.legacyImportedTotal;
        const total = current.total + delta;
        this.sql.exec(
            `UPDATE counter_state
             SET total = ?, legacy_imported_total = ?, updated_at = ?
             WHERE id = 1`,
            total,
            legacyTotal,
            now
        );
        return { total, legacyImportedTotal: legacyTotal };
    }
}

function getCounterStub(namespace) {
    if (typeof namespace.getByName === 'function') {
        return namespace.getByName(VISITOR_COUNTER_OBJECT_NAME);
    }
    return namespace.get(namespace.idFromName(VISITOR_COUNTER_OBJECT_NAME));
}

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

async function getLegacyTotal(env) {
    let storedTotal = null;
    try {
        if (env.VISITOR_KV && typeof env.VISITOR_KV.get === 'function') {
            storedTotal = await env.VISITOR_KV.get(VISITOR_TOTAL_KEY);
        }
    } catch (error) {
        console.warn('visitor-counter-legacy-total-read-failed', {
            message: error?.message || String(error)
        });
    }
    return Math.max(
        VISITOR_START_COUNT,
        VISITOR_MIGRATION_FLOOR,
        toInteger(storedTotal, VISITOR_MIGRATION_FLOOR)
    );
}

async function getVisitorIdentity(request, env) {
    const secret = String(env.VISITOR_HASH_SECRET || '').trim();
    if (!secret) throw new Error('VISITOR_HASH_SECRET is not configured.');

    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
        || 'unknown-ip';
    const userAgent = request.headers.get('User-Agent') || 'unknown-agent';
    const language = request.headers.get('Accept-Language') || 'unknown-language';
    const fingerprint = `${ip}|${userAgent}|${language}`;
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const [visitorHash, ipHash, legacyHash] = await Promise.all([
        hmacHex(key, `visitor\0${fingerprint}`),
        hmacHex(key, `ip\0${ip}`),
        sha256Hex(fingerprint)
    ]);
    return { visitorHash, ipHash, legacyHash };
}

async function getLegacySeenUntil(env, legacyHash) {
    try {
        if (!env.VISITOR_KV || typeof env.VISITOR_KV.get !== 'function') return 0;
        const seenAt = toInteger(
            await env.VISITOR_KV.get(`${VISITOR_SEEN_PREFIX}${legacyHash}`),
            0
        );
        return seenAt > 0 ? seenAt + (VISITOR_WINDOW_SECONDS * 1000) : 0;
    } catch (error) {
        console.warn('visitor-counter-legacy-seen-read-failed', {
            message: error?.message || String(error)
        });
        return 0;
    }
}

async function markLegacySeen(env, legacyHash) {
    try {
        if (!env.VISITOR_KV || typeof env.VISITOR_KV.put !== 'function') return;
        await env.VISITOR_KV.put(
            `${VISITOR_SEEN_PREFIX}${legacyHash}`,
            String(Date.now()),
            { expirationTtl: VISITOR_WINDOW_SECONDS }
        );
    } catch (error) {
        console.warn('visitor-counter-legacy-seen-write-failed', {
            message: error?.message || String(error)
        });
    }
}

async function hmacHex(key, value) {
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return bytesToHex(digest);
}

async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return bytesToHex(digest);
}

function bytesToHex(value) {
    return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function isValidHash(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function toInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
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
