/**
 * Diagrama como caixas e ligacoes, para o editor visual. A IA continua escrevendo Mermaid: o
 * mermaid le o texto (no renderer), `fromMermaid` traduz o que ele entendeu para este modelo e
 * `toMermaid` escreve as edicoes da pessoa de volta em Mermaid, que e o que a IA ve na proxima vez.
 * Funcoes puras: sem DOM e sem mermaid aqui.
 */
import type { Layout } from './types'

export type GraphKind = 'flow' | 'mind' | 'er'
export type Dir = 'LR' | 'RL' | 'TB' | 'BT'
export type Shape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'dcircle'
  | 'diamond'
  | 'hexagon'
  | 'odd'
  | 'lean-r'
  | 'lean-l'
  | 'trap'
  | 'trap-inv'
  | 'cloud'
  | 'bang'
  | 'plain'

export interface ErAttr {
  type: string
  name: string
  keys: string[]
  comment: string
}

export interface GNode {
  id: string
  label: string
  shape: Shape
  parent?: string // subgraph (fluxograma)
  group?: boolean // e um subgraph
  attrs?: ErAttr[] // entidade (diagrama de dados)
  section?: number // galho do mapa mental (cor)
}

/** Cardinalidade de um lado da relacao (diagrama de dados). */
export type Card = 'one' | 'zero-one' | 'many' | 'zero-many'

export interface GEdge {
  id: string
  source: string
  target: string
  label: string
  line: 'solid' | 'dotted' | 'thick'
  arrow: boolean
  from?: Card
  to?: Card
}

export interface Graph {
  kind: GraphKind
  dir: Dir
  nodes: GNode[]
  edges: GEdge[]
}

/** Tipo do mermaid -> tipo editavel (os outros continuam desenhados pelo mermaid). */
export function kindOf(mermaidType: string): GraphKind | null {
  if (mermaidType === 'flowchart-v2' || mermaidType === 'flowchart') return 'flow'
  if (mermaidType === 'mindmap') return 'mind'
  if (mermaidType === 'er') return 'er'
  return null
}

// ---------------------------------------------------------------- leitura

/** O que `diagram.db.getData()` do mermaid devolve (so o que a gente usa). */
export interface MermaidData {
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
}

const FLOW_SHAPES: Record<string, Shape> = {
  squareRect: 'rect',
  rect: 'rect',
  rounded: 'round',
  stadium: 'stadium',
  subroutine: 'subroutine',
  cylinder: 'cylinder',
  circle: 'circle',
  doublecircle: 'dcircle',
  diamond: 'diamond',
  question: 'diamond',
  hexagon: 'hexagon',
  odd: 'odd',
  lean_right: 'lean-r',
  lean_left: 'lean-l',
  trapezoid: 'trap',
  inv_trapezoid: 'trap-inv',
}

const MIND_SHAPES: Record<string, Shape> = {
  mindmapCircle: 'circle',
  circle: 'circle',
  defaultMindmapNode: 'plain',
  rect: 'rect',
  rounded: 'round',
  roundedRect: 'round',
  cloud: 'cloud',
  bang: 'bang',
  hexagon: 'hexagon',
}

const CARDS: Record<string, Card> = {
  only_one: 'one',
  zero_or_one: 'zero-one',
  one_or_more: 'many',
  zero_or_more: 'zero-many',
}

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' }

