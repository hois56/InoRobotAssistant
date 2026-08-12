const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_ENDPOINT = 'https://sheets.googleapis.com/v4/spreadsheets';
const GOOGLE_TREND_SHEET_NAME = '주간·월간 추이';
const ANALYTICS_START_DATE = '2026-07-22';
const KST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;
const KST_UTC_OFFSET = '+09:00';
const DAILY_DAYS_TO_REFRESH = 3;
const HISTORICAL_BACKFILL_DAYS = 180;
const HISTORICAL_BACKFILL_BATCH_DAYS = 5;
// Versioned so rows collected with the former UTC-day window are reprocessed.
const BACKFILL_STATE_KEY = 'web_analytics_backfill_kst_v1';
const MAX_GROUPS = 10000;
const ARCHIVE_WINDOW_GRAIN_MILLISECONDS = 5 * 60 * 1000;
const MAX_ARCHIVE_GROUPS_PER_DATE = 50000;
const MAX_GRAPHQL_REQUESTS_PER_DATE = 24;
const MAX_GRAPHQL_REQUESTS_PER_RUN = 40;
const MAX_GRAPHQL_RETRIES = 2;
const MAX_GRAPHQL_RETRY_DELAY_MILLISECONDS = 5000;
const CSV_DEFAULT_LIMIT = 366;
const CSV_MAX_LIMIT = 5000;
const TREND_MIN_ROW_COUNT = 110;
const TREND_HEADER_ROW_COUNT = 5;
const TREND_ROW_PADDING = 5;
const SERVICE_NAME = 'inorobot-analytics';
const RAW_PREFIX = 'web-analytics';
const RAW_PART_SIZE = 180000;
const GOOGLE_SHEET_HEADERS = [
    '날짜 (date)',
    '호스트 (host)',
    '페이지 조회수 (page_views)',
    '유입 방문수 (referrer_visits)',
    '샘플링 간격 (sample_interval)',
    '집계 시작 한국 시간 (source_window_start)',
    '집계 종료 한국 시간 (source_window_end)',
    '수집 시각 한국 시간 (collected_at)'
];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health') {
            return json({ ok: true, service: SERVICE_NAME });
        }
        if (url.pathname === '/analytics.csv') {
            return await handleAnalyticsCsv(request, env, url);
        }
        return json({ ok: false, message: 'Not Found' }, 404);
    },

    async scheduled(controller, env) {
        validateEnvironment(env);
        await ensureSyncStateTable(env);

        const referenceDate = new Date(controller.scheduledTime || Date.now());
        const plan = await getCollectionPlan(referenceDate, env);
        const runGraphQLBudget = createGraphQLRequestBudget(
            MAX_GRAPHQL_REQUESTS_PER_RUN,
            'scheduled run'
        );

        for (const date of plan.dates) {
            const graphQLBudget = createGraphQLRequestBudget(
                MAX_GRAPHQL_REQUESTS_PER_DATE,
                `KST date ${date}`,
                runGraphQLBudget
            );
            const result = await collectDate(date, env, graphQLBudget);
            console.info('analytics-sync-complete', result);
        }

        // Collection progress is independent of Google Sheets. Once all D1
        // rows are committed, do not spend the next invocation recollecting
        // the same GraphQL batch just because a later Sheets call failed.
        if (plan.backfill) {
            await saveBackfillState(env, plan.complete ? 'done' : plan.nextCursor);
            console.info('analytics-backfill-progress', {
                dates: plan.dates.length,
                nextCursor: plan.complete ? 'done' : plan.nextCursor,
                complete: plan.complete
            });
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

async function collectDate(date, env, graphQLBudget) {
    const { start, end } = getKoreanDayUtcWindow(date);
    const collectedAt = new Date().toISOString();
    const archive = await queryRawAnalytics({
        accountTag: env.CLOUDFLARE_ACCOUNT_TAG,
        host: env.WEB_ANALYTICS_HOST,
        start,
        end,
        token: env.CLOUDFLARE_API_TOKEN,
        graphQLBudget
    });

    const account = archive.data?.viewer?.accounts?.[0] || {};
    const pageLoadSummary = account.pageloadSummary || [];
    const row = {
        date,
        host: env.WEB_ANALYTICS_HOST,
        pageViews: pageLoadSummary.reduce((total, group) => total + toCount(group?.count), 0),
        referrerVisits: pageLoadSummary.reduce((total, group) => total + toCount(group?.sum?.visits), 0),
        sampleInterval: average(pageLoadSummary.map(group => group?.avg?.sampleInterval)),
        sourceWindowStart: start,
        sourceWindowEnd: end,
        collectedAt
    };

    const objectKey = `${RAW_PREFIX}/date=${date}/host=${safeObjectPart(env.WEB_ANALYTICS_HOST)}.json`;
    const rawDocument = {
        schemaVersion: 5,
        service: SERVICE_NAME,
        collectedAt,
        archiveComplete: archive.archiveComplete,
        archiveError: archive.archiveError,
        source: {
            accountTag: env.CLOUDFLARE_ACCOUNT_TAG,
            host: env.WEB_ANALYTICS_HOST,
            calendarDate: date,
            calendarTimeZone: 'Asia/Seoul',
            windowStart: start,
            windowEnd: end,
            maxGroupsPerRequest: MAX_GROUPS,
            archiveSegments: archive.archiveSegments
        },
        datasets: account,
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
                schemaVersion: '5'
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
        archiveComplete: archive.archiveComplete,
        archiveError: archive.archiveError,
        errors: archive.errors || []
    };
}

async function queryRawAnalytics({ accountTag, host, start, end, token, graphQLBudget }) {
    // Cloudflare limits account-level Analytics queries to 30 selected fields.
    // Fetch an ungrouped total for D1/Sheets and a separate detailed archive.
    // A detailed response that reaches the API limit is discarded and retried
    // in smaller time windows so a silently truncated list is never archived.
    const summaryQuery = `{
        viewer {
            accounts(filter: { accountTag: "${escapeGraphQL(accountTag)}" }) {
                pageloadSummary: rumPageloadEventsAdaptiveGroups(
                    filter: {
                        datetime_geq: "${escapeGraphQL(start)}"
                        datetime_lt: "${escapeGraphQL(end)}"
                        requestHost: "${escapeGraphQL(host)}"
                    }
                    limit: 1
                ) {
                    count
                    avg { sampleInterval }
                    sum { visits }
                }
            }
        }
    }`;

    const summaryPayload = await queryCloudflareGraphQL(summaryQuery, token, graphQLBudget);
    const summaryGroups = extractPageloadGroups(summaryPayload, 'pageloadSummary');
    let archive;
    let archiveError = null;
    try {
        archive = await queryPageloadArchiveWindow({
            accountTag,
            host,
            start,
            end,
            token,
            graphQLBudget
        });
    } catch (error) {
        archiveError = error?.message || String(error);
        archive = { groups: [], segments: [] };
        console.warn('cloudflare-detail-archive-incomplete', {
            windowStart: start,
            windowEnd: end,
            message: archiveError
        });
    }

    return {
        data: {
            viewer: {
                accounts: [{
                    pageloadSummary: summaryGroups,
                    pageloads: archive.groups
                }]
            }
        },
        errors: archiveError ? [{ dataset: 'pageloads', message: archiveError }] : [],
        archiveComplete: archiveError === null,
        archiveError,
        archiveSegments: archive.segments
    };
}

async function queryPageloadArchiveWindow(
    { accountTag, host, start, end, token, graphQLBudget },
    splitDepth = 0
) {
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
            }
        }
    }`;
    const payload = await queryCloudflareGraphQL(query, token, graphQLBudget);
    const groups = extractPageloadGroups(payload, 'pageloads');

    if (groups.length < MAX_GROUPS) {
        return {
            groups,
            segments: [{ windowStart: start, windowEnd: end, groupCount: groups.length, splitDepth }]
        };
    }

    const startMilliseconds = Date.parse(start);
    const endMilliseconds = Date.parse(end);
    const duration = endMilliseconds - startMilliseconds;
    if (!Number.isFinite(duration) || duration <= ARCHIVE_WINDOW_GRAIN_MILLISECONDS) {
        throw new Error(
            `Cloudflare detail archive still reached ${MAX_GROUPS} groups in the minimum window ${start}..${end}.`
        );
    }

    // Every selected row includes datetimeFiveMinutes. Keep every split on that
    // same boundary so a dimension key cannot be fragmented across segments.
    const midpointMilliseconds = Math.floor(
        (startMilliseconds + duration / 2) / ARCHIVE_WINDOW_GRAIN_MILLISECONDS
    ) * ARCHIVE_WINDOW_GRAIN_MILLISECONDS;
    if (midpointMilliseconds <= startMilliseconds || midpointMilliseconds >= endMilliseconds) {
        throw new Error(`Unable to split Cloudflare detail archive window ${start}..${end}.`);
    }
    const midpoint = new Date(midpointMilliseconds).toISOString();
    const left = await queryPageloadArchiveWindow(
        { accountTag, host, start, end: midpoint, token, graphQLBudget },
        splitDepth + 1
    );
    const right = await queryPageloadArchiveWindow(
        { accountTag, host, start: midpoint, end, token, graphQLBudget },
        splitDepth + 1
    );
    const combinedGroupCount = left.groups.length + right.groups.length;
    if (combinedGroupCount > MAX_ARCHIVE_GROUPS_PER_DATE) {
        throw new Error(
            `Cloudflare detail archive exceeded ${MAX_ARCHIVE_GROUPS_PER_DATE} groups for one KST date.`
        );
    }

    return {
        groups: [...left.groups, ...right.groups],
        segments: [...left.segments, ...right.segments]
    };
}

function extractPageloadGroups(payload, fieldName) {
    const accounts = payload?.data?.viewer?.accounts;
    if (!Array.isArray(accounts) || accounts.length === 0 || !Array.isArray(accounts[0]?.[fieldName])) {
        throw new Error(`Cloudflare GraphQL response did not contain ${fieldName}.`);
    }
    return accounts[0][fieldName];
}

function createGraphQLRequestBudget(maxRequests, label, parentBudget = null) {
    let used = 0;
    return {
        take() {
            if (used >= maxRequests) {
                throw new Error(
                    `Cloudflare GraphQL request budget exhausted (${maxRequests} for ${label}).`
                );
            }
            parentBudget?.take();
            used += 1;
        }
    };
}

async function queryCloudflareGraphQL(query, token, graphQLBudget) {
    let response;
    for (let attempt = 0; attempt <= MAX_GRAPHQL_RETRIES; attempt += 1) {
        graphQLBudget?.take();
        response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });
        if (response.status !== 429 || attempt === MAX_GRAPHQL_RETRIES) break;

        await response.text();
        const retryDelay = getRetryAfterMilliseconds(
            response.headers.get('Retry-After'),
            attempt
        );
        console.warn('cloudflare-graphql-rate-limited', {
            attempt: attempt + 1,
            retryDelay
        });
        await delay(retryDelay);
    }

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

function getRetryAfterMilliseconds(value, attempt) {
    let milliseconds;
    if (value !== null && /^\d+(?:\.\d+)?$/.test(value.trim())) {
        milliseconds = Number(value) * 1000;
    } else if (value) {
        milliseconds = Date.parse(value) - Date.now();
    } else {
        milliseconds = 500 * (2 ** attempt);
    }
    if (!Number.isFinite(milliseconds)) milliseconds = 500 * (2 ** attempt);
    return Math.min(Math.max(Math.ceil(milliseconds), 0), MAX_GRAPHQL_RETRY_DELAY_MILLISECONDS);
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function datasetNames(account) {
    if (!account || typeof account !== 'object') {
        return [];
    }
    return ['pageloadSummary', 'pageloads'].filter(name => Array.isArray(account[name]));
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

async function handleAnalyticsCsv(request, env, url) {
    if (!env.ANALYTICS_DB) return json({ ok: false, message: 'Analytics database is not configured.' }, 503);
    if (!env.ANALYTICS_CSV_TOKEN || typeof env.ANALYTICS_CSV_TOKEN !== 'string') {
        return json({ ok: false, message: 'Analytics CSV authentication is not configured.' }, 503);
    }

    const authorization = request.headers.get('Authorization') || '';
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!bearerMatch || !await tokensEqual(bearerMatch[1], env.ANALYTICS_CSV_TOKEN)) {
        return json(
            { ok: false, message: 'Unauthorized' },
            401,
            { 'WWW-Authenticate': 'Bearer realm="analytics.csv"' }
        );
    }

    const rawLimit = url.searchParams.get('limit');
    if (rawLimit !== null && !/^\d+$/.test(rawLimit)) {
        return json({ ok: false, message: `limit must be an integer from 1 to ${CSV_MAX_LIMIT}.` }, 400);
    }
    const limit = rawLimit === null ? CSV_DEFAULT_LIMIT : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > CSV_MAX_LIMIT) {
        return json({ ok: false, message: `limit must be an integer from 1 to ${CSV_MAX_LIMIT}.` }, 400);
    }

    const result = await env.ANALYTICS_DB.prepare(`
        SELECT date, host, page_views, referrer_visits, sample_interval,
               source_window_start, source_window_end, collected_at
        FROM (
            SELECT date, host, page_views, referrer_visits, sample_interval,
                   source_window_start, source_window_end, collected_at
            FROM analytics_daily
            WHERE host = ? AND date >= ?
            ORDER BY date DESC
            LIMIT ?
        ) AS latest
        ORDER BY date ASC
    `).bind(env.WEB_ANALYTICS_HOST, ANALYTICS_START_DATE, limit).all();

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

async function tokensEqual(provided, expected) {
    const encoder = new TextEncoder();
    const [providedHash, expectedHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(String(provided))),
        crypto.subtle.digest('SHA-256', encoder.encode(String(expected)))
    ]);
    const left = new Uint8Array(providedHash);
    const right = new Uint8Array(expectedHash);
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left[index] ^ right[index];
    }
    return difference === 0;
}

function googleSheetsConfigured(env) {
    return Boolean(
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL
        && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
        && env.GOOGLE_SHEETS_ID
    );
}

async function getCollectionPlan(referenceDate, env) {
    const referenceDay = new Date(`${formatKoreanDate(referenceDate)}T00:00:00Z`);
    const recentDates = getRecentDates(referenceDay);
    const state = await env.ANALYTICS_DB
        .prepare('SELECT value FROM analytics_sync_state WHERE key = ?')
        .bind(BACKFILL_STATE_KEY)
        .first();

    if (state?.value === 'done') {
        return { dates: recentDates, backfill: false };
    }

    const historyFloor = addUtcDays(referenceDay, -HISTORICAL_BACKFILL_DAYS);
    const configuredStartDay = new Date(`${ANALYTICS_START_DATE}T00:00:00Z`);
    const earliestDay = historyFloor > configuredStartDay ? historyFloor : configuredStartDay;
    const cursor = state?.value
        ? new Date(`${state.value}T00:00:00Z`)
        : earliestDay;
    const currentCursor = cursor < earliestDay ? earliestDay : cursor;
    const historicalDates = [];
    while (historicalDates.length < HISTORICAL_BACKFILL_BATCH_DAYS && currentCursor < referenceDay) {
        historicalDates.push(formatDate(currentCursor));
        currentCursor.setUTCDate(currentCursor.getUTCDate() + 1);
    }

    return {
        dates: [...new Set([...recentDates, ...historicalDates])],
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
        WHERE host = ? AND date >= ?
        ORDER BY date ASC
    `).bind(env.WEB_ANALYTICS_HOST, ANALYTICS_START_DATE).all();
    const values = (result.results || []).map(row => [
        row.date,
        row.host,
        row.page_views,
        row.referrer_visits,
        row.sample_interval,
        formatKoreanDateTime(row.source_window_start),
        formatKoreanDateTime(row.source_window_end),
        formatKoreanDateTime(row.collected_at)
    ]);

    const headerRange = env.GOOGLE_SHEETS_HEADER_RANGE || 'Daily!A1:H1';
    const clearRange = env.GOOGLE_SHEETS_CLEAR_RANGE || 'Daily!A2:H';
    const dataStartRange = env.GOOGLE_SHEETS_DATA_START || 'Daily!A2';
    const spreadsheetId = encodeURIComponent(env.GOOGLE_SHEETS_ID);

    if (values.length === 0) {
        throw new Error('Refusing to replace the Google Sheet because D1 returned no analytics rows.');
    }

    await ensureGoogleSheetRowCapacity(accessToken, spreadsheetId, dataStartRange, values.length);

    // Write the complete replacement before clearing anything. If this request
    // fails, the current sheet remains intact instead of being left empty.
    await googleSheetsApiRequest(
        accessToken,
        `${spreadsheetId}/values:batchUpdate`,
        'POST',
        {
            valueInputOption: 'USER_ENTERED',
            data: [
                { range: headerRange, majorDimension: 'ROWS', values: [GOOGLE_SHEET_HEADERS] },
                { range: dataStartRange, majorDimension: 'ROWS', values }
            ]
        }
    );

    // Only stale rows below the successfully written data are cleared. The
    // configured clear range supplies the sheet and final column, not a fixed
    // maximum row, so Daily can grow beyond 5,000 rows.
    const trailingClearRange = buildTrailingClearRange(dataStartRange, clearRange, values.length);
    await googleSheetsValuesRequest(accessToken, spreadsheetId, trailingClearRange, 'POST', {}, 'clear');

    const trendSheet = await syncGoogleTrendSheet(accessToken, spreadsheetId, values.length);
    return { spreadsheetId: env.GOOGLE_SHEETS_ID, rows: values.length, trendSheet };
}

