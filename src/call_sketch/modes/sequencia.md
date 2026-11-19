---
name: Sequência
announce: Modo sequência. Vou mostrar a troca de mensagens entre as partes, na ordem.
description: ordem das chamadas entre sistemas ou pessoas, request e response, integracao, autenticacao, webhook
---
Use `sequenceDiagram` com `autonumber`.
- Declare os participantes na ordem em que aparecem (`participant U as Usuario`).
- Chamadas com `->>`, respostas com `-->>`.
- Use `alt`/`else` para caminhos alternativos (ex: sucesso / erro) e `Note over` para observacoes curtas.
