'use strict';
// WebSocket session between the 3D simulation page and one virtual vision
// endpoint. The page authenticates with the local pairing token, sends the
// endpoint configuration and result words, and receives robot commands,
// socket text and frame logs.

const crypto = require('crypto');
const { VirtualVisionEndpoint } = require('./virtual-vision-protocols.cjs');

const MAX_MESSAGE_BYTES = 128 * 1024;
const MAX_MESSAGES_PER_SECOND = 400;

function websocketFrame(payload, opcode = 0x1) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    if (body.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, body.length]), body]);
    if (body.length <= 0xffff) {
        const header = Buffer.from([0x80 | opcode, 126, 0, 0]);
        header.writeUInt16BE(body.length, 2);
        return Buffer.concat([header, body]);
    }
    const header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
    return Buffer.concat([header, body]);
}

function acceptVirtualVisionSocket(request, socket, head, { token, allowedOrigin = () => true, log = () => { } } = {}) {
    const key = request.headers['sec-websocket-key'];
    if (!token || !key || (request.headers.origin && !allowedOrigin(request.headers.origin))) { socket.destroy(); return null; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);

    const session = {
        socket, buffer: Buffer.alloc(0), authenticated: false, closed: false, endpoint: null,
        rate: { start: Date.now(), count: 0 },
        handshake: setTimeout(() => close(), 5000)
    };
    const send = message => {
        if (session.closed) return;
        try { socket.write(websocketFrame(JSON.stringify(message))); } catch { close(); }
    };
    const stopEndpoint = async () => {
        const endpoint = session.endpoint;
        session.endpoint = null;
        if (!endpoint) return;
        endpoint.removeAllListeners();
        await endpoint.stop().catch(() => { });
    };
    function close() {
        if (session.closed) return;
        session.closed = true;
        clearTimeout(session.handshake);
        void stopEndpoint();
        try { socket.end(websocketFrame(Buffer.alloc(0), 0x8)); } catch { }
        try { socket.destroy(); } catch { }
    }

    async function configure(config) {
        await stopEndpoint();
        const endpoint = new VirtualVisionEndpoint(config);
        session.endpoint = endpoint;
        endpoint.on('status', status => send({ type: 'status', status }));
        endpoint.on('text', message => send({ type: 'text', ...message }));
        endpoint.on('commands', words => send({ type: 'commands', words }));
        endpoint.on('frame', frame => send({ type: 'frame', frame }));
        try {
            await endpoint.start();
            log(`Virtual vision ${endpoint.config.protocol} ${endpoint.config.role} on ${endpoint.config.bindIp}.`);
        } catch (error) {
            if (session.endpoint === endpoint) send({ type: 'status', status: { ...endpoint.status(), state: 'error', message: error.message } });
        }
    }

    function handle(text) {
        let message;
        try { message = JSON.parse(text); } catch { close(); return; }
        if (!message || typeof message !== 'object') { close(); return; }
        if (!session.authenticated) {
            const supplied = Buffer.from(String(message.token || ''));
            const expected = Buffer.from(String(token));
            if (message.type !== 'hello' || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) { close(); return; }
            session.authenticated = true;
            clearTimeout(session.handshake);
            send({ type: 'ready', protocol: 'inorobot-virtual-vision', version: 1 });
            return;
        }
        if (message.type === 'configure') void configure(message.config || {});
        else if (message.type === 'stop') void stopEndpoint().then(() => send({ type: 'status', status: { state: 'stopped', peers: [] } }));
        else if (message.type === 'results' && Array.isArray(message.words)) session.endpoint?.setResults(message.words.slice(0, 128));
        else if (message.type === 'text') session.endpoint?.sendText(String(message.text ?? '').slice(0, 65536), message.peer || null);
        else if (message.type === 'goodbye') close();
    }

    function consume() {
        while (!session.closed && session.buffer.length >= 2) {
            const first = session.buffer[0], second = session.buffer[1];
            const opcode = first & 0x0f;
            if (!(second & 0x80)) { close(); return; }
            let length = second & 0x7f, offset = 2;
            if (length === 126) {
                if (session.buffer.length < 4) return;
                length = session.buffer.readUInt16BE(2); offset = 4;
            } else if (length === 127) {
                if (session.buffer.length < 10) return;
                const long = session.buffer.readBigUInt64BE(2);
                if (long > BigInt(MAX_MESSAGE_BYTES)) { close(); return; }
                length = Number(long); offset = 10;
            }
            if (length > MAX_MESSAGE_BYTES) { close(); return; }
            const total = offset + 4 + length;
            if (session.buffer.length < total) return;
            const mask = session.buffer.subarray(offset, offset + 4);
            const payload = Buffer.from(session.buffer.subarray(offset + 4, total));
            session.buffer = session.buffer.subarray(total);
            for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
            if (opcode === 0x8) { close(); return; }
            if (opcode === 0x9) { try { socket.write(websocketFrame(payload, 0xA)); } catch { } continue; }
            if (opcode === 0xA) continue;
            if (opcode !== 0x1) { close(); return; }
            const now = Date.now();
            if (now - session.rate.start >= 1000) session.rate = { start: now, count: 0 };
            if (++session.rate.count > MAX_MESSAGES_PER_SECOND) { close(); return; }
            handle(payload.toString('utf8'));
        }
    }

    socket.on('data', chunk => {
        if (session.closed) return;
        if (session.buffer.length + chunk.length > MAX_MESSAGE_BYTES + 1024) { close(); return; }
        session.buffer = Buffer.concat([session.buffer, chunk]);
        consume();
    });
    socket.on('error', close);
    socket.on('close', close);
    if (head?.length) { session.buffer = Buffer.from(head); consume(); }
    return session;
}

module.exports = { acceptVirtualVisionSocket };