function buildTrailingClearRange(dataStartRange, configuredClearRange, writtenRowCount) {
    const dataStart = parseA1Range(dataStartRange);
    const clear = parseA1Range(configuredClearRange);
    if (
        !dataStart.sheet
        || unquoteA1SheetName(dataStart.sheet) !== unquoteA1SheetName(clear.sheet)
        || dataStart.startColumn !== clear.startColumn
        || dataStart.startRow !== clear.startRow
        || !clear.endColumn
    ) {
        throw new Error('Google Sheets data and clear ranges must target the same sheet and include an end column.');
    }
    const firstStaleRow = dataStart.startRow + writtenRowCount;
    return `${clear.sheetPrefix}${clear.startColumn}${firstStaleRow}:${clear.endColumn}`;
}

async function ensureGoogleSheetRowCapacity(accessToken, spreadsheetId, dataStartRange, writtenRowCount) {
    const dataStart = parseA1Range(dataStartRange);
    const sheetTitle = unquoteA1SheetName(dataStart.sheet);
    if (!sheetTitle) throw new Error('Google Sheets data start range must include a sheet name.');

    const metadata = await googleSheetsApiRequest(
        accessToken,
        `${spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`
    );
    const sheet = (metadata.sheets || []).find(item => item.properties?.title === sheetTitle);
    if (sheet?.properties?.sheetId === undefined) {
        throw new Error(`Google Sheets tab was not found: ${sheetTitle}`);
    }

    // Keep one row below the replacement data so the trailing clear range is
    // always valid, even when the data exactly filled the previous grid.
    const requiredRowCount = dataStart.startRow + writtenRowCount;
    const currentRowCount = Number(sheet.properties?.gridProperties?.rowCount) || 0;
    if (currentRowCount >= requiredRowCount) return;

    await googleSheetsApiRequest(accessToken, `${spreadsheetId}:batchUpdate`, 'POST', {
        requests: [{
            updateSheetProperties: {
                properties: {
                    sheetId: sheet.properties.sheetId,
                    gridProperties: { rowCount: requiredRowCount }
                },
                fields: 'gridProperties.rowCount'
            }
        }]
    });
}

