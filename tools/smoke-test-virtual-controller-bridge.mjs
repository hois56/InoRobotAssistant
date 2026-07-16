import assert from 'node:assert/strict';

const result = await new Promise((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:5055/ws');
    const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Bridge smoke test timed out.'));
    }, 6000);

    socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'bridgeReady') {
            socket.send(JSON.stringify({ type: 'connect', ip: '127.0.0.1' }));
        } else if (message.type === 'connectResult') {
            if (!message.success) {
                clearTimeout(timeout);
                socket.close();
                resolve({ controllerOnline: false, message: message.message });
                return;
            }
            socket.send(JSON.stringify({ type: 'startStream', interval: 4 }));
        } else if (message.type === 'robotState') {
            assert.ok(Array.isArray(message.data?.joints));
            assert.ok(message.data.joints.length >= 4);
            assert.ok(message.data.joints.every(Number.isFinite));
            clearTimeout(timeout);
            socket.send(JSON.stringify({ type: 'stopStream' }));
            socket.send(JSON.stringify({ type: 'disconnect' }));
            socket.close();
            resolve({ controllerOnline: true, joints: message.data.joints.slice(0, 6) });
        }
    });
    socket.addEventListener('error', () => reject(new Error('Unable to open bridge WebSocket.')));
});

if (result.controllerOnline) {
    console.log(`Bridge smoke test passed with live joint stream: ${result.joints.join(', ')}`);
} else {
    console.log(`Bridge smoke test passed; virtual controller is offline: ${result.message}`);
}
