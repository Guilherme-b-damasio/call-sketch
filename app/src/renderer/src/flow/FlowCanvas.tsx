/**
 * Editor visual (React Flow) para fluxograma, mapa mental e diagrama de dados. Arrastar, duplo
 * clique pra editar ou criar, puxar das bolinhas pra ligar, Del apaga, Ctrl+Z desfaz, travar.
 * Cada edicao vira Mermaid de novo e vai pro processo principal, que e o que a IA ve.
 */
import '@xyflow/react/dist/base.css'
import {
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  type EdgeChangeset,
  MarkerType,
  type NodeChangeset,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesStore,
  useViewport,
} from '@xyflow/react'
import { Check as CheckIcon, Copy, Download, LockKeyhole, Maximize, Plus, Undo2, Wand2, ZoomIn, ZoomOut } from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addNode,
  connect,
  type Doc,
  erText,
  type Graph,
  mindRoot,
  removeItems,
  renameNode,
  setEdgeLabel,
  toggleLock,
  toMermaid,
} from '@shared/graph'
import type { Layout } from '@shared/types'
import { cx, IconButton } from '../components/ui'
import { PALETTE, renderDiagram } from '../mermaid'
import { type Box, computeLayout, groupBoxes } from './layout'
import { type Actions, type BoxNode, BoxView, EntityView, FlowActions, GroupView, type LinkEdge, LinkView } from './nodes'

export interface FlowCanvasProps {
  graph: Graph
  code: string
  layout: Layout
  locked: string[]
  tabId: string
  editable: boolean
  compact: boolean
  dark: boolean
  fileName: string
}

const nodeTypes = { box: BoxView, entity: EntityView, group: GroupView }
const edgeTypes = { link: LinkView }

function themeVars(dark: boolean): CSSProperties {
  const v = dark
    ? {
        bg: '#0e0e12',
        fill: '#1d1a2e',
        stroke: '#8b5cf6',
        accent: '#8b5cf6',
        text: '#ececf1',
        muted: '#a1a1aa',
        line: '#30303b',
        edge: '#7c7c8a',
        group: 'rgb(18 18 24 / 0.55)',
      }
    : {
        bg: '#ffffff',
        fill: '#f5f3ff',
        stroke: '#7c3aed',
        accent: '#7c3aed',
        text: '#18181b',
        muted: '#71717a',
        line: '#d4d4d8',
        edge: '#71717a',
        group: 'rgb(250 250 250 / 0.7)',
      }
  return Object.fromEntries(Object.entries(v).map(([k, c]) => [`--cs-${k}`, c])) as CSSProperties
}

const roundLayout = (l: Layout): Layout =>
  Object.fromEntries(Object.entries(l).map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }]))

/** Folga em volta do desenho ao enquadrar (embaixo fica a barra de ferramentas). */
const FIT_PAD = { top: '64px', right: '48px', bottom: '80px', left: '48px' } as const

type Editing = { kind: 'node' | 'edge'; id: string } | null

function buildNodes(doc: Doc, boxes: Map<string, Box>, groups: Map<string, Box>, editing: Editing, prev: Map<string, BoxNode>, editable: boolean, dark: boolean): BoxNode[] {
  const g = doc.graph
  const root = g.kind === 'mind' ? mindRoot(g) : undefined
  const locked = new Set(doc.locked)
  const scale = (dark ? PALETTE.dark : PALETTE.light).scale
  const out: BoxNode[] = []
  const push = (n: Graph['nodes'][number], b: Box, type: BoxNode['type'], zIndex = 0) =>
    out.push({
      id: n.id,
      type,
      position: { x: b.x, y: b.y },
      width: b.w,
      height: b.h,
      zIndex,
      selected: prev.get(n.id)?.selected ?? false,
      draggable: editable,
      selectable: editable,
      data: {
        kind: g.kind,
        label: n.label,
        shape: n.shape,
        locked: locked.has(n.id),
        editing: editing?.kind === 'node' && editing.id === n.id,
        root: n.id === root,
        fill: g.kind === 'mind' && n.id !== root ? scale[(n.section ?? 0) % scale.length] : undefined,
        attrs: n.attrs,
        editText: g.kind === 'er' ? erText(n) : undefined,
      },
    })
  for (const n of g.nodes) {
    const b = groups.get(n.id)
    if (b) push(n, b, 'group', -1) // molduras primeiro: ficam atras
  }
  for (const n of g.nodes) {
    if (groups.has(n.id)) continue
    const b = boxes.get(n.id)
    if (b) push(n, b, n.group ? 'group' : g.kind === 'er' ? 'entity' : 'box')
  }
  return out
}

