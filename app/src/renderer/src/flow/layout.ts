/**
 * Onde cada caixa fica. O dagre arruma tudo sozinho; o que a pessoa arrastou fica onde ela pos, e
 * caixa nova que a IA trouxe aparece perto da vizinha (seguindo o mesmo deslocamento dela).
 */
import dagre from '@dagrejs/dagre'
import { type GNode, type Graph, mindRoot } from '@shared/graph'
import type { Layout } from '@shared/types'

export interface Box {
  x: number // canto de cima a esquerda
  y: number
  w: number
  h: number
  side?: 'l' | 'r' // lado do mapa mental
}

const FONT = '"Inter Variable", "Segoe UI", system-ui, sans-serif'
export const TEXT_MAX = 200
export const LINE_H = 20

let ctx: CanvasRenderingContext2D | null = null
function textW(s: string, px = 14, weight = 500): number {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return s.length * px * 0.55
  ctx.font = `${weight} ${px}px ${FONT}`
  return ctx.measureText(s).width
}

/** Quebra o texto como o navegador vai quebrar na caixa (largura maxima TEXT_MAX). */
function wrap(label: string, px = 14, weight = 500): { w: number; lines: number } {
  let w = 0
  let lines = 0
  for (const para of label.split('\n')) {
    let cur = ''
    lines++
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word
      if (textW(next, px, weight) > TEXT_MAX && cur) {
        w = Math.max(w, textW(cur, px, weight))
        lines++
        cur = word
      } else cur = next
    }
    w = Math.max(w, Math.min(textW(cur, px, weight), TEXT_MAX))
  }
  return { w: Math.ceil(w), lines: Math.max(lines, 1) }
}

export const ER_ROW = 26
export const ER_HEAD = 38

export function nodeSize(n: GNode, g: Graph, root = false): { w: number; h: number } {
  if (g.kind === 'er') {
    const rows = n.attrs ?? []
    const head = textW(n.label || n.id, 14, 650)
    const row = Math.max(0, ...rows.map((a) => textW(a.type, 12) + textW(a.name, 13) + textW(a.keys.join(','), 11, 600) + 40))
    return { w: Math.ceil(Math.max(head + 36, row + 24, 150)), h: ER_HEAD + 4 + rows.length * ER_ROW + (rows.length ? 10 : 0) }
  }
  if (n.group) return { w: 180, h: 80 }
  const big = g.kind === 'mind' && root
  const t = wrap(n.label || ' ', big ? 16 : 14, big ? 650 : 500)
  let w = Math.max(t.w + (big ? 40 : 30), g.kind === 'mind' ? 56 : 96)
  let h = t.lines * LINE_H + (big ? 30 : 22)
  switch (n.shape) {
    case 'diamond':
      w = Math.max(w * 1.5, 110)
      h = Math.max(h * 1.7, 70)
      break
    case 'circle':
    case 'dcircle':
      w = h = Math.max(w, h) + (n.shape === 'dcircle' ? 14 : 6)
      break
    case 'hexagon':
    case 'lean-r':
    case 'lean-l':
    case 'trap':
    case 'trap-inv':
      w += 30
      break
    case 'cylinder':
      h += 20
      break
    case 'stadium':
    case 'odd':
    case 'subroutine':
      w += 16
      break
    case 'cloud':
    case 'bang':
      w += 24
      h += 14
      break
  }
  return { w: Math.ceil(w), h: Math.ceil(h) }
}

/** Grupos que tem algo dentro (os vazios sao desenhados como caixa comum). */
function filledGroups(g: Graph): Set<string> {
  const groups = new Set(g.nodes.filter((n) => n.group).map((n) => n.id))
  const filled = new Set<string>()
  for (const n of g.nodes) if (n.parent && groups.has(n.parent)) filled.add(n.parent)
  return filled
}

function runDagre(g: Graph, sizes: Map<string, { w: number; h: number }>, only?: Set<string>): Map<string, Box> {
  const filled = filledGroups(g)
  const d = new dagre.graphlib.Graph({ compound: true, multigraph: true })
  d.setGraph({
    rankdir: g.kind === 'mind' ? 'LR' : g.dir,
    nodesep: g.kind === 'mind' ? 14 : 44,
    ranksep: g.kind === 'mind' ? 56 : g.kind === 'er' ? 90 : 64,
    edgesep: 18,
    marginx: 0,
    marginy: 0,
  })
  d.setDefaultEdgeLabel(() => ({}))
  const inside = (id: string) => !only || only.has(id)
  for (const n of g.nodes) {
    if (!inside(n.id)) continue
    if (filled.has(n.id)) d.setNode(n.id, { padding: 24 })
    else d.setNode(n.id, { width: sizes.get(n.id)!.w, height: sizes.get(n.id)!.h })
  }
  for (const n of g.nodes) if (inside(n.id) && n.parent && filled.has(n.parent) && inside(n.parent)) d.setParent(n.id, n.parent)
  g.edges.forEach((e, i) => {
    if (!inside(e.source) || !inside(e.target) || filled.has(e.source) || filled.has(e.target)) return
    if (!d.hasNode(e.source) || !d.hasNode(e.target)) return
    const label = e.label ? { width: textW(e.label, 12) + 18, height: 22, labelpos: 'c' as const } : {}
    d.setEdge(e.source, e.target, label, `e${i}`)
  })
  dagre.layout(d)
  const out = new Map<string, Box>()
  for (const id of d.nodes()) {
    if (filled.has(id)) continue
    const p = d.node(id) as { x: number; y: number; width: number; height: number } | undefined
    if (!p) continue
    out.set(id, { x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height })
  }
  return out
}

