"""Estado compartilhado de uma sessao (transcricao, diagrama, notas), thread-safe."""

from __future__ import annotations

import difflib
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime

ECHO_WINDOW_SEC = 30
ECHO_SIMILARITY = 0.55


def now_hms() -> str:
    return f"{datetime.now():%H:%M:%S}"


@dataclass
class Line:
    who: str          # "call" | "eu" | "nota"
    text: str
    t: str = field(default_factory=now_hms)
    ts: float = field(default_factory=time.time)


@dataclass
class Check:
    text: str
    t: str = field(default_factory=now_hms)


def similar(a: str, b: str) -> bool:
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio() > ECHO_SIMILARITY


class Session:
    def __init__(self, mode: str = "auto") -> None:
        self._lock = threading.Lock()
        self.transcript: list[Line] = []
        self.checks: list[Check] = []
        self.mermaid = ""
        self.version = 0
        self.status = "iniciando..."
        self.render_error: str | None = None
        self.mode = mode              # escolhido pelo usuario ("auto" ou id)
        self.active_mode = "" if mode == "auto" else mode   # o que esta sendo desenhado
        self.redraw = threading.Event()

    # ------------------------------------------------------------- escrita

    def add_line(self, line: Line) -> bool:
        """Adiciona uma fala. Descarta o eco do microfone (som da call vazando do fone).
        Retorna False se a linha foi descartada."""
        with self._lock:
            recent = [x for x in self.transcript[-8:] if line.ts - x.ts < ECHO_WINDOW_SEC]
            if line.who == "eu" and any(x.who == "call" and similar(x.text, line.text) for x in recent):
                return False
            if line.who == "call":  # a copia do microfone pode ter chegado antes
                for x in recent:
                    if x.who == "eu" and similar(x.text, line.text):
                        self.transcript.remove(x)
            self.transcript.append(line)
            return True

    def add_checks(self, texts: list[str]) -> None:
        with self._lock:
            self.checks.extend(Check(t) for t in texts)

    def set_diagram(self, code: str, active_mode: str | None = None) -> None:
        with self._lock:
            if code and code != self.mermaid:
                self.mermaid = code
                self.version += 1
            if active_mode:
                self.active_mode = active_mode
            self.render_error = None

    def set_mode(self, mode: str) -> None:
        with self._lock:
            self.mode = mode
            if mode != "auto":
                self.active_mode = mode
        self.redraw.set()

    def set_status(self, msg: str) -> None:
        print(f"[{now_hms()}] {msg}")
        with self._lock:
            self.status = msg

    def set_render_error(self, err: str | None) -> None:
        with self._lock:
            self.render_error = err
        self.redraw.set()

    def reset(self) -> None:
        with self._lock:
            self.transcript.clear()
            self.checks.clear()
            self.mermaid = ""
            self.render_error = None
            if self.mode == "auto":
                self.active_mode = ""
            self.version += 1

    # -------------------------------------------------------------- leitura

    def lines(self) -> list[Line]:
        with self._lock:
            return list(self.transcript)

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "transcript": [asdict(x) for x in self.transcript],
                "checks": [asdict(x) for x in self.checks],
                "mermaid": self.mermaid,
                "version": self.version,
                "status": self.status,
                "render_error": self.render_error,
                "mode": self.mode,
                "active_mode": self.active_mode,
            }


def format_transcript(lines: list[Line]) -> str:
    return "\n".join(f"[{x.t}] {x.who}: {x.text}" for x in lines)
