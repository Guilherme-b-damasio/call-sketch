"""Loop que pede ao Claude o diagrama atualizado e troca de modo quando a conversa muda."""

from __future__ import annotations

import re
import threading
from collections.abc import Callable

from call_sketch.llm import LLM
from call_sketch.modes import AUTO, Mode
from call_sketch.session import Session, format_transcript

BASE_PROMPT = """Voce e um desenhista de quadro branco ao vivo. Recebe a transcricao de uma conversa
(reconhecimento de voz: pode ter palavras trocadas) e o diagrama atual, e devolve o diagrama
ATUALIZADO em Mermaid que representa o que esta sendo falado.

Regras gerais:
- Evolua o diagrama atual em vez de recomecar, a menos que o assunto ou o modo tenha mudado.
- Textos curtos em portugues: no maximo ~4 palavras por no. Rotulos sempre entre aspas: A["Texto"].
- Codigo Mermaid 11 valido, sem estilos, cores ou classDef. No maximo ~15 nos.
- Falas marcadas como "nota" sao pedidos diretos do usuario: obedeca.
- Se ainda nao ha nada desenhavel, devolva o diagrama atual."""

MERMAID_RE = re.compile(r"```(?:mermaid)?\s*\n(.*?)```", re.S)
MODE_RE = re.compile(r"^\s*MODO:\s*([\w-]+)", re.M | re.I)


def build_system(modes: dict[str, Mode], mode: str) -> str:
    if mode != AUTO:
        m = modes[mode]
        return (f"{BASE_PROMPT}\n\nModo: {m.name}\n{m.instructions}\n\n"
                "Responda SOMENTE com um bloco ```mermaid ... ```, sem explicacao.")
    catalog = "\n\n".join(
        f"### {m.id}\nQuando usar: {m.description}\nComo desenhar:\n{m.instructions}" for m in modes.values()
    )
    return (f"{BASE_PROMPT}\n\nEscolha o modo que melhor representa a conversa. Mantenha o modo atual, "
            f"a menos que a conversa tenha claramente mudado de natureza.\n\nModos:\n\n{catalog}\n\n"
            "Formato da resposta, sem mais nada:\nMODO: <id do modo>\n```mermaid\n...\n```")


def parse_response(text: str) -> tuple[str | None, str]:
    """-> (id do modo ou None, codigo mermaid)."""
    mode = MODE_RE.search(text)
    code = MERMAID_RE.search(text)
    return (mode.group(1).lower() if mode else None,
            (code.group(1) if code else text).strip())


def build_user(session_lines: str, current: str, active_mode: str, render_error: str | None,
               mode_changed: bool) -> str:
    parts = [f"Modo atual: {active_mode or '(nenhum ainda)'}",
             f"Diagrama atual:\n```mermaid\n{current or '(vazio)'}\n```",
             f"Transcricao:\n{session_lines}"]
    if mode_changed:
        parts.append("O MODO MUDOU: redesenhe o conteudo no formato do novo modo.")
    if render_error:
        parts.append(f"O diagrama atual DEU ERRO ao renderizar, corrija a sintaxe: {render_error}")
    return "\n\n".join(parts)


class Sketcher(threading.Thread):
    def __init__(self, llm: LLM, session: Session, modes: dict[str, Mode], every: float,
                 on_mode_change: Callable[[Mode], None], stop: threading.Event) -> None:
        super().__init__(name="sketcher", daemon=True)
        self.llm, self.session, self.modes, self.every = llm, session, modes, every
        self.on_mode_change, self.stop = on_mode_change, stop
        self._drawn_upto = 0
        self._drawn_mode = session.active_mode

    def run(self) -> None:
        while not self.stop.is_set():
            self.session.redraw.wait(timeout=self.every)
            forced = self.session.redraw.is_set()
            self.session.redraw.clear()
            if not self.stop.is_set():
                self.step(forced)

    def step(self, forced: bool = False) -> None:
        s = self.session.snapshot()
        lines = self.session.lines()
        if len(lines) < self._drawn_upto:  # /reset
            self._drawn_upto = 0
        mode_changed = s["active_mode"] != self._drawn_mode and s["mode"] != AUTO
        if not lines or (len(lines) == self._drawn_upto and not forced
                         and not s["render_error"] and not mode_changed):
            return

        self.session.set_status("desenhando...")
        try:
            out = self.llm.ask(
                build_system(self.modes, s["mode"]),
                build_user(format_transcript(lines[-300:]), s["mermaid"], s["active_mode"],
                           s["render_error"], mode_changed),
            )
        except Exception as e:
            self.session.set_status(f"erro: {e}")
            return

        chosen, code = parse_response(out)
        if s["mode"] != AUTO or chosen not in self.modes:
            chosen = s["active_mode"] or None
        self._drawn_upto = len(lines)
        self.session.set_diagram(code, chosen)
        if s["mode"] == AUTO and chosen and chosen != self._drawn_mode:
            self.on_mode_change(self.modes[chosen])
        self._drawn_mode = chosen or ""
        self.session.set_status("ouvindo...")