function unquoteA1SheetName(sheet) {
    if (sheet.startsWith("'") && sheet.endsWith("'")) {
        return sheet.slice(1, -1).replace(/''/g, "'");
    }
    return sheet;
}

function parseA1Range(range) {
    const value = String(range);
    const separatorIndex = value.lastIndexOf('!');
    const sheetPrefix = separatorIndex >= 0 ? value.slice(0, separatorIndex + 1) : '';
    const sheet = separatorIndex >= 0 ? value.slice(0, separatorIndex) : '';
    const cells = separatorIndex >= 0 ? value.slice(separatorIndex + 1) : value;
    const match = /^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d*)?)?$/.exec(cells);
    if (!match) throw new Error(`Invalid Google Sheets A1 range: ${range}`);
    return {
        sheet,
        sheetPrefix,
        startColumn: match[1].toUpperCase(),
        startRow: Number(match[2]),
        endColumn: match[3]?.toUpperCase() || null
    };
}

async function syncGoogleTrendSheet(accessToken, spreadsheetId, dailyRowCount) {
    const metadata = await googleSheetsApiRequest(
        accessToken,
        `${spreadsheetId}?fields=sheets(properties(sheetId,title,index,gridProperties),charts(chartId),conditionalFormats)`
    );
    let sheet = (metadata.sheets || []).find(item => item.properties?.title === GOOGLE_TREND_SHEET_NAME);
    let sheetId = sheet?.properties?.sheetId;
    let createdSheet = false;
    const existingRowCount = Number(sheet?.properties?.gridProperties?.rowCount) || 0;
    const trendRowCount = Math.max(
        TREND_MIN_ROW_COUNT,
        existingRowCount,
        TREND_HEADER_ROW_COUNT + dailyRowCount + TREND_ROW_PADDING
    );

    if (sheetId === undefined) {
        createdSheet = true;
        const created = await googleSheetsApiRequest(accessToken, `${spreadsheetId}:batchUpdate`, 'POST', {
            requests: [{
                addSheet: {
                    properties: {
                        title: GOOGLE_TREND_SHEET_NAME,
                        gridProperties: {
                            rowCount: trendRowCount,
                            columnCount: 11,
                            frozenRowCount: 5,
                            hideGridlines: true
                        }
                    }
                }
            }]
        });
        sheetId = created.replies?.[0]?.addSheet?.properties?.sheetId;
        if (sheetId === undefined) {
            throw new Error('Google Sheets API did not return the new trend sheet ID.');
        }
        sheet = {
            properties: {
                sheetId,
                title: GOOGLE_TREND_SHEET_NAME,
                gridProperties: { rowCount: trendRowCount }
            },
            charts: [],
            conditionalFormats: []
        };
    }

    if (!createdSheet && existingRowCount < trendRowCount) {
        await googleSheetsApiRequest(accessToken, `${spreadsheetId}:batchUpdate`, 'POST', {
            requests: [{
                updateSheetProperties: {
                    properties: {
                        sheetId,
                        gridProperties: { rowCount: trendRowCount }
                    },
                    fields: 'gridProperties.rowCount'
                }
            }]
        });
    }

    const existingCharts = sheet.charts || [];
    const existingRules = sheet.conditionalFormats || [];
    const resetRequests = [
        ...(!createdSheet ? [{
            unmergeCells: {
                range: { sheetId, startRowIndex: 0, endRowIndex: trendRowCount, startColumnIndex: 0, endColumnIndex: 11 }
            }
        }] : []),
        ...existingCharts.map(chart => ({ deleteEmbeddedObject: { objectId: chart.chartId } })),
        ...existingRules.map((_, index) => ({
            deleteConditionalFormatRule: { sheetId, index: existingRules.length - index - 1 }
        }))
    ];
    const weeklyFormula = `=QUERY({ARRAYFORMULA(IF('Daily'!A2:A="","",'Daily'!A2:A-WEEKDAY('Daily'!A2:A,2)+1)),'Daily'!C2:C,'Daily'!D2:D},"select Col1,sum(Col2),sum(Col3) where Col1 is not null group by Col1 order by Col1 label Col1 '주 시작일 (월)', sum(Col2) '페이지 조회수', sum(Col3) '유입 방문수'",0)`;
    const monthlyFormula = `=QUERY({ARRAYFORMULA(IF('Daily'!A2:A="","",DATE(YEAR('Daily'!A2:A),MONTH('Daily'!A2:A),1))),'Daily'!C2:C,'Daily'!D2:D},"select Col1,sum(Col2),sum(Col3) where Col1 is not null group by Col1 order by Col1 label Col1 '월', sum(Col2) '페이지 조회수', sum(Col3) '유입 방문수'",0)`;
    const previousTrendRow = trendRowCount - 1;
    const weeklyViewChangeFormula = `=ARRAYFORMULA(IF(A6:A${trendRowCount}="","",IF(ROW(A6:A${trendRowCount})=6,"",IFERROR(B6:B${trendRowCount}/B5:B${previousTrendRow}-1,""))))`;
    const weeklyVisitChangeFormula = `=ARRAYFORMULA(IF(A6:A${trendRowCount}="","",IF(ROW(A6:A${trendRowCount})=6,"",IFERROR(C6:C${trendRowCount}/C5:C${previousTrendRow}-1,""))))`;
    const monthlyViewChangeFormula = `=ARRAYFORMULA(IF(G6:G${trendRowCount}="","",IF(ROW(G6:G${trendRowCount})=6,"",IFERROR(H6:H${trendRowCount}/H5:H${previousTrendRow}-1,""))))`;
    const monthlyVisitChangeFormula = `=ARRAYFORMULA(IF(G6:G${trendRowCount}="","",IF(ROW(G6:G${trendRowCount})=6,"",IFERROR(I6:I${trendRowCount}/I5:I${previousTrendRow}-1,""))))`;

    await googleSheetsApiRequest(
        accessToken,
        `${spreadsheetId}/values:batchUpdate`,
        'POST',
        {
            valueInputOption: 'USER_ENTERED',
            data: [
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!A1`, values: [['방문 추이 분석 | Weekly & Monthly Trends']] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!A2`, values: [['Daily 탭 기준 자동 집계 · 주간은 월요일 시작 · 첫 주/현재 주와 첫 달/현재 달은 부분 집계일 수 있습니다.']] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!A4`, values: [['주간 추이 | Weekly Trend']] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!A5`, values: [[weeklyFormula]] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!D5:E5`, values: [['조회수 전주 대비', '방문수 전주 대비']] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!D6:E6`, values: [[weeklyViewChangeFormula, weeklyVisitChangeFormula]] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!G4`, values: [['월간 추이 | Monthly Trend']] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!G5`, values: [[monthlyFormula]] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!J5:K5`, values: [['조회수 전월 대비', '방문수 전월 대비']] },
                { range: `'${GOOGLE_TREND_SHEET_NAME}'!J6:K6`, values: [[monthlyViewChangeFormula, monthlyVisitChangeFormula]] }
            ]
        }
    );

    const darkTeal = rgb(15, 118, 110);
    const blue = rgb(37, 99, 235);
    const orange = rgb(234, 88, 12);
    const lightTeal = rgb(240, 253, 250);
    const lightSlate = rgb(226, 232, 240);
    const slate = rgb(51, 65, 85);
    const white = rgb(255, 255, 255);
    const positiveFill = rgb(220, 252, 231);
    const positiveText = rgb(22, 101, 52);
    const negativeFill = rgb(254, 226, 226);
    const negativeText = rgb(153, 27, 27);
    const fullRange = { sheetId, startRowIndex: 0, endRowIndex: trendRowCount, startColumnIndex: 0, endColumnIndex: 11 };

    const formattingRequests = [
        {
            updateSheetProperties: {
                properties: {
                    sheetId,
                    gridProperties: {
                        rowCount: trendRowCount,
                        columnCount: 11,
                        frozenRowCount: 5,
                        hideGridlines: true
                    }
                },
                fields: 'gridProperties(rowCount,columnCount,frozenRowCount,hideGridlines)'
            }
        },
        {
            repeatCell: {
                range: fullRange,
                cell: {
                    userEnteredFormat: {
                        backgroundColor: white,
                        textFormat: { fontFamily: 'Arial', fontSize: 10, foregroundColor: slate },
                        verticalAlignment: 'MIDDLE'
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
            }
        },
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 }, mergeType: 'MERGE_ALL' } },
        { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 11 }, mergeType: 'MERGE_ALL' } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 5 }, mergeType: 'MERGE_ALL' } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 6, endColumnIndex: 11 }, mergeType: 'MERGE_ALL' } },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: darkTeal,
                        horizontalAlignment: 'CENTER',
                        textFormat: { fontFamily: 'Arial', fontSize: 18, bold: true, foregroundColor: white }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 11 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: lightTeal,
                        horizontalAlignment: 'CENTER',
                        wrapStrategy: 'WRAP',
                        textFormat: { fontFamily: 'Arial', fontSize: 10, italic: true, foregroundColor: slate }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,wrapStrategy,textFormat)'
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 5 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: blue,
                        horizontalAlignment: 'LEFT',
                        textFormat: { fontFamily: 'Arial', fontSize: 12, bold: true, foregroundColor: white }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 6, endColumnIndex: 11 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: orange,
                        horizontalAlignment: 'LEFT',
                        textFormat: { fontFamily: 'Arial', fontSize: 12, bold: true, foregroundColor: white }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 5 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: lightSlate,
                        horizontalAlignment: 'CENTER',
                        wrapStrategy: 'WRAP',
                        textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true, foregroundColor: slate }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,wrapStrategy,textFormat)'
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 6, endColumnIndex: 11 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: lightSlate,
                        horizontalAlignment: 'CENTER',
                        wrapStrategy: 'WRAP',
                        textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true, foregroundColor: slate }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,wrapStrategy,textFormat)'
            }
        },
        ...numberFormatRequests(sheetId, trendRowCount),
        ...dimensionRequests(sheetId),
        ...conditionalFormatRequests(sheetId, trendRowCount, positiveFill, positiveText, negativeFill, negativeText),
        weeklyChartRequest(sheetId, trendRowCount, blue, orange),
        monthlyChartRequest(sheetId, trendRowCount, blue, orange)
    ];

    // Submit cleanup and replacement formatting/charts as one atomic Sheets
    // batch. If any request is invalid, old charts and formatting remain.
    await googleSheetsApiRequest(accessToken, `${spreadsheetId}:batchUpdate`, 'POST', {
        requests: [...resetRequests, ...formattingRequests]
    });

    return { sheetId, title: GOOGLE_TREND_SHEET_NAME };
}

function numberFormatRequests(sheetId, trendRowCount) {
    const ranges = [
        [{ sheetId, startRowIndex: 5, endRowIndex: trendRowCount, startColumnIndex: 0, endColumnIndex: 1 }, 'yyyy-mm-dd'],
        [{ sheetId, startRowIndex: 5, endRowIndex: trendRowCount, startColumnIndex: 1, endColumnIndex: 3 }, '#,##0'],
        [{ sheetId, startRowIndex: 5, endRowIndex: trendRowCount, startColumnIndex: 3, endColumnIndex: 5 }, '0.0%'],
        [{ sheetId, startRowIndex: 5, endRowIndex: trendRowCount, startColumnIndex: 6, endColumnIndex: 7 }, 'yyyy-mm'],
        [{ sheetId, startRowIndex: 5, endRowIndex: trendRowCount, startColumnIndex: 7, endColumnIndex: 9 }, '#,##0'],
        [{ sheetId, startRowIndex: 5, endRowIndex: trendRowCount, startColumnIndex: 9, endColumnIndex: 11 }, '0.0%']
    ];
    return ranges.map(([range, pattern]) => {
        const patternText = String(pattern);
        return {
            repeatCell: {
                range,
                cell: { userEnteredFormat: { numberFormat: { type: patternText.includes('%') ? 'PERCENT' : patternText.includes('y') ? 'DATE' : 'NUMBER', pattern: patternText } } },
                fields: 'userEnteredFormat.numberFormat'
            }
        };
    });
}

function dimensionRequests(sheetId) {
    const columnWidths = [120, 105, 105, 125, 125, 24, 105, 105, 105, 125, 125];
    return [
        ...columnWidths.map((pixelSize, columnIndex) => ({
            updateDimensionProperties: {
                range: { sheetId, dimension: 'COLUMNS', startIndex: columnIndex, endIndex: columnIndex + 1 },
                properties: { pixelSize },
                fields: 'pixelSize'
            }
        })),
        ...[[0, 1, 42], [1, 2, 30], [2, 3, 14], [3, 4, 30], [4, 5, 38]].map(([startIndex, endIndex, pixelSize]) => ({
            updateDimensionProperties: {
                range: { sheetId, dimension: 'ROWS', startIndex, endIndex },
                properties: { pixelSize },
                fields: 'pixelSize'
            }
        }))
    ];
}

function conditionalFormatRequests(sheetId, trendRowCount, positiveFill, positiveText, negativeFill, negativeText) {
    return [
        ['D6', [3, 5], '>', positiveFill, positiveText],
        ['D6', [3, 5], '<', negativeFill, negativeText],
        ['J6', [9, 11], '>', positiveFill, positiveText],
        ['J6', [9, 11], '<', negativeFill, negativeText]
    ].map(([anchor, columns, operator, backgroundColor, foregroundColor], index) => ({
        addConditionalFormatRule: {
            index,
            rule: {
                ranges: [{ sheetId, startRowIndex: 5, endRowIndex: trendRowCount, startColumnIndex: columns[0], endColumnIndex: columns[1] }],
                booleanRule: {
                    condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=${anchor}${operator}0` }] },
                    format: { backgroundColor, textFormat: { foregroundColor, bold: true } }
                }
            }
        }
    }));
}

