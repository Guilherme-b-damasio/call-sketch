from call_sketch.session import Line, Session


def add(s: Session, who: str, text: str, ts: float = 1000.0) -> bool:
    return s.add_line(Line(who=who, text=text, ts=ts))


def test_mic_echo_of_call_is_dropped():
    s = Session()
    add(s, "call", "colocar o pe no chao cara. Eu jui nem deu um chute nele na rei.")
    assert not add(s, "eu", "colocar o pe no chao cara hum o Juninho deu um chute nele na rei")
    assert [x.who for x in s.lines()] == ["call"]


def test_mic_copy_arriving_first_is_replaced_by_call():
    s = Session()
    add(s, "eu", "Ai, cargada! Meu moco ontem foi...")
    add(s, "call", "Ai, que bagada! Meu moco ontem foi")
    assert [x.who for x in s.lines()] == ["call"]


def test_different_speech_is_kept():
    s = Session()
    add(s, "call", "vamos usar postgres no servico de pedidos")
    assert add(s, "eu", "e o front chama o gateway primeiro")
    assert len(s.lines()) == 2


def test_old_lines_do_not_count_as_echo():
    s = Session()
    add(s, "call", "vamos usar postgres", ts=0)
    assert add(s, "eu", "vamos usar postgres", ts=100)


def test_set_mode_and_reset():
    s = Session("auto")
    s.set_mode("brainstorm")
    assert s.snapshot()["active_mode"] == "brainstorm"
    assert s.redraw.is_set()
    s.set_diagram("mindmap\n  root((x))")
    s.reset()
    snap = s.snapshot()
    assert snap["mermaid"] == "" and snap["transcript"] == [] and snap["active_mode"] == "brainstorm"
