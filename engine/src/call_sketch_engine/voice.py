"""Voz do call-sketch: anuncia o modo em audio (edge-tts, gratis, vozes neurais pt-BR)."""

from __future__ import annotations

import asyncio
import logging
import queue
import threading
from collections.abc import Callable

import numpy as np

log = logging.getLogger(__name__)

VOICE_RATE = 24000
UNMUTE_DELAY_SEC = 0.6  # espera o eco da propria voz sumir antes de voltar a ouvir


async def _synthesize(text: str, voice: str) -> bytes:
    import edge_tts

    chunks = [c["data"] async for c in edge_tts.Communicate(text, voice).stream() if c["type"] == "audio"]
    return b"".join(chunks)


def synthesize(text: str, voice: str) -> np.ndarray:
    import miniaudio

    mp3 = asyncio.run(_synthesize(text, voice))
    pcm = miniaudio.decode(mp3, output_format=miniaudio.SampleFormat.FLOAT32, nchannels=1,
                           sample_rate=VOICE_RATE)
    return np.frombuffer(pcm.samples, dtype=np.float32)


class Voice(threading.Thread):
    """Fala em segundo plano. Enquanto fala, `muted` fica ligado pra captura nao transcrever a si mesma."""

    def __init__(self, muted: threading.Event,
                 on_speaking: Callable[[bool, str], None] = lambda speaking, text: None) -> None:
        super().__init__(name="voice", daemon=True)
        self.muted, self.on_speaking = muted, on_speaking
        self._q: queue.Queue[tuple[str, str]] = queue.Queue()

    def say(self, text: str, voice: str = "pt-BR-AntonioNeural") -> None:
        self._q.put((text, voice))

    def run(self) -> None:
        import soundcard as sc

        while True:
            text, voice = self._q.get()
            try:
                audio = synthesize(text, voice)
                self.muted.set()
                self.on_speaking(True, text)
                sc.default_speaker().play(audio, samplerate=VOICE_RATE)
            except Exception:
                log.exception("erro na voz")
            finally:
                self.on_speaking(False, text)
                threading.Timer(UNMUTE_DELAY_SEC, self.muted.clear).start()
