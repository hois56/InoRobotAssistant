const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const markdownPath = path.join(root, '0_Home', 'UPDATE_HISTORY.md');
const outputPath = path.join(root, '0_Home', 'site-card-history-data.js');
const markdownBase64 = fs.readFileSync(markdownPath).toString('base64');

const output = `// Generated from 0_Home/UPDATE_HISTORY.md by tools/sync-site-card-history-data.cjs.\n` +
    `window.SITE_CARD_HISTORY_MARKDOWN_BASE64 = '${markdownBase64}';\n`;

fs.writeFileSync(outputPath, output, 'utf8');
