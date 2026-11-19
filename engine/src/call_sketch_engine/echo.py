"""Falas transcritas e o filtro do eco do microfone (som da call vazando do fone)."""

from __future__ import annotations

import difflib
import itertools
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime

ECHO_WINDOW_SEC = 30
ECHO_SIMILARITY = 0.55

_ids = itertools.count(1)


@dataclass
class Line:
    who: str          # "call" | "eu"
    text: str
    id: int = field(default_factory=lambda: next(_ids))
    t: str = field(default_factory=lambda: f"{datetime.now():%H:%M:%S}")
    ts: float = field(default_factory=time.time)


def similar(a: str, b: str) -> bool:
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio() > ECHO_SIMILARITY


class EchoFilter:
    """Lembra as ultimas falas e descarta a copia que o microfone pega do audio da call."""

    def __init__(self, keep: int = 8) -> None:
        self._recent: deque[Line] = deque(maxlen=keep)

    def add(self, line: Line) -> tuple[bool, list[int]]:
        """-> (aceita?, ids de falas anteriores que devem ser removidas)."""
        recent = [x for x in self._recent if line.ts - x.ts < ECHO_WINDOW_SEC]
        if line.who == "eu" and any(x.who == "call" and similar(x.text, line.text) for x in recent):
            return False, []
        removed: list[int] = []
        if line.who == "call":  # a copia do microfone pode ter chegado antes
            for x in recent:
                if x.who == "eu" and similar(x.text, line.text):
                    self._recent.remove(x)
                    removed.append(x.id)
        self._recent.append(line)
        return True, removed
