/**
 * InoRobot3DView — 로컬 웹 서버
 * 실행: node server.js
 * 접속: http://localhost:5173
 *
 * 기능:
 *  - 정적 파일 서빙 (html, css, js, stp, png 등)
 *  - GET /api/models  → models/ 폴더의 .stp 파일 목록 반환 (JSON)
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = 5173;
const BASE_DIR = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.stp':  'application/octet-stream',
    '.step': 'application/octet-stream',
    '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const url = req.url.split('?')[0];

    // ── API: 모델 파일 목록 ──────────────────────────────
    if (url === '/api/models') {
        const modelsDir = path.join(BASE_DIR, 'models');
        try {
            const files = fs.readdirSync(modelsDir).filter(f =>
                f.toLowerCase().endsWith('.stp') || f.toLowerCase().endsWith('.step')
            ).sort();

            const list = files.map(f => ({
                name: f.replace(/\.(stp|step)$/i, ''),
                file: f
            }));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(list));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // ── 정적 파일 서빙 ────────────────────────────────────
    let filePath = path.join(BASE_DIR, url === '/' ? 'index.html' : url);

    // 디렉토리면 index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found: ' + url);
            return;
        }

        const ext  = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║   InoRobot 3D Viewer — Local Server      ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║   URL : http://localhost:${PORT}           ║`);
    console.log('  ║   종료 : Ctrl + C                        ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');

    // 브라우저 자동 열기 (Windows)
    const { exec } = require('child_process');
    exec(`start http://localhost:${PORT}`);
});
