"""Receptor local das capturas do QA visual (scripts/qa/capture.js).

Uso:  py -I scripts/qa/receive.py docs/qa/before      (ou docs/qa/after)
Escuta em 127.0.0.1:5199; POST /save?name=X com corpo = dataURL PNG grava <pasta>/X.png.
Só grava dentro da pasta indicada (nome saneado).
"""
import base64, re, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/qa/before").resolve()
OUT.mkdir(parents=True, exist_ok=True)


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = re.sub(r"[^A-Za-z0-9_.-]", "_", q.get("name", ["shot"])[0])[:80]
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("ascii", "ignore")
        b64 = body.split(",", 1)[1] if body.startswith("data:") else body
        data = base64.b64decode(b64)
        path = OUT / f"{name}.png"
        path.write_bytes(data)
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(f"saved {path.name} {len(data)}B".encode())

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("salvando em", OUT, flush=True)
    HTTPServer(("127.0.0.1", 5199), H).serve_forever()
