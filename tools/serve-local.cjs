const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = Number(process.argv[2] || 8765);
const virtualBusToken = String(process.env.INOROBOT_VIRTUAL_BUS_TOKEN || '');
const maxVirtualBusMessageBytes = 256 * 1024;
const maxVirtualBusMessagesPerSecond = 100;
const landingFiles = new Map([
    ['/', '0_Home/ko/index.html'],
    ['/kr/', '0_Home/kr/index.html'],
    ['/en/', '0_Home/en/index.html'],
    ['/cn/', '0_Home/zh-CN/index.html'],
    ['/vn/', '0_Home/vi/index.html']
]);

const publicTopLevelDirectories = new Set([
    '0_Home', '1_RobotModelSelect', '2_3DSimulation', '3_ToolSelector',
    '4_ProjectGenerator', '5_Software', '6_Document', '7_DebuggingTool',
    'Language', 'privacy'
]);
const publicRootFiles = new Set([
    'CNAME', 'sitemap.xml', 'analytics.js', 'analytics-config.js', 'visitor-counter.js',
    'site-card-versions.js'
]);
const blockedPathSegments = new Set([
    '.agents', '.cache', '.codex', '.git', '.openai', '.wrangler',
    'backups', 'bin', 'obj', 'publish-stability', 'tmp'
]);
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.fbx': 'application/octet-stream',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xml': 'application/xml; charset=utf-8',
    '.zip': 'application/zip'
};

// The browser cannot bind a TCP port. This process is also the loopback
// Virtual Bus broker. A high-entropy token is mandatory; without it the
// broker remains unavailable rather than accepting unauthenticated peers.
const virtualBus = { olp: null, master: null, lastOlpHello: null, generation: 0 };

function allowedOrigin(origin) {
    if (!origin) return false;
    return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

function isActiveVirtualBusPeer(peer) {
    if (!peer || peer.closed || !peer.role || !peer.authenticated) return false;
    return peer.role === 'slave' ? virtualBus.olp === peer : virtualBus.master === peer;
}

function websocketFrame(payload, opcode = 0x1) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    const first = Buffer.from([0x80 | (opcode & 0x0f)]);
    if (body.length < 126) return Buffer.concat([first, Buffer.from([body.length]), body]);
    if (body.length <= 0xffff) {
        const header = Buffer.alloc(4);
        header[0] = 0x80 | (opcode & 0x0f);
        header[1] = 126;
        header.writeUInt16BE(body.length, 2);
        return Buffer.concat([header, body]);
    }
    const header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
    return Buffer.concat([header, body]);
}

function closeVirtualBusPeer(peer, closeCounterpart = true) {
    if (!peer || peer.closed) return;
    const wasActive = isActiveVirtualBusPeer(peer);
    const pairGeneration = peer.pairGeneration;
    peer.closed = true;
    if (peer.handshakeTimer) clearTimeout(peer.handshakeTimer);
    peer.socket.removeAllListeners('data');
    peer.socket.removeAllListeners('error');
    peer.socket.removeAllListeners('close');
    try { peer.socket.end(websocketFrame(Buffer.alloc(0), 0x8)); } catch { }
    try { peer.socket.destroy(); } catch { }

    if (virtualBus.olp === peer) virtualBus.olp = null;
    if (virtualBus.master === peer) virtualBus.master = null;
    if (peer.role === 'slave' && wasActive) virtualBus.lastOlpHello = null;

    const counterpart = peer.role === 'slave' ? virtualBus.master : virtualBus.olp;
    if (peer.role === 'master' && wasActive && counterpart) {
        void sendVirtualBusText(counterpart, JSON.stringify({
            type: 'busStatus', connected: false, reason: 'masterDisconnected'
        })).then(() => {
            if (virtualBus.master === null && virtualBus.generation === pairGeneration && !counterpart.closed) {
                closeVirtualBusPeer(counterpart, false);
            }
        });
    }
    if (closeCounterpart && wasActive && peer.role !== 'master' && counterpart) {
        closeVirtualBusPeer(counterpart, false);
    }
    console.log(`Virtual Bus ${peer.role || 'unauthorized peer'} disconnected.`);
}

function sendVirtualBusFrame(peer, payload, opcode = 0x1) {
    if (!peer || peer.closed) return Promise.resolve();
    peer.sendQueue = peer.sendQueue
        .catch(() => { })
        .then(() => new Promise((resolve, reject) => {
            if (peer.closed) return resolve();
            peer.socket.write(websocketFrame(payload, opcode), error => error ? reject(error) : resolve());
        }))
        .catch(() => closeVirtualBusPeer(peer));
    return peer.sendQueue;
}

function sendVirtualBusText(peer, text) {
    return sendVirtualBusFrame(peer, text, 0x1);
}

