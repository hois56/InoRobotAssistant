const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const markdownPath = path.join(root, '0_Home', 'UPDATE_HISTORY.md');
const outputPath = path.join(root, '0_Home', 'site-card-history-data.js');
const markdownBase64 = fs.readFileSync(markdownPath).toString('base64');

const output = `// Generated from 0_Home/UPDATE_HISTORY.md by tools/sync-site-card-history-data.cjs.\n` +
    `window.SITE_CARD_HISTORY_MARKDOWN_BASE64 = '${markdownBase64}';\n`;

// Some Windows file watchers deny opening an existing generated file with the
// truncate flag while allowing shared read/write access. Reuse that handle and
// truncate after writing so the required sync command remains reliable.
if (fs.existsSync(outputPath)) {
    const fd = fs.openSync(outputPath, 'r+');
    try {
        const bytes = Buffer.from(output, 'utf8');
        let written = 0;
        while (written < bytes.length) {
            written += fs.writeSync(fd, bytes, written, bytes.length - written, written);
        }

        try {
            fs.ftruncateSync(fd, bytes.length);
        } catch (error) {
            // Some Windows file watchers reject SetEndOfFile even though they
            // allow shared writes. Cover any stale trailing bytes so they
            // cannot become executable JavaScript when truncation is blocked.
            const currentSize = fs.fstatSync(fd).size;
            const trailingBytes = currentSize - bytes.length;
            if (trailingBytes >= 4) {
                const padding = Buffer.concat([
                    Buffer.from('/*'),
                    Buffer.alloc(trailingBytes - 4, 0x20),
                    Buffer.from('*/')
                ]);
                let paddingWritten = 0;
                while (paddingWritten < padding.length) {
                    paddingWritten += fs.writeSync(fd, padding, paddingWritten, padding.length - paddingWritten, bytes.length + paddingWritten);
                }
            } else if (trailingBytes > 0) {
                fs.writeSync(fd, Buffer.alloc(trailingBytes, 0x20), 0, trailingBytes, bytes.length);
            } else if (trailingBytes < 0) {
                throw error;
            }
        }
    } finally {
        fs.closeSync(fd);
    }
} else {
    fs.writeFileSync(outputPath, output, 'utf8');
}