function weeklyChartRequest(sheetId, trendRowCount, pageViewColor, visitColor) {
    return trendChartRequest({
        sheetId,
        title: '주간 조회수·유입 방문수 추이',
        categoryColumn: 0,
        pageViewColumn: 1,
        visitColumn: 2,
        anchorColumn: 0,
        trendRowCount,
        pageViewColor,
        visitColor
    });
}

function monthlyChartRequest(sheetId, trendRowCount, pageViewColor, visitColor) {
    return trendChartRequest({
        sheetId,
        title: '월간 조회수·유입 방문수 추이',
        categoryColumn: 6,
        pageViewColumn: 7,
        visitColumn: 8,
        anchorColumn: 6,
        trendRowCount,
        pageViewColor,
        visitColor
    });
}

function trendChartRequest({
    sheetId,
    title,
    categoryColumn,
    pageViewColumn,
    visitColumn,
    anchorColumn,
    trendRowCount,
    pageViewColor,
    visitColor
}) {
    const source = column => ({
        sourceRange: {
            sources: [{
                sheetId,
                startRowIndex: 4,
                endRowIndex: trendRowCount,
                startColumnIndex: column,
                endColumnIndex: column + 1
            }]
        }
    });
    return {
        addChart: {
            chart: {
                spec: {
                    title,
                    titleTextFormat: { fontSize: 14, bold: true },
                    backgroundColor: rgb(255, 255, 255),
                    basicChart: {
                        chartType: 'LINE',
                        legendPosition: 'BOTTOM_LEGEND',
                        headerCount: 1,
                        interpolateNulls: false,
                        axis: [
                            { position: 'BOTTOM_AXIS', title: '기간' },
                            { position: 'LEFT_AXIS', title: '횟수' }
                        ],
                        domains: [{ domain: source(categoryColumn) }],
                        series: [
                            { series: source(pageViewColumn), targetAxis: 'LEFT_AXIS', color: pageViewColor },
                            { series: source(visitColumn), targetAxis: 'LEFT_AXIS', color: visitColor }
                        ]
                    }
                },
                position: {
                    overlayPosition: {
                        anchorCell: { sheetId, rowIndex: 29, columnIndex: anchorColumn },
                        offsetXPixels: 0,
                        offsetYPixels: 0,
                        widthPixels: 610,
                        heightPixels: 360
                    }
                }
            }
        }
    };
}

