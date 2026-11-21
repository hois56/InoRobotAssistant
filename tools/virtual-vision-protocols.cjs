'use strict';
// Virtual vision protocol endpoints for the local launcher.
//
// The browser computes results; this module exchanges them with a robot
// controller or PLC over real TCP/UDP sockets bound to the vision's own IP.
// Fieldbus data uses the robot image: 128 input words (INW[32..159]) and
// 128 output words (OUTW[32..159]). Results are placed at `resultIndex` of
// the robot input image and commands are read from `commandIndex` of the
// robot output image. Address aliases follow the Inovance controller:
//   Modbus: input words 34787+i (FC03/06/16), output words 2035+i (FC04),
//           input coils 4096+n (FC01/05/15), output bits n (FC02)
//   MC 3E:  the robot client writes its outputs to D1000.. and reads D0..
//   EIP:    assembly 100 = robot inputs (O→T), 101 = robot outputs (T→O)

const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const IMAGE_WORDS = 128;
const MC_DEVICE_CODES = Object.freeze({ D: 0xA8, W: 0xB4, R: 0xAF });
const MC_DEVICES_BY_CODE = Object.freeze({ 0xA8: 'D', 0xB4: 'W', 0xAF: 'R' });
const MC_HEX_DEVICES = new Set(['W']);
const TERMINATORS = Object.freeze({ none: '', cr: '\r', lf: '\n', crlf: '\r\n', lab: 'V' });
const MAX_TEXT_BYTES = 64 * 1024;
const EIP_VENDOR_ID = 0x0400;

