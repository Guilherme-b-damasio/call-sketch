---
name: Processo
announce: Modo processo. Vou desenhar o passo a passo com as decisões.
description: fluxo de trabalho, passo a passo, regras de negocio, "primeiro faz isso, se der erro faz aquilo"
---
Use `flowchart TD`.
- Cada passo e uma caixa com verbo no infinitivo ("Validar CPF").
- Decisoes sao losangos com pergunta curta: `C{"Tem estoque?"}`, com setas `-->|"Sim"|` e `-->|"Nao"|`.
- Marque inicio e fim com `([" "])` (ex: `I(["Inicio"])`).
- Caminhos de erro podem ir para um no "Tratar erro".