async function googleSheetsApiRequest(accessToken, path, method = 'GET', body) {
    const response = await fetch(`${GOOGLE_SHEETS_ENDPOINT}/${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const responseText = await response.text();
    if (!response.ok) {
        throw new Error(`Google Sheets API failed (${response.status}): ${responseText.slice(0, 1000)}`);
    }
    return responseText ? JSON.parse(responseText) : null;
}

function rgb(red, green, blue) {
    return { red: red / 255, green: green / 255, blue: blue / 255 };
}

async function googleSheetsValuesRequest(
    accessToken,
    spreadsheetId,
    range,
    method,
    body,
    action = '',
    valueInputOption = 'RAW'
) {
    const suffix = action ? `:${action}` : '';
    const response = await fetch(
        `${GOOGLE_SHEETS_ENDPOINT}/${spreadsheetId}/values/${encodeURIComponent(range)}${suffix}${action ? '' : `?valueInputOption=${valueInputOption}`}`,
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

function formatKoreanDate(value) {
    const source = new Date(value);
    if (Number.isNaN(source.getTime())) throw new Error(`Invalid date: ${value}`);
    return new Date(source.getTime() + KST_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

function getKoreanDayUtcWindow(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid Korean calendar date: ${date}`);
    const startDate = new Date(`${date}T00:00:00${KST_UTC_OFFSET}`);
    if (Number.isNaN(startDate.getTime()) || formatKoreanDate(startDate) !== date) {
        throw new Error(`Invalid Korean calendar date: ${date}`);
    }
    return {
        start: startDate.toISOString().replace('.000Z', 'Z'),
        end: new Date(startDate.getTime() + 24 * 60 * 60 * 1000).toISOString().replace('.000Z', 'Z')
    };
}

function formatKoreanDateTime(value) {
    if (!value) return '';
    const source = new Date(value);
    if (Number.isNaN(source.getTime())) return String(value);

    return new Date(source.getTime() + KST_OFFSET_MILLISECONDS)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
}

function toCount(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0;
}

function average(values) {
    const numbers = values.map(Number).filter(value => Number.isFinite(value) && value >= 0);
    return numbers.length > 0 ? numbers.reduce((total, value) => total + value, 0) / numbers.length : null;
}

function json(data, status = 200, additionalHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
            ...additionalHeaders
        }
    });
}