const isIpv4 = value => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(value || ''));
const int = (value, fallback, min, max) => {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const oneOf = (value, options, fallback) => options.includes(value) ? value : fallback;

function normalizeEndpointConfig(raw = {}) {
    const protocol = oneOf(raw.protocol, ['socket', 'modbus', 'eip', 'mc'], 'socket');
    const role = oneOf(raw.role, ['server', 'client'], 'server');
    const resultWords = int(raw.resultWords, 12, 0, IMAGE_WORDS);
    const commandWords = int(raw.commandWords, 8, 0, IMAGE_WORDS);
    const resultIndex = int(raw.resultIndex, 68, 0, IMAGE_WORDS - Math.max(1, resultWords));
    const commandIndex = int(raw.commandIndex, 68, 0, IMAGE_WORDS - Math.max(1, commandWords));
    const defaults = { socket: 5000, modbus: 502, eip: 44818, mc: 5000 };
    return {
        protocol, role,
        bindIp: isIpv4(raw.bindIp) ? raw.bindIp : '127.0.0.11',
        port: int(raw.port, defaults[protocol], 1, 65535),
        targetIp: isIpv4(raw.targetIp) ? raw.targetIp : '127.0.0.1',
        targetPort: int(raw.targetPort, defaults[protocol], 1, 65535),
        pollMs: int(raw.pollMs, 20, 5, 5000),
        terminator: oneOf(raw.terminator, Object.keys(TERMINATORS), 'none'),
        resultWords, commandWords, resultIndex, commandIndex,
        modbus: {
            unitId: int(raw.modbus?.unitId, 1, 0, 255),
            inputBase: int(raw.modbus?.inputBase, 34787, 0, 65535 - IMAGE_WORDS),
            outputBase: int(raw.modbus?.outputBase, 2035, 0, 65535 - IMAGE_WORDS),
            readFunction: oneOf(Number(raw.modbus?.readFunction), [3, 4], 4)
        },
        mc: {
            frame: oneOf(raw.mc?.frame, ['binary', 'ascii'], 'binary'),
            device: oneOf(String(raw.mc?.device || 'D').toUpperCase(), Object.keys(MC_DEVICE_CODES), 'D'),
            resultAddress: int(raw.mc?.resultAddress, 0, 0, 65536 - IMAGE_WORDS),
            commandAddress: int(raw.mc?.commandAddress, 1000, 0, 65536 - IMAGE_WORDS)
        },
        eip: {
            mode: oneOf(raw.eip?.mode, ['implicit', 'explicit'], 'implicit'),
            inputInstance: int(raw.eip?.inputInstance, 100, 1, 255),
            outputInstance: int(raw.eip?.outputInstance, 101, 1, 255),
            configInstance: int(raw.eip?.configInstance, 1, 0, 255),
            size: int(raw.eip?.size, 256, 2, 496) & ~1,
            rpiMs: int(raw.eip?.rpiMs, 10, 1, 1000),
            udpPort: int(raw.eip?.udpPort, 2222, 1, 65535)
        }
    };
}

function toHex(buffer, limit = 80) {
    const bytes = [...buffer.subarray(0, limit)].map(value => value.toString(16).padStart(2, '0').toUpperCase());
    return bytes.join(' ') + (buffer.length > limit ? ` … (+${buffer.length - limit})` : '');
}

function wordsEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

class VirtualVisionEndpoint extends EventEmitter {
    constructor(config) {
        super();
        this.config = normalizeEndpointConfig(config);
        this.results = new Uint16Array(this.config.resultWords);
        this.commands = new Uint16Array(this.config.commandWords);
        // Device image used by the Modbus/EIP server and the EIP client.
        this.inputs = new Uint16Array(IMAGE_WORDS);
        this.outputs = new Uint16Array(IMAGE_WORDS);
        this.mcMemory = Object.fromEntries(Object.keys(MC_DEVICE_CODES).map(code => [code, new Uint16Array(65536)]));
        this.running = false;
        this.state = 'stopped';
        this.message = '';
        this.closers = new Set();
        this.peers = new Map();
        this.resultsDirty = true;
        this.lastResultWrite = 0;
        this.frameLog = new Map();
        this.frameWindow = { start: 0, count: 0 };
    }

    // ------------------------------------------------------------ lifecycle

    async start() {
        if (this.running) return;
        this.running = true;
        this.setState(this.config.role === 'server' ? 'listening' : 'connecting');
        const { protocol, role } = this.config;
        try {
            if (protocol === 'socket') await (role === 'server' ? this.startSocketServer() : this.startSocketClient());
            else if (protocol === 'modbus') await (role === 'server' ? this.startModbusServer() : this.startModbusClient());
            else if (protocol === 'mc') await (role === 'server' ? this.startMcServer() : this.startMcClient());
            else await (role === 'server' ? this.startEipServer() : this.startEipClient());
        } catch (error) {
            await this.stop();
            this.setState('error', error.message);
            throw error;
        }
    }

    async stop() {
        const beforeStop = this.beforeStop;
        this.beforeStop = null;
        if (beforeStop) await Promise.race([beforeStop().catch(() => { }), new Promise(resolve => setTimeout(resolve, 500))]);
        this.running = false;
        const closers = [...this.closers];
        this.closers.clear();
        await Promise.allSettled(closers.map(close => Promise.resolve().then(close)));
        this.peers.clear();
        if (this.state !== 'error') this.setState('stopped');
    }

    addCloser(close) {
        this.closers.add(close);
        return () => this.closers.delete(close);
    }

    setState(state, message = '') {
        this.state = state;
        this.message = message;
        this.emit('status', this.status());
    }

    status() {
        return {
            state: this.state, message: this.message, protocol: this.config.protocol, role: this.config.role,
            bindIp: this.config.bindIp, port: this.config.port, targetIp: this.config.targetIp, targetPort: this.config.targetPort,
            peers: [...this.peers.values()]
        };
    }

    addPeer(id, label) {
        this.peers.set(id, label);
        this.setState('connected');
    }

    removePeer(id) {
        this.peers.delete(id);
        if (!this.running) return;
        this.setState(this.peers.size ? 'connected' : this.config.role === 'server' ? 'listening' : this.message ? 'error' : 'stopped', this.message);
    }

    /** Report a frame unless it repeats the previous content of its kind. */
    logFrame(direction, kind, buffer, summary = '', signature = null) {
        const hex = toHex(buffer);
        const key = `${direction}:${kind}`;
        const content = signature ?? hex;
        if (this.frameLog.get(key) === content) return;
        this.frameLog.set(key, content);
        const now = Date.now();
        if (now - this.frameWindow.start > 1000) this.frameWindow = { start: now, count: 0 };
        if (++this.frameWindow.count > 25) return;
        this.emit('frame', { direction, kind, summary, hex, bytes: buffer.length, time: now });
    }

    // ------------------------------------------------------------- data

    setResults(words) {
        const next = new Uint16Array(this.config.resultWords);
        for (let i = 0; i < next.length; i++) next[i] = Number(words?.[i]) & 0xffff;
        if (wordsEqual(next, this.results)) return;
        this.results = next;
        this.resultsDirty = true;
        const { protocol, role, resultIndex } = this.config;
        if (role === 'server' && protocol === 'mc') this.mcMemory[this.config.mc.device].set(next, this.config.mc.resultAddress);
        else if (role === 'server') this.outputs.set(next, resultIndex);
        else if (protocol === 'eip') this.inputs.set(next, resultIndex);
    }

    updateCommands(source) {
        if (!this.config.commandWords) return;
        const next = Uint16Array.from(source);
        if (wordsEqual(next, this.commands)) return;
        this.commands = next;
        this.emit('commands', [...next]);
    }

    refreshServerCommands() {
        const { protocol, commandIndex, commandWords } = this.config;
        if (!commandWords) return;
        if (protocol === 'mc') {
            const start = this.config.mc.commandAddress;
            this.updateCommands(this.mcMemory[this.config.mc.device].subarray(start, start + commandWords));
        } else this.updateCommands(this.inputs.subarray(commandIndex, commandIndex + commandWords));
    }

    // ------------------------------------------------------------- socket

    acceptTextData(peer, chunk) {
        peer.text += chunk.toString('utf8');
        if (Buffer.byteLength(peer.text) > MAX_TEXT_BYTES) peer.text = '';
        const parts = peer.text.split(this.config.terminator === 'lab' ? /V|\r\n|\r|\n/ : /\r\n|\r|\n/);
        peer.text = parts.pop();
        for (const part of parts) if (part.trim()) this.emit('text', { text: part, peer: peer.id });
        clearTimeout(peer.flush);
        // Robot `Send Port` frames usually have no terminator.
        if (peer.text) peer.flush = setTimeout(() => {
            const text = peer.text.replace(/\0+$/, '');
            peer.text = '';
            if (text.trim()) this.emit('text', { text, peer: peer.id });
        }, 15);
    }

    attachTextSocket(socket, label) {
        const id = crypto.randomUUID();
        const peer = { id, socket, text: '', flush: null };
        this.textPeers ??= new Map();
        this.textPeers.set(id, peer);
        socket.setNoDelay(true);
        this.addPeer(id, label);
        socket.on('data', chunk => {
            this.logFrame('rx', 'text', chunk, JSON.stringify(chunk.toString('utf8')));
            this.acceptTextData(peer, chunk);
        });
        const release = () => {
            clearTimeout(peer.flush);
            if (!this.textPeers.delete(id)) return;
            this.removePeer(id);
        };
        socket.on('close', release);
        socket.on('error', release);
        return peer;
    }

    sendText(text, peerId = null) {
        const payload = Buffer.from(String(text ?? ''), 'utf8');
        const peers = [...(this.textPeers?.values() || [])].filter(peer => !peerId || peer.id === peerId);
        const targets = peers.length ? peers : [...(this.textPeers?.values() || [])];
        for (const peer of targets) {
            if (peer.socket.destroyed) continue;
            peer.socket.write(payload);
            this.logFrame('tx', 'text', payload, JSON.stringify(String(text)));
        }
        return targets.length;
    }

    listen(server, port = this.config.port) {
        return new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, this.config.bindIp, () => {
                server.off('error', reject);
                server.on('error', error => this.setState('error', error.message));
                resolve();
            });
            this.addCloser(() => new Promise(done => {
                for (const socket of server.connections || []) socket.destroy();
                server.close(() => done());
            }));
        });
    }

    trackServerSockets(server) {
        server.connections = new Set();
        server.on('connection', socket => {
            server.connections.add(socket);
            socket.on('close', () => server.connections.delete(socket));
        });
    }

    async startSocketServer() {
        const server = net.createServer(socket => this.attachTextSocket(socket, `${socket.remoteAddress}:${socket.remotePort}`));
        this.trackServerSockets(server);
        await this.listen(server);
        this.setState('listening');
    }

    startSocketClient() {
        this.connectOnce(() => {
            const socket = net.connect({ host: this.config.targetIp, port: this.config.targetPort, localAddress: this.config.bindIp });
            socket.once('connect', () => this.attachTextSocket(socket, `${this.config.targetIp}:${this.config.targetPort}`));
            return socket;
        });
    }

    /** Open one client connection. A new attempt requires a new endpoint. */
    connectOnce(open, onConnected = null) {
        const socket = open();
        socket.setTimeout?.(5000, () => socket.destroy(new Error('Connection timeout')));
        socket.once('connect', () => { socket.setTimeout?.(0); onConnected?.(socket); });
        socket.on('error', error => { this.message = error.message; });
        socket.once('close', () => {
            if (!this.running) return;
            // Cyclic EtherNet/IP I/O can remain connected after its idle TCP
            // session closes; neither a refusal nor a close starts a new one.
            this.setState(this.peers.size ? 'connected' : this.message ? 'error' : 'stopped', this.message);
        });
        this.addCloser(() => socket.destroy());
    }

    // ------------------------------------------------------------- modbus

    modbusRegister(address, write) {
        const base = write ? this.config.modbus.inputBase : this.config.modbus.outputBase;
        return address >= base && address < base + IMAGE_WORDS ? address - base : -1;
    }

    modbusPdu(pdu, unit) {
        const fn = pdu[0] ?? 0;
        const exception = code => Buffer.from([fn | 0x80, code]);
        if (unit !== this.config.modbus.unitId && unit !== 0xff) return exception(11);
        if (pdu.length < 5) return exception(3);
        const address = pdu.readUInt16BE(1), count = pdu.readUInt16BE(3);
        const inputBits = this.inputBitsView();
        if (fn >= 1 && fn <= 4) {
            const bits = fn <= 2, input = fn === 1 || fn === 3;
            const at = bits ? (input ? address - 4096 : address) : this.modbusRegister(address, input);
            if (count < 1 || count > (bits ? 2000 : 125)) return exception(3);
            if (at < 0 || at + count > (bits ? IMAGE_WORDS * 16 : IMAGE_WORDS)) return exception(2);
            const image = input ? this.inputs : this.outputs;
            if (bits) {
                const reply = Buffer.alloc(2 + Math.ceil(count / 8));
                reply[0] = fn; reply[1] = reply.length - 2;
                for (let i = 0; i < count; i++) if ((image[(at + i) >> 4] >> ((at + i) & 15)) & 1) reply[2 + (i >> 3)] |= 1 << (i & 7);
                return reply;
            }
            const reply = Buffer.alloc(2 + count * 2);
            reply[0] = fn; reply[1] = count * 2;
            for (let i = 0; i < count; i++) reply.writeUInt16BE(image[at + i], 2 + i * 2);
            return reply;
        }
        if (fn === 5 || fn === 6) {
            const at = fn === 5 ? address - 4096 : this.modbusRegister(address, true);
            if (at < 0 || (fn === 5 ? at >= IMAGE_WORDS * 16 : at >= IMAGE_WORDS)) return exception(2);
            if (fn === 5) {
                if (count !== 0 && count !== 0xff00) return exception(3);
                inputBits(at, count !== 0);
            } else this.inputs[at] = count;
            this.refreshServerCommands();
            return pdu.subarray(0, 5);
        }
        if (fn === 15 || fn === 16) {
            const bits = fn === 15;
            const at = bits ? address - 4096 : this.modbusRegister(address, true);
            const bytes = bits ? Math.ceil(count / 8) : count * 2;
            if (count < 1 || count > (bits ? 1968 : 123) || pdu.length !== 6 + bytes || pdu[5] !== bytes) return exception(3);
            if (at < 0 || at + count > (bits ? IMAGE_WORDS * 16 : IMAGE_WORDS)) return exception(2);
            for (let i = 0; i < count; i++) {
                if (bits) inputBits(at + i, (pdu[6 + (i >> 3)] >> (i & 7)) & 1);
                else this.inputs[at + i] = pdu.readUInt16BE(6 + i * 2);
            }
            this.refreshServerCommands();
            return pdu.subarray(0, 5);
        }
        return exception(1);
    }

    inputBitsView() {
        return (bit, value) => {
            const word = bit >> 4, mask = 1 << (bit & 15);
            this.inputs[word] = value ? this.inputs[word] | mask : this.inputs[word] & ~mask;
        };
    }

    async startModbusServer() {
        const server = net.createServer(socket => {
            const id = crypto.randomUUID();
            let buffer = Buffer.alloc(0);
            socket.setNoDelay(true);
            this.addPeer(id, `${socket.remoteAddress}:${socket.remotePort}`);
            socket.on('data', chunk => {
                buffer = Buffer.concat([buffer, chunk]);
                while (buffer.length >= 7) {
                    const length = buffer.readUInt16BE(4);
                    if (buffer.readUInt16BE(2) !== 0 || length < 2 || length > 254) { socket.destroy(); return; }
                    if (buffer.length < 6 + length) return;
                    const frame = buffer.subarray(0, 6 + length);
                    buffer = buffer.subarray(6 + length);
                    this.logFrame('rx', `modbus-${frame[7]}`, frame, `FC${frame[7]}`, toHex(frame.subarray(7)));
                    const reply = this.modbusPdu(frame.subarray(7), frame[6]);
                    const header = Buffer.from(frame.subarray(0, 7));
                    header.writeUInt16BE(reply.length + 1, 4);
                    const response = Buffer.concat([header, reply]);
                    this.logFrame('tx', `modbus-${frame[7]}`, response, reply[0] & 0x80 ? `exception ${reply[1]}` : `FC${reply[0]}`, toHex(reply));
                    socket.write(response);
                }
            });
            socket.on('close', () => this.removePeer(id));
            socket.on('error', () => socket.destroy());
        });
        this.trackServerSockets(server);
        await this.listen(server);
        this.setState('listening');
    }

    /** Sequential request/response transport for client protocols. */
    createRequester(socket, parse) {
        let buffer = Buffer.alloc(0), pending = null;
        socket.on('data', chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            while (pending) {
                let result;
                try { result = parse(buffer); }
                catch (error) {
                    const current = pending; pending = null;
                    clearTimeout(current.timer);
                    current.reject(error);
                    socket.destroy();
                    return;
                }
                if (!result) return;
                buffer = buffer.subarray(result.length);
                const current = pending; pending = null;
                clearTimeout(current.timer);
                current.resolve(result.frame);
            }
        });
        socket.on('close', () => { if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Connection closed')); pending = null; } });
        return frame => new Promise((resolve, reject) => {
            if (pending) return reject(new Error('Request already pending'));
            pending = { resolve, reject, timer: setTimeout(() => { pending = null; reject(new Error('Response timeout')); socket.destroy(); }, 1500) };
            socket.write(frame);
        });
    }

    startPolling(socket, exchange) {
        let timer = null, stopped = false;
        const run = async () => {
            if (stopped || !this.running || socket.destroyed) return;
            try { await exchange(); }
            catch (error) { this.message = error.message; socket.destroy(); return; }
            timer = setTimeout(run, this.config.pollMs);
        };
        socket.once('close', () => { stopped = true; clearTimeout(timer); });
        run();
    }

    shouldWriteResults() {
        const now = Date.now();
        if (!this.resultsDirty && now - this.lastResultWrite < 500) return false;
        this.resultsDirty = false;
        this.lastResultWrite = now;
        return this.config.resultWords > 0;
    }

    startModbusClient() {
        const { modbus, resultIndex, commandIndex, commandWords } = this.config;
        let transaction = 0;
        this.connectOnce(() => net.connect({ host: this.config.targetIp, port: this.config.targetPort, localAddress: this.config.bindIp }), socket => {
            const id = crypto.randomUUID();
            this.addPeer(id, `${this.config.targetIp}:${this.config.targetPort}`);
            socket.once('close', () => this.removePeer(id));
            socket.setNoDelay(true);
            const request = this.createRequester(socket, buffer => {
                if (buffer.length < 7) return null;
                const length = 6 + buffer.readUInt16BE(4);
                return buffer.length >= length ? { length, frame: buffer.subarray(0, length) } : null;
            });
            const send = async pdu => {
                transaction = (transaction + 1) & 0xffff;
                const header = Buffer.alloc(7);
                header.writeUInt16BE(transaction, 0);
                header.writeUInt16BE(pdu.length + 1, 4);
                header[6] = modbus.unitId;
                const frame = Buffer.concat([header, pdu]);
                this.logFrame('tx', `modbus-${pdu[0]}`, frame, `FC${pdu[0]}`, toHex(pdu));
                const reply = await request(frame);
                this.logFrame('rx', `modbus-${pdu[0]}`, reply, `FC${reply[7]}`, toHex(reply.subarray(7)));
                if (reply.readUInt16BE(0) !== transaction) throw new Error('Modbus transaction mismatch');
                if (reply[7] & 0x80) throw new Error(`Modbus exception ${reply[8]} (FC${pdu[0]})`);
                return reply.subarray(7);
            };
            this.startPolling(socket, async () => {
                if (this.shouldWriteResults()) {
                    const pdu = Buffer.alloc(6 + this.results.length * 2);
                    pdu[0] = 16;
                    pdu.writeUInt16BE(modbus.inputBase + resultIndex, 1);
                    pdu.writeUInt16BE(this.results.length, 3);
                    pdu[5] = this.results.length * 2;
                    this.results.forEach((word, i) => pdu.writeUInt16BE(word, 6 + i * 2));
                    try { await send(pdu); } catch (error) { this.resultsDirty = true; throw error; }
                }
                if (commandWords) {
                    const pdu = Buffer.alloc(5);
                    pdu[0] = modbus.readFunction;
                    const base = modbus.readFunction === 4 ? modbus.outputBase : modbus.inputBase;
                    pdu.writeUInt16BE(base + commandIndex, 1);
                    pdu.writeUInt16BE(commandWords, 3);
                    const reply = await send(pdu);
                    const words = Array.from({ length: commandWords }, (_, i) => reply.readUInt16BE(2 + i * 2));
                    this.updateCommands(words);
                }
            });
        });
    }

    // ----------------------------------------------------------------- MC

    mcError(header, code, ascii) {
        return this.mcResponse(header, code, Buffer.alloc(0), ascii);
    }

    mcResponse(header, endCode, data, ascii) {
        if (ascii) {
            const body = endCode.toString(16).toUpperCase().padStart(4, '0')
                + [...Array(data.length / 2).keys()].map(i => data.readUInt16LE(i * 2).toString(16).toUpperCase().padStart(4, '0')).join('');
            return Buffer.from(`D000${header.route}${body.length.toString(16).toUpperCase().padStart(4, '0')}${body}`, 'ascii');
        }
        const response = Buffer.alloc(11 + data.length);
        response[0] = 0xD0; response[1] = 0x00;
        header.route.copy(response, 2);
        response.writeUInt16LE(2 + data.length, 7);
        response.writeUInt16LE(endCode, 9);
        data.copy(response, 11);
        return response;
    }

    /** Parse one 3E frame (binary or ASCII). Returns null when incomplete. */
    parseMcRequest(buffer) {
        if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x00) {
            if (buffer.length < 9) return null;
            const length = 9 + buffer.readUInt16LE(7);
            if (buffer.length < length) return null;
            const frame = buffer.subarray(0, length);
            if (length < 21) return { length, frame, ascii: false, route: Buffer.from(frame.subarray(2, 7)), invalid: true };
            return {
                length, frame, ascii: false, route: Buffer.from(frame.subarray(2, 7)),
                command: frame.readUInt16LE(11), subcommand: frame.readUInt16LE(13),
                address: frame[15] | frame[16] << 8 | frame[17] << 16,
                device: MC_DEVICES_BY_CODE[frame[18]], points: frame.readUInt16LE(19),
                data: frame.subarray(21)
            };
        }
        // ASCII 3E: "5000" net(2) pc(2) io(4) station(2) length(4) timer(4)
        // command(4) subcommand(4) device(2) number(6) points(4) data.
        const text = buffer.toString('ascii', 0, Math.min(buffer.length, 32));
        if (text.startsWith('5000')) {
            if (buffer.length < 18) return null;
            const length = 18 + Number.parseInt(buffer.toString('ascii', 14, 18), 16);
            if (!Number.isFinite(length)) return { length: buffer.length, invalid: true, ascii: true, route: '00FF03FF00' };
            if (buffer.length < length) return null;
            const frame = buffer.toString('ascii', 0, length);
            const route = frame.slice(4, 14);
            if (length < 42) return { length, frame: Buffer.from(frame), ascii: true, route, invalid: true };
            const device = frame.slice(30, 32).replace('*', '');
            const addressText = frame.slice(32, 38);
            const address = MC_HEX_DEVICES.has(device) ? Number.parseInt(addressText, 16) : Number.parseInt(addressText, 10);
            const dataText = frame.slice(42);
            const data = Buffer.alloc(Math.floor(dataText.length / 4) * 2);
            for (let i = 0; i + 4 <= dataText.length; i += 4) data.writeUInt16LE(Number.parseInt(dataText.slice(i, i + 4), 16) || 0, i / 2);
            return {
                length, frame: Buffer.from(frame), ascii: true, route,
                command: Number.parseInt(frame.slice(22, 26), 16),
                subcommand: Number.parseInt(frame.slice(26, 30), 16),
                device: device in MC_DEVICE_CODES ? device : undefined, address,
                points: Number.parseInt(frame.slice(38, 42), 16), data
            };
        }
        return { length: buffer.length, invalid: true, ascii: false, route: Buffer.from([0, 0xff, 0xff, 0x03, 0]) };
    }

    handleMcRequest(request) {
        const header = { route: request.route };
        if (request.invalid) return this.mcError(header, 0xC051, request.ascii);
        if (!request.device || ![0x0401, 0x1401].includes(request.command)) return this.mcError(header, 0xC059, request.ascii);
        if (request.subcommand !== 0) return this.mcError(header, 0xC059, request.ascii);
        const memory = this.mcMemory[request.device];
        if (request.points < 1 || request.points > 960 || request.address + request.points > memory.length) return this.mcError(header, 0xC056, request.ascii);
        if (request.command === 0x0401) {
            const data = Buffer.alloc(request.points * 2);
            for (let i = 0; i < request.points; i++) data.writeUInt16LE(memory[request.address + i], i * 2);
            return this.mcResponse(header, 0, data, request.ascii);
        }
        if (request.data.length < request.points * 2) return this.mcError(header, 0xC061, request.ascii);
        for (let i = 0; i < request.points; i++) memory[request.address + i] = request.data.readUInt16LE(i * 2);
        this.refreshServerCommands();
        return this.mcResponse(header, 0, Buffer.alloc(0), request.ascii);
    }

    async startMcServer() {
        const server = net.createServer(socket => {
            const id = crypto.randomUUID();
            let buffer = Buffer.alloc(0);
            socket.setNoDelay(true);
            this.addPeer(id, `${socket.remoteAddress}:${socket.remotePort}`);
            socket.on('data', chunk => {
                buffer = Buffer.concat([buffer, chunk]);
                if (buffer.length > 8192) { socket.destroy(); return; }
                while (buffer.length) {
                    const request = this.parseMcRequest(buffer);
                    if (!request) return;
                    buffer = buffer.subarray(request.length);
                    const kind = `mc-${(request.command || 0).toString(16)}`;
                    this.logFrame('rx', kind, request.frame || Buffer.alloc(0), mcSummary(request));
                    const response = this.handleMcRequest(request);
                    this.logFrame('tx', kind, response, 'response');
                    socket.write(response);
                    if (request.invalid) { socket.end(); return; }
                }
            });
            socket.on('close', () => this.removePeer(id));
            socket.on('error', () => socket.destroy());
        });
        this.trackServerSockets(server);
        await this.listen(server);
        this.setState('listening');
    }

    buildMcRequest(command, address, points, data = null) {
        const { device, frame } = this.config.mc;
        if (frame === 'ascii') {
            const deviceText = device.padEnd(2, '*');
            const addressText = MC_HEX_DEVICES.has(device)
                ? address.toString(16).toUpperCase().padStart(6, '0')
                : String(address).padStart(6, '0');
            const dataText = data ? [...Array(points).keys()].map(i => data[i].toString(16).toUpperCase().padStart(4, '0')).join('') : '';
            const body = `0010${command.toString(16).padStart(4, '0')}0000${deviceText}${addressText}${points.toString(16).toUpperCase().padStart(4, '0')}${dataText}`;
            return Buffer.from(`500000FF03FF00${body.length.toString(16).toUpperCase().padStart(4, '0')}${body}`, 'ascii');
        }
        const size = data ? points * 2 : 0;
        const request = Buffer.alloc(21 + size);
        request[0] = 0x50; request[2] = 0x00; request[3] = 0xff; request.writeUInt16LE(0x03ff, 4); request[6] = 0;
        request.writeUInt16LE(12 + size, 7);
        request.writeUInt16LE(0x0010, 9);
        request.writeUInt16LE(command, 11);
        request.writeUInt16LE(0, 13);
        request[15] = address & 0xff; request[16] = (address >> 8) & 0xff; request[17] = (address >> 16) & 0xff;
        request[18] = MC_DEVICE_CODES[device];
        request.writeUInt16LE(points, 19);
        if (data) for (let i = 0; i < points; i++) request.writeUInt16LE(data[i], 21 + i * 2);
        return request;
    }

    parseMcResponse(buffer) {
        if (this.config.mc.frame === 'ascii') {
            if (buffer.length < 22) return null;
            const length = 18 + Number.parseInt(buffer.toString('ascii', 14, 18), 16);
            if (buffer.length < length) return null;
            const text = buffer.toString('ascii', 0, length);
            const endCode = Number.parseInt(text.slice(18, 22), 16);
            const dataText = text.slice(22);
            const data = Buffer.alloc(dataText.length / 2);
            for (let i = 0; i + 4 <= dataText.length; i += 4) data.writeUInt16LE(Number.parseInt(dataText.slice(i, i + 4), 16) || 0, i / 2);
            return { length, frame: { endCode, data, raw: buffer.subarray(0, length) } };
        }
        if (buffer.length < 11) return null;
        const length = 9 + buffer.readUInt16LE(7);
        if (buffer.length < length) return null;
        const raw = buffer.subarray(0, length);
        if (raw[0] !== 0xD0) throw new Error('MC 3E response header error');
        return { length, frame: { endCode: raw.readUInt16LE(9), data: raw.subarray(11), raw } };
    }

    startMcClient() {
        const { mc, commandWords } = this.config;
        this.connectOnce(() => net.connect({ host: this.config.targetIp, port: this.config.targetPort, localAddress: this.config.bindIp }), socket => {
            const id = crypto.randomUUID();
            this.addPeer(id, `${this.config.targetIp}:${this.config.targetPort}`);
            socket.once('close', () => this.removePeer(id));
            socket.setNoDelay(true);
            const request = this.createRequester(socket, buffer => this.parseMcResponse(buffer));
            const exchange = async (command, address, points, data) => {
                const frame = this.buildMcRequest(command, address, points, data);
                this.logFrame('tx', `mc-${command.toString(16)}`, frame, `${command.toString(16).padStart(4, '0')} ${mc.device}${address} ×${points}`);
                const reply = await request(frame);
                this.logFrame('rx', `mc-${command.toString(16)}`, reply.raw, `end ${reply.endCode.toString(16).padStart(4, '0')}`);
                if (reply.endCode) throw new Error(`MC end code ${reply.endCode.toString(16).toUpperCase().padStart(4, '0')}`);
                return reply.data;
            };
            this.startPolling(socket, async () => {
                if (this.shouldWriteResults()) {
                    try { await exchange(0x1401, mc.resultAddress, this.results.length, this.results); }
                    catch (error) { this.resultsDirty = true; throw error; }
                }
                if (commandWords) {
                    const data = await exchange(0x0401, mc.commandAddress, commandWords);
                    this.updateCommands(Array.from({ length: commandWords }, (_, i) => data.readUInt16LE(i * 2)));
                }
            });
        });
    }

    // ---------------------------------------------------------------- EIP

    imageBytes(image) {
        const bytes = Buffer.alloc(this.config.eip.size);
        for (let i = 0; i < Math.min(image.length, bytes.length / 2); i++) bytes.writeUInt16LE(image[i], i * 2);
        return bytes;
    }

    writeImage(image, bytes) {
        for (let i = 0; i < Math.min(image.length, Math.floor(bytes.length / 2)); i++) image[i] = bytes.readUInt16LE(i * 2);
    }

    async startEipServer() {
        const eip = this.config.eip;
        this.eipConnections = new Map();
        const udp = dgram.createSocket({ type: 'udp4', reuseAddr: false });
        await new Promise((resolve, reject) => {
            udp.once('error', reject);
            udp.bind(eip.udpPort, this.config.bindIp, () => { udp.off('error', reject); resolve(); });
        });
        udp.on('error', error => this.setState('error', error.message));
        this.addCloser(() => new Promise(done => udp.close(() => done())));
        udp.on('message', (message, remote) => {
            const packet = parseIoPacket(message);
            if (!packet) return;
            const connection = [...this.eipConnections.values()].find(item => item.o2tId === packet.connectionId);
            if (!connection || packet.data.length < 2) return;
            connection.lastReceive = Date.now();
            // Class 1 data: 16-bit sequence count, optional 32-bit run/idle header.
            const running = !connection.o2tHeader || (packet.data.readUInt32LE(2) & 1) === 1;
            const data = packet.data.subarray(connection.o2tHeader ? 6 : 2);
            this.logFrame('rx', 'eip-io', message, `O→T seq ${packet.sequence}${running ? '' : ' (idle)'}`, toHex(data));
            if (!running) return;
            const before = this.inputs.slice();
            this.writeImage(this.inputs, data);
            if (!wordsEqual(before, this.inputs)) this.refreshServerCommands();
        });
        const server = net.createServer(socket => {
            const id = crypto.randomUUID();
            let buffer = Buffer.alloc(0);
            const session = { handle: 0, socket, id };
            socket.setNoDelay(true);
            this.addPeer(id, `${socket.remoteAddress}:${socket.remotePort}`);
            socket.on('data', chunk => {
                buffer = Buffer.concat([buffer, chunk]);
                while (buffer.length >= 24) {
                    const length = 24 + buffer.readUInt16LE(2);
                    if (length > 4096) { socket.destroy(); return; }
                    if (buffer.length < length) return;
                    const frame = buffer.subarray(0, length);
                    buffer = buffer.subarray(length);
                    const reply = this.handleEipEncapsulation(frame, session, udp);
                    if (reply) socket.write(reply);
                }
            });
            socket.on('close', () => {
                // Like OpENer, class 1 I/O outlives its TCP session and ends
                // on Forward_Close or the O→T watchdog.
                this.removePeer(id);
            });
            socket.on('error', () => socket.destroy());
        });
        this.trackServerSockets(server);
        await this.listen(server);
        this.addCloser(() => { for (const key of [...this.eipConnections.keys()]) this.closeEipConnection(key); });
        this.setState('listening');
    }

    closeEipConnection(key) {
        const connection = this.eipConnections.get(key);
        if (!connection) return;
        clearInterval(connection.timer);
        this.eipConnections.delete(key);
    }

    handleEipEncapsulation(frame, session, udp) {
        const command = frame.readUInt16LE(0);
        const handle = frame.readUInt32LE(4);
        const context = frame.subarray(12, 20);
        const reply = (body, status = 0, sessionHandle = handle) => {
            const header = Buffer.alloc(24);
            header.writeUInt16LE(command, 0);
            header.writeUInt16LE(body.length, 2);
            header.writeUInt32LE(sessionHandle, 4);
            header.writeUInt32LE(status, 8);
            context.copy(header, 12);
            return Buffer.concat([header, body]);
        };
        if (command === 0x0065) {
            session.handle = crypto.randomBytes(4).readUInt32LE(0) || 1;
            this.logFrame('rx', 'eip-register', frame, 'RegisterSession');
            return reply(Buffer.from([1, 0, 0, 0]), 0, session.handle);
        }
        if (command === 0x0066) { session.socket.end(); return null; }
        if (command === 0x0063) return reply(cpf([{ type: 0x000C, data: this.identityItem() }]));
        if (command === 0x0004) {
            const item = Buffer.alloc(20);
            item.writeUInt16LE(1, 0); item.writeUInt16LE(0x0120, 2);
            item.write('Communications', 4, 'ascii');
            return reply(cpf([{ type: 0x0100, data: item }]));
        }
        if (command !== 0x006F) return reply(Buffer.alloc(0), 0x0001);
        if (handle !== session.handle) return reply(Buffer.alloc(0), 0x0064);
        const items = parseCpf(frame.subarray(24 + 6));
        const request = items.find(item => item.type === 0x00B2)?.data;
        if (!request) return reply(Buffer.alloc(0), 0x0003);
        const extra = [];
        const sockaddr = items.find(item => item.type === 0x8001);
        const cipReply = this.handleCipRequest(request, session, udp, sockaddr, extra);
        this.logFrame('rx', `eip-cip-${request[0]}`, frame, cipServiceName(request[0]));
        const body = Buffer.concat([Buffer.alloc(6), cpf([{ type: 0, data: Buffer.alloc(0) }, { type: 0x00B2, data: cipReply }, ...extra])]);
        const response = reply(body);
        this.logFrame('tx', `eip-cip-${request[0]}`, response, `${cipServiceName(request[0])} reply`);
        return response;
    }

    identityItem() {
        const name = Buffer.from('InoRobot Virtual Vision', 'ascii');
        const item = Buffer.alloc(34 + name.length);
        item.writeUInt16LE(1, 0);
        item.writeUInt16BE(2, 2); item.writeUInt16BE(44818, 4);
        Buffer.from(this.config.bindIp.split('.').map(Number)).copy(item, 6);
        item.writeUInt16LE(EIP_VENDOR_ID, 18); item.writeUInt16LE(0x2B, 20); item.writeUInt16LE(1, 22);
        item[24] = 1; item[25] = 0; item.writeUInt16LE(0, 26); item.writeUInt32LE(0x56495331, 28);
        item[32] = name.length; name.copy(item, 33); item[33 + name.length] = 3;
        return item;
    }

    handleCipRequest(request, session, udp, sockaddr, extra) {
        const service = request[0];
        const pathWords = request[1];
        const path = parseEpath(request.subarray(2, 2 + pathWords * 2));
        const data = request.subarray(2 + pathWords * 2);
        const status = (code, payload = Buffer.alloc(0)) => Buffer.concat([Buffer.from([service | 0x80, 0, code, 0]), payload]);
        if (service === 0x52 && path.class === 0x06) {
            const size = data.readUInt16LE(2);
            return this.handleCipRequest(data.subarray(4, 4 + size), session, udp, sockaddr, extra);
        }
        const eip = this.config.eip;
        if (path.class === 0x01 && (service === 0x01 || service === 0x0E)) {
            const identity = this.identityItem();
            const all = identity.subarray(18, 33 + identity[32]);
            if (service === 0x01) return status(0, all);
            const ranges = { 1: [0, 2], 2: [2, 4], 3: [4, 6], 4: [6, 8], 5: [8, 10], 6: [10, 14], 7: [14, all.length] };
            const range = ranges[path.attribute];
            return range ? status(0, all.subarray(...range)) : status(0x14);
        }
        if ((service === 0x0E || service === 0x10) && path.class === 0x04 && path.attribute === 3) {
            const image = path.instance === eip.inputInstance ? this.inputs : path.instance === eip.outputInstance ? this.outputs : null;
            if (!image) return status(path.instance === eip.configInstance ? 0 : 0x05);
            if (service === 0x0E) return status(0, this.imageBytes(image));
            if (image !== this.inputs) return status(0x0E);
            if (data.length !== eip.size) return status(data.length < eip.size ? 0x13 : 0x15);
            this.writeImage(this.inputs, data);
            this.refreshServerCommands();
            return status(0);
        }
        if ((service === 0x54 || service === 0x5B) && path.class === 0x06) return this.forwardOpen(service, data, session, udp, sockaddr, extra, status);
        if (service === 0x4E && path.class === 0x06) {
            const serial = data.readUInt16LE(2), vendor = data.readUInt16LE(4), originator = data.readUInt32LE(6);
            const key = `${serial}:${vendor}:${originator}`;
            this.closeEipConnection(key);
            const payload = Buffer.alloc(10);
            data.copy(payload, 0, 2, 10);
            return status(0, payload);
        }
        return status(0x08);
    }

    forwardOpen(service, data, session, udp, sockaddr, extra, status) {
        const large = service === 0x5B;
        const eip = this.config.eip;
        const read = { o2tId: data.readUInt32LE(2), t2oId: data.readUInt32LE(6), serial: data.readUInt16LE(10), vendor: data.readUInt16LE(12), originator: data.readUInt32LE(14), multiplier: data[18] };
        let offset = 22;
        const o2tRpi = data.readUInt32LE(offset); offset += 4;
        const o2tParams = large ? data.readUInt32LE(offset) : data.readUInt16LE(offset); offset += large ? 4 : 2;
        const t2oRpi = data.readUInt32LE(offset); offset += 4;
        const t2oParams = large ? data.readUInt32LE(offset) : data.readUInt16LE(offset); offset += large ? 4 : 2;
        offset += 1;
        const pathWords = data[offset]; offset += 1;
        const connectionPath = data.subarray(offset, offset + pathWords * 2);
        const points = [];
        for (let i = 0; i + 1 < connectionPath.length; i += 2) {
            if (connectionPath[i] === 0x2C || connectionPath[i] === 0x24) points.push(connectionPath[i + 1]);
        }
        const [, consumed, produced] = points.length >= 3 ? points : [0, ...points];
        const sizeMask = large ? 0xffff : 0x1ff;
        const o2tSize = o2tParams & sizeMask, t2oSize = t2oParams & sizeMask;
        const o2tHeader = o2tSize - 2 >= eip.size + 4;
        if (consumed !== eip.inputInstance || produced !== eip.outputInstance) {
            return status(0x01, Buffer.from([0x05, 0x01]));
        }
        if (o2tSize - 2 - (o2tHeader ? 4 : 0) !== eip.size || t2oSize - 2 !== eip.size) {
            return status(0x01, Buffer.from([0x09, 0x01]));
        }
        const key = `${read.serial}:${read.vendor}:${read.originator}`;
        this.closeEipConnection(key);
        const multicastT2o = ((t2oParams >> (large ? 29 : 13)) & 3) === 1;
        const connection = {
            sessionId: session.id,
            o2tId: crypto.randomBytes(4).readUInt32LE(0),
            t2oId: multicastT2o || !read.t2oId ? crypto.randomBytes(4).readUInt32LE(0) : read.t2oId,
            address: session.socket.remoteAddress.replace(/^::ffff:/, ''),
            port: sockaddr ? sockaddr.data.readUInt16BE(2) : eip.udpPort,
            o2tHeader, sequence: 0, lastReceive: Date.now(),
            timeoutMs: Math.max(100, (o2tRpi / 1000) * (4 << Math.min(7, read.multiplier)))
        };
        const interval = Math.max(1, Math.round(t2oRpi / 1000));
        connection.timer = setInterval(() => {
            if (!this.running) { this.closeEipConnection(key); return; }
            if (Date.now() - connection.lastReceive > connection.timeoutMs) { this.closeEipConnection(key); return; }
            connection.sequence = (connection.sequence + 1) >>> 0;
            const image = this.imageBytes(this.outputs);
            const payload = Buffer.concat([Buffer.from([connection.sequence & 0xff, (connection.sequence >> 8) & 0xff]), image]);
            const packet = ioPacket(connection.t2oId, connection.sequence, payload);
            this.logFrame('tx', 'eip-io', packet, `T→O seq ${connection.sequence}`, toHex(image));
            safeSend(udp, packet, connection.port, connection.address);
        }, interval);
        this.eipConnections.set(key, connection);
        // Tell the originator where to send O→T data when it is not UDP 2222.
        if (eip.udpPort !== 2222) {
            const address = Buffer.alloc(16);
            address.writeUInt16BE(2, 0); address.writeUInt16BE(eip.udpPort, 2);
            Buffer.from(this.config.bindIp.split('.').map(Number)).copy(address, 4);
            extra.push({ type: 0x8000, data: address });
        }
        const payload = Buffer.alloc(26);
        payload.writeUInt32LE(connection.o2tId, 0);
        payload.writeUInt32LE(connection.t2oId, 4);
        payload.writeUInt16LE(read.serial, 8);
        payload.writeUInt16LE(read.vendor, 10);
        payload.writeUInt32LE(read.originator, 12);
        payload.writeUInt32LE(o2tRpi, 16);
        payload.writeUInt32LE(t2oRpi, 20);
        return status(0, payload);
    }

    async startEipClient() {
        const eip = this.config.eip;
        let udp = null;
        if (eip.mode === 'implicit') {
            udp = dgram.createSocket({ type: 'udp4', reuseAddr: false });
            await new Promise((resolve, reject) => {
                udp.once('error', reject);
                udp.bind(eip.udpPort, this.config.bindIp, () => { udp.off('error', reject); resolve(); });
            });
            udp.on('error', error => { this.message = error.message; });
            this.addCloser(() => new Promise(done => udp.close(() => done())));
        }
        // The class 1 I/O connection belongs to the endpoint, not to one TCP
        // session: OpENer adapters may close an idle encapsulation session
        // while UDP I/O keeps running. Only a T→O timeout ends the I/O.
        this.eipIo = null;
        this.eipSession = null;
        const stopIo = reason => {
            const connection = this.eipIo;
            if (!connection) return;
            clearInterval(connection.timer);
            udp?.removeListener('message', connection.listener);
            this.eipIo = null;
            if (reason) this.message = reason;
            this.removePeer('eip-io');
        };
        this.addCloser(() => stopIo());
        this.connectOnce(() => net.connect({ host: this.config.targetIp, port: this.config.targetPort, localAddress: this.config.bindIp }), socket => {
            const id = crypto.randomUUID();
            socket.setNoDelay(true);
            const request = this.createRequester(socket, buffer => {
                if (buffer.length < 24) return null;
                const length = 24 + buffer.readUInt16LE(2);
                return buffer.length >= length ? { length, frame: buffer.subarray(0, length) } : null;
            });
            let sessionHandle = 0, keepAlive = null;
            const encapsulate = (command, body) => {
                const header = Buffer.alloc(24);
                header.writeUInt16LE(command, 0);
                header.writeUInt16LE(body.length, 2);
                header.writeUInt32LE(sessionHandle, 4);
                return Buffer.concat([header, body]);
            };
            const sendCip = async (cipRequest, extraItems = []) => {
                const frame = encapsulate(0x006F, Buffer.concat([Buffer.alloc(6), cpf([{ type: 0, data: Buffer.alloc(0) }, { type: 0x00B2, data: cipRequest }, ...extraItems])]));
                this.logFrame('tx', `eip-cip-${cipRequest[0]}`, frame, cipServiceName(cipRequest[0]));
                const reply = await request(frame);
                this.logFrame('rx', `eip-cip-${cipRequest[0]}`, reply, `${cipServiceName(cipRequest[0])} reply`);
                if (reply.readUInt32LE(8) !== 0) throw new Error(`EIP encapsulation status ${reply.readUInt32LE(8)}`);
                const items = parseCpf(reply.subarray(30));
                const cip = items.find(item => item.type === 0x00B2)?.data;
                if (!cip || cip.length < 4) throw new Error('EIP reply without CIP data');
                if (cip[2] !== 0) {
                    const extended = cip[3] ? cip.readUInt16LE(4) : 0;
                    const error = new Error(`CIP status 0x${cip[2].toString(16)}${extended ? ` / 0x${extended.toString(16)}` : ''}${cip[2] === 1 && extended === 0x106 ? ' ownership conflict' : ''}`);
                    error.cipStatus = cip[2];
                    error.extendedStatus = extended;
                    throw error;
                }
                return { data: cip.subarray(4 + cip[3] * 2), items };
            };
            socket.once('close', () => {
                clearInterval(keepAlive);
                if (this.eipSession?.socket === socket) this.eipSession = null;
                this.removePeer(id);
            });
            (async () => {
                const registered = await request(encapsulate(0x0065, Buffer.from([1, 0, 0, 0])));
                if (registered.readUInt32LE(8) !== 0) throw new Error('RegisterSession rejected');
                sessionHandle = registered.readUInt32LE(4);
                if (eip.mode === 'explicit') {
                    this.addPeer(id, `${this.config.targetIp}:${this.config.targetPort} (explicit)`);
                    this.startPolling(socket, async () => {
                        if (this.shouldWriteResults()) {
                            try { await sendCip(Buffer.concat([Buffer.from([0x10, 3, 0x20, 0x04, 0x24, eip.inputInstance, 0x30, 3]), this.imageBytes(this.inputs)])); }
                            catch (error) { this.resultsDirty = true; throw error; }
                        }
                        if (this.config.commandWords) {
                            const reply = await sendCip(Buffer.from([0x0E, 3, 0x20, 0x04, 0x24, eip.outputInstance, 0x30, 3]));
                            this.writeImage(this.outputs, reply.data);
                            this.updateCommands(this.outputs.subarray(this.config.commandIndex, this.config.commandIndex + this.config.commandWords));
                        }
                    });
                    return;
                }
                this.eipSession = { socket, sendCip };
                if (!this.eipIo) {
                    this.eipIo = await this.openEipIo(sendCip, udp, reason => {
                        stopIo(reason);
                        // Open a fresh session and connection on the next attempt.
                        this.eipSession?.socket.destroy();
                    });
                    this.addPeer('eip-io', `${this.config.targetIp}:${this.config.targetPort} (I/O ${eip.rpiMs} ms)`);
                }
                // Keep the encapsulation session active with a small explicit
                // read; adapters close idle sessions after their inactivity timeout.
                keepAlive = setInterval(() => {
                    sendCip(Buffer.from([0x0E, 3, 0x20, 0x01, 0x24, 0x01, 0x30, 0x01]))
                        .catch(error => { if (error.cipStatus === undefined) socket.destroy(); });
                }, 5000);
                // Release the connection explicitly so the robot does not
                // wait for the I/O timeout before accepting another owner.
                this.beforeStop = async () => {
                    const connection = this.eipIo, session = this.eipSession;
                    if (!connection) return;
                    clearInterval(connection.timer);
                    if (!session || session.socket.destroyed) return;
                    const close = Buffer.alloc(10);
                    close[0] = 0x0A; close[1] = 0x0E;
                    close.writeUInt16LE(connection.serial, 2);
                    close.writeUInt16LE(EIP_VENDOR_ID, 4);
                    close.writeUInt32LE(connection.originator, 6);
                    const path = Buffer.from([0x20, 0x04, 0x24, eip.configInstance, 0x2C, eip.inputInstance, 0x2C, eip.outputInstance]);
                    await session.sendCip(Buffer.concat([Buffer.from([0x4E, 2, 0x20, 0x06, 0x24, 0x01]), close, Buffer.from([path.length / 2, 0]), path]));
                };
            })().catch(error => {
                this.message = error.message;
                this.setState(this.peers.size ? 'connected' : 'error', error.message);
                socket.destroy();
            });
        });
    }

    async openEipIo(sendCip, udp, onTimeout) {
        const eip = this.config.eip;
        const serial = crypto.randomBytes(2).readUInt16LE(0);
        const originator = crypto.randomBytes(4).readUInt32LE(0);
        const rpi = eip.rpiMs * 1000;
        const o2tSize = eip.size + 6, t2oSize = eip.size + 2;
        const params = (size, pointToPoint) => (size & 0x1ff) | (pointToPoint ? 2 << 13 : 1 << 13) | (2 << 10);
        const multiplier = 5; // connection timeout = RPI × 128
        const timeoutMs = Math.max(2000, eip.rpiMs * (4 << multiplier));
        const body = Buffer.alloc(36);
        body[0] = 0x0A; body[1] = 0x0E;
        body.writeUInt32LE(crypto.randomBytes(4).readUInt32LE(0), 2);
        body.writeUInt32LE(crypto.randomBytes(4).readUInt32LE(0), 6);
        body.writeUInt16LE(serial, 10);
        body.writeUInt16LE(EIP_VENDOR_ID, 12);
        body.writeUInt32LE(originator, 14);
        body[18] = multiplier;
        body.writeUInt32LE(rpi, 22); body.writeUInt16LE(params(o2tSize, true), 26);
        body.writeUInt32LE(rpi, 28); body.writeUInt16LE(params(t2oSize, true), 32);
        body[34] = 0x01; // class 1, cyclic
        const connectionPath = Buffer.from([0x20, 0x04, 0x24, eip.configInstance, 0x2C, eip.inputInstance, 0x2C, eip.outputInstance]);
        body[35] = connectionPath.length / 2;
        const request = Buffer.concat([Buffer.from([0x54, 2, 0x20, 0x06, 0x24, 0x01]), body, connectionPath]);
        const sockaddr = Buffer.alloc(16);
        sockaddr.writeUInt16BE(2, 0); sockaddr.writeUInt16BE(eip.udpPort, 2);
        Buffer.from(this.config.bindIp.split('.').map(Number)).copy(sockaddr, 4);
        const reply = await sendCip(request, [{ type: 0x8001, data: sockaddr }]);
        const o2tId = reply.data.readUInt32LE(0), t2oId = reply.data.readUInt32LE(4);
        const targetSockaddr = reply.items.find(item => item.type === 0x8000);
        const targetPort = targetSockaddr ? targetSockaddr.data.readUInt16BE(2) : 2222;
        const connection = { o2tId, t2oId, serial, originator, sequence: 0, lastReceive: Date.now(), timer: null, listener: null };
        connection.listener = message => {
            const packet = parseIoPacket(message);
            if (!packet || packet.connectionId !== t2oId) return;
            connection.lastReceive = Date.now();
            this.logFrame('rx', 'eip-io', message, `T→O seq ${packet.sequence}`, toHex(packet.data.subarray(2)));
            this.writeImage(this.outputs, packet.data.subarray(2));
            if (this.config.commandWords) this.updateCommands(this.outputs.subarray(this.config.commandIndex, this.config.commandIndex + this.config.commandWords));
        };
        udp.on('message', connection.listener);
        connection.timer = setInterval(() => {
            if (!this.running) { clearInterval(connection.timer); return; }
            if (Date.now() - connection.lastReceive > timeoutMs) {
                onTimeout?.(`EtherNet/IP I/O timeout: no T→O data for ${timeoutMs} ms`);
                return;
            }
            connection.sequence = (connection.sequence + 1) >>> 0;
            const header = Buffer.from([connection.sequence & 0xff, (connection.sequence >> 8) & 0xff, 1, 0, 0, 0]);
            const image = this.imageBytes(this.inputs);
            const packet = ioPacket(o2tId, connection.sequence, Buffer.concat([header, image]));
            this.logFrame('tx', 'eip-io', packet, `O→T seq ${connection.sequence}`, toHex(image));
            safeSend(udp, packet, targetPort, this.config.targetIp);
        }, eip.rpiMs);
        return connection;
    }
}

