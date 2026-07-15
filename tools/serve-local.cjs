const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = Number(process.argv[2] || 8765);

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.fbx': 'application/octet-stream',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xml': 'application/xml; charset=utf-8',
    '.zip': 'application/zip'
};

function sendError(response, statusCode, message) {
    response.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    response.end(message);
}

const server = http.createServer((request, response) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, 'http://' + host).pathname);
    } catch {
        sendError(response, 400, 'Bad request');
        return;
    }

    let filePath = path.resolve(root, '.' + pathname);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
        sendError(response, 403, 'Forbidden');
        return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        sendError(response, 404, 'Not found');
        return;
    }

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
    });
    if (request.method === 'HEAD') {
        response.end();
        return;
    }
    fs.createReadStream(filePath).pipe(response);
});

server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
        console.error('Port ' + port + ' is already in use. Try: node tools\\serve-local.cjs 8766');
    } else {
        console.error(error.message);
    }
    process.exitCode = 1;
});

server.listen(port, host, () => {
    console.log('InoRobot Assistant local server is running.');
    console.log('Open: http://' + host + ':' + port + '/');
    console.log('Stop: Ctrl+C');
});