function isValidVirtualBusMessage(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const allowedTypes = new Set([
        'hello', 'goodbye', 'inputSnapshot', 'outputSnapshot', 'ready', 'busStatus'
    ]);
    if (!allowedTypes.has(String(parsed.type || ''))) return false;
    if (parsed.type === 'inputSnapshot') {
        if (!Array.isArray(parsed.words) || parsed.words.length > 256) return false;
        if (parsed.mappedValues && (typeof parsed.mappedValues !== 'object' || Array.isArray(parsed.mappedValues))) return false;
    }
    if (parsed.type === 'outputSnapshot') {
        if (parsed.words && (!Array.isArray(parsed.words) || parsed.words.length > 256)) return false;
    }
    return true;
}

function relayVirtualBusMessage(peer, message) {
    if (Buffer.byteLength(message, 'utf8') > maxVirtualBusMessageBytes) return closeVirtualBusPeer(peer);
    let parsed;
    try { parsed = JSON.parse(message); } catch { return closeVirtualBusPeer(peer); }
    const type = String(parsed?.type || '');

    if (!peer.authenticated) {
        if (type !== 'hello' || !virtualBusToken || parsed.token !== virtualBusToken) return closeVirtualBusPeer(peer);
        const protocol = String(parsed.protocol || '');
        const version = Number(parsed.version);
        const role = String(parsed.role || '').toLowerCase();
        if (protocol !== 'inorobot-virtual-bus' || version !== 1 || !['master', 'slave'].includes(role)) {
            return closeVirtualBusPeer(peer);
        }
        peer.authenticated = true;
        peer.role = role;
        virtualBus.generation += 1;
        peer.pairGeneration = virtualBus.generation;
        if (role === 'slave') {
            if (virtualBus.olp && virtualBus.olp !== peer) closeVirtualBusPeer(virtualBus.olp, false);
            virtualBus.olp = peer;
            virtualBus.lastOlpHello = message;
            if (virtualBus.master) {
                virtualBus.master.pairGeneration = virtualBus.generation;
                void sendVirtualBusText(virtualBus.master, message);
            }
        } else {
            if (virtualBus.master && virtualBus.master !== peer) closeVirtualBusPeer(virtualBus.master, false);
            virtualBus.master = peer;
            if (virtualBus.olp) virtualBus.olp.pairGeneration = virtualBus.generation;
            if (virtualBus.lastOlpHello) void sendVirtualBusText(peer, virtualBus.lastOlpHello);
        }
        if (peer.handshakeTimer) clearTimeout(peer.handshakeTimer);
        console.log(`Virtual Bus ${role} authenticated.`);
        return;
    }

    if (!isValidVirtualBusMessage(parsed)) return closeVirtualBusPeer(peer);
    if (type === 'hello') return closeVirtualBusPeer(peer);
    if (type === 'goodbye') return closeVirtualBusPeer(peer);
    if (!isActiveVirtualBusPeer(peer)) return;
    const target = peer.role === 'slave' ? virtualBus.master : virtualBus.olp;
    if (isActiveVirtualBusPeer(target)) void sendVirtualBusText(target, message);
}

function consumeVirtualBusFrames(peer) {
    while (!peer.closed && peer.buffer.length >= 2) {
        const first = peer.buffer[0];
        const second = peer.buffer[1];
        const opcode = first & 0x0f;
        const masked = (second & 0x80) !== 0;
        if (!masked) return closeVirtualBusPeer(peer);
        let length = second & 0x7f;
        let offset = 2;
        if (length === 126) {
            if (peer.buffer.length < 4) return;
            length = peer.buffer.readUInt16BE(2);
            offset = 4;
        } else if (length === 127) {
            if (peer.buffer.length < 10) return;
            const longLength = peer.buffer.readBigUInt64BE(2);
            if (longLength > BigInt(maxVirtualBusMessageBytes)) return closeVirtualBusPeer(peer);
            length = Number(longLength);
            offset = 10;
        }
        const total = offset + 4 + length;
        if (peer.buffer.length < total) return;
        const maskBytes = peer.buffer.subarray(offset, offset + 4);
        const payload = Buffer.from(peer.buffer.subarray(offset + 4, total));
        peer.buffer = peer.buffer.subarray(total);
        for (let index = 0; index < payload.length; index++) payload[index] ^= maskBytes[index % 4];
        if (payload.length > maxVirtualBusMessageBytes) return closeVirtualBusPeer(peer);
        if (opcode === 0x8) return closeVirtualBusPeer(peer);
        if (opcode === 0x9) {
            void sendVirtualBusFrame(peer, payload, 0xA);
            continue;
        }
        if (opcode !== 0x1) return closeVirtualBusPeer(peer);
        const now = Date.now();
        peer.rateWindow = now - peer.rateWindow.start >= 1000
            ? { start: now, count: 0 }
            : peer.rateWindow;
        peer.rateWindow.count += 1;
        if (peer.rateWindow.count > maxVirtualBusMessagesPerSecond) return closeVirtualBusPeer(peer);
        relayVirtualBusMessage(peer, payload.toString('utf8'));
    }
}