// ------------------------------------------------------------------ helpers

function cpf(items) {
    const parts = [Buffer.from([items.length & 0xff, items.length >> 8])];
    for (const item of items) {
        const header = Buffer.alloc(4);
        header.writeUInt16LE(item.type, 0);
        header.writeUInt16LE(item.data.length, 2);
        parts.push(header, item.data);
    }
    return Buffer.concat(parts);
}

function parseCpf(buffer) {
    if (buffer.length < 2) return [];
    const count = buffer.readUInt16LE(0);
    const items = [];
    let offset = 2;
    for (let i = 0; i < count && offset + 4 <= buffer.length; i++) {
        const type = buffer.readUInt16LE(offset), length = buffer.readUInt16LE(offset + 2);
        offset += 4;
        if (offset + length > buffer.length) break;
        items.push({ type, data: buffer.subarray(offset, offset + length) });
        offset += length;
    }
    return items;
}

function parseEpath(buffer) {
    const path = {};
    for (let i = 0; i < buffer.length;) {
        const segment = buffer[i];
        if (segment === 0x20) { path.class = buffer[i + 1]; i += 2; }
        else if (segment === 0x21) { path.class = buffer.readUInt16LE(i + 2); i += 4; }
        else if (segment === 0x24) { path.instance = buffer[i + 1]; i += 2; }
        else if (segment === 0x25) { path.instance = buffer.readUInt16LE(i + 2); i += 4; }
        else if (segment === 0x30) { path.attribute = buffer[i + 1]; i += 2; }
        else if (segment === 0x2C) { path.point = buffer[i + 1]; i += 2; }
        else break;
    }
    return path;
}

