from call_sketch_engine.echo import EchoFilter, Line


def line(who: str, text: str, ts: float = 1000.0) -> Line:
    return Line(who=who, text=text, ts=ts)


def test_mic_echo_of_call_is_dropped():
    f = EchoFilter()
    assert f.add(line("call", "colocar o pe no chao cara. Eu jui nem deu um chute nele")) == (True, [])
    accepted, removed = f.add(line("eu", "colocar o pe no chao cara hum o Juninho deu um chute nele na rei"))
    assert not accepted and removed == []


def test_mic_copy_arriving_first_is_removed():
    f = EchoFilter()
    mic = line("eu", "Ai, cargada! Meu moco ontem foi...")
    f.add(mic)
    assert f.add(line("call", "Ai, que bagada! Meu moco ontem foi")) == (True, [mic.id])


def test_different_speech_is_kept():
    f = EchoFilter()
    f.add(line("call", "vamos usar postgres no servico de pedidos"))
    assert f.add(line("eu", "e o front chama o gateway primeiro")) == (True, [])


def test_old_lines_do_not_count_as_echo():
    f = EchoFilter()
    f.add(line("call", "vamos usar postgres", ts=0))
    assert f.add(line("eu", "vamos usar postgres", ts=100))[0]


def test_ids_are_unique():
    assert line("call", "a").id != line("call", "b").id
