const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const histories = {
    communicationTester: 'DebuggingSupport/CommunicationTester/업데이트_기록.md',
    labelGenerator: 'DebuggingSupport/InoRobotLabelGen/업데이트기록.md',
    trace: 'DebuggingSupport/Trace/업데이트_기록.md',
    projectCompare: 'DebuggingSupport/ProjectCompare/업데이트_기록.md'
};

const encodedHistories = Object.fromEntries(
    Object.entries(histories).map(([toolKey, relativePath]) => [
        toolKey,
        fs.readFileSync(path.join(root, relativePath)).toString('base64')
    ])
);

const outputPath = path.join(root, 'DebuggingSupport', 'debugging-history-data.js');
const output = '// Generated from each debugging tool update history by tools/sync-debugging-history-data.cjs.\n' +
    `window.DEBUGGING_HISTORY_DATA = ${JSON.stringify(encodedHistories, null, 4)};\n`;

fs.writeFileSync(outputPath, output, 'utf8');
