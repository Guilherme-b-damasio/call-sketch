"""Modos de desenho. Cada modo e um arquivo .md com cabecalho simples:

    ---
    name: Brainstorm
    announce: Frase que o call-sketch fala quando entra no modo.
    description: Quando usar (o modo automatico le isso pra escolher).
    ---
    Instrucoes de como desenhar nesse modo.

Os modos padrao ficam em call_sketch/modes/. Da pra criar os seus numa pasta e passar --modes-dir.
"""

from __future__ import annotations

from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path

AUTO = "auto"


@dataclass(frozen=True)
class Mode:
    id: str
    name: str
    announce: str
    description: str
    instructions: str


def parse_mode(mode_id: str, text: str) -> Mode:
    _, header, body = text.split("---", 2)
    meta = {}
    for raw in header.strip().splitlines():
        key, _, value = raw.partition(":")
        meta[key.strip()] = value.strip()
    missing = {"name", "announce", "description"} - meta.keys()
    if missing:
        raise ValueError(f"modo '{mode_id}' sem {', '.join(sorted(missing))}")
    return Mode(mode_id, meta["name"], meta["announce"], meta["description"], body.strip())


def load_modes(extra_dir: Path | None = None) -> dict[str, Mode]:
    sources = [p for p in files("call_sketch").joinpath("modes").iterdir() if p.name.endswith(".md")]
    if extra_dir:
        sources += sorted(Path(extra_dir).glob("*.md"))  # sobrescrevem os padrao com o mesmo nome
    modes = {}
    for src in sorted(sources, key=lambda p: p.name):
        mode_id = src.name.removesuffix(".md")
        modes[mode_id] = parse_mode(mode_id, src.read_text(encoding="utf-8"))
    return modes
