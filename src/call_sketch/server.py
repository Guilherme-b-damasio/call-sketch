"""Servidor local: a pagina com o diagrama e uma API JSON pequena."""

from __future__ import annotations

import json
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files

from call_sketch.modes import AUTO, Mode
from call_sketch.session import Line, Session


def make_server(host: str, port: int, session: Session, modes: dict[str, Mode],
                on_mode_selected: Callable[[str], None]) -> ThreadingHTTPServer:
    page = files("call_sketch").joinpath("web", "index.html")
    modes_json = [{"id": AUTO, "name": "Automático"}] + [
        {"id": m.id, "name": m.name, "description": m.description} for m in modes.values()
    ]

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args) -> None:
            pass

        def _send(self, body: bytes, ctype: str, code: int = 200) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code: int = 200) -> None:
            self._send(json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8", code)

        def do_GET(self) -> None:
            if self.path == "/state":
                return self._json(session.snapshot())
            if self.path == "/modes":
                return self._json(modes_json)
            if self.path in ("/", "/index.html"):
                return self._send(page.read_bytes(), "text/html; charset=utf-8")
            self._json({"error": "not found"}, 404)

        def do_POST(self) -> None:
            n = int(self.headers.get("Content-Length") or 0)
            try:
                data = json.loads(self.rfile.read(n) or b"{}")
            except json.JSONDecodeError:
                return self._json({"error": "json invalido"}, 400)

            if self.path == "/redraw":
                session.redraw.set()
            elif self.path == "/reset":
                session.reset()
            elif self.path == "/note":
                text = str(data.get("text", "")).strip()
                if text:
                    session.add_line(Line(who="nota", text=text))
                    session.redraw.set()
            elif self.path == "/render_error":
                session.set_render_error(str(data.get("error", ""))[:500] or None)
            elif self.path == "/mode":
                mode = str(data.get("mode", ""))
                if mode != AUTO and mode not in modes:
                    return self._json({"error": f"modo desconhecido: {mode}"}, 400)
                on_mode_selected(mode)
            else:
                return self._json({"error": "not found"}, 404)
            self._json({"ok": True})

    return ThreadingHTTPServer((host, port), Handler)
