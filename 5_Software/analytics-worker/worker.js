const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_ENDPOINT = 'https://sheets.googleapis.com/v4/spreadsheets';
const DAILY_DAYS_TO_REFRESH = 3;
const HISTORICAL_BACKFILL_DAYS = 180;
const HISTORICAL_BACKFILL_BATCH_DAYS = 30;
const BACKFILL_STATE_KEY = 'web_analytics_backfill';
const MAX_GROUPS = 10000;
const SERVICE_NAME = 'inorobot-analytics';
const RAW_PREFIX = 'web-analytics';
const RAW_PART_SIZE = 180000;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health') {
            return json({ ok: true, service: SERVICE_NAME });
        }
        if (url.pathname === '/analytics.csv') {
            return await handleAnalyticsCsv(env, url);
        }

        return json({ ok: false, message: 'Not Found' }, 404);
    },

    async scheduled(controller, env) {
        validateEnvironment(env);
        await ensureSyncStateTable(env);

        const referenceDate = new Date(controller.scheduledTime || Date.now());
        const plan = await getCollectionPlan(referenceDate, env);

        for (const date of plan.dates) {
            const result = await collectDate(date, env);
            console.info('analytics-sync-complete', result);
        }

        if (googleSheetsConfigured(env)) {
            try {
                const result = await syncGoogleSheet(env);
                console.info('google-sheets-sync-complete', result);
            } catch (error) {
                console.error('google-sheets-sync-failed', { message: error?.message || String(error) });
                throw error;
                }
        } else {
            console.info('google-sheets-sync-skipped', {
                missing: ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'GOOGLE_SHEETS_ID']
                    .filter(name => !env[name])
            });
        }

        if (plan.backfill) {
            await saveBackfillState(env, plan.complete ? 'done' : plan.nextCursor);
            console.info('analytics-backfill-progress', {
                dates: plan.dates.length,
                nextCursor: plan.complete ? 'done' : plan.nextCursor,
                complete: plan.complete
            });
        }
    }
};

function validateEnvironment(env) {
    const required = [
        ['ANALYTICS_DB', env.ANALYTICS_DB],
        ['CLOUDFLARE_API_TOKEN', env.CLOUDFLARE_API_TOKEN],
        ['CLOUDFLARE_ACCOUNT_TAG', env.CLOUDFLARE_ACCOUNT_TAG],
        ['WEB_ANALYTICS_HOST', env.WEB_ANALYTICS_HOST]
    ];

    const missing = required
        .filter(([, value]) => !value || (typeof value === 'string' && !value.trim()))
        .map(([name]) => name);

    if (missing.length > 0) {
        throw new Error(`Missing analytics configuration: ${missing.join(', ')}`);
    }
}

