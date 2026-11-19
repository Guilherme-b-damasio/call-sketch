from call_sketch_engine.transcriber import is_phantom, keep_segment


def test_phantoms():
    phantoms = ["Tchau!", "Obrigado.", " obrigado por assistir ", "Legendas pela comunidade Amara.org"]
    phantoms += ["", "..."]
    for t in phantoms:
        assert is_phantom(t), t


def test_real_speech_is_kept():
    for t in ["Tchau, depois a gente fala do deploy", "O serviço chama o banco", "Obrigado, João, segue"]:
        assert not is_phantom(t), t


def test_keep_segment():
    assert keep_segment(0.1, -0.3)
    assert not keep_segment(0.9, -0.8)
    assert not keep_segment(0.1, -1.5)
