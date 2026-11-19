from pathlib import Path

import pytest

from call_sketch.modes import AUTO, load_modes, parse_mode
from call_sketch.session import Line, Session
from call_sketch.sketcher import Sketcher, build_system, parse_response
from call_sketch.validator import parse_checks

EXPECTED = {"arquitetura", "brainstorm", "daily", "dados", "decisao", "planejamento", "processo", "sequencia"}


def test_builtin_modes_load():
    modes = load_modes()
    assert EXPECTED <= modes.keys()
    for m in modes.values():
        assert m.name and m.announce and m.description and m.instructions


def test_custom_mode_dir_overrides(tmp_path: Path):
    (tmp_path / "daily.md").write_text("---\nname: Minha Daily\nannounce: oi\ndescription: x\n---\nfaz assim",
                                       encoding="utf-8")
    (tmp_path / "retro.md").write_text("---\nname: Retro\nannounce: retro\ndescription: y\n---\nmindmap",
                                       encoding="utf-8")
    modes = load_modes(tmp_path)
    assert modes["daily"].name == "Minha Daily"
    assert modes["retro"].instructions == "mindmap"


def test_mode_without_required_field_fails():
    with pytest.raises(ValueError):
        parse_mode("x", "---\nname: X\n---\ncorpo")


def test_auto_prompt_lists_every_mode_and_asks_for_mode_line():
    modes = load_modes()
    system = build_system(modes, AUTO)
    assert "MODO:" in system
    for mode_id in modes:
        assert f"### {mode_id}" in system


def test_fixed_prompt_has_only_that_mode():
    modes = load_modes()
    system = build_system(modes, "brainstorm")
    assert "mindmap" in system and "erDiagram" not in system and "MODO:" not in system


def test_parse_response_with_mode():
    mode, code = parse_response("MODO: Arquitetura\n```mermaid\nflowchart LR\n  A --> B\n```")
    assert mode == "arquitetura"
    assert code == "flowchart LR\n  A --> B"


def test_parse_response_without_fence():
    assert parse_response("flowchart TD\n A-->B") == (None, "flowchart TD\n A-->B")


def test_parse_checks():
    out = 'Aqui:\n- [ERRADO] "404 e erro de servidor" -> e erro do cliente\nNADA\n- [DUVIDA] "x" -> conferir'
    assert parse_checks(out) == ['[ERRADO] "404 e erro de servidor" -> e erro do cliente',
                                 '[DUVIDA] "x" -> conferir']


class FakeLLM:
    name = "fake"

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.calls: list[tuple[str, str]] = []

    def ask(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        return self.reply


def make_sketcher(reply: str, mode: str = AUTO):
    import threading

    session = Session(mode)
    announced = []
    llm = FakeLLM(reply)
    sk = Sketcher(llm, session, load_modes(), 20, announced.append, threading.Event())
    return sk, session, llm, announced


def test_auto_mode_draws_and_announces_new_mode_once():
    reply = "MODO: brainstorm\n```mermaid\nmindmap\n  root((Ideias))\n```"
    sk, session, llm, announced = make_sketcher(reply)
    session.add_line(Line("call", "e se a gente fizesse um app de caronas"))
    sk.step()
    snap = session.snapshot()
    assert snap["active_mode"] == "brainstorm"
    assert snap["mermaid"].startswith("mindmap")
    assert [m.id for m in announced] == ["brainstorm"]

    session.add_line(Line("call", "ou um app de entregas"))
    sk.step()
    assert len(announced) == 1  # mesmo modo, nao repete o anuncio


def test_nothing_new_means_no_call():
    sk, session, llm, _ = make_sketcher("MODO: brainstorm\n```mermaid\nmindmap\n  root((x))\n```")
    sk.step()
    assert llm.calls == []


def test_fixed_mode_ignores_mode_from_model():
    reply = "MODO: dados\n```mermaid\nflowchart TD\n A-->B\n```"
    sk, session, llm, announced = make_sketcher(reply, "processo")
    session.add_line(Line("call", "primeiro valida o cpf"))
    sk.step()
    assert session.snapshot()["active_mode"] == "processo"
    assert announced == []
