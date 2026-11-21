import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VirtualVisionEndpoint } = require('../../tools/virtual-vision-protocols.cjs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const value = check();
        if (value) return value;
        await wait(10);
    }
    throw new Error('Timed out waiting for condition');
}
async function withEndpoints(configs, run) {
    const endpoints = configs.map(config => new VirtualVisionEndpoint(config));
    try {
        for (const endpoint of endpoints) await endpoint.start();
        await run(...endpoints);
    } finally {
        await Promise.all(endpoints.map(endpoint => endpoint.stop()));
    }
}
function connect(host, port, localAddress = '127.0.0.1') {
    const socket = net.connect({ host, port, localAddress });
    return once(socket, 'connect').then(() => socket);
}
async function exchange(socket, request, isComplete) {
    let buffer = Buffer.alloc(0);
    const done = new Promise((resolve, reject) => {
        const onData = chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            if (isComplete(buffer)) { socket.off('data', onData); resolve(buffer); }
        };
        socket.on('data', onData);
        socket.once('error', reject);
    });
    socket.write(request);
    return done;
}

test('socket server receives robot commands and replies on the same connection', async () => {
    await withEndpoints([{ protocol: 'socket', role: 'server', bindIp: '127.0.0.31', port: 45001 }], async vision => {
        const texts = [];
        vision.on('text', message => { texts.push(message.text); vision.sendText('1.250,-2.500,3.750', message.peer); });
        const robot = await connect('127.0.0.31', 45001);
        const reply = await exchange(robot, 'Shot', buffer => buffer.length >= 18);
        assert.equal(reply.toString(), '1.250,-2.500,3.750');
        robot.write('CALPOS,1,2,3\r\nCALSTART\r\n');
        await waitFor(() => texts.length === 3);
        assert.deepEqual(texts, ['Shot', 'CALPOS,1,2,3', 'CALSTART']);
        assert.equal(vision.status().state, 'connected');
        robot.destroy();
        await waitFor(() => vision.status().state === 'listening');
    });
});

test('socket client connects from the vision IP to a robot server', async () => {
    const server = net.createServer();
    server.listen(45002, '127.0.0.32');
    await once(server, 'listening');
    const accepted = once(server, 'connection');
    try {
        await withEndpoints([{ protocol: 'socket', role: 'client', bindIp: '127.0.0.33', targetIp: '127.0.0.32', targetPort: 45002 }], async vision => {
            const [robot] = await accepted;
            assert.equal(robot.remoteAddress.replace(/^::ffff:/, ''), '127.0.0.33');
            const received = once(vision, 'text');
            robot.write('T1');
            assert.equal((await received)[0].text, 'T1');
            const reply = once(robot, 'data');
            vision.sendText('0.000,0.000,0.000\r\n');
            assert.equal((await reply)[0].toString(), '0.000,0.000,0.000\r\n');
            robot.destroy();
        });
    } finally { server.close(); }
});

test('modbus server mirrors the Inovance controller aliases', async () => {
    await withEndpoints([{ protocol: 'modbus', role: 'server', bindIp: '127.0.0.34', port: 45502, resultIndex: 68, commandIndex: 68, resultWords: 12, commandWords: 8 }], async vision => {
        const commands = [];
        vision.on('commands', words => commands.push(words));
        vision.setResults([0x000D, 1, 0, 0x3FA0, 0, 0, 0, 0, 0, 0, 7, 0]);
        const plc = await connect('127.0.0.34', 45502);
        const request = (transaction, pdu) => {
            const header = Buffer.alloc(7);
            header.writeUInt16BE(transaction, 0); header.writeUInt16BE(pdu.length + 1, 4); header[6] = 1;
            return exchange(plc, Buffer.concat([header, pdu]), buffer => buffer.length >= 6 && buffer.length >= 6 + buffer.readUInt16BE(4));
        };
        // FC04 output words: OUTW[32+68] = register 2035+68.
        let reply = await request(1, Buffer.from([4, 0x08, 0x37, 0, 4]));
        assert.deepEqual([...reply.subarray(9)], [0, 0x0D, 0, 1, 0, 0, 0x3F, 0xA0]);
        // FC16 input words: INW[32+68] = register 34787+68.
        const write = Buffer.from([16, 0x88, 0x27, 0, 2, 4, 0, 1, 0, 0]);
        write.writeUInt16BE(34787 + 68, 1);
        reply = await request(2, write);
        assert.deepEqual([...reply.subarray(7)], [16, ...write.subarray(1, 5)]);
        await waitFor(() => commands.length === 1);
        assert.deepEqual(commands[0].slice(0, 2), [1, 0]);
        // FC03 reads input words back; out-of-range addresses raise exception 2.
        const read = Buffer.from([3, 0, 0, 0, 2]);
        read.writeUInt16BE(34787 + 68, 1);
        reply = await request(3, read);
        assert.deepEqual([...reply.subarray(9)], [0, 1, 0, 0]);
        const bad = Buffer.from([3, 0, 0, 0, 1]);
        bad.writeUInt16BE(34787 + 128, 1);
        reply = await request(4, bad);
        assert.deepEqual([...reply.subarray(7)], [0x83, 2]);
        // FC05 input coil 4096+n sets INW bit n; FC02 reads output bits.
        const coil = Buffer.from([5, 0, 0, 0xFF, 0]);
        coil.writeUInt16BE(4096 + 68 * 16 + 1, 1);
        await request(5, coil);
        await waitFor(() => commands.length === 2);
        assert.equal(commands[1][0], 3);
        const bits = Buffer.from([2, 0, 0, 0, 4]);
        bits.writeUInt16BE(68 * 16, 1);
        reply = await request(6, bits);
        assert.deepEqual([...reply.subarray(7)], [2, 1, 0x0D]);
        plc.destroy();
    });
});

