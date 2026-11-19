"""Backends do Claude: login do Claude Code (assinatura de cada pessoa) ou API key."""

from __future__ import annotations

import shutil
import subprocess
from typing import Protocol


class LLMError(RuntimeError):
    pass


class LLM(Protocol):
    name: str

    def ask(self, system: str, user: str) -> str: ...


class ClaudeCLI:
    """Usa o `claude -p` logado na conta de quem esta rodando. Sem API paga."""

    def __init__(self, model: str = "sonnet") -> None:
        self.model = model
        self.name = f"claude-code/{model}"
        self.bin = shutil.which("claude")
        if not self.bin:
            raise LLMError("comando 'claude' nao encontrado. Instale: npm i -g @anthropic-ai/claude-code")

    def ask(self, system: str, user: str) -> str:
        # No Windows o `claude` e um .CMD (batch), que estraga argumentos multilinha:
        # as instrucoes vao pelo stdin e o --system-prompt fica numa linha so.
        p = subprocess.run(
            [self.bin, "-p", "--model", self.model,
             "--system-prompt", "Siga as instrucoes da mensagem a risca.",
             "--strict-mcp-config", "--no-session-persistence"],
            input=f"{system}\n\n---\n\n{user}",
            capture_output=True, text=True, encoding="utf-8", timeout=180,
        )
        out = p.stdout.strip()
        if p.returncode != 0 or "Not logged in" in out:
            raise LLMError((out or p.stderr).strip()[:300] or f"claude saiu com codigo {p.returncode}")
        return out

    def check_login(self) -> None:
        self.ask("Responda apenas: ok", "ping")


class ClaudeAPI:
    """Usa ANTHROPIC_API_KEY (pago por uso). Requer o extra [api]."""

    def __init__(self, model: str = "claude-opus-5-5") -> None:
        try:
            import anthropic
        except ImportError as e:
            raise LLMError("instale o extra: pip install 'call-sketch[api]'") from e
        self._anthropic = anthropic
        self.client = anthropic.Anthropic()
        self.model = model
        self.name = f"api/{model}"

    def ask(self, system: str, user: str) -> str:
        try:
            resp = self.client.beta.messages.create(
                model=self.model,
                max_tokens=8000,
                system=system,
                output_config={"effort": "low"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                messages=[{"role": "user", "content": user}],
            )
        except self._anthropic.APIError as e:
            raise LLMError(str(e)) from e
        if resp.stop_reason == "refusal":
            raise LLMError("o Claude recusou esse trecho")
        return "".join(b.text for b in resp.content if b.type == "text")

    def check_login(self) -> None:
        pass


def make_llm(backend: str, model: str | None) -> ClaudeCLI | ClaudeAPI:
    if backend == "api":
        return ClaudeAPI(model or "claude-opus-5-5")
    return ClaudeCLI(model or "sonnet")
