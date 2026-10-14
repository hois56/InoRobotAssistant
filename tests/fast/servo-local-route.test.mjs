import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('가상환경의 모션 카드는 서보 페이지와 이미지·스타일을 제공한다', { timeout: 15000 }, async t => {
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));

    const server = spawn(process.execPath, ['tools/serve-local.cjs', String(port)], {
        cwd: root,
        env: { ...process.env, INOROBOT_SERVER_HOST: '127.0.0.1', INOROBOT_VIRTUAL_BUS_TOKEN: '' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const exited = once(server, 'exit');
    t.after(async () => { if (server.exitCode === null) server.kill(); await exited; });
    await new Promise((resolve, reject) => {
        let output = '';
        server.stdout.on('data', chunk => {
            output += chunk;
            if (output.includes('local server is running.')) resolve();
        });
        server.once('error', reject);
        server.once('exit', code => reject(new Error(`Local server exited: ${code}`)));
    });

    const base = `http://127.0.0.1:${port}`;
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /id="motion-card" href="\/Servo\/"/);
    for (const route of ['/Servo/', '/Servo/index.html']) {
        const page = await fetch(base + route);
        assert.equal(page.status, 200, route);
        const html = await page.text();
        assert.match(html, /href="\/Servo\/servo-motion-guide\.png"/);
        assert.match(html, /data-i18n="pages\.servo\.hero\.title"/);
    }
    for (const [route, type] of [
        ['/Servo/style.css', 'text/css'],
        ['/Servo/servo-motion-guide.png', 'image/png']
    ]) {
        const asset = await fetch(base + route, { method: 'HEAD' });
        assert.equal(asset.status, 200, route);
        assert.ok(asset.headers.get('content-type').startsWith(type));
    }
    for (const route of ['/AGENTS.md', '/Servo/.gitkeep', '/Servo/../tools/serve-local.cjs']) {
        assert.equal((await fetch(base + route)).status, 404, route);
    }
});