test('modbus client writes results and polls robot outputs', async () => {
    await withEndpoints([
        { protocol: 'modbus', role: 'server', bindIp: '127.0.0.35', port: 45503, resultIndex: 20, commandIndex: 68, resultWords: 8, commandWords: 12 },
        { protocol: 'modbus', role: 'client', bindIp: '127.0.0.36', targetIp: '127.0.0.35', targetPort: 45503, resultIndex: 68, commandIndex: 20, resultWords: 12, commandWords: 8, pollMs: 10 }
    ], async (robot, vision) => {
        const robotSeen = [], visionSeen = [];
        robot.on('commands', words => robotSeen.push(words));
        vision.on('commands', words => visionSeen.push(words));
        vision.setResults([5, 1, 0x1234, 0x4321, 0, 0, 0, 0, 0, 0, 9, 0]);
        robot.setResults([1, 0, 0xAAAA, 0xBBBB, 0, 0, 0, 0]);
        await waitFor(() => robotSeen.at(-1)?.[2] === 0x1234);
        await waitFor(() => visionSeen.at(-1)?.[3] === 0xBBBB);
        assert.deepEqual(robotSeen.at(-1), [5, 1, 0x1234, 0x4321, 0, 0, 0, 0, 0, 0, 9, 0]);
        assert.equal(vision.status().state, 'connected');
    });
});

// Byte-for-byte port of the virtual controller's MC 3E client request.
function controllerMcRequest(command, start, data = null) {
    const size = command === 0x1401 ? data.length : 0;
    const p = Buffer.alloc(21 + size);
    p[0] = 0x50; p[2] = 0; p[3] = 255; p[4] = 255; p[5] = 3;
    p.writeUInt16LE(12 + size, 7); p.writeUInt16LE(16, 9); p.writeUInt16LE(command, 11);
    p[15] = start & 255; p[16] = (start >> 8) & 255; p[17] = (start >> 16) & 255; p[18] = 0xA8;
    p.writeUInt16LE(128, 19);
    if (size) data.copy(p, 21);
    return p;
}