/** Desfaz os escapes do mermaid (#quot;, <br>) que chegam crus no texto. */
export function decodeLabel(s: string): string {
  return s
    .replace(/ﬂ°°(\d+)¶ß/g, '#$1;') // codificacao interna do mermaid
    .replace(/ﬂ°(\w+)¶ß/g, '#$1;')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/#([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/^"(.*)"$/s, '$1')
    .replace(/^`(.*)`$/s, '$1')
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

function normDir(d: unknown): Dir {
  const s = str(d).toUpperCase()
  if (s === 'LR' || s === 'RL' || s === 'BT') return s
  return 'TB' // TB e TD
}

function uniq(base: string, taken: Set<string>): string {
  let id = base
  for (let i = 2; taken.has(id); i++) id = `${base}~${i}`
  taken.add(id)
  return id
}

export function fromMermaid(kind: GraphKind, data: MermaidData, dir?: unknown): Graph {
  if (kind === 'mind') return fromMind(data)
  if (kind === 'er') return fromEr(data, dir)
  const nodes: GNode[] = data.nodes.map((n) => ({
    id: str(n.id),
    label: decodeLabel(str(n.label)),
    shape: n.isGroup ? 'rect' : (FLOW_SHAPES[str(n.shape)] ?? 'rect'),
    ...(n.parentId ? { parent: str(n.parentId) } : {}),
    ...(n.isGroup ? { group: true } : {}),
  }))
  const edges: GEdge[] = data.edges.map((e, i) => {
    const end = str(e.arrowTypeEnd || e.type)
    return {
      id: str(e.id) || `e${i}`,
      source: str(e.start),
      target: str(e.end),
      label: decodeLabel(str(e.label)),
      line: e.thickness === 'thick' || e.pattern === 'thick' ? 'thick' : e.pattern === 'dotted' ? 'dotted' : 'solid',
      arrow: end !== 'arrow_open' && end !== 'none' && end !== '',
    }
  })
  return { kind: 'flow', dir: normDir(dir), nodes, edges }
}

function fromMind(data: MermaidData): Graph {
  const taken = new Set<string>()
  const ids = new Map<string, string>() // id interno do mermaid -> nosso id
  const nodes: GNode[] = data.nodes.map((n) => {
    const label = decodeLabel(str(n.label))
    const id = uniq(str(n.nodeId) || label || str(n.id), taken)
    ids.set(str(n.id), id)
    return {
      id,
      label,
      shape: MIND_SHAPES[str(n.shape)] ?? 'plain',
      ...(typeof n.section === 'number' ? { section: n.section } : {}),
    }
  })
  const edges: GEdge[] = data.edges
    .filter((e) => ids.has(str(e.start)) && ids.has(str(e.end)))
    .map((e) => {
      const source = ids.get(str(e.start))!
      const target = ids.get(str(e.end))!
      return { id: `${source}>${target}`, source, target, label: '', line: 'solid', arrow: false }
    })
  return { kind: 'mind', dir: 'LR', nodes, edges }
}

function fromEr(data: MermaidData, dir?: unknown): Graph {
  const ids = new Map<string, string>()
  const taken = new Set<string>()
  const nodes: GNode[] = data.nodes.map((n) => {
    const raw = str(n.id)
    const name = /^entity-(.+)-\d+$/.exec(raw)?.[1] ?? raw
    const id = uniq(name, taken)
    ids.set(raw, id)
    const attrs = Array.isArray(n.attributes)
      ? (n.attributes as Array<Record<string, unknown>>).map((a) => ({
          type: str(a.type),
          name: str(a.name),
          keys: Array.isArray(a.keys) ? a.keys.map(str) : [],
          comment: str(a.comment),
        }))
      : []
    return { id, label: decodeLabel(str(n.alias) || str(n.label) || id), shape: 'rect', attrs }
  })
  const edges: GEdge[] = data.edges
    .filter((e) => ids.has(str(e.start)) && ids.has(str(e.end)))
    .map((e, i) => ({
      id: `r${i}:${ids.get(str(e.start))}>${ids.get(str(e.end))}`,
      source: ids.get(str(e.start))!,
      target: ids.get(str(e.end))!,
      label: decodeLabel(str(e.label)),
      line: e.pattern === 'dashed' || e.pattern === 'dotted' ? 'dotted' : 'solid',
      arrow: false,
      from: CARDS[str(e.arrowTypeStart)] ?? 'one',
      to: CARDS[str(e.arrowTypeEnd)] ?? 'zero-many',
    }))
  return { kind: 'er', dir: normDir(dir), nodes, edges }
}

// ---------------------------------------------------------------- escrita

/** Texto entre aspas no fluxograma: aspas e quebras de linha viram escapes do mermaid. */
function quoted(s: string): string {
  return `"${s.replace(/"/g, '#quot;').replace(/\r?\n/g, '<br>')}"`
}

const FLOW_WRAP: Record<Shape, [string, string]> = {
  rect: ['[', ']'],
  plain: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  subroutine: ['[[', ']]'],
  cylinder: ['[(', ')]'],
  circle: ['((', '))'],
  dcircle: ['(((', ')))'],
  diamond: ['{', '}'],
  hexagon: ['{{', '}}'],
  odd: ['>', ']'],
  'lean-r': ['[/', '/]'],
  'lean-l': ['[\\', '\\]'],
  trap: ['[/', '\\]'],
  'trap-inv': ['[\\', '/]'],
  cloud: ['(', ')'],
  bang: ['(', ')'],
}

const FLOW_LINK = {
  solid: ['-->', '---'],
  dotted: ['-.->', '-.-'],
  thick: ['==>', '==='],
} as const

export function toMermaid(g: Graph): string {
  if (g.kind === 'mind') return mindToMermaid(g)
  if (g.kind === 'er') return erToMermaid(g)
  const out = [`flowchart ${g.dir}`]
  const ids = new Set(g.nodes.map((n) => n.id))
  const kids = new Map<string, GNode[]>()
  for (const n of g.nodes) {
    const p = n.parent && ids.has(n.parent) && n.parent !== n.id ? n.parent : ''
    kids.set(p, [...(kids.get(p) ?? []), n])
  }
  const seen = new Set<string>()
  const write = (parent: string, depth: number): void => {
    for (const n of kids.get(parent) ?? []) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      const pad = '  '.repeat(depth)
      if (n.group) {
        out.push(`${pad}subgraph ${n.id} [${quoted(n.label)}]`)
        write(n.id, depth + 1)
        out.push(`${pad}end`)
      } else {
        const [a, b] = FLOW_WRAP[n.shape] ?? FLOW_WRAP.rect
        out.push(`${pad}${n.id}${a}${quoted(n.label)}${b}`)
      }
    }
  }
  write('', 1)
  for (const e of g.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    const op = FLOW_LINK[e.line][e.arrow ? 0 : 1]
    out.push(`  ${e.source} ${op}${e.label ? `|${quoted(e.label)}|` : ''} ${e.target}`)
  }
  return out.join('\n')
}