function buildEdges(doc: Doc, editing: Editing, prev: Map<string, LinkEdge>, dark: boolean): LinkEdge[] {
  const ids = new Set(doc.graph.nodes.map((n) => n.id))
  return doc.graph.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      id: e.id,
      type: 'link' as const,
      source: e.source,
      target: e.target,
      selected: prev.get(e.id)?.selected ?? false,
      markerEnd: e.arrow ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: dark ? '#7c7c8a' : '#71717a' } : undefined,
      data: {
        kind: doc.graph.kind,
        label: e.label,
        line: e.line,
        from: e.from,
        to: e.to,
        editing: editing?.kind === 'edge' && editing.id === e.id,
      },
    }))
}

/** Recalcula a moldura dos grupos depois que as caixas de dentro andaram. */
function regroup(graph: Graph, nodes: BoxNode[], filled: Set<string>): BoxNode[] {
  if (!filled.size) return nodes
  const boxes = new Map<string, Box>()
  for (const n of nodes) if (!filled.has(n.id)) boxes.set(n.id, { x: n.position.x, y: n.position.y, w: n.width ?? 0, h: n.height ?? 0 })
  const groups = groupBoxes(graph, boxes)
  return nodes.map((n) => {
    const b = groups.get(n.id)
    if (!b || (b.x === n.position.x && b.y === n.position.y && b.w === n.width && b.h === n.height)) return n
    return { ...n, position: { x: b.x, y: b.y }, width: b.w, height: b.h }
  })
}

