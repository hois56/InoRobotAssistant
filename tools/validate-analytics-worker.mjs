import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerUrl = new URL('../5_Software/analytics-worker/worker.js', import.meta.url);
const workerSource = await readFile(workerUrl, 'utf8');
const readmeSource = await readFile(new URL('../5_Software/analytics-worker/README.md', import.meta.url), 'utf8');
const wranglerSource = await readFile(new URL('../5_Software/analytics-worker/wrangler.toml', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);

assert.match(workerSource, /const ANALYTICS_START_DATE = '2026-07-22';/);
assert.match(workerSource, /const GOOGLE_TREND_SHEET_NAME = '주간·월간 추이';/);
assert.match(workerSource, /async function syncGoogleTrendSheet/);
assert.match(workerSource, /async function queryPageloadArchiveWindow/);
assert.match(workerSource, /pageloadSummary: rumPageloadEventsAdaptiveGroups/);
assert.match(workerSource, /ARCHIVE_WINDOW_GRAIN_MILLISECONDS = 5 \* 60 \* 1000/);
assert.match(workerSource, /MAX_ARCHIVE_GROUPS_PER_DATE = 50000/);
assert.match(workerSource, /MAX_GRAPHQL_REQUESTS_PER_DATE = 24/);
assert.match(workerSource, /MAX_GRAPHQL_REQUESTS_PER_RUN = 40/);
assert.match(workerSource, /MAX_GRAPHQL_RETRIES = 2/);
assert.match(workerSource, /createGraphQLRequestBudget/);
assert.match(workerSource, /getRetryAfterMilliseconds/);
assert.match(workerSource, /cloudflare-detail-archive-incomplete/);
assert.match(workerSource, /archiveComplete: archiveError === null/);
assert.match(workerSource, /calendarTimeZone: 'Asia\/Seoul'/);
assert.match(workerSource, /getKoreanDayUtcWindow/);
assert.match(workerSource, /web_analytics_backfill_kst_v1/);
assert.match(workerSource, /ANALYTICS_CSV_TOKEN/);
assert.match(workerSource, /buildTrailingClearRange/);
assert.match(workerSource, /ensureGoogleSheetRowCapacity/);
assert.match(workerSource, /requests: \[\.\.\.resetRequests, \.\.\.formattingRequests\]/);
assert.doesNotMatch(workerSource, /GOOGLE_TREND_SHEET_NAME[^]*?A1:K\$\{trendRowCount\}[^]*?'clear'/);
assert.match(workerSource, /TREND_MIN_ROW_COUNT/);
assert.match(workerSource, /주간 조회수·유입 방문수 추이/);
assert.match(workerSource, /월간 조회수·유입 방문수 추이/);
assert.match(workerSource, /WHERE host = \? AND date >= \?/);
assert.match(workerSource, /날짜 \(date\)/);
assert.match(workerSource, /페이지 조회수 \(page_views\)/);
assert.match(workerSource, /USER_ENTERED/);
assert.match(workerSource, /집계 시작 한국 시간/);
assert.match(workerSource, /KST_OFFSET_MILLISECONDS/);
assert.match(workerSource, /formatKoreanDateTime/);
assert.match(workerSource, /'Daily'!A2:A/);
assert.doesNotMatch(workerSource, /A5000|H5000|endRowIndex: 100/);
assert.doesNotMatch(workerSource, /집계 시작 UTC/);
assert.doesNotMatch(workerSource, /ONE_TIME_SHEET_ADMIN/);
assert.doesNotMatch(workerSource, /__trend_sheet_admin_/);
assert.match(readmeSource, /wrangler secret put ANALYTICS_CSV_TOKEN/);
assert.match(readmeSource, /15:00 through the next 15:00 UTC/);
assert.match(readmeSource, /latest 366 days/);
assert.match(wranglerSource, /GOOGLE_SHEETS_CLEAR_RANGE = "Daily!A2:H"/);
assert.doesNotMatch(wranglerSource, /ANALYTICS_CSV_TOKEN\s*=/);

const scheduledSource = workerSource.slice(
    workerSource.indexOf('async scheduled'),
    workerSource.indexOf('function validateEnvironment')
);
assert.ok(
    scheduledSource.indexOf('if (plan.backfill)') < scheduledSource.indexOf('if (googleSheetsConfigured(env))'),
    'D1 collection progress must be saved before Google Sheets synchronization.'
);

const graphQLCollectionSource = workerSource.slice(
    workerSource.indexOf('async function queryRawAnalytics'),
    workerSource.indexOf('function extractPageloadGroups')
);
assert.doesNotMatch(graphQLCollectionSource, /Promise\.all/);

const dailySyncSource = workerSource.slice(
    workerSource.indexOf('async function syncGoogleSheet'),
    workerSource.indexOf('async function syncGoogleTrendSheet')
);
assert.ok(
    dailySyncSource.indexOf(`${'${spreadsheetId}'}/values:batchUpdate`) < dailySyncSource.indexOf('const trailingClearRange'),
    'Daily replacement must be written before stale trailing rows are cleared.'
);
assert.match(dailySyncSource, /Refusing to replace the Google Sheet because D1 returned no analytics rows/);

const trendSyncSource = workerSource.slice(
    workerSource.indexOf('async function syncGoogleTrendSheet'),
    workerSource.indexOf('function numberFormatRequests')
);
assert.ok(
    trendSyncSource.indexOf(`${'${spreadsheetId}'}/values:batchUpdate`) < trendSyncSource.indexOf('requests: [...resetRequests, ...formattingRequests]'),
    'Trend formulas must be accepted before the atomic chart/format replacement.'
);

const queries = [];
const batches = [];
const preparedStatements = [];

function createStatement(sql) {
    const statement = {
        sql,
        args: [],
        bind(...args) {
            this.args = args;
            return this;
        },
        async run() {
            return { success: true };
        },
        async first() {
            return null;
        },
        async all() {
            return { results: [] };
        }
    };
    preparedStatements.push(statement);
    return statement;
}

const env = {
    ANALYTICS_DB: {
        prepare: createStatement,
        async batch(statements) {
            batches.push(statements);
            return statements.map(() => ({ success: true }));
        }
    },
    CLOUDFLARE_API_TOKEN: 'test-token',
    CLOUDFLARE_ACCOUNT_TAG: 'test-account',
    WEB_ANALYTICS_HOST: 'inovancerobot.com'
};

const originalFetch = globalThis.fetch;
const originalInfo = console.info;
const originalError = console.error;
const originalWarn = console.warn;
let returnedRateLimit = false;

globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
    const { query } = JSON.parse(options.body);
    queries.push(query);
    const isSummary = query.includes('pageloadSummary:');
    if (!returnedRateLimit) {
        returnedRateLimit = true;
        return new Response(JSON.stringify({ errors: [{ message: 'rate limited' }] }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '0' }
        });
    }
    const isFirstFullDetailWindow = !isSummary
        && query.includes('datetime_geq: "2026-08-08T15:00:00Z"')
        && query.includes('datetime_lt: "2026-08-09T15:00:00Z"');
    const isFirstLeftHalfDetailWindow = !isSummary
        && query.includes('datetime_geq: "2026-08-08T15:00:00Z"')
        && query.includes('datetime_lt: "2026-08-09T03:00:00.000Z"');
    const fieldName = isSummary ? 'pageloadSummary' : 'pageloads';
    const groups = isSummary
        ? [{ count: 5, avg: { sampleInterval: 2 }, sum: { visits: 3 } }]
        : isFirstFullDetailWindow || isFirstLeftHalfDetailWindow
            ? Array.from({ length: 10000 }, (_, index) => ({
                count: 1,
                dimensions: { requestPath: `/limit-test-${index}` },
                avg: { sampleInterval: 1 },
                sum: { visits: 1 }
            }))
            : [{ count: 2, dimensions: { requestPath: '/' }, avg: { sampleInterval: 1 }, sum: { visits: 1 } }];
    return new Response(JSON.stringify({
        data: {
            viewer: {
                accounts: [{
                    [fieldName]: groups
                }]
            }
        }
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
console.info = () => {};
console.error = () => {};
console.warn = () => {};

try {
    await workerModule.default.scheduled({
        scheduledTime: Date.parse('2026-08-10T01:00:00Z')
    }, env);
} finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.error = originalError;
    console.warn = originalWarn;
}

const summaryQueries = queries.filter(query => query.includes('pageloadSummary:'));
const detailQueries = queries.filter(query => !query.includes('pageloadSummary:'));
assert.equal(summaryQueries.length, 9, 'Eight dates should use one summary query plus one bounded 429 retry.');
assert.equal(detailQueries.length, 12, 'A recursively saturated branch should be split twice.');
assert.equal(batches.length, 8, 'Each collected day should be committed to D1.');
assert.equal(returnedRateLimit, true, 'The 429 retry fixture should run.');
assert.match(queries[0], /2026-08-08T15:00:00Z/);
assert.match(queries[0], /2026-08-09T15:00:00Z/);
assert.match(queries[1], /2026-08-08T15:00:00Z/);
assert.match(queries[1], /2026-08-09T15:00:00Z/);

for (const query of summaryQueries) {
    assert.match(query, /limit: 1/);
    assert.doesNotMatch(query, /dimensions\s*\{/);
}

for (const query of detailQueries) {
    assert.match(query, /limit: 10000/);
    assert.match(query, /dimensions\s*\{/);
    const start = query.match(/datetime_geq: "([^"]+)"/)?.[1];
    const end = query.match(/datetime_lt: "([^"]+)"/)?.[1];
    assert.ok(start && end, 'Every detail query should have a bounded source window.');
    assert.equal(Date.parse(start) % (5 * 60 * 1000), 0, `Split start must be on a five-minute boundary: ${start}`);
    assert.equal(Date.parse(end) % (5 * 60 * 1000), 0, `Split end must be on a five-minute boundary: ${end}`);
}

for (const query of queries) {
    assert.match(query, /rumPageloadEventsAdaptiveGroups/);
    assert.doesNotMatch(query, /rumPerformanceEventsAdaptiveGroups/);
    assert.doesNotMatch(query, /rumWebVitalsEventsAdaptiveGroups/);
}

const firstDailyStatement = batches[0][0];
assert.equal(firstDailyStatement.args[0], '2026-08-09');
assert.equal(firstDailyStatement.args[2], 5, 'D1 totals must come from the ungrouped summary query.');
assert.equal(firstDailyStatement.args[3], 3);
assert.equal(firstDailyStatement.args[5], '2026-08-08T15:00:00Z');
assert.equal(firstDailyStatement.args[6], '2026-08-09T15:00:00Z');

const firstRawDocument = JSON.parse(batches[0].slice(3).map(statement => statement.args[4]).join(''));
assert.equal(firstRawDocument.schemaVersion, 5);
assert.equal(firstRawDocument.source.calendarDate, '2026-08-09');
assert.equal(firstRawDocument.source.calendarTimeZone, 'Asia/Seoul');
assert.equal(firstRawDocument.archiveComplete, true);
assert.equal(firstRawDocument.archiveError, null);
assert.equal(firstRawDocument.source.archiveSegments.length, 3);
assert.equal(firstRawDocument.datasets.pageloadSummary[0].count, 5);
assert.equal(firstRawDocument.datasets.pageloads.length, 3, 'Limit-sized parent responses must not be archived.');

const csvEnv = { ...env, ANALYTICS_CSV_TOKEN: 'csv-secret' };
let response = await workerModule.default.fetch(
    new Request('https://worker.example/analytics.csv'),
    env
);
assert.equal(response.status, 503, 'CSV must fail closed when its secret is not configured.');

response = await workerModule.default.fetch(
    new Request('https://worker.example/analytics.csv'),
    csvEnv
);
assert.equal(response.status, 401);
assert.match(response.headers.get('WWW-Authenticate'), /^Bearer/);

response = await workerModule.default.fetch(
    new Request('https://worker.example/analytics.csv?limit=12.5', {
        headers: { Authorization: 'Bearer csv-secret' }
    }),
    csvEnv
);
assert.equal(response.status, 400);

response = await workerModule.default.fetch(
    new Request('https://worker.example/analytics.csv?limit=5001', {
        headers: { Authorization: 'Bearer csv-secret' }
    }),
    csvEnv
);
assert.equal(response.status, 400);

response = await workerModule.default.fetch(
    new Request('https://worker.example/analytics.csv?limit=25', {
        headers: { Authorization: 'Bearer csv-secret' }
    }),
    csvEnv
);
assert.equal(response.status, 200);
assert.match(response.headers.get('Content-Type'), /^text\/csv/);
const csvStatement = preparedStatements.findLast(statement => /FROM analytics_daily/.test(statement.sql));
assert.deepEqual(csvStatement.args, ['inovancerobot.com', '2026-07-22', 25]);
assert.match(csvStatement.sql, /ORDER BY date DESC\s+LIMIT \?/);
assert.match(csvStatement.sql, /\) AS latest\s+ORDER BY date ASC/);

// Exercise recursive saturation until the per-date query budget fails closed.
// Lower constants keep the fixture small while preserving production control flow.
const constrainedWorkerSource = workerSource
    .replace('const MAX_GROUPS = 10000;', 'const MAX_GROUPS = 4;')
    .replace('const MAX_GRAPHQL_REQUESTS_PER_DATE = 24;', 'const MAX_GRAPHQL_REQUESTS_PER_DATE = 8;')
    .replace('const MAX_GRAPHQL_REQUESTS_PER_RUN = 40;', 'const MAX_GRAPHQL_REQUESTS_PER_RUN = 30;');
const constrainedModule = await import(
    `data:text/javascript;base64,${Buffer.from(constrainedWorkerSource).toString('base64')}`
);
let constrainedFetches = 0;
let constrainedBatches = 0;
const constrainedQueries = [];
const constrainedRawDocuments = [];
const constrainedEnv = {
    ...env,
    ANALYTICS_DB: {
        prepare(sql) {
            const statement = createStatement(sql);
            statement.first = async () => ({ value: 'done' });
            return statement;
        },
        async batch(statements) {
            constrainedBatches += 1;
            constrainedRawDocuments.push(
                JSON.parse(statements.slice(3).map(statement => statement.args[4]).join(''))
            );
            return statements.map(() => ({ success: true }));
        }
    }
};
globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
    constrainedFetches += 1;
    const { query } = JSON.parse(options.body);
    constrainedQueries.push(query);
    const fieldName = query.includes('pageloadSummary:') ? 'pageloadSummary' : 'pageloads';
    const groups = fieldName === 'pageloadSummary'
        ? [{ count: 1, avg: { sampleInterval: 1 }, sum: { visits: 1 } }]
        : Array.from({ length: 4 }, (_, index) => ({
            count: 1,
            dimensions: { requestPath: `/saturated-${index}` },
            avg: { sampleInterval: 1 },
            sum: { visits: 1 }
        }));
    return new Response(JSON.stringify({
        data: { viewer: { accounts: [{ [fieldName]: groups }] } }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
console.info = () => {};
console.error = () => {};
console.warn = () => {};
let constrainedError;
try {
    await constrainedModule.default.scheduled({
        scheduledTime: Date.parse('2026-08-10T01:00:00Z')
    }, constrainedEnv);
} catch (error) {
    constrainedError = error;
} finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.error = originalError;
    console.warn = originalWarn;
}
assert.equal(constrainedError, undefined, 'A detail-only failure must not discard the daily summary.');
assert.equal(constrainedFetches, 24, 'Each of three dates must stop at its eight-request budget.');
assert.equal(constrainedBatches, 3, 'Each exact daily summary must be committed despite detail failure.');
assert.equal(constrainedRawDocuments.length, 3);
for (const document of constrainedRawDocuments) {
    assert.equal(document.archiveComplete, false);
    assert.match(document.archiveError, /request budget exhausted \(8 for KST date/);
    assert.equal(document.datasets.pageloadSummary[0].count, 1);
    assert.deepEqual(document.datasets.pageloads, []);
}
for (const query of constrainedQueries.filter(value => !value.includes('pageloadSummary:'))) {
    const boundaries = [
        query.match(/datetime_geq: "([^"]+)"/)?.[1],
        query.match(/datetime_lt: "([^"]+)"/)?.[1]
    ];
    for (const boundary of boundaries) {
        assert.equal(Date.parse(boundary) % (5 * 60 * 1000), 0);
    }
}

console.log('Analytics Worker OK: KST days, bounded detail splitting/retries, dynamic Sheets, and protected latest CSV.');
