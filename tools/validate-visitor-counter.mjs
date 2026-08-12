import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const workerSource = await readFile(
    new URL('../5_Software/visitor-counter-worker/worker.js', import.meta.url),
    'utf8'
);
const wranglerSource = await readFile(
    new URL('../5_Software/visitor-counter-worker/wrangler.toml', import.meta.url),
    'utf8'
);
const readmeSource = await readFile(
    new URL('../5_Software/visitor-counter-worker/README.md', import.meta.url),
    'utf8'
);
const clientSource = await readFile(new URL('../visitor-counter.js', import.meta.url), 'utf8');
const workerModule = await import(
    `data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`
);

assert.match(workerSource, /const VISITOR_START_COUNT = 1800;/);
assert.match(workerSource, /const VISITOR_MIGRATION_FLOOR = 2031;/);
assert.match(workerSource, /const VISITOR_IP_WINDOW_LIMIT = 10;/);
assert.match(workerSource, /state\.storage\.transactionSync/);
assert.match(workerSource, /CREATE TABLE IF NOT EXISTS counter_state/);
assert.match(workerSource, /CREATE TABLE IF NOT EXISTS seen_visitors/);
assert.match(workerSource, /legacy_imported_total/);
assert.match(workerSource, /HMAC/);
assert.match(workerSource, /visitor-counter-legacy-seen/);
assert.doesNotMatch(workerSource, /\.one\(\)/);
assert.doesNotMatch(workerSource, /put\(VISITOR_TOTAL_KEY/);
assert.match(wranglerSource, /\[\[durable_objects\.bindings\]\]/);
assert.match(wranglerSource, /\[exports\.VisitorCounter\]/);
assert.doesNotMatch(wranglerSource, /\[\[migrations\]\]/);
assert.match(readmeSource, /migration floor[^\n]*`2031`/i);
assert.match(readmeSource, /VISITOR_HASH_SECRET/);
assert.match(clientSource, /const visitCounterStart = 2031;/);
assert.match(clientSource, /Math\.max\(fallbackCount/);
assert.match(clientSource, /currentText\.replace\(\/\[0-9\]\[0-9,\]\*\//);

async function renderClientCount(initialText, total) {
    const counter = { textContent: initialText };
    vm.runInNewContext(clientSource, {
        document: { getElementById: id => id === 'visit-count' ? counter : null },
        fetch: async () => ({
            ok: true,
            json: async () => ({ ok: true, total })
        })
    });
    await new Promise(resolve => setImmediate(resolve));
    return counter.textContent;
}

assert.equal(await renderClientCount('방문 2,031', 2045), '방문 2,045');
assert.equal(await renderClientCount('2,031 visits', 2045), '2,045 visits');
assert.equal(await renderClientCount('访问量 2,031', 2045), '访问量 2,045');
assert.equal(await renderClientCount('2,031 lượt truy cập', 2045), '2,045 lượt truy cập');

const { default: worker, VisitorCounter } = workerModule;

function rows(value) {
    return {
        toArray: () => value === null || value === undefined ? [] : [value],
        one() {
            if (value === null || value === undefined) {
                throw new Error('Expected exactly one result, but got none.');
            }
            return value;
        }
    };
}

function createSqlStore() {
    const database = { state: null, seen: new Map() };
    return {
        database,
        sql: {
            exec(statement, ...args) {
                const sql = String(statement).replace(/\s+/g, ' ').trim();
                if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) return rows(null);
                if (sql.startsWith('SELECT total, legacy_imported_total')) {
                    return rows(database.state && {
                        total: database.state.total,
                        legacy_imported_total: database.state.legacyImportedTotal
                    });
                }
                if (sql.startsWith('INSERT INTO counter_state')) {
                    database.state = {
                        total: Number(args[0]),
                        legacyImportedTotal: Number(args[1]),
                        createdAt: Number(args[2]),
                        updatedAt: Number(args[3])
                    };
                    return rows(null);
                }
                if (sql.includes('SET total = ?, legacy_imported_total = ?')) {
                    database.state.total = Number(args[0]);
                    database.state.legacyImportedTotal = Number(args[1]);
                    database.state.updatedAt = Number(args[2]);
                    return rows(null);
                }
                if (sql.startsWith('UPDATE counter_state SET total = ?')) {
                    database.state.total = Number(args[0]);
                    database.state.updatedAt = Number(args[1]);
                    return rows(null);
                }
                if (sql.startsWith('DELETE FROM seen_visitors')) {
                    const now = Number(args[0]);
                    for (const [hash, item] of database.seen) {
                        if (item.expiresAt <= now) database.seen.delete(hash);
                    }
                    return rows(null);
                }
                if (sql.startsWith('SELECT expires_at FROM seen_visitors')) {
                    const item = database.seen.get(args[0]);
                    return rows(item && { expires_at: item.expiresAt });
                }
                if (sql.startsWith('SELECT COUNT(*) AS active_count')) {
                    const [ipHash, now] = args;
                    const count = [...database.seen.values()]
                        .filter(item => item.ipHash === ipHash && item.expiresAt > Number(now))
                        .length;
                    return rows({ active_count: count });
                }
                if (sql.startsWith('INSERT INTO seen_visitors')) {
                    const [visitorHash, ipHash, expiresAt] = args;
                    const prior = database.seen.get(visitorHash);
                    database.seen.set(visitorHash, {
                        ipHash,
                        expiresAt: sql.includes('MAX(seen_visitors.expires_at')
                            ? Math.max(prior?.expiresAt || 0, Number(expiresAt))
                            : Number(expiresAt)
                    });
                    return rows(null);
                }
                throw new Error(`Unexpected SQL in visitor-counter validator: ${sql}`);
            }
        }
    };
}

async function createCounter(legacyTotal) {
    const store = createSqlStore();
    const env = {
        VISITOR_KV: {
            async get(key) {
                return key === 'visitor:total' ? legacyTotal.value : null;
            }
        }
    };
    const state = {
        storage: {
            sql: store.sql,
            transactionSync(callback) {
                return callback();
            }
        },
        blockConcurrencyWhile(callback) {
            this.ready = Promise.resolve().then(callback);
            return this.ready;
        }
    };
    const counter = new VisitorCounter(state, env);
    await state.ready;
    return { counter, store, legacyTotal };
}

function hash(value) {
    return BigInt(value).toString(16).padStart(64, '0').slice(-64);
}

async function counterAction(counter, payload) {
    const response = await counter.fetch(new Request('https://counter.internal/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }));
    assert.equal(response.status, 200);
    return response.json();
}

for (const [legacyValue, expected] of [[null, 2031], ['1799', 2031], ['2030', 2031], ['2031', 2031], ['2037', 2037]]) {
    const { counter } = await createCounter({ value: legacyValue });
    const result = await counterAction(counter, { action: 'read' });
    assert.equal(result.total, expected);
    assert.equal(result.counted, false);
}

const fixture = await createCounter({ value: '2037' });
const firstVisit = await counterAction(fixture.counter, {
    action: 'visit', visitorHash: hash(1), ipHash: hash(1001), legacySeenUntil: 0
});
assert.equal(firstVisit.total, 2038);
assert.equal(firstVisit.counted, true);
const duplicate = await counterAction(fixture.counter, {
    action: 'visit', visitorHash: hash(1), ipHash: hash(1001), legacySeenUntil: 0
});
assert.equal(duplicate.total, 2038);
assert.equal(duplicate.deduped, true);

const beforeUniqueBurst = fixture.store.database.state.total;
const uniqueBurst = await Promise.all(Array.from({ length: 100 }, (_, index) => counterAction(
    fixture.counter,
    {
        action: 'visit',
        visitorHash: hash(10_000 + index),
        ipHash: hash(20_000 + index),
        legacySeenUntil: 0
    }
)));
assert.equal(uniqueBurst.filter(result => result.counted).length, 100);
assert.equal(fixture.store.database.state.total, beforeUniqueBurst + 100);

const concurrentHash = hash(99_999);
const beforeDuplicateBurst = fixture.store.database.state.total;
const duplicateBurst = await Promise.all(Array.from({ length: 100 }, () => counterAction(
    fixture.counter,
    { action: 'visit', visitorHash: concurrentHash, ipHash: hash(88_888), legacySeenUntil: 0 }
)));
assert.equal(duplicateBurst.filter(result => result.counted).length, 1);
assert.equal(fixture.store.database.state.total, beforeDuplicateBurst + 1);

const beforeRateLimit = fixture.store.database.state.total;
const rateResults = [];
for (let index = 0; index < 11; index += 1) {
    rateResults.push(await counterAction(fixture.counter, {
        action: 'visit',
        visitorHash: hash(300_000 + index),
        ipHash: hash(777_777),
        legacySeenUntil: 0
    }));
}
assert.equal(rateResults.filter(result => result.counted).length, 10);
assert.equal(rateResults.at(-1).rateLimited, true);
assert.equal(fixture.store.database.state.total, beforeRateLimit + 10);

const beforeLegacySeen = fixture.store.database.state.total;
const legacyDuplicate = await counterAction(fixture.counter, {
    action: 'visit',
    visitorHash: hash(400_001),
    ipHash: hash(400_002),
    legacySeenUntil: Date.now() + 60_000
});
assert.equal(legacyDuplicate.deduped, true);
assert.equal(fixture.store.database.state.total, beforeLegacySeen);

fixture.legacyTotal.value = '2040';
const beforeReconcile = fixture.store.database.state.total;
const afterStaleLegacy = await counterAction(fixture.counter, { action: 'read' });
// The DO already grew beyond the legacy store; only the positive legacy delta
// (2040 - 2037) is reconciled once, without replacing the DO total.
assert.equal(afterStaleLegacy.total, beforeReconcile + 3);
assert.equal(fixture.store.database.state.legacyImportedTotal, 2040);
const reconciledTotal = afterStaleLegacy.total;
fixture.legacyTotal.value = '2039';
assert.equal((await counterAction(fixture.counter, { action: 'read' })).total, reconciledTotal);

const forwarded = [];
const legacyWrites = [];
const now = Date.now();
const outerEnv = {
    ALLOWED_ORIGINS: 'https://inovancerobot.com,https://www.inovancerobot.com',
    VISITOR_HASH_SECRET: 'validator-secret-that-is-not-committed',
    VISITOR_KV: {
        async get(key) {
            if (key === 'visitor:total') return '2031';
            if (key.startsWith('visitor:seen:')) return String(now - 1000);
            return null;
        },
        async put(...args) {
            legacyWrites.push(args);
        }
    },
    VISITOR_COUNTER: {
        getByName(name) {
            assert.equal(name, 'site-total-v1');
            return {
                async fetch(_url, init) {
                    const payload = JSON.parse(init.body);
                    forwarded.push(payload);
                    return new Response(JSON.stringify({
                        ok: true,
                        total: 2031,
                        counted: payload.action === 'visit',
                        deduped: false,
                        rateLimited: false
                    }), { headers: { 'Content-Type': 'application/json' } });
                }
            };
        }
    }
};
const originHeaders = {
    Origin: 'https://inovancerobot.com',
    'CF-Connecting-IP': '203.0.113.10',
    'User-Agent': 'visitor-counter-validator',
    'Accept-Language': 'ko-KR'
};
const getResponse = await worker.fetch(new Request('https://worker.test/visit', {
    headers: originHeaders
}), outerEnv);
assert.equal(getResponse.status, 200);
assert.equal(forwarded.at(-1).action, 'read');
assert.equal(getResponse.headers.get('Access-Control-Allow-Origin'), 'https://inovancerobot.com');

const postResponse = await worker.fetch(new Request('https://worker.test/visit', {
    method: 'POST', headers: originHeaders
}), outerEnv);
assert.equal(postResponse.status, 200);
assert.match(forwarded.at(-1).visitorHash, /^[a-f0-9]{64}$/);
assert.match(forwarded.at(-1).ipHash, /^[a-f0-9]{64}$/);
assert.notEqual(forwarded.at(-1).visitorHash, forwarded.at(-1).ipHash);
assert.ok(forwarded.at(-1).legacySeenUntil > now);
assert.equal(legacyWrites.length, 1);
assert.match(legacyWrites[0][0], /^visitor:seen:[a-f0-9]{64}$/);
assert.deepEqual(legacyWrites[0][2], { expirationTtl: 300 });

const missingDoResponse = await worker.fetch(new Request('https://worker.test/visit', {
    headers: originHeaders
}), { ...outerEnv, VISITOR_COUNTER: undefined });
assert.equal(missingDoResponse.status, 503);
assert.equal((await missingDoResponse.json()).total, 2031);
assert.equal((await worker.fetch(new Request('https://worker.test/visit', {
    headers: { Origin: 'https://example.com' }
}), outerEnv)).status, 403);
assert.equal((await worker.fetch(new Request('https://worker.test/visit', {
    method: 'OPTIONS', headers: { Origin: 'https://inovancerobot.com' }
}), outerEnv)).status, 204);
assert.equal((await worker.fetch(new Request('https://worker.test/visit', {
    method: 'PUT', headers: originHeaders
}), outerEnv)).status, 405);
assert.equal((await worker.fetch(new Request('https://worker.test/other', {
    headers: originHeaders
}), outerEnv)).status, 404);

console.log('Visitor Counter OK: 2,031 migration floor, atomic increments, dedupe, rate cap, and KV bridge.');
