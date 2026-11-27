import { describe, expect, it } from 'vitest'
import { addNode, connect, decodeLabel, type Doc, fromMermaid, type MermaidData, parseErText, removeItems, renameNode, toggleLock, toMermaid } from './graph'

// o que o mermaid 11 devolve em db.getData() (tirado de uma rodada real, so com os campos usados)
const FLOW: MermaidData = {
  nodes: [
    { id: 'Backend', label: 'Backend', shape: 'rect', isGroup: true },
    { id: 'A', label: 'Cliente', shape: 'squareRect', isGroup: false },
    { id: 'B', label: 'Valido?', shape: 'diamond', isGroup: false },
    { id: 'C', label: 'Postgres', shape: 'cylinder', parentId: 'Backend', isGroup: false },
    { id: 'D', label: 'Diz #quot;oi#quot;<br>agora', shape: 'stadium', isGroup: false },
  ],
  edges: [
    { id: 'L_A_B_0', start: 'A', end: 'B', label: '', thickness: 'normal', pattern: 'normal', arrowTypeEnd: 'arrow_point' },
    { id: 'L_B_C_0', start: 'B', end: 'C', label: 'sim', thickness: 'normal', pattern: 'normal', arrowTypeEnd: 'arrow_point' },
    { id: 'L_B_D_0', start: 'B', end: 'D', label: 'nao', thickness: 'dotted', pattern: 'dotted', arrowTypeEnd: 'arrow_point' },
    { id: 'L_C_D_0', start: 'C', end: 'D', label: '', thickness: 'thick', pattern: 'thick', arrowTypeEnd: 'arrow_open' },
  ],
}

const MIND: MermaidData = {
  nodes: [
    { id: '0', label: 'Ideias', shape: 'mindmapCircle', nodeId: 'root', level: 0 },
    { id: '1', label: 'App de caronas', shape: 'defaultMindmapNode', nodeId: 'App de caronas', section: 0 },
    { id: '2', label: 'Motoristas', shape: 'defaultMindmapNode', nodeId: 'Motoristas', section: 0 },
    { id: '3', label: 'Entregas', shape: 'rect', nodeId: 'e1', section: 1 },
  ],
  edges: [
    { id: 'edge_0_1', start: '0', end: '1' },
    { id: 'edge_1_2', start: '1', end: '2' },
    { id: 'edge_0_3', start: '0', end: '3' },
  ],
}

const ER: MermaidData = {
  nodes: [
    {
      id: 'entity-CLIENTE-0',
      label: 'CLIENTE',
      alias: '',
      attributes: [
        { type: 'int', name: 'id', keys: ['PK'], comment: '' },
        { type: 'string', name: 'nome', keys: [], comment: '' },
      ],
    },
    { id: 'entity-PEDIDO-1', label: 'PEDIDO', alias: '', attributes: [] },
  ],
  edges: [
    {
      start: 'entity-CLIENTE-0',
      end: 'entity-PEDIDO-1',
      label: 'faz',
      arrowTypeStart: 'only_one',
      arrowTypeEnd: 'zero_or_more',
      pattern: 'solid',
    },
  ],
}

const doc = (graph: Doc['graph']): Doc => ({ graph, layout: {}, locked: [] })

