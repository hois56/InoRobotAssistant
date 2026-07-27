const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const DAYS_TO_REFRESH = 3;
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

        return json({ ok: false, message: 'Not Found' }, 404);
    },

    async scheduled(controller, env) {
        validateEnvironment(env);

        const referenceDate = new Date(controller.scheduledTime || Date.now());
        const dates = Array.from({ length: DAYS_TO_REFRESH }, (_, offset) => {
            const date = new Date(referenceDate);
            date.setUTCDate(date.getUTCDate() - offset - 1);
            return formatDate(date);
        });

        for (const date of dates) {
            const result = await collectDate(date, env);
            console.info('analytics-sync-complete', result);
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
