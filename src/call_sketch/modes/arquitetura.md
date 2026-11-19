---
name: Arquitetura
announce: Modo arquitetura. Vou desenhar os componentes do sistema e como eles se conectam.
description: sistemas, servicos, APIs, bancos, filas, front e back, infraestrutura, quem chama quem
---
Use `flowchart LR` (ou `TD` se ficar mais largo que alto).
- Servicos e apps como caixas `A["Nome"]`, bancos como cilindros `DB[("Postgres")]`, filas como `Q[["Fila"]]`.
- Rotule as setas com o protocolo ou acao quando for dito: `-->|"HTTP"|`, `-->|"publica"|`.
- Agrupe por sistema ou camada com `subgraph` (ex: "Frontend", "Backend", "Infra").
- Componentes externos (terceiros) em um `subgraph` "Externo".
