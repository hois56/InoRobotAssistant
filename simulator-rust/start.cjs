// The packaged server provides the same loopback vision and Virtual Bus
// services as the site's local launcher, using a fresh pairing token.
const { randomBytes } = require('node:crypto');
const { fork } = require('node:child_process');
const path = require('node:path');
process.env.INOROBOT_VIRTUAL_BUS_TOKEN ||= randomBytes(32).toString('hex');
process.argv[2] ||= '8775';
const collaboration = fork(path.join(__dirname, 'tools/collaboration-server.cjs'), [], {
    windowsHide: true,
    env: {
        ...process.env,
        INOROBOT_COLLAB_HOST: process.env.INOROBOT_COLLAB_HOST || process.env.INOROBOT_SERVER_HOST || '127.0.0.1'
    }
});
process.on('exit', () => collaboration.kill());
process.once('SIGINT', () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));
require('./tools/serve-local.cjs');
