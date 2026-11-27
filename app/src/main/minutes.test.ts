import { describe, expect, it } from 'vitest'
import type { CallRecord } from '@shared/types'
import { buildMinutesUser, makeMinutes, parseMinutes, renderMinutes } from './minutes'

const rec: CallRecord = {
  id: '20261127-180000-abcd',
  startedAt: new Date(2026, 10, 27, 18, 0).getTime(),
  endedAt: new Date(2026, 10, 27, 18, 34).getTime(),
  lines: [
    { id: 1, who: 'call', text: 'a api grava no postgres', t: '18:01:00', ts: 0 },
    { id: 2, who: 'eu', text: 'o joao sobe o redis ate sexta', t: '18:02:00', ts: 0 },
  ],
  checks: [{ id: 1, kind: 'duvida', text: '[DUVIDA] "redis persiste" -> conferir AOF', t: '18:03:00' }],
  versions: [
    { ts: 1, tabId: 'a', mode: 'arquitetura', mermaid: 'flowchart LR\n A-->B', by: 'ia' },
    { ts: 2, tabId: 'b', mode: 'dados', mermaid: 'erDiagram\n A ||--o{ B : tem', by: 'ia' },
    { ts: 3, tabId: 'a', mode: 'arquitetura', mermaid: 'flowchart LR\n A-->B\n B-->C', by: 'mao' },
  ],
}

const names = (id: string) => ({ arquitetura: 'Arquitetura', dados: 'Dados' })[id] ?? id

describe('ata', () => {
  it('le a resposta da IA mesmo com enfeite e itens vazios', () => {
    const p = parseMinutes(`**TÍTULO:** "Cache do sistema de pedidos"
RESUMO: Falaram do cache.
Decidiram usar Redis.
DECISÕES:
- Usar Redis na frente do Postgres
AÇÕES:
1. Subir o Redis | João | sexta
- Revisar o diagrama | - | -
PENDÊNCIAS:
- nenhuma`)
    expect(p.title).toBe('Cache do sistema de pedidos')
    expect(p.summary).toBe('Falaram do cache. Decidiram usar Redis.')
    expect(p.decisions).toEqual(['Usar Redis na frente do Postgres'])
    expect(p.actions).toEqual([
      { task: 'Subir o Redis', who: 'João', when: 'sexta' },
      { task: 'Revisar o diagrama', who: '', when: '' },
    ])
    expect(p.open).toEqual([])
  })

  it('monta o markdown com o diagrama final de cada aba, notas e transcricao', () => {
    const md = renderMinutes(
      rec,
      { title: 'Pedidos', summary: 'Resumo.', decisions: [], actions: [{ task: 'Subir o Redis', who: 'João', when: 'sexta' }], open: [] },
      names,
    )
    expect(md).toContain('# Pedidos')
    expect(md).toContain('(34 min)')
    expect(md).toContain('- [ ] Subir o Redis — **João** · até sexta')
    expect(md).toContain('_Nenhuma decisão clara._')
    expect(md).not.toContain('Pontos em aberto')
    expect(md).toContain('### Arquitetura\n\n```mermaid\nflowchart LR\n A-->B\n B-->C\n```')
    expect(md.indexOf('### Arquitetura')).toBeLessThan(md.indexOf('### Dados'))
    expect(md).toContain('- ❓ "redis persiste" -> conferir AOF')
    expect(md).toContain('- `18:02:00` **Eu:** o joao sobe o redis ate sexta')
  })

  it('manda pra IA os diagramas finais e a conversa', () => {
    const u = buildMinutesUser(rec, names)
    expect(u).toContain('Arquitetura:\n```mermaid\nflowchart LR\n A-->B\n B-->C')
    expect(u).toContain('[18:01:00] Call: a api grava no postgres')
  })

  it('call sem fala nao chama a IA', async () => {
    let asked = 0
    const llm = { name: 'x', ask: async () => (asked++, '') }
    const md = await makeMinutes({ ...rec, lines: [] }, llm, names)
    expect(asked).toBe(0)
    expect(md).toContain('# Ata da call')
  })
})
