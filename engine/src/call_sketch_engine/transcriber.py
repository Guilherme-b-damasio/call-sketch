"""Transcricao local com faster-whisper (GPU se tiver, senao CPU)."""

from __future__ import annotations

import logging
import os
import queue
import site
import threading
from collections.abc import Callable
from pathlib import Path

import numpy as np

from call_sketch_engine.audio import WHISPER_RATE

log = logging.getLogger(__name__)


def _add_cuda_dlls() -> None:
    """Deixa visiveis as DLLs do CUDA instaladas via pip (extra [gpu]) antes do ctranslate2 carregar."""
    for sp in site.getsitepackages():
        for bin_dir in Path(sp, "nvidia").glob("*/bin"):
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(str(bin_dir))
            os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}"


def load_whisper(size: str = "auto", language: str = "pt"):
    """-> (modelo, "gpu" | "cpu")."""
    _add_cuda_dlls()
    from faster_whisper import WhisperModel

    try:
        model = WhisperModel("medium" if size == "auto" else size, device="cuda", compute_type="float16")
        # transcribe devolve um gerador: precisa consumir pra GPU rodar de verdade
        noise = (np.random.randn(WHISPER_RATE) * 0.1).astype(np.float32)
        list(model.transcribe(noise, language=language)[0])
        return model, "gpu"
    except Exception as e:  # sem CUDA/cuDNN -> CPU
        log.warning("GPU indisponivel (%s), usando CPU", e.__class__.__name__)
        return WhisperModel("small" if size == "auto" else size, device="cpu", compute_type="int8"), "cpu"


class Transcriber(threading.Thread):
    def __init__(self, model, audio_q: queue.Queue, language: str,
                 on_text: Callable[[str, str], None], stop: threading.Event) -> None:
        super().__init__(name="transcriber", daemon=True)
        self.model, self.audio_q, self.language = model, audio_q, language
        self.on_text, self.stop = on_text, stop

    def run(self) -> None:
        while not self.stop.is_set():
            try:
                who, audio = self.audio_q.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                segs, _ = self.model.transcribe(audio, language=self.language, vad_filter=True)
                text = " ".join(s.text.strip() for s in segs).strip()
            except Exception:
                log.exception("erro na transcricao")
                continue
            if text:
                self.on_text(who, text)
