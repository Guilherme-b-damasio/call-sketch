from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    backend: str = "cli"                 # cli = login do Claude Code; api = ANTHROPIC_API_KEY
    model: str | None = None             # None = padrao do backend
    whisper: str = "auto"                # auto = medium na GPU, small na CPU
    language: str = "pt"
    mode: str = "auto"                   # modo inicial (auto = Claude escolhe)
    modes_dir: Path | None = None        # modos extras/personalizados (*.md)
    draw_every: float = 20.0             # segundos entre redesenhos
    check_every: float = 30.0            # segundos entre validacoes (0 desliga)
    max_phrase_sec: float = 15.0
    mic: bool = True
    voice: bool = True
    voice_name: str = "pt-BR-AntonioNeural"
    host: str = "127.0.0.1"
    port: int = 8765
    open_browser: bool = True
