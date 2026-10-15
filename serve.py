#!/usr/bin/env python3
"""Local dev server with caching disabled, so edits show up on a normal reload.
Usage: python3 serve.py [port]   (default 8765)"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f"Serving on http://localhost:{port}")
ThreadingHTTPServer(("", port), NoCache).serve_forever()
