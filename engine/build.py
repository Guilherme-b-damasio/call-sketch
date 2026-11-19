"""Empacota o motor com PyInstaller em dist/call-sketch-engine (Windows, macOS ou Linux).

Uso (com o pacote ja instalado no Python atual):
    python build.py            # sem as bibliotecas de GPU (instalador menor; usa CPU)
    python build.py --gpu      # inclui CUDA (Windows/Linux com NVIDIA; ~1 GB a mais)
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
NAME = "call-sketch-engine"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gpu", action="store_true")
    args = ap.parse_args()

    collect = ["faster_whisper", "ctranslate2", "soundcard", "edge_tts", "miniaudio"]
    if args.gpu:
        missing = [m for m in ("nvidia.cublas", "nvidia.cudnn") if not importlib.util.find_spec(m)]
        if missing:
            sys.exit(f"instale o extra [gpu] antes: falta {', '.join(missing)}")
        collect += ["nvidia.cublas", "nvidia.cudnn"]

    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--console", "--name", NAME]
    cmd += ["--paths", str(HERE / "src"), "--distpath", str(HERE / "dist"), "--workpath", str(HERE / "build")]
    cmd += ["--specpath", str(HERE / "build")]
    for mod in collect:
        cmd += ["--collect-all", mod]
    cmd.append(str(HERE / "src" / "call_sketch_engine" / "__main__.py"))
    subprocess.run(cmd, check=True)

    exe = HERE / "dist" / NAME / (NAME + (".exe" if sys.platform == "win32" else ""))
    out = subprocess.run([str(exe), "--check"], capture_output=True, text=True, check=True).stdout
    info = json.loads(out.strip().splitlines()[-1])
    if not info.get("ok"):
        sys.exit(f"o executavel nao carregou: {out}")
    print(f"pronto: {exe} ({info})")


if __name__ == "__main__":
    main()