async function collectDate(date, env) {
    const start = `${date}T00:00:00Z`;
    const end = `${formatDate(addUtcDays(new Date(`${date}T00:00:00Z`), 1))}T00:00:00Z`;
    const collectedAt = new Date().toISOString();
    const archive = await queryRawAnalytics({
        accountTag: env.CLOUDFLARE_ACCOUNT_TAG,
        host: env.WEB_ANALYTICS_HOST,
        start,
        end,
        token: env.CLOUDFLARE_API_TOKEN
    });

    const pageLoads = archive.data?.viewer?.accounts?.[0]?.pageloads || [];
    const row = {
        date,
        host: env.WEB_ANALYTICS_HOST,
        pageViews: pageLoads.reduce((total, group) => total + toCount(group?.count), 0),
        referrerVisits: pageLoads.reduce((total, group) => total + toCount(group?.sum?.visits), 0),
        sampleInterval: average(pageLoads.map(group => group?.avg?.sampleInterval)),
        sourceWindowStart: start,
        sourceWindowEnd: end,
        collectedAt
    };

    const objectKey = `${RAW_PREFIX}/date=${date}/host=${safeObjectPart(env.WEB_ANALYTICS_HOST)}.json`;
    const rawDocument = {
        schemaVersion: 2,
        service: SERVICE_NAME,
        collectedAt,
        source: {
            accountTag: env.CLOUDFLARE_ACCOUNT_TAG,
            host: env.WEB_ANALYTICS_HOST,
            windowStart: start,
            windowEnd: end,
            maxGroups: MAX_GROUPS
        },
        datasets: archive.data?.viewer?.accounts?.[0] || null,
        errors: archive.errors || []
    };
    const rawBody = JSON.stringify(rawDocument);
    const rawBytes = byteLength(rawBody);
    if (env.ANALYTICS_RAW) {
        await env.ANALYTICS_RAW.put(objectKey, rawBody, {
            httpMetadata: { contentType: 'application/json; charset=utf-8' },
            customMetadata: {
                date,
                host: env.WEB_ANALYTICS_HOST,
                schemaVersion: '2'
            }
        });
    }

    const rawParts = splitRawBody(rawBody);
    const rawStorageKey = env.ANALYTICS_RAW ? objectKey : `d1://analytics_raw_parts/${date}`;
    const rawStorage = env.ANALYTICS_RAW ? 'r2+d1' : 'd1';
    const statements = [
        env.ANALYTICS_DB.prepare(`
            INSERT INTO analytics_daily (
                date,
                host,
                page_views,
                referrer_visits,
                sample_interval,
                source_window_start,
                source_window_end,
                collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                host = excluded.host,
                page_views = excluded.page_views,
                referrer_visits = excluded.referrer_visits,
                sample_interval = excluded.sample_interval,
                source_window_start = excluded.source_window_start,
                source_window_end = excluded.source_window_end,
                collected_at = excluded.collected_at
        `).bind(
            row.date,
            row.host,
            row.pageViews,
            row.referrerVisits,
            row.sampleInterval,
            row.sourceWindowStart,
            row.sourceWindowEnd,
            row.collectedAt
        ),
        env.ANALYTICS_DB.prepare(`
            INSERT INTO analytics_raw_archive (
                date,
                host,
                object_key,
                byte_size,
                datasets_json,
                source_window_start,
                source_window_end,
                collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                host = excluded.host,
                object_key = excluded.object_key,
                byte_size = excluded.byte_size,
                datasets_json = excluded.datasets_json,
                source_window_start = excluded.source_window_start,
                source_window_end = excluded.source_window_end,
                collected_at = excluded.collected_at
        `).bind(
            date,
            env.WEB_ANALYTICS_HOST,
            rawStorageKey,
            rawBytes,
            JSON.stringify({ datasets: datasetNames(rawDocument.datasets), storage: rawStorage }),
            start,
            end,
            collectedAt
        ),
        env.ANALYTICS_DB.prepare('DELETE FROM analytics_raw_parts WHERE date = ?').bind(date)
    ];

    rawParts.forEach((part, index) => {
        statements.push(env.ANALYTICS_DB.prepare(`
            INSERT INTO analytics_raw_parts (
                date,
                part_no,
                part_count,
                host,
                payload_json,
                byte_size,
                collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            date,
            index,
            rawParts.length,
            env.WEB_ANALYTICS_HOST,
            part,
            byteLength(part),
            collectedAt
        ));
    });

    await env.ANALYTICS_DB.batch(statements);

    return {
        ...row,
        rawObjectKey: rawStorageKey,
        rawBytes,
        rawStorage,
        rawParts: rawParts.length,
        datasets: datasetNames(rawDocument.datasets),
        errors: archive.errors || []
    };
}

async function queryRawAnalytics({ accountTag, host, start, end, token }) {
    const query = `{
        viewer {
            accounts(filter: { accountTag: "${escapeGraphQL(accountTag)}" }) {
                pageloads: rumPageloadEventsAdaptiveGroups(
                    filter: {
                        datetime_geq: "${escapeGraphQL(start)}"
                        datetime_lt: "${escapeGraphQL(end)}"
                        requestHost: "${escapeGraphQL(host)}"
                    }
                    limit: ${MAX_GROUPS}
                ) {
                    count
                    dimensions {
                        bot
                        countryName
                        date
                        datetimeFifteenMinutes
                        datetimeFiveMinutes
                        datetimeHour
                        deviceType
                        refererHost
                        refererPath
                        requestHost
                        requestPath
                        requestScheme
                        siteTag
                        userAgentBrowser
                        userAgentOS
                    }
                    avg { sampleInterval }
                    sum { visits }
                }
                performance: rumPerformanceEventsAdaptiveGroups(
                    filter: {
                        datetime_geq: "${escapeGraphQL(start)}"
                        datetime_lt: "${escapeGraphQL(end)}"
                        requestHost: "${escapeGraphQL(host)}"
                    }
                    limit: ${MAX_GROUPS}
                ) {
                    count
                    dimensions {
                        bot
                        countryName
                        date
                        datetimeFifteenMinutes
                        datetimeFiveMinutes
                        datetimeHour
                        datetimeMinute
                        deviceType
                        navigationType
                        refererHost
                        refererPath
                        refererScheme
                        requestHost
                        requestPath
                        requestScheme
                        siteTag
                        userAgentBrowser
                        userAgentOS
                    }
                    avg {
                        connectionTime
                        dnsTime
                        firstContentfulPaint
                        firstPaint
                        loadEventTime
                        pageLoadTime
                        pageRenderTime
                        requestTime
                        responseTime
                        sampleInterval
                    }
                    quantiles {
                        connectionTimeP50
                        connectionTimeP75
                        connectionTimeP90
                        connectionTimeP95
                        connectionTimeP99
                        firstContentfulPaintP50
                        firstContentfulPaintP75
                        firstContentfulPaintP90
                        firstContentfulPaintP95
                        firstContentfulPaintP99
                        pageLoadTimeP50
                        pageLoadTimeP75
                        pageLoadTimeP90
                        pageLoadTimeP95
                        pageLoadTimeP99
                        pageRenderTimeP50
                        pageRenderTimeP75
                        pageRenderTimeP90
                        pageRenderTimeP95
                        pageRenderTimeP99
                    }
                }
                webVitals: rumWebVitalsEventsAdaptiveGroups(
                    filter: {
                        datetime_geq: "${escapeGraphQL(start)}"
                        datetime_lt: "${escapeGraphQL(end)}"
                        requestHost: "${escapeGraphQL(host)}"
                    }
                    limit: ${MAX_GROUPS}
                ) {
                    count
                    dimensions {
                        countryName
                        date
                        datetimeFifteenMinutes
                        datetimeHour
                        deviceType
                        requestHost
                        requestPath
                        siteTag
                        userAgentBrowser
                        userAgentOS
                    }
                    avg {
                        cumulativeLayoutShift
                        firstContentfulPaint
                        interactionToNextPaint
                        largestContentfulPaint
                        timeToFirstByte
                        sampleInterval
                    }
                    quantiles {
                        cumulativeLayoutShiftP50
                        cumulativeLayoutShiftP75
                        cumulativeLayoutShiftP95
                        firstContentfulPaintP50
                        firstContentfulPaintP75
                        firstContentfulPaintP95
                        interactionToNextPaintP50
                        interactionToNextPaintP75
                        interactionToNextPaintP95
                        largestContentfulPaintP50
                        largestContentfulPaintP75
                        largestContentfulPaintP95
                        timeToFirstByteP50
                        timeToFirstByteP75
                        timeToFirstByteP95
                    }
                }
            }
        }
    }`;

    const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error(`Cloudflare GraphQL returned invalid JSON (${response.status})`);
    }

    if (!response.ok) {
        throw new Error(`Cloudflare GraphQL request failed (${response.status})`);
    }
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        const message = payload.errors.map(error => error.message || 'Unknown GraphQL error').join('; ');
        throw new Error(`Cloudflare GraphQL query failed: ${message}`);
    }

    return payload;
}

function datasetNames(account) {
    if (!account || typeof account !== 'object') {
        return [];
    }
    return ['pageloads', 'performance', 'webVitals'].filter(name => Array.isArray(account[name]));
}

function safeObjectPart(value) {
    return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function splitRawBody(value) {
    const parts = [];
    for (let offset = 0; offset < value.length; offset += RAW_PART_SIZE) {
        parts.push(value.slice(offset, offset + RAW_PART_SIZE));
    }
    return parts.length > 0 ? parts : [''];
}

async function handleAnalyticsCsv(env, url) {
    if (!env.ANALYTICS_DB) return json({ ok: false, message: 'Analytics database is not configured.' }, 503);

    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 366), 1), 5000);
    const result = await env.ANALYTICS_DB.prepare(`
        SELECT date, host, page_views, referrer_visits, sample_interval,
               source_window_start, source_window_end, collected_at
        FROM analytics_daily
        WHERE host = ?
        ORDER BY date ASC
        LIMIT ?
    `).bind(env.WEB_ANALYTICS_HOST, limit).all();

    const headers = [
        'date',
        'host',
        'page_views',
        'referrer_visits',
        'sample_interval',
        'source_window_start',
        'source_window_end',
        'collected_at'
    ];
    const rows = (result.results || []).map(row => [
        row.date,
        row.host,
        row.page_views,
        row.referrer_visits,
        row.sample_interval,
        row.source_window_start,
        row.source_window_end,
        row.collected_at
    ]);

    return new Response(`\uFEFF${[headers, ...rows].map(values => values.map(csvValue).join(',')).join('\r\n')}\r\n`, {
        status: 200,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="analytics_daily.csv"'
        }
    });
}

function googleSheetsConfigured(env) {
    return Boolean(
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL
        && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
        && env.GOOGLE_SHEETS_ID
    );
}

async function getCollectionPlan(referenceDate, env) {
    const referenceDay = new Date(`${formatDate(referenceDate)}T00:00:00Z`);
    const state = await env.ANALYTICS_DB
        .prepare('SELECT value FROM analytics_sync_state WHERE key = ?')
        .bind(BACKFILL_STATE_KEY)
        .first();

    if (state?.value === 'done') {
        return { dates: getRecentDates(referenceDay), backfill: false };
    }

    const earliestDay = addUtcDays(referenceDay, -HISTORICAL_BACKFILL_DAYS);
    const cursor = state?.value
        ? new Date(`${state.value}T00:00:00Z`)
        : earliestDay;
    const currentCursor = cursor < earliestDay ? earliestDay : cursor;
    const dates = [];
    while (dates.length < HISTORICAL_BACKFILL_BATCH_DAYS && currentCursor < referenceDay) {
        dates.push(formatDate(currentCursor));
        currentCursor.setUTCDate(currentCursor.getUTCDate() + 1);
    }

    return {
        dates,
        backfill: true,
        complete: currentCursor >= referenceDay,
        nextCursor: formatDate(currentCursor)
    };
}

async function ensureSyncStateTable(env) {
    await env.ANALYTICS_DB.prepare(`
        CREATE TABLE IF NOT EXISTS analytics_sync_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `).run();
}

function getRecentDates(referenceDay) {
    return Array.from({ length: DAILY_DAYS_TO_REFRESH }, (_, offset) =>
        formatDate(addUtcDays(referenceDay, -offset - 1))
    );
}

async function saveBackfillState(env, value) {
    await env.ANALYTICS_DB.prepare(`
        INSERT INTO analytics_sync_state (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).bind(BACKFILL_STATE_KEY, value).run();
}

async function syncGoogleSheet(env) {
    const accessToken = await getGoogleAccessToken(env);
    const result = await env.ANALYTICS_DB.prepare(`
        SELECT date, host, page_views, referrer_visits, sample_interval,
               source_window_start, source_window_end, collected_at
        FROM analytics_daily
        WHERE host = ?
        ORDER BY date ASC
    `).bind(env.WEB_ANALYTICS_HOST).all();
    const values = (result.results || []).map(row => [
        row.date,
        row.host,
        row.page_views,
        row.referrer_visits,
        row.sample_interval,
        row.source_window_start,
        row.source_window_end,
        row.collected_at
    ]);

    const headerRange = env.GOOGLE_SHEETS_HEADER_RANGE || 'Daily!A1:H1';
    const clearRange = env.GOOGLE_SHEETS_CLEAR_RANGE || 'Daily!A2:H5000';
    const dataStartRange = env.GOOGLE_SHEETS_DATA_START || 'Daily!A2';
    const spreadsheetId = encodeURIComponent(env.GOOGLE_SHEETS_ID);

    await googleSheetsValuesRequest(accessToken, spreadsheetId, headerRange, 'PUT', {
        range: headerRange,
        majorDimension: 'ROWS',
        values: [[
            'date',
            'host',
            'page_views',
            'referrer_visits',
            'sample_interval',
            'source_window_start',
            'source_window_end',
            'collected_at'
        ]]
    });
    await googleSheetsValuesRequest(accessToken, spreadsheetId, clearRange, 'POST', {} , 'clear');
    if (values.length > 0) {
        await googleSheetsValuesRequest(accessToken, spreadsheetId, dataStartRange, 'PUT', {
            range: dataStartRange,
            majorDimension: 'ROWS',
            values
        });
    }

    return { spreadsheetId: env.GOOGLE_SHEETS_ID, rows: values.length };
}

async function googleSheetsValuesRequest(accessToken, spreadsheetId, range, method, body, action = '') {
    const suffix = action ? `:${action}` : '';
    const response = await fetch(
        `${GOOGLE_SHEETS_ENDPOINT}/${spreadsheetId}/values/${encodeURIComponent(range)}${suffix}${action ? '' : '?valueInputOption=RAW'}`,
        {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );
    const responseText = await response.text();
    if (!response.ok) {
        throw new Error(`Google Sheets API failed (${response.status}): ${responseText.slice(0, 500)}`);
    }
    return responseText ? JSON.parse(responseText) : null;
}

async function getGoogleAccessToken(env) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64UrlEncode(JSON.stringify({
        iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: GOOGLE_TOKEN_ENDPOINT,
        iat: now,
        exp: now + 3600
    }));
    const unsignedToken = `${header}.${payload}`;
    const privateKey = await importGooglePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
    const signature = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' },
        privateKey,
        new TextEncoder().encode(unsignedToken)
    );
    const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        }).toString()
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
        throw new Error(`Google OAuth failed (${response.status}): ${JSON.stringify(data).slice(0, 500)}`);
    }
    return data.access_token;
}

async function importGooglePrivateKey(value) {
    const pem = String(value).replace(/\\n/g, '\n');
    const base64 = pem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return crypto.subtle.importKey(
        'pkcs8',
        bytes.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
}

function base64UrlEncode(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function csvValue(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
}

function escapeGraphQL(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function addUtcDays(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

function toCount(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0;
}

function average(values) {
    const numbers = values.map(Number).filter(value => Number.isFinite(value) && value >= 0);
    return numbers.length > 0 ? numbers.reduce((total, value) => total + value, 0) / numbers.length : null;
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8'
        }
    });
}
