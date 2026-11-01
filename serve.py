"""Local dev server for Neon Static.

Same as `python -m http.server`, but tells the browser never to cache, so every
reload runs the latest scripts instead of a stale copy of an older build.
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"Neon Static running at http://localhost:{PORT}  (close this window to stop)")
        httpd.serve_forever()
