import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolsDirectory, '..');

function sourceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
    return source.slice(start, end);
}

async function waitFor(condition, message, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await condition()) return;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
    }
    throw new Error(message);
}

async function getAvailablePort() {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const port = address.port;
    await new Promise((resolveClose) => server.close(resolveClose));
    return port;
}

function openWebSocket(endpoint) {
    return new Promise((resolveOpen, rejectOpen) => {
        const socket = new WebSocket(endpoint);
        const timeout = setTimeout(() => {
            socket.close();
            rejectOpen(new Error(`WebSocket open timed out: ${endpoint}`));
        }, 3000);
        socket.addEventListener('open', () => {
            clearTimeout(timeout);
            resolveOpen(socket);
        }, { once: true });
        socket.addEventListener('error', () => {
            clearTimeout(timeout);
            rejectOpen(new Error(`WebSocket open failed: ${endpoint}`));
        }, { once: true });
    });
}

function waitForMessage(socket, predicate, description, timeoutMs = 3000) {
    return new Promise((resolveMessage, rejectMessage) => {
        const timeout = setTimeout(() => {
            socket.removeEventListener('message', onMessage);
            rejectMessage(new Error(`Timed out waiting for ${description}.`));
        }, timeoutMs);
        const onMessage = (event) => {
            let message;
            try { message = JSON.parse(String(event.data)); }
            catch { return; }
            if (!predicate(message)) return;
            clearTimeout(timeout);
            socket.removeEventListener('message', onMessage);
            resolveMessage(message);
        };
        socket.addEventListener('message', onMessage);
    });
}

const mainSource = await readFile(resolve(repositoryRoot, '2_3DSimulation', 'main.js'), 'utf8');
const connectSource = sourceBetween(
    mainSource,
    'function connectOlpVirtualBus(',
    '\nasync function startOlpSession('
);
const startSource = sourceBetween(
    mainSource,
    'async function startOlpSession(',
    '\nasync function stopOlpSession('
);

{
    let helloCount = 0;
    const openSocket = { readyState: 1 };
    const context = vm.createContext({
        state: {
            virtualController: { wanted: false },
            olp: {
                virtualBusWanted: true,
                reconnectTimer: null,
                socket: openSocket
            }
        },
        WebSocket: { CONNECTING: 0, OPEN: 1 },
        startOlpBusMonitor: () => { },
        sendOlpVirtualBusHello: async () => { helloCount += 1; }
    });
    vm.runInContext(connectSource, context);

    context.connectOlpVirtualBus();
    await Promise.resolve();
    assert.equal(helloCount, 0, 'Starting OLP resent hello on an already paired socket.');

    context.connectOlpVirtualBus({ refreshMetadata: true });
    await Promise.resolve();
    assert.equal(helloCount, 1, 'An explicit OLP metadata refresh did not resend hello.');
}

{
    const connectCalls = [];
    class FakeOlpRuntime {
        constructor() {
            this.running = false;
            this.paused = false;
        }

        run() {
            this.running = true;
            return Promise.resolve();
        }

        stepOnce() {
            this.running = true;
            return Promise.resolve();
        }
    }
    const state = {
        activeProgramRobot: {},
        activeArticulatedModel: null,
        virtualController: { wanted: false },
        motionSessions: new Map(),
        olp: {
            runtime: null,
            project: { programPath: 'main.pro' },
            workOriginBusy: false,
            manualMoveBusy: false,
            resetCursorOnStop: false,
            virtualBusWanted: true,
            execution: {},
            status: 'connected'
        }
    };
    const context = vm.createContext({
        state,
        OlpRuntime: FakeOlpRuntime,
        isOlpRunning: () => false,
        setOlpStatus: () => { },
        flushOlpPendingEdit: () => { },
        readOlpAddress: () => 0,
        writeOlpAddress: () => { },
        runOlpMove: () => { },
        runOlpJump: () => { },
        runOlpHome: () => { },
        getOlpCurrentPosition: () => null,
        handleOlpAlarm: () => { },
        appendOlpConsole: () => { },
        queueOlpRuntimeView: () => { },
        flushOlpRuntimeView: () => { },
        resetOlpProgramCursor: () => { },
        updateMotionUiLock: () => { },
        requestRender: () => { },
        updateOlpBusStatus: () => { },
        connectOlpVirtualBus: (...args) => { connectCalls.push(args); },
        window: { setTimeout }
    });
    vm.runInContext(startSource, context);

    await context.startOlpSession();
    assert.equal(connectCalls.length, 1, 'Starting OLP did not reuse the Virtual Bus connection path.');
    assert.equal(
        connectCalls[0].length,
        0,
        'Starting OLP incorrectly requested a Virtual Bus metadata refresh.'
    );
}