/** Mapa mental: os galhos da raiz se dividem pros dois lados. */
function mindLayout(g: Graph, sizes: Map<string, { w: number; h: number }>): Map<string, Box> {
  const root = mindRoot(g)
  const out = new Map<string, Box>()
  if (!root) return out
  const kids = new Map<string, string[]>()
  for (const e of g.edges) kids.set(e.source, [...(kids.get(e.source) ?? []), e.target])
  const reach = new Set<string>([root])
  const walk = (id: string) => {
    for (const k of kids.get(id) ?? []) if (!reach.has(k)) (reach.add(k), walk(k))
  }
  walk(root)
  const first = [...(kids.get(root) ?? []), ...g.nodes.filter((n) => !reach.has(n.id)).map((n) => n.id)]
  const orphanEdges = g.nodes
    .filter((n) => !reach.has(n.id))
    .map((n) => ({ id: `${root}>${n.id}`, source: root, target: n.id, label: '', line: 'solid' as const, arrow: false }))
  const graph: Graph = { ...g, edges: [...g.edges, ...orphanEdges] }
  const sides: Array<['l' | 'r', string[]]> =
    first.length >= 3 ? [['r', first.filter((_, i) => i % 2 === 0)], ['l', first.filter((_, i) => i % 2 === 1)]] : [['r', first]]
  const rs = sizes.get(root)!
  out.set(root, { x: -rs.w / 2, y: -rs.h / 2, w: rs.w, h: rs.h })
  const allKids = new Map<string, string[]>()
  for (const e of graph.edges) allKids.set(e.source, [...(allKids.get(e.source) ?? []), e.target])
  for (const [side, tops] of sides) {
    const set = new Set<string>([root])
    const add = (id: string) => {
      if (set.has(id)) return
      set.add(id)
      for (const k of allKids.get(id) ?? []) add(k)
    }
    tops.forEach(add)
    const boxes = runDagre(graph, sizes, set)
    const r = boxes.get(root)
    if (!r) continue
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    for (const [id, b] of boxes) {
      if (id === root) continue
      const x = b.x + b.w / 2 - cx
      out.set(id, { x: (side === 'l' ? -x : x) - b.w / 2, y: b.y + b.h / 2 - cy - b.h / 2, w: b.w, h: b.h, side })
    }
  }
  return out
}

/** Caixas de todos os nos que nao sao grupo-com-conteudo (esses saem de `groupBoxes`). */
export function computeLayout(g: Graph, saved: Layout): Map<string, Box> {
  const root = g.kind === 'mind' ? mindRoot(g) : undefined
  const sizes = new Map(g.nodes.map((n) => [n.id, nodeSize(n, g, n.id === root)]))
  const auto = g.kind === 'mind' ? mindLayout(g, sizes) : runDagre(g, sizes)
  const placed = [...auto.keys()].filter((id) => saved[id])
  if (!placed.length) return auto
  // deslocamento medio do que a pessoa arrumou (para quem nao tem vizinho arrumado)
  const avg = placed.reduce((a, id) => ({ x: a.x + saved[id].x - auto.get(id)!.x, y: a.y + saved[id].y - auto.get(id)!.y }), { x: 0, y: 0 })
  avg.x /= placed.length
  avg.y /= placed.length
  const neighbors = new Map<string, string[]>()
  for (const e of g.edges) {
    neighbors.set(e.source, [...(neighbors.get(e.source) ?? []), e.target])
    neighbors.set(e.target, [...(neighbors.get(e.target) ?? []), e.source])
  }
  const out = new Map<string, Box>()
  for (const [id, b] of auto) {
    const s = saved[id]
    if (s) {
      out.set(id, { ...b, x: s.x, y: s.y })
      continue
    }
    const nb = neighbors.get(id)?.find((n) => saved[n] && auto.has(n))
    const off = nb ? { x: saved[nb].x - auto.get(nb)!.x, y: saved[nb].y - auto.get(nb)!.y } : avg
    out.set(id, { ...b, x: b.x + off.x, y: b.y + off.y })
  }
  if (g.kind === 'mind' && root) {
    // o lado de cada galho segue onde ele esta em relacao a raiz
    const r = out.get(root)!
    for (const [id, b] of out) if (id !== root) b.side = b.x + b.w / 2 < r.x + r.w / 2 ? 'l' : 'r'
  }
  return out
}

const GROUP_PAD = 18
const GROUP_HEAD = 26

/** Moldura de cada grupo em volta do que tem dentro (inclusive grupos dentro de grupos). */
export function groupBoxes(g: Graph, boxes: Map<string, Box>): Map<string, Box> {
  const filled = filledGroups(g)
  const parent = new Map(g.nodes.map((n) => [n.id, n.parent]))
  const depth = (id: string) => {
    let d = 0
    for (let p = parent.get(id); p && d < 50; p = parent.get(p)) d++
    return d
  }
  const out = new Map<string, Box>()
  for (const id of [...filled].sort((a, b) => depth(b) - depth(a))) {
    const inner = g.nodes.filter((n) => n.parent === id).map((n) => out.get(n.id) ?? boxes.get(n.id))
    const list = inner.filter((b): b is Box => !!b)
    if (!list.length) continue
    const x1 = Math.min(...list.map((b) => b.x)) - GROUP_PAD
    const y1 = Math.min(...list.map((b) => b.y)) - GROUP_PAD - GROUP_HEAD
    const x2 = Math.max(...list.map((b) => b.x + b.w)) + GROUP_PAD
    const y2 = Math.max(...list.map((b) => b.y + b.h)) + GROUP_PAD
    out.set(id, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
  }
  return out
}
