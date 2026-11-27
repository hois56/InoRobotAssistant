import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.TEST_SERVER_PORT || 4173);
const landingPaths = new Map([
  ['/', '/0_Home/ko/index.html'],
  ['/kr/', '/0_Home/kr/index.html'],
  ['/en/', '/0_Home/en/index.html'],
  ['/cn/', '/0_Home/zh-CN/index.html'],
  ['/vn/', '/0_Home/vi/index.html'],
  ['/tr/', '/0_Home/tr/index.html'],
  ['/ru/', '/0_Home/ru/index.html']
]);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.zip', 'application/zip']
]);

const previewRoute = '/__preview/luna-chat';
const previewEnabled = process.argv.includes('--luna-live');
const previewKeyPath = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'InoRobotAssistant', 'preview-chat.key') : '';
function loadPreviewKey() {
  try {
    const key = fs.readFileSync(previewKeyPath, 'utf8').trim();
    return /^[a-f0-9]{64}$/.test(key) ? key : '';
  } catch { return ''; }
}

async function previewChat(request, response) {
  const send = (status, value, mode) => response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(['luna','unverified'].includes(mode) ? {'X-Ino-Answer-Mode':mode} : {})
  }).end(value);
  if (!previewEnabled) return send(404, '{"code":"disabled"}');
  const hosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
  const hostHeader = request.headers.host;
  // No cross-site requests, no generic proxy, and no API key on the local machine.
  if (!hosts.has(hostHeader) || request.headers.origin !== 'http://' + hostHeader
      || !['127.0.0.1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) {
    return send(403, '{"code":"origin"}');
  }
  if (request.method !== 'POST') return send(405, '{"code":"method"}');
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
    return send(415, '{"code":"content_type"}');
  }
  const key = loadPreviewKey();
  if (!key) return send(503, '{"code":"unavailable"}');
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 8192) return send(413, '{"code":"too_large"}');
      chunks.push(chunk);
    }
    const upstream = await fetch('https://inorobot-web-assistant.hois56.workers.dev/v1/preview/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://inovancerobot.com', 'Authorization': 'Bearer '+key },
      body: Buffer.concat(chunks),
      redirect: 'error',
      signal: AbortSignal.timeout(21000)
    });
    return send(upstream.status, await upstream.text(), upstream.headers.get('X-Ino-Answer-Mode'));
  } catch {
    return send(503, '{"code":"unavailable"}');
  }
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
    return;
  }

  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(request.url || '/', `http://${host}:${port}`).pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  if (requestPath === previewRoute) {
    void previewChat(request, response);
    return;
  }

  const landingPath = requestPath.replace(/\/index\.html$/i, '/').replace(/\/?$/, '/');
  if (landingPath === '/ko/' || (previewEnabled && landingPath === '/0_Home/ko/')) {
    const query = new URL(request.url || '/', 'http://127.0.0.1').search;
    response.writeHead(302, { location: '/kr/' + query, 'cache-control': 'no-store' }).end();
    return;
  }
  requestPath = landingPaths.get(landingPath) || requestPath;
  const filePath = path.resolve(repoRoot, `.${requestPath}`);
  const relative = path.relative(repoRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  let target = filePath;
  try {
    if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    const stats = fs.statSync(target);
    if (!stats.isFile()) throw new Error('Not a file');
    if (/^0_Home[\\/][^\\/]+[\\/]index\.html$/i.test(path.relative(repoRoot, target))) {
      const contents = fs.readFileSync(target, 'utf8').replace(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(contents), 'cache-control': 'no-store' }).end(contents);
      return;
    }
    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'content-length': stats.size,
      'cache-control': 'no-store'
    });
    fs.createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, host, () => console.log(`Regression test server listening at http://${host}:${port}`));
server.on('error', error => {
  console.error(`Regression test server failed: ${error.message}`);
  process.exitCode = 1;
});

function stop() {
  server.close(() => process.exit());
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
