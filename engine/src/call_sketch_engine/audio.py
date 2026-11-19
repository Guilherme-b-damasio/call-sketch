"""Captura do audio do PC (loopback da saida padrao) e do microfone, cortada em frases."""

from __future__ import annotations

import queue
import threading
import warnings

import numpy as np

CAPTURE_RATE = 48000
WHISPER_RATE = 16000


def to_16k_mono(data: np.ndarray) -> np.ndarray:
    """48 kHz (mono ou estereo) -> 16 kHz mono float32. Media de 3 em 3: passa-baixa simples, ok pra voz."""
    mono = data.mean(axis=1) if data.ndim == 2 else data
    n = len(mono) // 3 * 3
    return mono[:n].reshape(-1, 3).mean(axis=1).astype(np.float32)


class PhraseChunker:
    """Junta blocos de audio e devolve uma frase inteira quando a pessoa faz uma pausa."""

    def __init__(
        self,
        block_sec: float = 0.25,
        silence_rms: float = 0.004,
        pause_sec: float = 0.8,
        min_sec: float = 0.5,
        max_sec: float = 15.0,
    ) -> None:
        self.block_sec = block_sec
        self.silence_rms = silence_rms
        self.pause_sec = pause_sec
        self.min_sec = min_sec
        self.max_sec = max_sec
        self.reset()

    def reset(self) -> None:
        self._buf: list[np.ndarray] = []
        self._preroll: np.ndarray | None = None
        self._silent_for = 0.0

    def feed(self, block: np.ndarray) -> np.ndarray | None:
        loud = float(np.sqrt(np.mean(block**2))) >= self.silence_rms
        if not self._buf:
            if loud:  # comecou a falar: inclui o bloco anterior pra nao comer a 1a silaba
                self._buf = [self._preroll, block] if self._preroll is not None else [block]
                self._silent_for = 0.0
            self._preroll = block
            return None

        self._buf.append(block)
        self._silent_for = 0.0 if loud else self._silent_for + self.block_sec
        dur = len(self._buf) * self.block_sec
        spoken = dur - self._silent_for  # sem contar a pausa do fim
        if (self._silent_for >= self.pause_sec and spoken >= self.min_sec) or dur >= self.max_sec:
            phrase = np.concatenate(self._buf)
            self.reset()
            return phrase
        if self._silent_for >= self.pause_sec:  # ruido curto, descarta
            self.reset()
        return None


class AudioCapture(threading.Thread):
    """Le um dispositivo continuamente e joga (quem, frase) na fila."""

    def __init__(
        self,
        who: str,
        device,
        out: queue.Queue[tuple[str, np.ndarray]],
        chunker: PhraseChunker,
        muted: threading.Event,
        stop: threading.Event,
    ) -> None:
        super().__init__(name=f"capture-{who}", daemon=True)
        self.who, self.device, self.out, self.chunker = who, device, out, chunker
        self.muted, self.stop = muted, stop

    def run(self) -> None:
        frames = int(CAPTURE_RATE * self.chunker.block_sec)
        with self.device.recorder(samplerate=CAPTURE_RATE) as rec:
            while not self.stop.is_set():
                block = to_16k_mono(rec.record(numframes=frames))
                if self.muted.is_set():  # a propria voz do call-sketch esta tocando
                    self.chunker.reset()
                    continue
                phrase = self.chunker.feed(block)
                if phrase is not None:
                    self.out.put((self.who, phrase))


def default_sources(mic: bool) -> list[tuple[str, object, str]]:
    """[(quem, dispositivo, nome)]: loopback da saida padrao (+ microfone padrao)."""
    import soundcard as sc

    # o soundcard religa os proprios avisos ao ser importado; desliga depois do import
    warnings.filterwarnings("ignore", message="data discontinuity")
    speaker = sc.default_speaker()
    sources = [("call", sc.get_microphone(id=str(speaker.name), include_loopback=True), speaker.name)]
    if mic:
        m = sc.default_microphone()
        sources.append(("eu", m, m.name))
    return sources


def list_devices() -> dict[str, list[str] | str]:
    import soundcard as sc

    return {
        "speakers": [s.name for s in sc.all_speakers()],
        "mics": [m.name for m in sc.all_microphones()],
        "default_speaker": sc.default_speaker().name,
        "default_mic": sc.default_microphone().name,
    }