/** No mapa mental o texto nao tem aspas: tira o que o mermaid leria como forma. */
function mindText(s: string): string {
  return s.replace(/[()[\]{}]/g, '').replace(/\s*\r?\n\s*/g, ' ').trim() || '...'
}

const MIND_WRAP: Partial<Record<Shape, [string, string]>> = {
  rect: ['[', ']'],
  round: ['(', ')'],
  circle: ['((', '))'],
  dcircle: ['((', '))'],
  bang: ['))', '(('],
  cloud: [')', '('],
  hexagon: ['{{', '}}'],
}

/** Id que o mapa mental aceita antes de uma forma (sem espaco nem simbolo). */
function mindId(id: string): string {
  return id.replace(/~\d+$/, '').replace(/[^\p{L}\p{N}_-]/gu, '_') || 'n'
}

/** A raiz do mapa: quem nao tem pai (a primeira, se tiver mais de uma). */
export function mindRoot(g: Graph): string | undefined {
  const hasParent = new Set(g.edges.map((e) => e.target))
  return (g.nodes.find((n) => !hasParent.has(n.id)) ?? g.nodes[0])?.id
}

function mindToMermaid(g: Graph): string {
  const out = ['mindmap']
  const root = mindRoot(g)
  if (!root) return 'mindmap\n  root((...))'
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const kids = new Map<string, string[]>()
  const parentOf = new Map<string, string>()
  for (const e of g.edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || parentOf.has(e.target)) continue
    parentOf.set(e.target, e.source)
    kids.set(e.source, [...(kids.get(e.source) ?? []), e.target])
  }
  const seen = new Set<string>()
  const write = (id: string, depth: number): void => {
    if (seen.has(id)) return
    seen.add(id)
    const n = byId.get(id)!
    const wrap = MIND_WRAP[n.shape] ?? (id === root ? MIND_WRAP.circle : undefined)
    const text = mindText(n.label)
    out.push(`${'  '.repeat(depth)}${wrap ? `${mindId(n.id)}${wrap[0]}${text}${wrap[1]}` : text}`)
    for (const k of kids.get(id) ?? []) write(k, depth + 1)
  }
  write(root, 1)
  // o que ficou solto (ou num ciclo) vira filho da raiz
  for (const n of g.nodes) if (!seen.has(n.id)) write(n.id, 2)
  return out.join('\n')
}