describe('grafo editavel', () => {
  it('le o fluxograma com formas, grupo, rotulos e estilos de linha', () => {
    const g = fromMermaid('flow', FLOW, 'LR')
    expect(g.dir).toBe('LR')
    expect(g.nodes.map((n) => [n.id, n.shape])).toEqual([
      ['Backend', 'rect'],
      ['A', 'rect'],
      ['B', 'diamond'],
      ['C', 'cylinder'],
      ['D', 'stadium'],
    ])
    expect(g.nodes[0].group).toBe(true)
    expect(g.nodes[3].parent).toBe('Backend')
    expect(g.nodes[4].label).toBe('Diz "oi"\nagora')
    expect(g.edges.map((e) => [e.line, e.arrow, e.label])).toEqual([
      ['solid', true, ''],
      ['solid', true, 'sim'],
      ['dotted', true, 'nao'],
      ['thick', false, ''],
    ])
  })

  it('escreve o fluxograma de volta em mermaid', () => {
    expect(toMermaid(fromMermaid('flow', FLOW, 'TD'))).toBe(
      [
        'flowchart TB',
        '  subgraph Backend ["Backend"]',
        '    C[("Postgres")]',
        '  end',
        '  A["Cliente"]',
        '  B{"Valido?"}',
        '  D(["Diz #quot;oi#quot;<br>agora"])',
        '  A --> B',
        '  B -->|"sim"| C',
        '  B -.->|"nao"| D',
        '  C === D',
      ].join('\n'),
    )
  })

  it('mapa mental: arvore com a raiz em circulo e ids estaveis', () => {
    const g = fromMermaid('mind', MIND)
    expect(g.nodes.map((n) => n.id)).toEqual(['root', 'App de caronas', 'Motoristas', 'e1'])
    expect(toMermaid(g)).toBe(['mindmap', '  root((Ideias))', '    App de caronas', '      Motoristas', '    e1[Entregas]'].join('\n'))
  })

  it('diagrama de dados: entidades, campos e cardinalidade', () => {
    const g = fromMermaid('er', ER, 'TB')
    expect(g.nodes.map((n) => n.id)).toEqual(['CLIENTE', 'PEDIDO'])
    expect(g.edges[0]).toMatchObject({ source: 'CLIENTE', target: 'PEDIDO', from: 'one', to: 'zero-many', label: 'faz' })
    expect(toMermaid(g)).toBe(
      ['erDiagram', '  CLIENTE ||--o{ PEDIDO : "faz"', '  CLIENTE {', '    int id PK', '    string nome', '  }', '  PEDIDO'].join('\n'),
    )
  })

  it('renomear no mapa mental leva posicao e trava junto com o id', () => {
    const d: Doc = { graph: fromMermaid('mind', MIND), layout: { Motoristas: { x: 5, y: 6 } }, locked: ['Motoristas'] }
    const out = renameNode(d, 'Motoristas', 'Condutores')
    expect(out.graph.nodes.map((n) => n.id)).toContain('Condutores')
    expect(out.layout.Condutores).toEqual({ x: 5, y: 6 })
    expect(out.locked).toEqual(['Condutores'])
    expect(out.graph.edges.find((e) => e.target === 'Condutores')?.source).toBe('App de caronas')
  })

  it('renomear entidade aceita o texto com os campos', () => {
    const out = renameNode(doc(fromMermaid('er', ER)), 'PEDIDO', 'Pedido de compra\nint id PK\ndate quando\ncliente_id FK')
    const n = out.graph.nodes.find((x) => x.id === 'PEDIDO_DE_COMPRA')!
    expect(n.label).toBe('Pedido de compra')
    expect(n.attrs?.map((a) => `${a.type} ${a.name} ${a.keys}`)).toEqual(['int id PK', 'date quando ', 'string cliente_id FK'])
    expect(out.graph.edges[0].target).toBe('PEDIDO_DE_COMPRA')
    expect(toMermaid(out.graph)).toContain('PEDIDO_DE_COMPRA["Pedido de compra"] {')
  })

  it('apagar no mapa mental sobe os filhos para o avo', () => {
    const out = removeItems(doc(fromMermaid('mind', MIND)), ['App de caronas'], [])
    expect(out.graph.edges.map((e) => `${e.source}>${e.target}`).sort()).toEqual(['root>Motoristas', 'root>e1'])
  })

  it('apagar um grupo deixa as caixas soltas', () => {
    const out = removeItems(doc(fromMermaid('flow', FLOW, 'LR')), ['Backend'], [])
    expect(out.graph.nodes.find((n) => n.id === 'C')?.parent).toBeUndefined()
    expect(toMermaid(out.graph)).not.toContain('subgraph')
  })

  it('caixa nova e ligacao nova', () => {
    const [d1, id] = addNode(doc(fromMermaid('flow', FLOW, 'LR')), { x: 10, y: 20 })
    expect(id).toBe('n6')
    expect(d1.layout.n6).toEqual({ x: 10, y: 20 })
    const d2 = connect(d1, 'A', 'n6')
    expect(toMermaid(d2.graph)).toContain('  A --> n6')
    expect(connect(d2, 'A', 'n6')).toBe(d2) // nao duplica
    expect(connect(d2, 'A', 'Backend')).toBe(d2) // nao liga em grupo
  })

  it('no mapa mental ligar troca o pai e nao deixa criar ciclo', () => {
    const d = doc(fromMermaid('mind', MIND))
    const moved = connect(d, 'e1', 'Motoristas')
    expect(moved.graph.edges.filter((e) => e.target === 'Motoristas').map((e) => e.source)).toEqual(['e1'])
    expect(connect(d, 'Motoristas', 'App de caronas')).toBe(d)
  })

  it('desfaz a codificacao interna do mermaid', () => {
    expect(decodeLabel('Diz ﬂ°quot¶ßoiﬂ°quot¶ß<br>agora ﬂ°°35¶ß1')).toBe('Diz "oi"\nagora #1')
  })

  it('travar e destravar', () => {
    const d = doc(fromMermaid('flow', FLOW, 'LR'))
    const t = toggleLock(d, ['A', 'B'])
    expect(t.locked).toEqual(['A', 'B'])
    expect(toggleLock(t, ['A', 'B']).locked).toEqual([])
    expect(toggleLock(t, ['A', 'C']).locked).toEqual(['A', 'B', 'C'])
  })

  it('texto da entidade: campo sem tipo vira string', () => {
    expect(parseErText('X\nnome\nint id pk')).toEqual({
      name: 'X',
      attrs: [
        { type: 'string', name: 'nome', keys: [], comment: '' },
        { type: 'int', name: 'id', keys: ['PK'], comment: '' },
      ],
    })
  })
})
