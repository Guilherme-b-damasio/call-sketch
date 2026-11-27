import numpy as np

from call_sketch_engine.speakers import SpeakerTracker, _mel_banks, fbank


def tracker(threshold: float = 0.45, max_speakers: int = 8) -> SpeakerTracker:
    """Sem o modelo: so a parte de agrupar as vozes."""
    t = SpeakerTracker.__new__(SpeakerTracker)
    t.threshold, t.max_speakers = threshold, max_speakers
    t.centroids, t.counts = [], []
    return t


def unit(v):
    v = np.asarray(v, dtype=np.float32)
    return v / np.linalg.norm(v)


def test_fbank_formato_e_media_zero():
    sec = np.sin(2 * np.pi * 440 * np.arange(16000) / 16000).astype(np.float32) * 0.1
    f = fbank(sec)
    assert f.shape == (98, 80)  # (16000 - 400) // 160 + 1
    assert np.allclose(f.mean(axis=0), 0, atol=1e-3)
    assert fbank(np.zeros(100, dtype=np.float32)).shape == (0, 80)


def test_filtros_mel_cobrem_o_espectro_em_ordem():
    banks = _mel_banks()
    assert banks.shape == (80, 257)
    peaks = banks.argmax(axis=1)
    assert (np.diff(peaks) >= 0).all()
    assert banks.max() <= 1.0


def test_agrupa_por_voz_e_numera_na_ordem():
    t = tracker()
    a, b = unit([1, 0, 0, 0]), unit([0, 1, 0, 0])
    got = [t.assign(v) for v in (a, b, unit([0.95, 0.1, 0, 0]), unit([0.1, 0.9, 0.1, 0]), unit([0, 0, 1, 0]))]
    assert got == [1, 2, 1, 2, 3]
    t.reset()
    assert t.assign(b) == 1


def test_limite_de_pessoas_vai_pra_mais_parecida():
    t = tracker(max_speakers=2)
    t.assign(unit([1, 0, 0]))
    t.assign(unit([0, 1, 0]))
    assert t.assign(unit([0.2, 0.1, 1])) == 1
