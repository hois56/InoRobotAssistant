const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = Number(process.argv[2] || 8765);
const landingFiles = new Map([
    ['/', '0_Home/ko/index.html'],
    ['/kr/', '0_Home/kr/index.html'],
    ['/en/', '0_Home/en/index.html'],
    ['/cn/', '0_Home/zh-CN/index.html'],
    ['/vn/', '0_Home/vi/index.html']
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

// The browser cannot bind a TCP port.  The local simulation launcher is
// therefore also the broker for the loopback Virtual Bus.  The OLP page
// connects as the slave when OLP is enabled; the Communication Tester
// connects as the master when its Connect button is pressed.  No listener is
// opened by the tester process.
const virtualBus = {
    olp: null,
    master: null,
    lastOlpHello: null,
    generation: 0
};

function isActiveVirtualBusPeer(peer) {
    if (!peer || peer.closed || !peer.role) return false;
    return peer.role === 'slave'
        ? virtualBus.olp === peer
        : virtualBus.master === peer;
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
    peer.socket.removeAllListeners('data');
    peer.socket.removeAllListeners('error');
    peer.socket.removeAllListeners('close');
    try { peer.socket.end(websocketFrame(Buffer.alloc(0), 0x8)); } catch { }
    try { peer.socket.destroy(); } catch { }

    if (virtualBus.olp === peer) virtualBus.olp = null;
    if (virtualBus.master === peer) virtualBus.master = null;
    if (peer.role === 'slave' && wasActive) virtualBus.lastOlpHello = null;

    const counterpart = peer.role === 'slave' ? virtualBus.master : virtualBus.olp;
    // The tester is the master.  Its disconnect must not tear down the OLP
    // browser socket: OLP stays locally executable and can accept a tester
    // reconnect.  Notify the slave explicitly so its green indicator cannot
    // remain latched to the previous handshake.
    if (peer.role === 'master' && wasActive && counterpart) {
        const disconnectNotice = sendVirtualBusText(counterpart, JSON.stringify({
            type: 'busStatus',
            connected: false,
            reason: 'masterDisconnected'
        }));
        // Close the old slave transport after the notice is queued.  The OLP
        // close handler reconnects it in waiting state, which also makes the
        // transport state authoritative if the browser misses the notice.
        void disconnectNotice.then(() => {
            // A new master may have completed a handshake while the old
            // disconnect notice was queued. Never tear down the new pair.
            if (virtualBus.master === null
                && virtualBus.generation === pairGeneration
                && !counterpart.closed) closeVirtualBusPeer(counterpart, false);
        });
    }
    if (closeCounterpart && wasActive && peer.role !== 'master' && counterpart) {
        closeVirtualBusPeer(counterpart, false);
    }
    console.log(`Virtual Bus ${peer.role || 'peer'} disconnected.`);
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

function relayVirtualBusMessage(peer, message) {
    let parsed;
    try { parsed = JSON.parse(message); } catch { return; }
    const type = String(parsed?.type || '');

    if (type === 'hello') {
        const protocol = String(parsed.protocol || '');
        const version = Number(parsed.version);
        if (protocol !== 'inorobot-virtual-bus' || version !== 1) {
            closeVirtualBusPeer(peer);
            return;
        }
        const requestedRole = String(parsed.role || '').toLowerCase();
        if (requestedRole !== 'master' && requestedRole !== 'slave') {
            closeVirtualBusPeer(peer);
            return;
        }
        const role = requestedRole;
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
        console.log(`Virtual Bus ${role} connected.`);
        return;
    }

    if (type === 'goodbye') {
        closeVirtualBusPeer(peer);
        return;
    }

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
        let length = second & 0x7f;
        let offset = 2;
        if (length === 126) {
            if (peer.buffer.length < 4) return;
            length = peer.buffer.readUInt16BE(2);
            offset = 4;
        } else if (length === 127) {
            if (peer.buffer.length < 10) return;
            const longLength = peer.buffer.readBigUInt64BE(2);
            if (longLength > BigInt(16 * 1024 * 1024)) return closeVirtualBusPeer(peer);
            length = Number(longLength);
            offset = 10;
        }
        const maskOffset = masked ? offset : -1;
        const maskBytes = masked ? Buffer.from(peer.buffer.subarray(maskOffset, maskOffset + 4)) : null;
        if (masked) offset += 4;
        const total = offset + length;
        if (peer.buffer.length < total) return;
        const payload = Buffer.from(peer.buffer.subarray(offset, total));
        peer.buffer = peer.buffer.subarray(total);
        if (masked) {
            for (let index = 0; index < payload.length; index++) payload[index] ^= maskBytes[index % 4];
        }
        if (opcode === 0x8) return closeVirtualBusPeer(peer);
        if (opcode === 0x9) {
            void sendVirtualBusFrame(peer, payload, 0xA);
            continue;
        }
        if (opcode === 0x1) relayVirtualBusMessage(peer, payload.toString('utf8'));
    }
}

function sendError(response, statusCode, message) {
    response.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    response.end(message);
}

const server = http.createServer((request, response) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, 'http://' + host).pathname);
    } catch {
        sendError(response, 400, 'Bad request');
        return;
    }

    const landingFile = landingFiles.get(pathname);
    let filePath = landingFile
        ? path.resolve(root, landingFile)
        : path.resolve(root, '.' + pathname);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
        sendError(response, 403, 'Forbidden');
        return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        sendError(response, 404, 'Not found');
        return;
    }

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
    });
    if (request.method === 'HEAD') {
        response.end();
        return;
    }
    if (contentType.startsWith('text/html')) {
        const html = fs.readFileSync(filePath, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
        response.end(html);
        return;
    }
    fs.createReadStream(filePath).pipe(response);
});

server.on('upgrade', (request, socket, head) => {
    let pathname;
    try {
        pathname = new URL(request.url, 'http://' + host).pathname;
    } catch {
        socket.destroy();
        return;
    }
    if (pathname !== '/virtualbus/' && pathname !== '/virtualbus') {
        socket.destroy();
        return;
    }

    const key = request.headers['sec-websocket-key'];
    if (!key) {
        socket.destroy();
        return;
    }
    const accept = crypto.createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n'
        + 'Upgrade: websocket\r\n'
        + 'Connection: Upgrade\r\n'
        + 'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
    );
    socket.setNoDelay(true);

    const peer = {
        socket,
        role: null,
        pairGeneration: 0,
        closed: false,
        buffer: Buffer.alloc(0),
        sendQueue: Promise.resolve()
    };
    socket.on('data', chunk => {
        if (peer.closed) return;
        peer.buffer = Buffer.concat([peer.buffer, chunk]);
        consumeVirtualBusFrames(peer);
    });
    socket.on('error', () => closeVirtualBusPeer(peer));
    socket.on('close', () => closeVirtualBusPeer(peer));
    if (head?.length) {
        peer.buffer = Buffer.from(head);
        consumeVirtualBusFrames(peer);
    }
});

server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
        console.error('Port ' + port + ' is already in use. Try: node tools\\serve-local.cjs 8766');
    } else {
        console.error(error.message);
    }
    process.exitCode = 1;
});

server.listen(port, host, () => {
    console.log('InoRobot Assistant local server is running.');
    console.log('Open: http://' + host + ':' + port + '/');
    console.log('Virtual Bus broker: ws://' + host + ':' + port + '/virtualbus/');
    console.log('Stop: Ctrl+C');
});
