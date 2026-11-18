// The packaged server provides the same loopback vision and Virtual Bus
// services as the site's local launcher, using a fresh pairing token.
const { randomBytes } = require('node:crypto');
const { fork } = require('node:child_process');
if (process.argv[2] === '--collaboration') {
    process.argv.splice(2, 1);
    process.once('disconnect', () => process.exit());
    require('./tools/collaboration-server.cjs');
} else {
    startSimulator();
}

function startSimulator() {
    process.env.INOROBOT_VIRTUAL_BUS_TOKEN ||= randomBytes(32).toString('hex');
    process.argv[2] ||= '8775';
    const collaboration = fork(__filename, ['--collaboration'], {
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
}
