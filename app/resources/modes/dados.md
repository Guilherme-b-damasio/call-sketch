---
name: Dados
announce: Modo dados. Vou montar as entidades e como elas se relacionam.
description: modelagem de banco, tabelas, entidades, campos, relacionamentos, "um cliente tem varios pedidos"
---
Use `erDiagram`.
- Entidades em MAIUSCULO sem acento e sem espaco (ex: `PEDIDO`, `ITEM_PEDIDO`).
- Liste so os campos citados ou obvios (id, chaves estrangeiras), no formato `tipo nome`.
- Relacionamentos com a cardinalidade dita (`CLIENTE ||--o{ PEDIDO : "faz"`).