/** Quantas caixas ja foram medidas na tela (muda quando as novas terminam de medir). */
function countMeasured(s: { nodeLookup: Map<string, { measured: { width?: number } }> }): number {
  let n = 0
  for (const node of s.nodeLookup.values()) if (node.measured.width) n++
  return n
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

function Inner(p: FlowCanvasProps) {
  const rf = useReactFlow<BoxNode, LinkEdge>()
  const { zoom } = useViewport()
  const [doc, setDoc] = useState<Doc>(() => ({ graph: p.graph, layout: p.layout ?? {}, locked: p.locked ?? [] }))
  const [editing, setEditing] = useState<Editing>(null)
  const [nodes, setNodes] = useState<BoxNode[]>([])
  const [edges, setEdges] = useState<LinkEdge[]>([])
  const [copied, setCopied] = useState(false)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const docRef = useRef(doc)
  docRef.current = doc
  // `sent`: o ultimo que eu mandei (o eco dele nao e novidade); `seen`: o ultimo que veio de fora
  const sent = useRef({ code: p.code, layout: JSON.stringify(p.layout ?? {}), locked: JSON.stringify(p.locked ?? []) })
  const seen = useRef(sent.current)
  const history = useRef<Doc[]>([])
  const userMoved = useRef(false)
  const fitPending = useRef<'now' | 'smooth' | null>('now')
  const box = useRef<HTMLDivElement>(null)

  // desenho novo de fora (IA, troca de aba, quem compartilha a sessao arrumou as caixas). Estado
  // velho que chega antes do eco de uma edicao (ex: mudou so o "ouvindo") e igual ao `seen`: ignora.
  useEffect(() => {
    const key = { code: p.code, layout: JSON.stringify(p.layout ?? {}), locked: JSON.stringify(p.locked ?? []) }
    const same = (a: typeof key) => key.code === a.code && key.layout === a.layout && key.locked === a.locked
    if (same(seen.current)) return
    seen.current = key
    if (same(sent.current)) return
    sent.current = key
    setEditing(null)
    setDoc({ graph: p.graph, layout: p.layout ?? {}, locked: p.locked ?? [] })
    if (!userMoved.current) fitPending.current = 'smooth'
  }, [p.graph, p.code, p.layout, p.locked])

  const boxes = useMemo(() => computeLayout(doc.graph, doc.layout), [doc.graph, doc.layout])
  const groups = useMemo(() => groupBoxes(doc.graph, boxes), [doc.graph, boxes])
  const filledRef = useRef(new Set<string>())
  filledRef.current = new Set(groups.keys())

  useEffect(() => {
    setNodes(buildNodes(doc, boxes, groups, editing, new Map(nodesRef.current.map((n) => [n.id, n])), p.editable, p.dark))
    setEdges((prev) => buildEdges(doc, editing, new Map(prev.map((e) => [e.id, e])), p.dark))
  }, [doc, boxes, groups, editing, p.editable, p.dark])

  const fit = useCallback(
    (duration = 250) => {
      userMoved.current = false
      requestAnimationFrame(() => void rf.fitView({ padding: FIT_PAD, maxZoom: 1.6, duration }))
    },
    [rf],
  )

  // enquadra so depois que todas as caixas da tela foram medidas (senao corta as novas)
  const measured = useNodesStore(countMeasured)
  useEffect(() => {
    if (!fitPending.current || !nodes.length || measured < nodes.length) return
    if (!nodes.every((n) => rf.getInternalNode(n.id)?.measured.width)) return
    const mode = fitPending.current
    fitPending.current = null
    fit(mode === 'now' ? 0 : 300)
  }, [nodes, measured, fit, rf])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => !userMoved.current && fit(0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  // ------------------------------------------------------------ edicao

  const send = useCallback(
    (d: Doc, withCode: boolean) => {
      const layout = roundLayout(d.layout)
      const code = withCode ? toMermaid(d.graph) : sent.current.code
      sent.current = { code, layout: JSON.stringify(layout), locked: JSON.stringify(d.locked) }
      void window.api?.editDiagram({ tabId: p.tabId, mermaid: withCode ? code : undefined, layout, locked: d.locked })
    },
    [p.tabId],
  )

  /** Posicao atual de todas as caixas (para congelar o que esta na tela). */
  const positions = (): Layout =>
    Object.fromEntries(nodesRef.current.filter((n) => !filledRef.current.has(n.id)).map((n) => [n.id, n.position]))

  /** `freeze`: guarda onde tudo esta agora (senao o dagre rearruma o resto em volta da mudanca). */
  const edit = useCallback(
    (fn: (d: Doc) => Doc, freeze = false, withCode = true) => {
      const cur = docRef.current
      const base = freeze ? { ...cur, layout: { ...cur.layout, ...positions() } } : cur
      const next = fn(base)
      if (next === base && !freeze) return
      history.current = [...history.current.slice(-49), cur]
      docRef.current = next
      setDoc(next)
      send(next, withCode)
    },
    [send],
  )

  const undo = useCallback(() => {
    const prev = history.current.pop()
    if (!prev) return
    setEditing(null)
    docRef.current = prev
    setDoc(prev)
    send(prev, true)
  }, [send])

  const addAt = useCallback(
    (at: { x: number; y: number }) => {
      let id = ''
      const sel = nodesRef.current.find((n) => n.selected)?.id
      edit((d) => {
        const [next, nid] = addNode(d, { x: at.x - 60, y: at.y - 20 }, sel)
        id = nid
        return next
      }, true)
      setEditing({ kind: 'node', id })
    },
    [edit],
  )

  const actions = useMemo<Actions>(
    () => ({
      editable: p.editable,
      cancel: () => setEditing(null),
      commit: (kind, id, text) => {
        setEditing(null)
        const g = docRef.current.graph
        if (kind === 'node') {
          const n = g.nodes.find((x) => x.id === id)
          const before = n ? (g.kind === 'er' ? erText(n) : n.label) : ''
          if (!n || text.trim() === before.trim()) return
          edit((d) => renameNode(d, id, text))
        } else {
          const e = g.edges.find((x) => x.id === id)
          if (!e || text.trim() === e.label) return
          edit((d) => setEdgeLabel(d, id, text))
        }
      },
    }),
    [p.editable, edit],
  )

  const onNodesChange = useCallback(
    (changes: NodeChangeset<BoxNode>) => {
      for (const c of changes.getByType('remove')) changes.remove(c) // apagar passa pelo onDelete
      const filled = filledRef.current
      if (filled.size) {
        // arrastar a moldura de um grupo leva o que tem dentro
        const byId = new Map(nodesRef.current.map((n) => [n.id, n]))
        const moving = new Set(changes.getByType('position').map((c) => c.id))
        const parent = new Map(docRef.current.graph.nodes.map((n) => [n.id, n.parent]))
        const inside = (id: string, g: string) => {
          for (let q = parent.get(id), i = 0; q && i < 50; q = parent.get(q), i++) if (q === g) return true
          return false
        }
        for (const c of changes.getByType('position')) {
          const grp = byId.get(c.id)
          if (!grp || !filled.has(grp.id) || !c.position) continue
          const dx = c.position.x - grp.position.x
          const dy = c.position.y - grp.position.y
          for (const n of nodesRef.current) {
            if (filled.has(n.id) || moving.has(n.id) || !inside(n.id, grp.id)) continue
            changes.add({ type: 'position', id: n.id, position: { x: n.position.x + dx, y: n.position.y + dy }, dragging: c.dragging })
          }
        }
      }
      setNodes((ns) => regroup(docRef.current.graph, changes.applyTo(ns), filled))
    },
    [],
  )

  const onEdgesChange = useCallback((changes: EdgeChangeset<LinkEdge>) => {
    for (const c of changes.getByType('remove')) changes.remove(c)
    setEdges((es) => changes.applyTo(es))
  }, [])

  const onDragStop = useCallback(() => edit((d) => d, true, false), [edit])

  const onConnect = useCallback((c: Connection) => edit((d) => connect(d, c.source, c.target)), [edit])

  const onDelete = useCallback(
    ({ nodes: ns, edges: es }: { nodes: BoxNode[]; edges: LinkEdge[] }) =>
      edit((d) => removeItems(d, ns.map((n) => n.id), es.map((e) => e.id))),
    [edit],
  )

  const onDoubleClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement
    const label = el.closest<HTMLElement>('[data-edge]')
    if (label) {
      if (p.editable && doc.graph.kind !== 'mind') setEditing({ kind: 'edge', id: label.dataset.edge! })
      return
    }
    if (!el.classList.contains('react-flow__pane')) return
    if (!p.editable) return fit()
    addAt(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  useEffect(() => {
    if (!p.editable) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTyping(e.target)) {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.editable, undo])

  const selected = nodes.filter((n) => n.selected).map((n) => n.id)
  const allLocked = selected.length > 0 && selected.every((id) => doc.locked.includes(id))

  const addCenter = () => {
    const r = box.current!.getBoundingClientRect()
    addAt(rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))
  }

  const reorganize = () => {
    fitPending.current = 'smooth'
    edit((d) => ({ ...d, layout: {} }), false, false)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(sent.current.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const saveSvg = async () => {
    const { svg } = await renderDiagram(sent.current.code, p.dark)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    Object.assign(document.createElement('a'), { href: url, download: `${p.fileName}.svg` }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <FlowActions.Provider value={actions}>
      <div ref={box} className={cx('cs-flow absolute inset-0', p.editable && 'editable')} style={themeVars(p.dark)} onDoubleClick={onDoubleClick}>
        <ReactFlow<BoxNode, LinkEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onDragStop}
          onConnect={onConnect}
          onDelete={onDelete}
          onNodeDoubleClick={(_, n) => p.editable && setEditing({ kind: 'node', id: n.id })}
          onEdgeDoubleClick={(_, e) => p.editable && doc.graph.kind !== 'mind' && setEditing({ kind: 'edge', id: e.id })}
          onMoveStart={(e) => {
            if (e) userMoved.current = true
          }}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={p.editable}
          nodesConnectable={p.editable}
          elementsSelectable={p.editable}
          deleteKeyCode={p.editable ? ['Delete', 'Backspace'] : null}
          zoomOnDoubleClick={false}
          elevateNodesOnSelect={false}
          minZoom={0.15}
          maxZoom={4}
          attributionPosition="top-right"
        >
          {!p.compact && <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="rgb(127 127 140 / 0.35)" />}
        </ReactFlow>

        {!p.compact && (
          <div
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 right-4 z-10 flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white/85 p-1 shadow-lg shadow-black/5 backdrop-blur dark:border-white/8 dark:bg-ink-850/85 dark:shadow-black/40"
          >
            <IconButton label="Diminuir" onClick={() => void rf.zoomOut({ duration: 150 })}>
              <ZoomOut className="size-4" />
            </IconButton>
            <button
              type="button"
              onClick={() => fit()}
              title="Enquadrar"
              className="w-12 text-center text-xs font-medium tabular-nums text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="Aumentar" onClick={() => void rf.zoomIn({ duration: 150 })}>
              <ZoomIn className="size-4" />
            </IconButton>
            <IconButton label="Enquadrar" onClick={() => fit()}>
              <Maximize className="size-4" />
            </IconButton>
            {p.editable && (
              <>
                <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-white/10" />
                <IconButton label={doc.graph.kind === 'er' ? 'Nova entidade' : doc.graph.kind === 'mind' ? 'Nova ideia' : 'Nova caixa'} onClick={addCenter}>
                  <Plus className="size-4" />
                </IconButton>
                <IconButton
                  label={allLocked ? 'Destravar (a IA volta a poder mudar)' : 'Travar o selecionado (a IA não muda)'}
                  active={allLocked}
                  disabled={!selected.length}
                  onClick={() => edit((d) => toggleLock(d, selected), false, false)}
                >
                  <LockKeyhole className="size-4" />
                </IconButton>
                <IconButton label="Reorganizar tudo" onClick={reorganize}>
                  <Wand2 className="size-4" />
                </IconButton>
                <IconButton label="Desfazer" shortcut="Ctrl+Z" disabled={!history.current.length} onClick={undo}>
                  <Undo2 className="size-4" />
                </IconButton>
              </>
            )}
            <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-white/10" />
            <IconButton label="Copiar código Mermaid" onClick={() => void copy()}>
              {copied ? <CheckIcon className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            </IconButton>
            <IconButton label="Salvar SVG" onClick={() => void saveSvg()}>
              <Download className="size-4" />
            </IconButton>
          </div>
        )}

        {p.editable && !p.compact && (
          <p className="pointer-events-none absolute bottom-5 left-4 z-10 hidden text-[11px] text-zinc-400 lg:block dark:text-zinc-500">
            Duplo clique edita ou cria · puxe das bolinhas para ligar · Del apaga · Ctrl+Z desfaz
          </p>
        )}
      </div>
    </FlowActions.Provider>
  )
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  )
}
