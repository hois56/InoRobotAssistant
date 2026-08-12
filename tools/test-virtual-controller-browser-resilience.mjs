import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');

function sourceBetween(startMarker, endMarker) {
    const start = main.indexOf(startMarker);
    assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
    const end = main.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
    return main.slice(start, end);
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

async function flushAsyncWork() {
    await new Promise((resolve) => setImmediate(resolve));
}

const healthCheckSource = sourceBetween(
    'async function isVirtualControllerBridgeRunning()',
    '\nfunction monitorVirtualControllerBridgeHealth('
);
const healthMonitorSource = sourceBetween(
    'function monitorVirtualControllerBridgeHealth(',
    '\nfunction launchVirtualControllerBridge('
);
const messageHandlerSource = sourceBetween(
    'function handleVirtualControllerMessage(',
    '\nfunction scheduleVirtualControllerReconnect('
);
const socketSource = sourceBetween(
    'function openVirtualControllerSocket(',
    '\nfunction endVirtualControllerSessionForSourceExit('
);
const disconnectSource = sourceBetween(
    'function closeVirtualControllerSocket(',
    '\nfunction isVirtualControllerSourceLive('
);

{
    const first = createDeferred();
    const second = createDeferred();
    const responses = [first, second];
    const controller = {
        bridgeHealthCheckSequence: 0,
        bridgeToken: 'original-token',
        core: {
            getVirtualControllerSource: () => ({ healthUrl: 'http://bridge.test/api/health' })
        }
    };
    const context = vm.createContext({
        state: { virtualController: controller },
        fetch: () => responses.shift().promise
    });
    vm.runInContext(healthCheckSource, context);

    const olderCheck = context.isVirtualControllerBridgeRunning();
    const newerCheck = context.isVirtualControllerBridgeRunning();
    second.resolve({
        ok: true,
        json: async () => ({
            service: 'InoRobotVirtualControllerBridge',
            pairingToken: 'new-token'
        })
    });
    assert.equal(await newerCheck, true);
    assert.equal(controller.bridgeToken, 'new-token');

    first.resolve({
        ok: true,
        json: async () => ({
            service: 'InoRobotVirtualControllerBridge',
            pairingToken: 'stale-token'
        })
    });
    await olderCheck;
    assert.equal(
        controller.bridgeToken,
        'new-token',
        'An older health response overwrote the current bridge pairing token.'
    );
}

{
    const warnings = [];
    const statuses = [];
    const controller = {
        wanted: true,
        core: { parseVirtualControllerMessage: (raw) => raw },
        samples: {}
    };
    const context = vm.createContext({
        state: { virtualController: controller },
        performance: { now: () => 1_000 },
        setVirtualControllerStatus: (...args) => { statuses.push(args); },
        uiText: (value) => value,
        console: { warn: (...args) => { warnings.push(args); } }
    });
    vm.runInContext(messageHandlerSource, context);

    context.handleVirtualControllerMessage({
        kind: 'event',
        type: 'controllerConnectionLost',
        message: { message: 'Joint feedback failed; last failure: return code -7.' }
    });
    context.handleVirtualControllerMessage({
        kind: 'event',
        type: 'controllerReconnectFailed',
        message: { message: 'Reconnect failed. Recovery cause: return code -7.' }
    });
    assert.equal(warnings.length, 2, 'Native feedback diagnostics were not recorded.');
    assert.match(warnings[0][1].detail, /return code -7/);
    assert.match(warnings[1][1].detail, /return code -7/);
    assert.equal(statuses[0][0], 'reconnecting');
    assert.equal(statuses[1][0], 'reconnecting');
}

{
    const warnings = [];
    const controller = {
        wanted: true,
        bridgeRunning: true,
        bridgeStartInProgress: false,
        bridgeHealthCheckSequence: 0,
        bridgeHealthFailureCount: 0,
        bridgeToken: 'current-token',
        core: {
            getVirtualControllerSource: () => ({ healthUrl: 'http://bridge.test/api/health' })
        }
    };
    const context = vm.createContext({
        state: { virtualController: controller },
        fetch: async () => { throw new TypeError('Failed to fetch'); },
        console: { warn: (...args) => { warnings.push(args); } }
    });
    vm.runInContext(healthCheckSource, context);

    assert.equal(await context.isVirtualControllerBridgeRunning(), false);
    assert.equal(warnings.length, 1, 'An active bridge health failure was not recorded.');
    assert.equal(warnings[0][0], 'Virtual controller bridge health check failed.');
    assert.match(warnings[0][1].error, /Failed to fetch/);
    assert.equal(warnings[0][1].healthUrl, 'http://bridge.test/api/health');
}

{
    const first = createDeferred();
    const second = createDeferred();
    const healthResults = [first.promise, second.promise];
    let sourceExitCount = 0;
    let nextTimerId = 1;
    const controller = {
        wanted: true,
        bridgeRunning: true,
        bridgeStartInProgress: false,
        bridgeHealthDeadline: 0,
        bridgeHealthFailureCount: 0,
        bridgeHealthCheckSequence: 0,
        bridgeHealthMonitorGeneration: 0,
        bridgeHealthTimer: null
    };
    const context = vm.createContext({
        state: { virtualController: controller },
        VIRTUAL_CONTROLLER_BRIDGE_HEALTH_FAILURE_LIMIT: 3,
        isVirtualControllerBridgeRunning: () => {
            controller.bridgeHealthCheckSequence += 1;
            return healthResults.shift();
        },
        clearVirtualControllerBridgeHealthMonitor: () => {
            controller.bridgeHealthTimer = null;
            controller.bridgeHealthMonitorGeneration += 1;
        },
        getVirtualControllerSourceConfig: () => ({ id: 'bridge' }),
        endVirtualControllerSessionForSourceExit: () => {
            sourceExitCount += 1;
        },
        setVirtualControllerStatus: () => {},
        refreshVirtualControllerUi: () => {},
        performance: { now: () => 1_000 },
        el: { virtualControllerPanel: { classList: { contains: () => false } } },
        window: {
            setTimeout: () => nextTimerId++
        }
    });
    vm.runInContext(healthMonitorSource, context);

    context.monitorVirtualControllerBridgeHealth(true);
    context.monitorVirtualControllerBridgeHealth(true);
    second.resolve(true);
    await flushAsyncWork();
    assert.equal(controller.bridgeRunning, true);
    assert.equal(controller.bridgeHealthFailureCount, 0);
    assert.equal(sourceExitCount, 0);

    first.resolve(false);
    await flushAsyncWork();
    assert.equal(controller.bridgeRunning, true, 'A stale failed health check changed the running state.');
    assert.equal(controller.bridgeHealthFailureCount, 0, 'A stale failed health check consumed the failure budget.');
    assert.equal(sourceExitCount, 0, 'A stale failed health check ended an active controller session.');
}

{
    let sourceExitCount = 0;
    let nextTimerId = 1;
    const controller = {
        wanted: true,
        bridgeRunning: true,
        bridgeStartInProgress: false,
        bridgeHealthDeadline: 0,
        bridgeHealthFailureCount: 0,
        bridgeHealthCheckSequence: 0,
        bridgeHealthMonitorGeneration: 0,
        bridgeHealthTimer: null
    };
    const context = vm.createContext({
        state: { virtualController: controller },
        VIRTUAL_CONTROLLER_BRIDGE_HEALTH_FAILURE_LIMIT: 3,
        isVirtualControllerBridgeRunning: async () => {
            controller.bridgeHealthCheckSequence += 1;
            return false;
        },
        clearVirtualControllerBridgeHealthMonitor: () => {
            controller.bridgeHealthTimer = null;
            controller.bridgeHealthMonitorGeneration += 1;
        },
        getVirtualControllerSourceConfig: () => ({ id: 'bridge' }),
        endVirtualControllerSessionForSourceExit: () => {
            sourceExitCount += 1;
        },
        setVirtualControllerStatus: () => {},
        refreshVirtualControllerUi: () => {},
        performance: { now: () => 1_000 },
        el: { virtualControllerPanel: { classList: { contains: () => false } } },
        window: {
            setTimeout: () => nextTimerId++
        }
    });
    vm.runInContext(healthMonitorSource, context);

    for (let failure = 1; failure <= 2; failure += 1) {
        context.monitorVirtualControllerBridgeHealth(true);
        await flushAsyncWork();
        assert.equal(sourceExitCount, 0, `Health failure ${failure} ended the session too early.`);
    }
    context.monitorVirtualControllerBridgeHealth(true);
    await flushAsyncWork();
    assert.equal(sourceExitCount, 1, 'Three consecutive health failures did not end the session.');
}

{
    class FakeWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        constructor(url) {
            this.url = url;
            this.readyState = FakeWebSocket.CONNECTING;
            this.listeners = new Map();
            FakeWebSocket.instances.push(this);
        }

        addEventListener(type, listener) {
            const listeners = this.listeners.get(type) || [];
            listeners.push(listener);
            this.listeners.set(type, listeners);
        }

        emit(type, event = {}) {
            for (const listener of this.listeners.get(type) || []) listener(event);
        }
    }
    FakeWebSocket.instances = [];

    let sampleClearCount = 0;
    let watchdogClearCount = 0;
    let reconnectCount = 0;
    const socketWarnings = [];
    const socketDebug = [];
    const statuses = [];
    const controller = {
        wanted: true,
        reconnectTimer: null,
        socket: null,
        socketGeneration: 0,
        core: { VIRTUAL_CONTROLLER_HOST: '127.0.0.1', VIRTUAL_CONTROLLER_TARGET_PORT: 2222 },
        bridgeToken: 'pairing-token',
        bridgeRunning: true,
        ipAddress: '127.0.0.1',
        controllerKind: 'virtual',
        reconnectMessage: 'keep-current-message',
        pendingInterferenceReads: new Set([1]),
        pendingInterferenceToolReads: new Set([2]),
        samples: { clear: () => { sampleClearCount += 1; } },
        lastAppliedSampleId: 17
    };
    const context = vm.createContext({
        state: { virtualController: controller },
        WebSocket: FakeWebSocket,
        getVirtualControllerSourceConfig: () => ({ id: 'bridge', socketUrl: 'ws://bridge.test/ws' }),
        setVirtualControllerStatus: (status) => { statuses.push(status); },
        getVirtualControllerUnavailableMessage: () => 'unavailable',
        refreshVirtualControllerUi: () => {},
        sendVirtualControllerCommand: () => true,
        handleVirtualControllerMessage: () => {},
        clearVirtualControllerStreamWatchdog: () => { watchdogClearCount += 1; },
        scheduleVirtualControllerReconnect: () => { reconnectCount += 1; },
        performance: { now: () => 1_000 },
        console: {
            warn: (...args) => { socketWarnings.push(args); },
            debug: (...args) => { socketDebug.push(args); }
        }
    });
    vm.runInContext(socketSource, context);

    context.openVirtualControllerSocket(false);
    const oldSocket = FakeWebSocket.instances[0];
    oldSocket.readyState = FakeWebSocket.CLOSED;
    context.openVirtualControllerSocket(true);
    const currentSocket = FakeWebSocket.instances[1];
    const statusCountBeforeStaleEvents = statuses.length;

    oldSocket.emit('close', { code: 1006, reason: 'stale transport failure', wasClean: false });
    oldSocket.emit('error');
    assert.equal(controller.socket, currentSocket, 'A stale close cleared the current WebSocket.');
    assert.equal(controller.bridgeRunning, true, 'A stale close marked the current bridge as stopped.');
    assert.equal(controller.reconnectMessage, 'keep-current-message');
    assert.equal(controller.pendingInterferenceReads.size, 1);
    assert.equal(controller.pendingInterferenceToolReads.size, 1);
    assert.equal(controller.lastAppliedSampleId, 17);
    assert.equal(sampleClearCount, 0, 'A stale close cleared samples from the current session.');
    assert.equal(watchdogClearCount, 0, 'A stale close stopped the current stream watchdog.');
    assert.equal(reconnectCount, 0, 'A stale close scheduled another reconnect.');
    assert.equal(statuses.length, statusCountBeforeStaleEvents, 'A stale socket event changed connection status.');
    assert.equal(socketDebug.length, 1, 'A stale WebSocket close diagnostic was not recorded.');
    assert.equal(socketDebug[0][1].code, 1006);
    assert.equal(socketDebug[0][1].reason, 'stale transport failure');

    currentSocket.emit('close', { code: 1006, reason: 'bridge transport lost', wasClean: false });
    assert.equal(socketWarnings.length, 1, 'The active WebSocket close diagnostic was not recorded.');
    assert.equal(socketWarnings[0][1].code, 1006);
    assert.equal(socketWarnings[0][1].reason, 'bridge transport lost');
    assert.equal(reconnectCount, 1, 'An active unexpected close did not schedule reconnect.');
}

