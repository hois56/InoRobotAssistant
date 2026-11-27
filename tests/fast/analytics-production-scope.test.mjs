import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const analytics = readFileSync(new URL('../../analytics.js', import.meta.url), 'utf8');
const counter = readFileSync(new URL('../../visitor-counter.js', import.meta.url), 'utf8');

function run(url, { embeddedManual = false, alreadyLoaded = false } = {}) {
    const scripts = [], requests = [];
    const location = new URL(url);
    if (embeddedManual) location.search = '?embed=manual';
    const window = { location, INOROBOT_ANALYTICS_CONFIG: { provider: 'cloudflare-web-analytics', token: 'test-token' } };
    window.self = window;
    window.top = embeddedManual ? {} : window;
    const count = { textContent: 'visits 2,031' };
    const document = {
        querySelector: () => alreadyLoaded ? {} : null,
        createElement: () => ({ dataset: {} }),
        head: { appendChild: script => scripts.push(script) },
        getElementById: id => id === 'visit-count' ? count : null
    };
    const fetch = (...args) => { requests.push(args); return Promise.resolve({ ok: false }); };
    vm.runInNewContext(analytics, { window, document, URLSearchParams });
    vm.runInNewContext(counter, { window, document, fetch });
    return { scripts, requests, count: count.textContent };
}

test('운영 호스트에서만 웹 분석 비콘과 누적 카운터가 동작한다', () => {
    for (const host of ['inovancerobot.com', 'www.inovancerobot.com']) {
        const { scripts, requests } = run('https://' + host + '/en/');
        assert.equal(scripts.length, 1);
        assert.equal(scripts[0].src, 'https://static.cloudflareinsights.com/beacon.min.js');
        assert.equal(requests.length, 1);
        assert.equal(requests[0][1].method, 'POST');
    }
});

test('로컬·파일·미리보기·유사 호스트는 운영 분석 요청이 없다', () => {
    for (const url of ['http://localhost:4173/', 'http://127.0.0.1:4173/', 'https://[::1]/', 'http://192.168.1.2/',
        'file:///C:/preview/index.html', 'https://hois56.github.io/InoRobotAssistant/', 'https://preview.inovancerobot.com/',
        'https://inovancerobot.com.evil.example/', 'http://inovancerobot.com/', 'https://inovancerobot.com@localhost/']) {
        const { scripts, requests, count } = run(url);
        assert.equal(scripts.length, 0, url);
        assert.equal(requests.length, 0, url);
        assert.equal(count, 'visits 2,031');
    }
});

test('운영 화면의 중복 비콘 및 임베드 매뉴얼 제외는 유지한다', () => {
    assert.equal(run('https://inovancerobot.com/', { embeddedManual: true }).scripts.length, 0);
    assert.equal(run('https://inovancerobot.com/', { alreadyLoaded: true }).scripts.length, 0);
});