test('MC server answers the virtual controller 3E client frames', async () => {
    await withEndpoints([{ protocol: 'mc', role: 'server', bindIp: '127.0.0.37', port: 45000, resultWords: 12, commandWords: 8, mc: { resultAddress: 68, commandAddress: 1068 } }], async vision => {
        const commands = [];
        vision.on('commands', words => commands.push(words));
        vision.setResults([0x000D, 1, 0x0000, 0x3FA0, 0, 0, 0, 0, 0, 0, 3, 0]);
        const robot = await connect('127.0.0.37', 45000);
        const outputs = Buffer.alloc(256);
        outputs.writeUInt16LE(1, 68 * 2);
        outputs.writeFloatLE(512.5, 70 * 2);
        const isComplete = buffer => buffer.length >= 9 && buffer.length >= 9 + buffer.readUInt16LE(7);
        let reply = await exchange(robot, controllerMcRequest(0x1401, 1000, outputs), isComplete);
        assert.equal(reply[0], 0xD0);
        assert.deepEqual([...reply.subarray(2, 7)], [0, 255, 255, 3, 0]);
        assert.equal(reply.readUInt16LE(7), 2);
        assert.equal(reply.readUInt16LE(9), 0);
        await waitFor(() => commands.length === 1);
        assert.equal(commands[0][0], 1);
        reply = await exchange(robot, controllerMcRequest(0x0401, 0), isComplete);
        assert.equal(reply.readUInt16LE(7), 258);
        const inputs = reply.subarray(11);
        assert.equal(inputs.readUInt16LE(68 * 2), 0x000D);
        assert.equal(inputs.readFloatLE(70 * 2), 1.25);
        assert.equal(inputs.readUInt16LE(78 * 2), 3);
        // ASCII 3E batch read of D68..D69.
        const ascii = '500000FF03FF00' + '0018' + '0010' + '0401' + '0000' + 'D*' + '000068' + '0002';
        reply = await exchange(robot, Buffer.from(ascii, 'ascii'), buffer => buffer.length >= 18 && buffer.length >= 18 + Number.parseInt(buffer.toString('ascii', 14, 18), 16));
        assert.equal(reply.toString('ascii'), 'D00000FF03FF00000C0000000D0001');
        robot.destroy();
    });
});

test('MC client writes results to a PLC and reads commands', async () => {
    for (const frame of ['binary', 'ascii']) {
        await withEndpoints([
            { protocol: 'mc', role: 'server', bindIp: '127.0.0.38', port: 45010, resultWords: 8, commandWords: 12, mc: { resultAddress: 300, commandAddress: 100 } },
            { protocol: 'mc', role: 'client', bindIp: '127.0.0.39', targetIp: '127.0.0.38', targetPort: 45010, pollMs: 10, resultWords: 12, commandWords: 8, mc: { frame, resultAddress: 100, commandAddress: 300 } }
        ], async (plc, vision) => {
            const plcSeen = [], visionSeen = [];
            plc.on('commands', words => plcSeen.push(words));
            vision.on('commands', words => visionSeen.push(words));
            vision.setResults([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0xFFFF]);
            plc.setResults([7, 0, 0, 0, 0, 0, 0, 0x8000]);
            await waitFor(() => plcSeen.at(-1)?.[11] === 0xFFFF);
            await waitFor(() => visionSeen.at(-1)?.[7] === 0x8000);
            assert.deepEqual(visionSeen.at(-1), [7, 0, 0, 0, 0, 0, 0, 0x8000]);
        });
    }
});

// Get_Attribute_Single as sent by the virtual controller bridge's fieldbus reader.
function readAssemblyRequest(session, instance) {
    const body = Buffer.from([0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0xB2, 0, 8, 0, 0x0E, 3, 0x20, 4, 0x24, instance, 0x30, 3]);
    const header = Buffer.alloc(24);
    header.writeUInt16LE(0x6F, 0); header.writeUInt16LE(body.length, 2); header.writeUInt32LE(session, 4);
    return Buffer.concat([header, body]);
}

test('EtherNet/IP adapter supports explicit reads compatible with the bridge reader', async () => {
    await withEndpoints([{ protocol: 'eip', role: 'server', bindIp: '127.0.0.41', port: 45818, resultIndex: 68, commandIndex: 68, eip: { udpPort: 45222 } }], async vision => {
        vision.setResults([0x000D, 1, 0, 0x3FA0, 0, 0, 0, 0, 0, 0, 1, 0]);
        const scanner = await connect('127.0.0.41', 45818);
        const complete = buffer => buffer.length >= 24 && buffer.length >= 24 + buffer.readUInt16LE(2);
        const register = Buffer.alloc(28);
        register.writeUInt16LE(0x65, 0); register.writeUInt16LE(4, 2); register[24] = 1;
        let reply = await exchange(scanner, register, complete);
        const session = reply.readUInt32LE(4);
        assert.ok(session !== 0);
        reply = await exchange(scanner, readAssemblyRequest(session, 101), complete);
        assert.equal(reply.readUInt16LE(30), 2);
        let offset = 32;
        offset += 4 + reply.readUInt16LE(offset + 2);
        assert.equal(reply.readUInt16LE(offset), 0xB2);
        const length = reply.readUInt16LE(offset + 2);
        assert.equal(reply[offset + 4], 0x8E);
        assert.equal(reply[offset + 6], 0);
        const data = reply.subarray(offset + 8, offset + 4 + length);
        assert.equal(data.length, 256);
        assert.equal(data.readUInt16LE(68 * 2), 0x000D);
        assert.equal(data.readFloatLE(70 * 2), 1.25);
        scanner.destroy();
    });
});

