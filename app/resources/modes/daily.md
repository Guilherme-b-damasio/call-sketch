---
name: Daily
announce: Modo daily. Vou separar o que cada um fez, o que vai fazer e os bloqueios.
description: reuniao de status, cada pessoa conta o que fez ontem, o que vai fazer hoje e se esta travada
---
Use `flowchart TD` com um `subgraph` por pessoa (titulo = nome da pessoa; se nao souber, "Pessoa 1"...).
Dentro de cada pessoa, nos curtos com prefixo:
- `✅` o que ja fez
- `🔜` o que vai fazer
- `⛔` bloqueio
Se um bloqueio depende de outra pessoa, ligue com uma seta pontilhada `-.->` para o subgraph dela.
