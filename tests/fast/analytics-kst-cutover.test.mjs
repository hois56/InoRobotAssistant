import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync } from 'node:crypto';

const file = new URL('../../5_Software/analytics-worker/worker.js', import.meta.url);
const source = readFileSync(file, 'utf8');
const exportForTest = source + '\nexport { getCollectionPlan, collectDate, hasKstWindow, syncGoogleSheet };';
const { default: worker, getCollectionPlan, collectDate, hasKstWindow, syncGoogleSheet } = await import(
    'data:text/javascript;base64,' + Buffer.from(exportForTest).toString('base64')
);

test('안전 전환은 과거 전체를 재수집하지 않고 완료된 한국 날짜만 수집한다', async () => {
    const db = { prepare() { assert.fail('cutover should not access historical-backfill state'); } };
    const env = { WEB_ANALYTICS_KST_CUTOVER_DATE: '2026-11-27', ANALYTICS_DB: db };
    assert.deepEqual(await getCollectionPlan(new Date('2026-11-27T01:00:00Z'), env), {
        backfill: false, dates: [], cutoverDate: '2026-11-27'
    });
    assert.deepEqual(await getCollectionPlan(new Date('2026-11-28T01:00:00Z'), env), {
        backfill: false, dates: ['2026-11-27'], cutoverDate: '2026-11-27'
    });
    await assert.rejects(getCollectionPlan(new Date('2026-11-28T01:00:00Z'), {
        ...env, WEB_ANALYTICS_KST_CUTOVER_DATE: '2026-11-31'
    }), /Invalid Korean calendar date/);
});

test('9시 기준 기존 행은 보존하고 날짜가 맞는 자정 구간만 통과한다', async () => {
    const date = '2026-11-27';
    const oldRow = { source_window_start: '2026-11-27T00:00:00Z', source_window_end: '2026-11-28T00:00:00Z' };
    const kstRow = { source_window_start: '2026-11-26T15:00:00.000Z', source_window_end: '2026-11-27T15:00:00Z' };
    assert.equal(hasKstWindow(date, oldRow), false);
    assert.equal(hasKstWindow(date, kstRow), true);
    assert.equal(hasKstWindow('2026-11-28', kstRow), false);
    const db = {
        prepare(sql) {
            assert.match(sql, /^SELECT source_window_start/);
            return { bind(foundDate, host) {
                assert.equal(foundDate, date);
                assert.equal(host, 'inovancerobot.com');
                return { first: async () => oldRow };
            } };
        }
    };
    assert.deepEqual(await collectDate(date, {
        WEB_ANALYTICS_KST_CUTOVER_DATE: date, WEB_ANALYTICS_HOST: 'inovancerobot.com', ANALYTICS_DB: db
    }), { date, skipped: 'legacy-window-preserved' });
});


const productionHost = 'inovancerobot.com';
const legacy = (date, start, end, host = productionHost) => ({
    date, host, source_window_start: start, source_window_end: end,
    page_views: 14, referrer_visits: 3, sample_interval: 1,
    collected_at: '2026-11-27T01:00:00Z'
});
const fixtures = [
    legacy('2026-07-21', '2026-07-21T00:00:00Z', '2026-07-22T00:00:00Z'),
    legacy('2026-11-23', '2026-11-22T15:00:00Z', '2026-11-23T15:00:00Z'),
    legacy('2026-11-24', '2026-11-24T00:00:00Z', '2026-11-25T00:00:00Z', '127.0.0.1'),
    legacy('2026-11-25', '2026-11-25T00:00:00Z', '2026-11-26T00:00:00Z'),
    legacy('2026-11-26', '2026-11-26T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
    legacy('2026-11-27', '2026-11-26T15:00:00Z', '2026-11-27T15:00:00Z'),
    legacy('2026-11-28', '2026-11-28T00:00:00Z', '2026-11-29T00:00:00Z')
];

function makeFixtureD1() {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE analytics_daily (date TEXT, host TEXT, page_views INTEGER, referrer_visits INTEGER, sample_interval REAL, source_window_start TEXT, source_window_end TEXT, collected_at TEXT)');
    const insert = db.prepare('INSERT INTO analytics_daily VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const row of fixtures) insert.run(row.date, row.host, row.page_views, row.referrer_visits,
        row.sample_interval, row.source_window_start, row.source_window_end, row.collected_at);
    return {
        ANALYTICS_DB: {
            prepare(sql) {
                const query = db.prepare(sql);
                return { bind: (...params) => ({ all: async () => ({ results: query.all(...params) }) }) };
            }
        },
        close: () => db.close()
    };
}

test('공개 CSV는 기존 형식을 유지하고 다른 호스트·KST·컷오버 이후 자료를 내보내지 않는다', async () => {
    const db = makeFixtureD1();
    try {
        const env = { ...db, WEB_ANALYTICS_HOST: productionHost, WEB_ANALYTICS_KST_CUTOVER_DATE: '2026-11-27' };
        const res = await worker.fetch(new Request('https://worker.example/analytics.csv'), env);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('Content-Type'), 'text/csv; charset=utf-8');
        assert.equal(res.headers.get('Content-Disposition'), 'attachment; filename="analytics_daily.csv"');
        assert.equal(res.headers.get('Cache-Control'), 'no-store');
        const csv = Buffer.from(await res.arrayBuffer()).toString('utf8');
        const expected = '\uFEFFdate,host,page_views,referrer_visits,sample_interval,source_window_start,source_window_end,collected_at\r\n';
        assert.ok(csv.startsWith(expected));
        const dates = csv.slice(expected.length).trim().split('\r\n').map(row => row.split(',')[0]);
        assert.deepEqual(dates, ['2026-11-25', '2026-11-26']);
        const one = await worker.fetch(new Request('https://worker.example/analytics.csv?limit=1'), env);
        assert.match(await one.text(), /2026-11-25,inovancerobot\.com/);
    } finally {
        db.close();
    }
});

test('새 자정 집계는 오직 Daily_KST에 유효한 완료일만 쓴다', async () => {
    const db = makeFixtureD1();
    const savedFetch = globalThis.fetch;
    const calls = [];
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    globalThis.fetch = async (url, options) => {
        calls.push({ url, method: options.method, body: options.body });
        if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'mock' });
        if (url.includes('?fields=')) return Response.json({ sheets: [{ properties: { title: 'Daily', sheetId: 0, gridProperties: { rowCount: 1000 } } }] });
        return Response.json({});
    };
    try {
        const res = await syncGoogleSheet({
            ...db,
            WEB_ANALYTICS_HOST: productionHost,
            GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com',
            GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
            GOOGLE_SHEETS_ID: 'test-spreadsheet'
        }, '2026-11-27');
        assert.equal(res.rows, 1);
        assert.equal(res.trendSheet, null);
        assert.equal(calls.length, 5);
        assert.ok(calls[2].url.endsWith('test-spreadsheet:batchUpdate'));
        assert.equal(JSON.parse(calls[2].body).requests[0].addSheet.properties.title, 'Daily_KST');
        const data = JSON.parse(calls[3].body).data;
        assert.deepEqual(data.map(part => part.range), ['Daily_KST!A1:H1', 'Daily_KST!A2']);
        assert.deepEqual(data[1].values[0].slice(0, 2), ['2026-11-27', productionHost]);
        assert.deepEqual(data[1].values[0].slice(5, 7), ['2026-11-27 00:00:00', '2026-11-28 00:00:00']);
        assert.match(decodeURIComponent(calls[4].url), /Daily_KST!A3:H:clear$/);
    } finally {
        globalThis.fetch = savedFetch;
        db.close();
    }
});