test('EtherNet/IP scanner exchanges cyclic I/O with an adapter', async () => {
    for (const mode of ['implicit', 'explicit']) {
        await withEndpoints([
            { protocol: 'eip', role: 'server', bindIp: '127.0.0.42', port: 45819, resultIndex: 10, commandIndex: 68, resultWords: 8, commandWords: 12, eip: { udpPort: 45223 } },
            { protocol: 'eip', role: 'client', bindIp: '127.0.0.43', targetIp: '127.0.0.42', targetPort: 45819, pollMs: 10, resultIndex: 68, commandIndex: 10, resultWords: 12, commandWords: 8, eip: { mode, udpPort: 45224, rpiMs: 5 } }
        ], async (robot, vision) => {
            const robotSeen = [], visionSeen = [];
            robot.on('commands', words => robotSeen.push(words));
            vision.on('commands', words => visionSeen.push(words));
            vision.setResults([0x000D, 1, 0x0000, 0x3FA0, 0, 0, 0, 0, 0, 0, 2, 0]);
            robot.setResults([1, 0, 0x0000, 0x4400, 0, 0, 0, 0]);
            await waitFor(() => robotSeen.at(-1)?.[3] === 0x3FA0, 4000);
            await waitFor(() => visionSeen.at(-1)?.[3] === 0x4400, 4000);
            assert.equal(vision.status().state, 'connected');
            assert.match(vision.status().peers[0], new RegExp(mode === 'implicit' ? 'I/O' : 'explicit'));
        });
    }
});

