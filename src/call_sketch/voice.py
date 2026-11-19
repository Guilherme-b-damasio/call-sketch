"""Voz do call-sketch: anuncia o modo em audio (edge-tts, gratis, vozes neurais pt-BR)."""

from __future__ import annotations

import asyncio
import queue
import threading

import numpy as np

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

    def __init__(self, voice: str, muted: threading.Event, enabled: bool = True) -> None:
        super().__init__(name="voice", daemon=True)
        self.voice, self.muted, self.enabled = voice, muted, enabled
        self._q: queue.Queue[str] = queue.Queue()

    def say(self, text: str) -> None:
        print(f"  >> {text}")
        if self.enabled:
            self._q.put(text)

    def run(self) -> None:
        import soundcard as sc

        while True:
            text = self._q.get()
            try:
                audio = synthesize(text, self.voice)
                self.muted.set()
                sc.default_speaker().play(audio, samplerate=VOICE_RATE)
            except Exception as e:
                print(f"voz: erro {e}")
            finally:
                threading.Timer(UNMUTE_DELAY_SEC, self.muted.clear).start()
