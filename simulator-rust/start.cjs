const { randomBytes } = require('node:crypto');

process.env.INOROBOT_VIRTUAL_BUS_TOKEN ||= randomBytes(32).toString('hex');
process.env.INOROBOT_STANDALONE_SIMULATION = '1';
process.argv[2] ||= '8775';
require('./tools/serve-local.cjs');