function ioPacket(connectionId, sequence, payload) {
    const address = Buffer.alloc(8);
    address.writeUInt32LE(connectionId >>> 0, 0);
    address.writeUInt32LE(sequence >>> 0, 4);
    return cpf([{ type: 0x8002, data: address }, { type: 0x00B1, data: payload }]);
}

function parseIoPacket(message) {
    const items = parseCpf(message);
    const address = items.find(item => item.type === 0x8002);
    const data = items.find(item => item.type === 0x00B1);
    if (!address || address.data.length < 8 || !data) return null;
    return { connectionId: address.data.readUInt32LE(0), sequence: address.data.readUInt32LE(4), data: data.data };
}

function safeSend(udp, packet, port, address) {
    try { udp.send(packet, port, address); }
    catch { /* The socket closes while the endpoint is stopping. */ }
}

function cipServiceName(service) {
    return { 0x01: 'Get_Attributes_All', 0x0E: 'Get_Attribute_Single', 0x10: 'Set_Attribute_Single', 0x4E: 'Forward_Close', 0x52: 'Unconnected_Send', 0x54: 'Forward_Open', 0x5B: 'Large_Forward_Open' }[service] || `service 0x${Number(service).toString(16)}`;
}

function mcSummary(request) {
    if (request.invalid) return 'invalid frame';
    return `${request.command.toString(16).padStart(4, '0')} ${request.device || '?'}${request.address} ×${request.points}${request.ascii ? ' ASCII' : ''}`;
}

module.exports = {
    IMAGE_WORDS,
    VirtualVisionEndpoint,
    normalizeEndpointConfig,
    parseCpf,
    cpf,
    parseIoPacket,
    ioPacket
};
