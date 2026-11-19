import numpy as np

from call_sketch_engine.audio import PhraseChunker, to_16k_mono

BLOCK = 4000  # 0.25 s a 16 kHz


def speech() -> np.ndarray:
    return (np.random.default_rng(0).standard_normal(BLOCK) * 0.1).astype(np.float32)


def silence() -> np.ndarray:
    return np.zeros(BLOCK, dtype=np.float32)


def feed_all(chunker: PhraseChunker, blocks: list[np.ndarray]) -> list[np.ndarray]:
    return [p for b in blocks if (p := chunker.feed(b)) is not None]


def test_silence_produces_nothing():
    assert feed_all(PhraseChunker(), [silence()] * 40) == []


def test_phrase_is_cut_at_pause_with_preroll():
    c = PhraseChunker()
    out = feed_all(c, [silence()] + [speech()] * 8 + [silence()] * 4)
    assert len(out) == 1
    # 1 bloco de preroll + 8 de fala + 4 de silencio (0.8 s de pausa = 3.2 blocos -> 4)
    assert len(out[0]) == BLOCK * 13


def test_short_noise_is_discarded():
    c = PhraseChunker()
    assert feed_all(c, [speech()] + [silence()] * 6) == []


def test_long_speech_is_split_at_max():
    c = PhraseChunker(max_sec=2.0)
    out = feed_all(c, [speech()] * 20)
    assert len(out) == 2
    assert all(len(p) == BLOCK * 8 for p in out)


def test_to_16k_mono_downsamples_stereo():
    stereo = np.ones((48000, 2), dtype=np.float32)
    mono = to_16k_mono(stereo)
    assert mono.shape == (16000,)
    assert mono.dtype == np.float32