function securityHeaders(contentType) {
    return {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy-Report-Only': "default-src 'self'; object-src 'none'; base-uri 'self'"
    };
}

function sendError(response, statusCode, message) {
    response.writeHead(statusCode, securityHeaders('text/plain; charset=utf-8'));
    response.end(message);
}

function resolvePublicFile(pathname) {
    const relativePath = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!relativePath) return null;
    const segments = relativePath.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) return null;
    if (segments.some(segment => blockedPathSegments.has(segment.toLowerCase()))) return null;
    if (segments.length === 1
        && !publicRootFiles.has(segments[0])
        && !publicTopLevelDirectories.has(segments[0])) return null;
    if (segments.length > 1 && !publicTopLevelDirectories.has(segments[0])) return null;
    let filePath = path.resolve(root, relativePath);
    const relativeToRoot = path.relative(root, filePath);
    if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    return filePath;
}

function originForRequest(request) {
    const origin = request.headers.origin;
    return allowedOrigin(origin) ? origin : null;
}

const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname); }
    catch { sendError(response, 400, 'Bad request'); return; }

    if (pathname === '/api/virtualbus-token') {
        const origin = originForRequest(request);
        if (request.method !== 'GET' || !origin) { sendError(response, 403, 'Forbidden'); return; }
        if (!virtualBusToken) { sendError(response, 503, 'Virtual Bus pairing is not configured.'); return; }
        response.writeHead(200, { ...securityHeaders('application/json; charset=utf-8'), 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
        response.end(JSON.stringify({ ok: true, token: virtualBusToken }));
        return;
    }

    const landingFile = landingFiles.get(pathname);
    const filePath = landingFile ? path.resolve(root, landingFile) : resolvePublicFile(pathname);
    if (!filePath) { sendError(response, 404, 'Not found'); return; }
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, securityHeaders(contentType));
    if (request.method === 'HEAD') { response.end(); return; }
    if (contentType.startsWith('text/html')) {
        const html = fs.readFileSync(filePath, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
        response.end(html);
        return;
    }
    fs.createReadStream(filePath).pipe(response);
});

server.on('upgrade', (request, socket, head) => {
    let pathname;
    try { pathname = new URL(request.url, `http://${host}`).pathname; }
    catch { socket.destroy(); return; }
    if (pathname !== '/virtualbus/' && pathname !== '/virtualbus') { socket.destroy(); return; }
    if (!virtualBusToken || (request.headers.origin && !allowedOrigin(request.headers.origin))) { socket.destroy(); return; }
    const key = request.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);

    const peer = {
        socket, role: null, authenticated: false, pairGeneration: 0, closed: false,
        buffer: Buffer.alloc(0), sendQueue: Promise.resolve(), rateWindowStart: Date.now(),
        rateWindow: { start: Date.now(), count: 0 }, handshakeTimer: null
    };
    peer.handshakeTimer = setTimeout(() => closeVirtualBusPeer(peer), 5000);
    socket.on('data', chunk => {
        if (peer.closed) return;
        if (peer.buffer.length + chunk.length > maxVirtualBusMessageBytes + 64 * 1024) return closeVirtualBusPeer(peer);
        peer.buffer = Buffer.concat([peer.buffer, chunk]);
        consumeVirtualBusFrames(peer);
    });
    socket.on('error', () => closeVirtualBusPeer(peer));
    socket.on('close', () => closeVirtualBusPeer(peer));
    if (head?.length) { peer.buffer = Buffer.from(head); consumeVirtualBusFrames(peer); }
});

server.on('error', error => {
    if (error.code === 'EADDRINUSE') console.error('Port ' + port + ' is already in use. Try: node tools\\serve-local.cjs 8766');
    else console.error(error.message);
    process.exitCode = 1;
});

server.listen(port, host, () => {
    console.log('InoRobot Assistant local server is running.');
    console.log('Open: http://' + host + ':' + port + '/');
    console.log('Virtual Bus broker: ws://' + host + ':' + port + '/virtualbus/');
    console.log(virtualBusToken ? 'Virtual Bus pairing token is configured.' : 'Virtual Bus disabled: set INOROBOT_VIRTUAL_BUS_TOKEN to a high-entropy token.');
    console.log('Stop: Ctrl+C');
});