const LEFT: Record<Card, string> = { one: '||', 'zero-one': '|o', many: '}|', 'zero-many': '}o' }
const RIGHT: Record<Card, string> = { one: '||', 'zero-one': 'o|', many: '|{', 'zero-many': 'o{' }

/** Nome de entidade valido (sem espaco nem simbolo). */
export function entityName(s: string): string {
  return (
    s
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .toUpperCase() || 'ENTIDADE'
  )
}

function erToMermaid(g: Graph): string {
  const out = ['erDiagram']
  const ids = new Set(g.nodes.map((n) => n.id))
  const name = (id: string) => entityName(id.replace(/~\d+$/, ''))
  for (const e of g.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    const op = `${LEFT[e.from ?? 'one']}${e.line === 'dotted' ? '..' : '--'}${RIGHT[e.to ?? 'zero-many']}`
    out.push(`  ${name(e.source)} ${op} ${name(e.target)} : "${(e.label || 'tem').replace(/"/g, "'").replace(/\s*\r?\n\s*/g, ' ')}"`)
  }
  for (const n of g.nodes) {
    const alias = n.label && n.label !== n.id ? `["${n.label.replace(/"/g, "'").replace(/\s*\r?\n\s*/g, ' ')}"]` : ''
    if (!n.attrs?.length) {
      out.push(`  ${name(n.id)}${alias}`)
      continue
    }
    out.push(`  ${name(n.id)}${alias} {`)
    for (const a of n.attrs) {
      const keys = a.keys.length ? ` ${a.keys.join(',')}` : ''
      const comment = a.comment ? ` "${a.comment.replace(/"/g, "'")}"` : ''
      out.push(`    ${attrWord(a.type) || 'string'} ${attrWord(a.name) || 'campo'}${keys}${comment}`)
    }
    out.push('  }')
  }
  return out.join('\n')
}

const attrWord = (s: string) => s.replace(/[^\p{L}\p{N}_\-()[\]*]/gu, '_')

// ---------------------------------------------------------------- edicao

export interface Doc {
  graph: Graph
  layout: Layout
  locked: string[]
}

const VALID_KEYS = new Set(['PK', 'FK', 'UK'])

/** Texto de edicao de uma entidade: nome na primeira linha, um campo por linha ("int id PK"). */
export function erText(n: GNode): string {
  return [n.label || n.id, ...(n.attrs ?? []).map((a) => [a.type, a.name, a.keys.join(',')].filter(Boolean).join(' '))].join('\n')
}

export function parseErText(text: string): { name: string; attrs: ErAttr[] } {
  const [first = '', ...rest] = text.split(/\r?\n/)
  const attrs = rest
    .map((l) => l.trim().split(/\s+/).filter(Boolean))
    .filter((w) => w.length)
    .map((w) => {
      const isKey = (k: string) => k.toUpperCase().split(',').every((x) => VALID_KEYS.has(x))
      let end = w.length
      while (end > 1 && isKey(w[end - 1])) end--
      const keys = w.slice(end).flatMap((k) => k.toUpperCase().split(','))
      const [type, name] = end === 1 ? ['string', w[0]] : [w[0], w[1]]
      return { type, name, keys, comment: '' }
    })
  return { name: first.trim(), attrs }
}

