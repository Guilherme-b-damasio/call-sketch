"""Transcricao local com faster-whisper (GPU se tiver, senao CPU)."""

from __future__ import annotations

import os
import queue
import site
import threading
from pathlib import Path

import numpy as np

from call_sketch.audio import WHISPER_RATE
from call_sketch.session import Line, Session


def _add_cuda_dlls() -> None:
    """Deixa visiveis as DLLs do CUDA instaladas via pip (extra [gpu]) antes do ctranslate2 carregar."""
    for sp in site.getsitepackages():
        for bin_dir in Path(sp, "nvidia").glob("*/bin"):
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(str(bin_dir))
            os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}"


def load_whisper(size: str = "auto", language: str = "pt"):
    _add_cuda_dlls()
    from faster_whisper import WhisperModel

    try:
        model = WhisperModel("medium" if size == "auto" else size, device="cuda", compute_type="float16")
        # transcribe devolve um gerador: precisa consumir pra GPU rodar de verdade
        noise = (np.random.randn(WHISPER_RATE) * 0.1).astype(np.float32)
        list(model.transcribe(noise, language=language)[0])
        print("whisper: GPU")
        return model
    except Exception as e:  # sem CUDA/cuDNN -> CPU
        print(f"whisper: GPU indisponivel ({e.__class__.__name__}), usando CPU")
        return WhisperModel("small" if size == "auto" else size, device="cpu", compute_type="int8")


class Transcriber(threading.Thread):
    def __init__(self, model, audio_q: queue.Queue, session: Session, language: str,
                 stop: threading.Event) -> None:
        super().__init__(name="transcriber", daemon=True)
        self.model, self.audio_q, self.session = model, audio_q, session
        self.language, self.stop = language, stop

    def run(self) -> None:
        while not self.stop.is_set():
            try:
                who, audio = self.audio_q.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                segs, _ = self.model.transcribe(audio, language=self.language, vad_filter=True)
                text = " ".join(s.text.strip() for s in segs).strip()
            except Exception as e:
                print(f"erro na transcricao: {e}")
                continue
            if text and self.session.add_line(Line(who=who, text=text)):
                print(f"  [{who}] {text}")
