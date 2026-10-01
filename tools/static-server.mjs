import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.TEST_SERVER_PORT || 4173);
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

  if (requestPath === '/') requestPath = '/0_Home/ko/index.html';
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