test('EtherNet/IP I/O survives an idle TCP close without reconnecting the session', async () => {
    await withEndpoints([
        { protocol: 'eip', role: 'server', bindIp: '127.0.0.45', port: 45820, resultIndex: 10, commandIndex: 68, resultWords: 8, commandWords: 12, eip: { udpPort: 45225 } },
        { protocol: 'eip', role: 'client', bindIp: '127.0.0.46', targetIp: '127.0.0.45', targetPort: 45820, resultIndex: 68, commandIndex: 10, resultWords: 12, commandWords: 8, eip: { udpPort: 45226, rpiMs: 5 } }
    ], async (robot, vision) => {
        const robotSeen = [], visionSeen = [], states = [];
        robot.on('commands', words => robotSeen.push(words));
        vision.on('commands', words => visionSeen.push(words));
        vision.on('status', status => states.push(status.state));
        vision.setResults([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        await waitFor(() => robotSeen.at(-1)?.[0] === 1);
        const forwardOpens = () => [...robot.eipConnections.values()].length;
        assert.equal(forwardOpens(), 1);
        // Inactivity timeout on the adapter side: only the TCP session closes.
        await waitFor(() => vision.eipSession);
        vision.eipSession.socket.destroy();
        vision.setResults([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        await waitFor(() => robotSeen.at(-1)?.[0] === 2);
        robot.setResults([5, 0, 0, 0, 0, 0, 0, 0]);
        await waitFor(() => visionSeen.at(-1)?.[0] === 5);
        await wait(1200);
        assert.equal(vision.eipSession, null, 'the idle TCP session is not reconnected');
        assert.equal(forwardOpens(), 1, 'the existing cyclic I/O connection stays active');
        assert.equal(vision.status().state, 'connected');
        assert.ok(!states.includes('connecting'), `status flipped: ${states.join(',')}`);
    });
});

test('Socket and Ethernet/IP clients attempt a refused connection only once', async () => {
    for (const protocol of ['socket', 'eip']) {
        const server = net.createServer();
        server.listen(0, '127.0.0.61');
        await once(server, 'listening');
        const port = server.address().port;
        await new Promise(resolve => server.close(resolve));
        const vision = new VirtualVisionEndpoint({ protocol, role: 'client', bindIp: '127.0.0.62', targetIp: '127.0.0.61', targetPort: port, eip: { mode: 'explicit' } });
        const accepted = [];
        server.on('connection', socket => accepted.push(socket));
        try {
            await vision.start();
            await waitFor(() => vision.status().state === 'error');
            server.listen(port, '127.0.0.61');
            await once(server, 'listening');
            await wait(1200);
            assert.equal(accepted.length, 0, `${protocol} retried a refused connection`);
        } finally {
            await vision.stop();
            accepted.forEach(socket => socket.destroy());
            await new Promise(resolve => server.close(resolve));
        }
    }
});

test('Socket and Ethernet/IP clients do not reconnect after an established connection closes', async () => {
    for (const protocol of ['socket', 'eip']) {
        await withEndpoints([
            { protocol, role: 'server', bindIp: '127.0.0.63', port: 45063 },
            { protocol, role: 'client', bindIp: '127.0.0.64', targetIp: '127.0.0.63', targetPort: 45063, eip: { mode: 'explicit' } }
        ], async (robot, vision) => {
            await waitFor(() => vision.status().state === 'connected');
            await robot.stop();
            await waitFor(() => ['stopped', 'error'].includes(vision.status().state));
            await robot.start();
            await wait(1200);
            assert.notEqual(vision.status().state, 'connected', `${protocol} reconnected automatically`);
            assert.equal(robot.status().state, 'listening');
        });
    }
});

test('local launcher relays a virtual vision session over WebSocket', async () => {
    const { spawn } = await import('node:child_process');
    const token = 'a'.repeat(64);
    const server = spawn(process.execPath, ['tools/serve-local.cjs', '48766'], {
        env: { ...process.env, INOROBOT_VIRTUAL_BUS_TOKEN: token, INOROBOT_EXIT_WHEN_PAGES_CLOSED: '' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    try {
        await new Promise((resolve, reject) => {
            server.stdout.on('data', chunk => { if (String(chunk).includes('Virtual vision endpoint')) resolve(); });
            server.once('exit', code => reject(new Error(`server exited ${code}`)));
        });
        const ws = new WebSocket('ws://127.0.0.1:48766/virtualvision/');
        const messages = [];
        ws.addEventListener('message', event => messages.push(JSON.parse(event.data)));
        await once(ws, 'open');
        ws.send(JSON.stringify({ type: 'hello', token }));
        await waitFor(() => messages.some(message => message.type === 'ready'));
        ws.send(JSON.stringify({ type: 'configure', config: { protocol: 'socket', role: 'server', bindIp: '127.0.0.51', port: 45030 } }));
        await waitFor(() => messages.some(message => message.type === 'status' && message.status.state === 'listening'));
        const robot = await connect('127.0.0.51', 45030);
        robot.write('Shot');
        const command = await waitFor(() => messages.find(message => message.type === 'text'));
        assert.equal(command.text, 'Shot');
        const reply = once(robot, 'data');
        ws.send(JSON.stringify({ type: 'text', text: '1,2,3', peer: command.peer }));
        assert.equal((await reply)[0].toString(), '1,2,3');
        robot.destroy();
        ws.close();
        // A wrong token closes the session without opening endpoints.
        const intruder = new WebSocket('ws://127.0.0.1:48766/virtualvision/');
        await once(intruder, 'open');
        intruder.send(JSON.stringify({ type: 'hello', token: 'b'.repeat(64) }));
        await once(intruder, 'close');
    } finally {
        server.kill();
    }
});

test('endpoint reports bind failures as errors', async () => {
    const blocker = net.createServer();
    blocker.listen(45020, '127.0.0.44');
    await once(blocker, 'listening');
    const vision = new VirtualVisionEndpoint({ protocol: 'socket', role: 'server', bindIp: '127.0.0.44', port: 45020 });
    await assert.rejects(vision.start(), /EADDRINUSE/);
    assert.equal(vision.status().state, 'error');
    blocker.close();
});

test('RobotLab V framing separates commands and retains unterminated Send Port compatibility', async () => {
    await withEndpoints([{ protocol: 'socket', role: 'server', bindIp: '127.0.0.31', port: 45009, terminator: 'lab' }], async vision => {
        const texts = [];
        vision.on('text', message => { texts.push(message.text); vision.sendText('12.500,34.250V', message.peer); });
        const robot = await connect('127.0.0.31', 45009);
        try {
            assert.equal((await exchange(robot, 'CALRAWV', buffer => buffer.includes(86))).toString(), '12.500,34.250V');
            robot.write('PIXELVCALRAWV');
            await waitFor(() => texts.length === 3);
            assert.deepEqual(texts, ['CALRAW', 'PIXEL', 'CALRAW']);
            robot.write('Shot');
            await waitFor(() => texts.length === 4);
            assert.equal(texts[3], 'Shot');
        } finally { robot.destroy(); }
    });
});