const port = await getAvailablePort();
const token = '0123456789abcdef'.repeat(4);
const endpoint = `ws://127.0.0.1:${port}/virtualbus/`;
const broker = spawn(process.execPath, [resolve(toolsDirectory, 'serve-local.cjs'), String(port)], {
    cwd: repositoryRoot,
    env: { ...process.env, INOROBOT_VIRTUAL_BUS_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
});
let brokerLog = '';
broker.stdout.on('data', (chunk) => { brokerLog += String(chunk); });
broker.stderr.on('data', (chunk) => { brokerLog += String(chunk); });

let slave;
let master;
try {
    await waitFor(
        () => brokerLog.includes('InoRobot Assistant local server is running.'),
        `Virtual Bus broker did not start. ${brokerLog}`
    );

    slave = await openWebSocket(endpoint);
    slave.send(JSON.stringify({
        type: 'hello',
        token,
        role: 'slave',
        protocol: 'inorobot-virtual-bus',
        version: 1,
        robotName: 'Initial Robot',
        labels: { Start: 'In[1]' }
    }));

    master = await openWebSocket(endpoint);
    const initialHelloPromise = waitForMessage(
        master,
        (message) => message.type === 'hello' && message.robotName === 'Initial Robot',
        'the initial OLP hello'
    );
    master.send(JSON.stringify({
        type: 'hello',
        token,
        role: 'master',
        protocol: 'inorobot-virtual-bus',
        version: 1
    }));
    await initialHelloPromise;

    const readyPromise = waitForMessage(slave, (message) => message.type === 'ready', 'master ready');
    master.send(JSON.stringify({
        type: 'ready',
        role: 'master',
        protocol: 'inorobot-virtual-bus',
        version: 1
    }));
    await readyPromise;

    const refreshedHelloPromise = waitForMessage(
        master,
        (message) => message.type === 'hello' && message.robotName === 'Updated Robot',
        'the refreshed OLP metadata'
    );
    slave.send(JSON.stringify({
        type: 'hello',
        token,
        role: 'slave',
        protocol: 'inorobot-virtual-bus',
        version: 1,
        robotName: 'Updated Robot',
        labels: { Start: 'In[1]', Running: 'Out[1]' }
    }));
    const refreshedHello = await refreshedHelloPromise;
    assert.equal(refreshedHello.labels.Running, 'Out[1]');

    const inputPromise = waitForMessage(slave, (message) => message.type === 'inputSnapshot', 'input relay');
    master.send(JSON.stringify({ type: 'inputSnapshot', words: [0, 1, 2] }));
    assert.deepEqual((await inputPromise).words, [0, 1, 2]);

    const outputPromise = waitForMessage(master, (message) => message.type === 'outputSnapshot', 'output relay');
    slave.send(JSON.stringify({ type: 'outputSnapshot', words: [3, 4, 5] }));
    assert.deepEqual((await outputPromise).words, [3, 4, 5]);

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    assert.equal(slave.readyState, WebSocket.OPEN, 'OLP socket closed after metadata refresh.');
    assert.equal(master.readyState, WebSocket.OPEN, 'Tester socket closed after OLP metadata refresh.');
} finally {
    if (slave && slave.readyState < WebSocket.CLOSING) slave.close();
    if (master && master.readyState < WebSocket.CLOSING) master.close();
    if (broker.exitCode === null) broker.kill();
    await Promise.race([
        once(broker, 'exit'),
        new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
    ]);
}

console.log('OLP Virtual Bus validation passed: program start reuse, metadata refresh, and bidirectional relay.');
