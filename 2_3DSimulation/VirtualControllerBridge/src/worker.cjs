'use strict';

const { createInterface } = require('node:readline');
const { VirtualVisionEndpoint } = require('./virtual-vision-protocols.cjs');

function send(message) {
    if (process.stdout.writableLength > 1024 * 1024) process.exit(1);
    process.stdout.write(JSON.stringify(message) + '\n');
}

async function run() {
    let endpoint;
    const loopbackOnly = process.argv.includes('--loopback-only');
    const commands = createInterface({ input: process.stdin, crlfDelay: Infinity });
    send({ type: 'ready', protocol: 'inorobot-virtual-vision', version: 1 });
    try {
        for await (const line of commands) {
            const message = JSON.parse(line);
            if (message.type === 'configure') {
                await endpoint?.stop();
                endpoint = new VirtualVisionEndpoint(message.config);
                const { protocol, bindIp, targetIp, role } = endpoint.config;
                if (!['socket', 'eip'].includes(protocol) ||
                    (loopbackOnly && (!bindIp.startsWith('127.') || (role === 'client' && !targetIp.startsWith('127.'))))) {
                    send({ type: 'status', status: { state: 'error', message: 'This endpoint is disabled by the bridge configuration.' } });
                    endpoint = null;
                    continue;
                }
                endpoint.on('status', status => send({ type: 'status', status }));
                endpoint.on('text', data => send({ type: 'text', ...data }));
                endpoint.on('frame', frame => send({ type: 'frame', frame }));
                endpoint.on('commands', words => send({ type: 'commands', words }));
                // start() reports bind/connection errors through the status event.
                await endpoint.start().catch(() => {});
            } else if (message.type === 'results' && Array.isArray(message.words)) {
                endpoint?.setResults(message.words.slice(0, 128));
            } else if (message.type === 'text') {
                endpoint?.sendText(String(message.text ?? '').slice(0, 65536), message.peer || null);
            } else if (message.type === 'stop') {
                await endpoint?.stop();
                endpoint = null;
            }
        }
    } finally {
        await endpoint?.stop();
    }
}

run().then(() => process.exit(0), () => process.exit(1));