function rekey(doc: Doc, from: string, to: string): Doc {
  if (from === to) return doc
  const swap = (id: string) => (id === from ? to : id)
  const layout = { ...doc.layout }
  if (layout[from]) {
    layout[to] = layout[from]
    delete layout[from]
  }
  return {
    graph: {
      ...doc.graph,
      nodes: doc.graph.nodes.map((n) => ({ ...n, id: swap(n.id), ...(n.parent ? { parent: swap(n.parent) } : {}) })),
      edges: doc.graph.edges.map((e) => ({ ...e, source: swap(e.source), target: swap(e.target) })),
    },
    layout,
    locked: doc.locked.map(swap),
  }
}

/**
 * Troca o texto de uma caixa. No mapa mental (caixa sem forma) e no diagrama de dados o id e o
 * proprio texto, entao o id muda junto, levando posicao e trava.
 */
export function renameNode(doc: Doc, id: string, text: string): Doc {
  const node = doc.graph.nodes.find((n) => n.id === id)
  if (!node) return doc
  const taken = new Set(doc.graph.nodes.filter((n) => n.id !== id).map((n) => n.id))
  if (doc.graph.kind === 'er') {
    const { name, attrs } = parseErText(text)
    if (!name) return doc
    const newId = uniq(entityName(name), taken)
    const label = entityName(name) === name ? newId : name
    const next = rekey(doc, id, newId)
    return { ...next, graph: { ...next.graph, nodes: next.graph.nodes.map((n) => (n.id === newId ? { ...n, label, attrs } : n)) } }
  }
  const label = text.trim()
  if (!label) return doc
  const relabel = (d: Doc, nid: string): Doc => ({
    ...d,
    graph: { ...d.graph, nodes: d.graph.nodes.map((n) => (n.id === nid ? { ...n, label } : n)) },
  })
  if (doc.graph.kind === 'mind' && node.shape === 'plain' && mindRoot(doc.graph) !== id) {
    const newId = uniq(mindText(label), taken)
    return relabel(rekey(doc, id, newId), newId)
  }
  return relabel(doc, id)
}

export function setEdgeLabel(doc: Doc, id: string, label: string): Doc {
  return { ...doc, graph: { ...doc.graph, edges: doc.graph.edges.map((e) => (e.id === id ? { ...e, label: label.trim() } : e)) } }
}

/** Caixa nova; no mapa mental vira filha de `parent` (ou da raiz). Devolve o id dela. */
export function addNode(doc: Doc, at: { x: number; y: number }, parent?: string): [Doc, string] {
  const g = doc.graph
  const taken = new Set(g.nodes.map((n) => n.id))
  let node: GNode
  const edges = [...g.edges]
  if (g.kind === 'er') {
    const id = uniq('ENTIDADE', taken)
    node = { id, label: id, shape: 'rect', attrs: [{ type: 'int', name: 'id', keys: ['PK'], comment: '' }] }
  } else if (g.kind === 'mind') {
    const id = uniq('Nova ideia', taken)
    node = { id, label: 'Nova ideia', shape: 'plain' }
    const p = parent && taken.has(parent) ? parent : mindRoot(g)
    if (p) {
      const sec = g.nodes.find((n) => n.id === p)?.section
      if (sec !== undefined) node.section = sec
      edges.push({ id: `${p}>${id}`, source: p, target: id, label: '', line: 'solid', arrow: false })
    }
  } else {
    let k = g.nodes.length + 1
    while (taken.has(`n${k}`)) k++
    node = { id: `n${k}`, label: 'Nova caixa', shape: 'rect' }
    const grp = g.nodes.find((n) => n.id === parent)
    if (grp?.group) node.parent = grp.id
    else if (grp?.parent) node.parent = grp.parent
  }
  return [{ ...doc, graph: { ...g, nodes: [...g.nodes, node], edges }, layout: { ...doc.layout, [node.id]: at } }, node.id]
}

