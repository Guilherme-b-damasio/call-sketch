"""Quem esta falando: separa as vozes da call em Pessoa 1, 2, ...

Cada frase vira uma "impressao digital" da voz (embedding de 256 numeros) com um modelo pequeno
(WeSpeaker ResNet34, ~26 MB, roda na CPU pelo onnxruntime que o faster-whisper ja traz). A frase vai
pra pessoa com a voz mais parecida; se nenhuma parece o bastante, e uma pessoa nova.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from call_sketch_engine.audio import WHISPER_RATE

log = logging.getLogger(__name__)

N_MELS = 80
FRAME = 400  # 25 ms a 16 kHz
SHIFT = 160  # 10 ms
NFFT = 512
MIN_SEC = 1.0  # frase mais curta que isso nao da pra reconhecer a voz direito


def _mel_banks(n_mels: int = N_MELS, nfft: int = NFFT, rate: int = WHISPER_RATE,
               low: float = 20.0, high: float = 0.0) -> np.ndarray:
    """Filtros triangulares na escala mel, do jeito do Kaldi. -> (n_mels, nfft // 2 + 1)."""
    high = high if high > 0 else rate / 2 + high

    def mel(f):
        return 1127.0 * np.log(1.0 + np.asarray(f, dtype=np.float64) / 700.0)

    lo, hi = mel(low), mel(high)
    delta = (hi - lo) / (n_mels + 1)
    bins = mel(np.arange(nfft // 2 + 1) * rate / nfft)
    banks = np.zeros((n_mels, nfft // 2 + 1), dtype=np.float64)
    for m in range(n_mels):
        left, center, right = lo + m * delta, lo + (m + 1) * delta, lo + (m + 2) * delta
        up = (bins - left) / (center - left)
        down = (right - bins) / (right - center)
        banks[m] = np.maximum(0.0, np.minimum(up, down))
    return banks.astype(np.float32)


_BANKS = _mel_banks()
_WINDOW = np.hamming(FRAME).astype(np.float32)
_EPS = np.finfo(np.float32).eps


def fbank(audio: np.ndarray) -> np.ndarray:
    """Fbank de 80 bandas estilo Kaldi (o que o WeSpeaker espera), com a media tirada. -> (T, 80)."""
    x = np.asarray(audio, dtype=np.float32) * 32768.0  # o modelo foi treinado com amostras em int16
    if len(x) < FRAME:
        return np.zeros((0, N_MELS), dtype=np.float32)
    n = 1 + (len(x) - FRAME) // SHIFT
    idx = np.arange(FRAME)[None, :] + SHIFT * np.arange(n)[:, None]
    frames = x[idx]
    frames = frames - frames.mean(axis=1, keepdims=True)  # tira o DC
    frames = np.concatenate([frames[:, :1] * (1 - 0.97), frames[:, 1:] - 0.97 * frames[:, :-1]], axis=1)
    frames = frames * _WINDOW
    power = np.abs(np.fft.rfft(frames, n=NFFT)) ** 2
    feats = np.log(np.maximum(power.astype(np.float32) @ _BANKS.T, _EPS))
    return feats - feats.mean(axis=0, keepdims=True)


class SpeakerTracker:
    """Agrupa as frases por voz, ao vivo. Numera as pessoas na ordem em que aparecem."""

    def __init__(self, model_path: str | Path, threshold: float = 0.45, max_speakers: int = 8) -> None:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2  # deixa CPU pro Whisper
        opts.log_severity_level = 3
        self.session = ort.InferenceSession(str(model_path), opts, providers=["CPUExecutionProvider"])
        self.input = self.session.get_inputs()[0].name
        self.threshold, self.max_speakers = threshold, max_speakers
        self.centroids: list[np.ndarray] = []
        self.counts: list[int] = []

    def embed(self, audio: np.ndarray) -> np.ndarray | None:
        feats = fbank(audio)
        if len(feats) < MIN_SEC * 100:
            return None
        (emb,) = self.session.run(None, {self.input: feats[None]})
        v = emb[0].astype(np.float32)
        return v / (np.linalg.norm(v) + 1e-9)

    def assign(self, v: np.ndarray) -> int:
        """Embedding normalizado -> numero da pessoa (1, 2, ...)."""
        if self.centroids:
            sims = [float(c @ v) for c in self.centroids]
            best = int(np.argmax(sims))
            if sims[best] >= self.threshold or len(self.centroids) >= self.max_speakers:
                w = min(self.counts[best], 20)  # media movel: a voz pode mudar um pouco ao longo da call
                c = self.centroids[best] * w + v
                self.centroids[best] = c / (np.linalg.norm(c) + 1e-9)
                self.counts[best] += 1
                return best + 1
        self.centroids.append(v)
        self.counts.append(1)
        return len(self.centroids)

    def identify(self, audio: np.ndarray) -> int | None:
        """Frase (16 kHz mono float) -> pessoa, ou None se for curta demais pra saber."""
        try:
            v = self.embed(audio)
        except Exception:
            log.exception("erro ao reconhecer a voz")
            return None
        return None if v is None else self.assign(v)

    def reset(self) -> None:
        self.centroids.clear()
        self.counts.clear()
