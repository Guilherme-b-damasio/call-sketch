"""Um segundo Claude que confere afirmacoes tecnicas/factuais ditas na conversa."""

from __future__ import annotations

import threading

from call_sketch.llm import LLM
from call_sketch.session import Session, format_transcript

CHECK_PROMPT = """Voce e um revisor tecnico ouvindo uma conversa ao vivo.
Recebe a transcricao recente (reconhecimento de voz, pode ter palavras trocadas) e as notas que voce ja deu.
Aponte afirmacoes tecnicas ou factuais ERRADAS ou DUVIDOSAS (conceitos, comandos, numeros, como uma
tecnologia funciona, riscos de uma decisao) e diga a correcao em 1 frase curta.

Regras:
- Ignore papo, piadas e opinioes; so valide o que da pra checar.
- Na duvida se foi erro de transcricao, nao aponte.
- Nao repita notas ja dadas.
- No maximo 3 notas novas, em portugues, uma por linha, neste formato:
  - [ERRADO] "trecho dito" -> correcao
  - [DUVIDA] "trecho dito" -> o que conferir
- Se nao houver nada, responda exatamente: NADA"""


def parse_checks(text: str) -> list[str]:
    return [line.strip()[2:] for line in text.splitlines() if line.strip().startswith("- [")]


class Validator(threading.Thread):
    def __init__(self, llm: LLM, session: Session, every: float, stop: threading.Event) -> None:
        super().__init__(name="validator", daemon=True)
        self.llm, self.session, self.every, self.stop = llm, session, every, stop
        self._checked_upto = 0

    def run(self) -> None:
        while not self.stop.wait(self.every):
            self.step()

    def step(self) -> None:
        lines = self.session.lines()
        if len(lines) < self._checked_upto:  # /reset
            self._checked_upto = 0
        if len(lines) == self._checked_upto:
            return
        given = [c["text"] for c in self.session.snapshot()["checks"][-15:]]
        user = ("Notas ja dadas:\n" + ("\n".join(given) or "(nenhuma)")
                + f"\n\nTranscricao recente:\n{format_transcript(lines[-60:])}")
        try:
            notes = parse_checks(self.llm.ask(CHECK_PROMPT, user))
        except Exception as e:
            print(f"validacao: erro {e}")
            return
        self._checked_upto = len(lines)
        if notes:
            for n in notes:
                print(f"  ! {n}")
            self.session.add_checks(notes)
