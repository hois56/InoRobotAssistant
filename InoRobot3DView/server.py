"""
InoRobot3DView — 로컬 웹 서버 (Python 3)
실행: python server.py
접속: http://localhost:5173
"""

import http.server
import json
import os
import threading
import webbrowser

PORT    = 5173
BASE    = os.path.dirname(os.path.abspath(__file__))
MODELS  = os.path.join(BASE, 'models')

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.stp':  'application/octet-stream',
    '.step': 'application/octet-stream',
    '.wasm': 'application/wasm',
}

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # 간략한 로그만 출력
        if '/api/' in (args[0] if args else ''):
            print(f'  [API] {args[0]}')

    def do_GET(self):
        path = self.path.split('?')[0]

        # ── /api/models — models/ 폴더의 .stp 파일 목록 ──
        if path == '/api/models':
            try:
                files = sorted([
                    f for f in os.listdir(MODELS)
                    if f.lower().endswith(('.stp', '.step'))
                ])
                result = [
                    {'name': os.path.splitext(f)[0], 'file': f}
                    for f in files
                ]
                body = json.dumps(result, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
            return

        # ── 정적 파일 서빙 ───────────────────────────────
        if path == '/':
            path = '/index.html'

        file_path = os.path.join(BASE, path.lstrip('/').replace('/', os.sep))

        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')

        if not os.path.exists(file_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')
            return

        ext  = os.path.splitext(file_path)[1].lower()
        mime = MIME.get(ext, 'application/octet-stream')

        with open(file_path, 'rb') as f:
            data = f.read()

        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    os.chdir(BASE)
    server = http.server.HTTPServer(('', PORT), Handler)

    print()
    print('  ╔══════════════════════════════════════════╗')
    print('  ║   InoRobot 3D Viewer — Python Server     ║')
    print('  ╠══════════════════════════════════════════╣')
    print(f'  ║   URL : http://localhost:{PORT}           ║')
    print('  ║   종료 : Ctrl + C                        ║')
    print('  ╚══════════════════════════════════════════╝')
    print()

    # 1초 후 브라우저 자동 열기
    threading.Timer(1.0, lambda: webbrowser.open(f'http://localhost:{PORT}')).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  서버가 종료되었습니다.')