export function removeItems(doc: Doc, nodeIds: string[], edgeIds: string[]): Doc {
  const g = doc.graph
  const drop = new Set(nodeIds)
  const dropEdges = new Set(edgeIds)
  let edges = g.edges.filter((e) => !dropEdges.has(e.id))
  let nodes = g.nodes
  if (g.kind === 'mind') {
    // os filhos sobem para o avo, pra nao perder um galho inteiro
    const parentOf = new Map(edges.map((e) => [e.target, e.source]))
    const up = (id: string): string | undefined => {
      let p = parentOf.get(id)
      while (p && drop.has(p)) p = parentOf.get(p)
      return p
    }
    edges = edges
      .filter((e) => !drop.has(e.target))
      .map((e) => (drop.has(e.source) ? { ...e, source: up(e.target) ?? '' } : e))
      .filter((e) => e.source)
      .map((e) => ({ ...e, id: `${e.source}>${e.target}` }))
  } else {
    edges = edges.filter((e) => !drop.has(e.source) && !drop.has(e.target))
    // caixas de um grupo apagado ficam no grupo de cima
    const parentOf = new Map(g.nodes.map((n) => [n.id, n.parent]))
    const up = (id?: string): string | undefined => {
      let p = id
      while (p && drop.has(p)) p = parentOf.get(p)
      return p
    }
    nodes = nodes.map((n) => {
      if (!n.parent || !drop.has(n.parent)) return n
      const { parent: _old, ...rest } = n
      const p = up(n.parent)
      return p ? { ...rest, parent: p } : rest
    })
  }
  nodes = nodes.filter((n) => !drop.has(n.id))
  const layout = Object.fromEntries(Object.entries(doc.layout).filter(([id]) => !drop.has(id)))
  return { graph: { ...g, nodes, edges }, layout, locked: doc.locked.filter((id) => !drop.has(id)) }
}

/** Liga duas caixas. No mapa mental, `target` muda de pai (sem criar ciclo). */
export function connect(doc: Doc, source: string, target: string): Doc {
  const g = doc.graph
  const ids = new Set(g.nodes.map((n) => n.id))
  if (source === target || !ids.has(source) || !ids.has(target)) return doc
  if (g.nodes.find((n) => n.id === source)?.group || g.nodes.find((n) => n.id === target)?.group) return doc
  if (g.kind === 'mind') {
    const parentOf = new Map(g.edges.map((e) => [e.target, e.source]))
    for (let p: string | undefined = source; p; p = parentOf.get(p)) if (p === target) return doc
    const edges = g.edges.filter((e) => e.target !== target)
    edges.push({ id: `${source}>${target}`, source, target, label: '', line: 'solid', arrow: false })
    const sec = g.nodes.find((n) => n.id === source)?.section
    const nodes = sec === undefined ? g.nodes : g.nodes.map((n) => (n.id === target ? { ...n, section: sec } : n))
    return { ...doc, graph: { ...g, nodes, edges } }
  }
  if (g.edges.some((e) => e.source === source && e.target === target)) return doc
  const taken = new Set(g.edges.map((e) => e.id))
  const edge: GEdge =
    g.kind === 'er'
      ? { id: uniq(`r:${source}>${target}`, taken), source, target, label: 'tem', line: 'solid', arrow: false, from: 'one', to: 'zero-many' }
      : { id: uniq(`L_${source}_${target}_0`, taken), source, target, label: '', line: 'solid', arrow: true }
  return { ...doc, graph: { ...g, edges: [...g.edges, edge] } }
}

export function toggleLock(doc: Doc, ids: string[]): Doc {
  const all = ids.every((id) => doc.locked.includes(id))
  const locked = all ? doc.locked.filter((id) => !ids.includes(id)) : [...new Set([...doc.locked, ...ids])]
  return { ...doc, locked }
}