{
    let sampleClearCount = 0;
    let watchdogClearCount = 0;
    let closeCount = 0;
    const statuses = [];
    const controller = {
        wanted: true,
        reconnectTimer: null,
        socketGeneration: 4,
        socket: {
            readyState: 1,
            send: () => {},
            close: () => { closeCount += 1; }
        },
        pendingInterferenceReads: new Set([1]),
        pendingInterferenceToolReads: new Set([2]),
        samples: { clear: () => { sampleClearCount += 1; } },
        historyBefore: null,
        lastAppliedSampleId: 17,
        sourceConnectedAt: 1_000,
        lastSampleAt: 1_000,
        lastStreamStartAt: 1_000,
        reconnectMessage: 'reconnecting'
    };
    const context = vm.createContext({
        state: { virtualController: controller },
        WebSocket: { OPEN: 1 },
        getVirtualControllerSourceConfig: () => ({ stopCommand: 'stopStream' }),
        clearVirtualControllerStreamWatchdog: () => { watchdogClearCount += 1; },
        setVirtualControllerStatus: (status) => { statuses.push(status); },
        refreshViewPresetsUi: () => {}
    });
    vm.runInContext(disconnectSource, context);

    context.disconnectVirtualController();
    assert.equal(controller.wanted, false);
    assert.equal(controller.socket, null);
    assert.equal(controller.socketGeneration, 5);
    assert.equal(controller.pendingInterferenceReads.size, 0, 'Manual disconnect left a zone read pending.');
    assert.equal(controller.pendingInterferenceToolReads.size, 0, 'Manual disconnect left a tool read pending.');
    assert.equal(sampleClearCount, 1);
    assert.equal(watchdogClearCount, 1);
    assert.equal(closeCount, 1);
    assert.deepEqual(statuses, ['disconnected']);
}

console.log('Virtual controller browser resilience regression tests passed.');
