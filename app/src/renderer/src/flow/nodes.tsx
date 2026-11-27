/** Caixas, molduras de grupo e ligacoes do editor visual. */
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  Handle,
  type InternalNode,
  type Node,
  type NodeProps,
  Position,
  useInternalNode,
} from '@xyflow/react'
import { Lock } from 'lucide-react'
import { createContext, memo, useContext, useEffect, useRef, useState } from 'react'
import type { Card, ErAttr, GEdge, GraphKind, Shape } from '@shared/graph'
import { cx } from '../components/ui'
import { ER_HEAD, ER_ROW, TEXT_MAX } from './layout'

export interface Actions {
  editable: boolean
  commit(kind: 'node' | 'edge', id: string, text: string): void
  cancel(): void
}
export const FlowActions = createContext<Actions>({ editable: false, commit: () => {}, cancel: () => {} })

export interface BoxData extends Record<string, unknown> {
  kind: GraphKind
  label: string
  shape: Shape
  locked: boolean
  editing: boolean
  root?: boolean
  fill?: string // cor do galho (mapa mental)
  attrs?: ErAttr[]
  editText?: string // texto inicial do editor (entidade: nome + campos)
}
export type BoxNode = Node<BoxData, 'box' | 'entity' | 'group'>

export interface LinkData extends Record<string, unknown> {
  kind: GraphKind
  label: string
  line: GEdge['line']
  from?: Card
  to?: Card
  editing: boolean
}
export type LinkEdge = Edge<LinkData, 'link'>

// ---------------------------------------------------------------- editor de texto

function Editor({ id, kind, initial, multiline }: { id: string; kind: 'node' | 'edge'; initial: string; multiline?: boolean }) {
  const { commit, cancel } = useContext(FlowActions)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(initial)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (ok: boolean) => {
    if (done.current) return
    done.current = true
    if (ok) commit(kind, id, text)
    else cancel()
  }
  return (
    <textarea
      ref={ref}
      value={text}
      rows={multiline ? Math.max(3, text.split('\n').length) : 1}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') finish(false)
        if (e.key === 'Enter' && (multiline ? e.ctrlKey || e.metaKey : !e.shiftKey)) {
          e.preventDefault()
          finish(true)
        }
      }}
      className={cx(
        'nodrag nopan nowheel resize-none rounded-md border border-accent-500 bg-white px-2 py-1 text-[13px] leading-5 text-zinc-900 shadow-lg outline-none',
        'dark:bg-ink-850 dark:text-zinc-100',
        multiline ? 'w-60 font-mono text-[12px]' : 'w-full min-w-28 text-center',
      )}
    />
  )
}

// ---------------------------------------------------------------- formas

function ShapeBg({ shape, fill, stroke }: { shape: Shape; fill: string; stroke: string }) {
  const common = { fill, stroke, strokeWidth: 1.6, vectorEffect: 'non-scaling-stroke' as const }
  let el: React.ReactNode
  switch (shape) {
    case 'diamond':
      el = <polygon points="50,1 99,50 50,99 1,50" {...common} />
      break
    case 'hexagon':
      el = <polygon points="12,1 88,1 99,50 88,99 12,99 1,50" {...common} />
      break
    case 'lean-r':
      el = <polygon points="12,1 99,1 88,99 1,99" {...common} />
      break
    case 'lean-l':
      el = <polygon points="1,1 88,1 99,99 12,99" {...common} />
      break
    case 'trap':
      el = <polygon points="12,1 88,1 99,99 1,99" {...common} />
      break
    case 'trap-inv':
      el = <polygon points="1,1 99,1 88,99 12,99" {...common} />
      break
    case 'odd':
      el = <polygon points="1,1 99,1 99,99 1,99 12,50" {...common} />
      break
    case 'cylinder':
      el = (
        <>
          <path d="M1,10 C1,-2 99,-2 99,10 L99,90 C99,102 1,102 1,90 Z" {...common} />
          <path d="M1,10 C1,22 99,22 99,10" {...common} fill="none" />
        </>
      )
      break
    case 'cloud':
    case 'bang':
      el = <path d="M20,30 C8,30 4,48 14,56 C4,68 16,88 32,82 C40,98 64,98 70,84 C88,92 100,72 90,60 C100,46 88,28 74,32 C70,12 44,8 38,22 C32,16 22,20 20,30 Z" {...common} />
      break
    default:
      return null
  }
  return (
    <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
      {el}
    </svg>
  )
}

const CSS_SHAPES: Partial<Record<Shape, string>> = {
  rect: 'rounded-[6px]',
  round: 'rounded-[14px]',
  stadium: 'rounded-full',
  plain: 'rounded-full',
  circle: 'rounded-full',
  dcircle: 'rounded-full outline-[1.6px] outline-offset-[3px] outline-[var(--cs-stroke)]',
  subroutine: 'rounded-[4px] border-x-[5px] border-double',
}

function Handles() {
  return (
    <>
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((p) => (
        <Handle key={p} id={p} type="source" position={p} className="cs-handle" />
      ))}
    </>
  )
}

function LockBadge() {
  return (
    <span
      title="Travada: a IA não muda esta caixa"
      className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-amber-400 text-amber-950 shadow ring-2 ring-[var(--cs-bg)]"
    >
      <Lock className="size-3" />
    </span>
  )
}

export const BoxView = memo(function BoxView({ id, data, selected }: NodeProps<BoxNode>) {
  const css = CSS_SHAPES[data.shape]
  const svg = !css
  const fill = data.fill ?? 'var(--cs-fill)'
  const stroke = data.root ? 'var(--cs-accent)' : data.fill ? 'transparent' : 'var(--cs-stroke)'
  return (
    <div className={cx('cs-pop group relative grid size-full place-items-center', selected && 'cs-selected')}>
      {css ? (
        <div className={cx('absolute inset-0 border-[1.6px]', css)} style={{ background: data.root ? 'var(--cs-accent)' : fill, borderColor: stroke }} />
      ) : null}
      {svg && <ShapeBg shape={data.shape} fill={fill} stroke={stroke} />}
      {data.editing ? (
        <div className="relative z-10 px-2">
          <Editor id={id} kind="node" initial={data.label} />
        </div>
      ) : (
        <div
          className={cx(
            'relative whitespace-pre-wrap break-words px-3 text-center leading-5',
            data.root ? 'text-[16px] font-[650] text-white' : 'text-[14px] font-medium text-[var(--cs-text)]',
          )}
          style={{ maxWidth: TEXT_MAX + 24 }}
        >
          {data.label}
        </div>
      )}
      {data.locked && <LockBadge />}
      <Handles />
    </div>
  )
})

export const EntityView = memo(function EntityView({ id, data, selected }: NodeProps<BoxNode>) {
  return (
    <div
      className={cx(
        'cs-pop relative size-full overflow-visible rounded-lg border-[1.6px] border-[var(--cs-stroke)] bg-[var(--cs-bg)] text-[var(--cs-text)]',
        selected && 'cs-selected',
      )}
    >
      <div className="flex items-center justify-center rounded-t-[6px] bg-[var(--cs-fill)] px-3 text-[14px] font-[650]" style={{ height: ER_HEAD }}>
        {data.label}
      </div>
      {!!data.attrs?.length && (
        <div className="border-t border-[var(--cs-line)] py-1">
          {data.attrs.map((a, i) => (
            <div key={i} className="flex items-center gap-2 px-3" style={{ height: ER_ROW }}>
              <span className="text-[12px] text-[var(--cs-muted)]">{a.type}</span>
              <span className="flex-1 text-[13px]">{a.name}</span>
              {!!a.keys.length && <span className="text-[11px] font-semibold text-[var(--cs-accent)]">{a.keys.join(',')}</span>}
            </div>
          ))}
        </div>
      )}
      {data.editing && (
        <div className="absolute left-1/2 top-1 z-10 -translate-x-1/2">
          <Editor id={id} kind="node" initial={data.editText ?? data.label} multiline />
          <p className="mt-1 w-60 text-[11px] text-[var(--cs-muted)]">Nome na 1ª linha, um campo por linha (tipo nome PK). Ctrl+Enter salva.</p>
        </div>
      )}
      {data.locked && <LockBadge />}
      <Handles />
    </div>
  )
})

export const GroupView = memo(function GroupView({ id, data, selected }: NodeProps<BoxNode>) {
  return (
    <div
      className={cx(
        'relative size-full rounded-xl border-[1.6px] border-dashed border-[var(--cs-line)] bg-[var(--cs-group)]',
        selected && 'cs-selected',
      )}
    >
      <div className="absolute left-3 top-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--cs-muted)]">
        {data.editing ? <Editor id={id} kind="node" initial={data.label} /> : data.label}
      </div>
      {data.locked && <LockBadge />}
      <Handles />
    </div>
  )
})

// ---------------------------------------------------------------- ligacoes

/** Lados de saida e chegada pela posicao relativa das caixas (as ligacoes seguem a caixa arrastada). */
function ends(s: InternalNode, t: InternalNode, horizontal: boolean) {
  const sw = s.measured.width ?? 0
  const sh = s.measured.height ?? 0
  const tw = t.measured.width ?? 0
  const th = t.measured.height ?? 0
  const sc = { x: s.internals.positionAbsolute.x + sw / 2, y: s.internals.positionAbsolute.y + sh / 2 }
  const tc = { x: t.internals.positionAbsolute.x + tw / 2, y: t.internals.positionAbsolute.y + th / 2 }
  const dx = tc.x - sc.x
  const dy = tc.y - sc.y
  // horizontal quando as caixas estao mais lado a lado do que uma em cima da outra
  const horiz = horizontal || Math.abs(dx) - (sw + tw) / 4 > Math.abs(dy) - (sh + th) / 4
  if (horiz) {
    const right = dx >= 0
    return {
      sx: sc.x + (right ? sw / 2 : -sw / 2),
      sy: sc.y,
      tx: tc.x + (right ? -tw / 2 : tw / 2),
      ty: tc.y,
      sp: right ? Position.Right : Position.Left,
      tp: right ? Position.Left : Position.Right,
    }
  }
  const down = dy >= 0
  return {
    sx: sc.x,
    sy: sc.y + (down ? sh / 2 : -sh / 2),
    tx: tc.x,
    ty: tc.y + (down ? -th / 2 : th / 2),
    sp: down ? Position.Bottom : Position.Top,
    tp: down ? Position.Top : Position.Bottom,
  }
}

const CARD_TEXT: Record<Card, string> = { one: '1', 'zero-one': '0..1', many: '1..N', 'zero-many': '0..N' }

function cardAt(x: number, y: number, side: Position): { left: number; top: number } {
  const o = 16
  if (side === Position.Right) return { left: x + o, top: y - 12 }
  if (side === Position.Left) return { left: x - o, top: y - 12 }
  if (side === Position.Bottom) return { left: x + 14, top: y + o }
  return { left: x + 14, top: y - o }
}

export const LinkView = memo(function LinkView({ id, source, target, data, markerEnd, selected }: EdgeProps<LinkEdge>) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  const { editable } = useContext(FlowActions)
  if (!s || !t || !data) return null
  const e = ends(s, t, data.kind === 'mind')
  const args = { sourceX: e.sx, sourceY: e.sy, sourcePosition: e.sp, targetX: e.tx, targetY: e.ty, targetPosition: e.tp }
  const [path, lx, ly] = data.kind === 'mind' ? getBezierPath(args) : getSmoothStepPath({ ...args, borderRadius: 14, offset: 18 })
  const style = {
    stroke: selected ? 'var(--cs-accent)' : 'var(--cs-edge)',
    strokeWidth: data.line === 'thick' ? 3 : data.kind === 'mind' ? 2 : 1.6,
    strokeDasharray: data.line === 'dotted' ? '6 5' : undefined,
  }
  const showLabel = data.editing || !!data.label
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={18} />
      {(showLabel || data.from) && (
        <EdgeLabelRenderer>
          {showLabel && (
            <div
              className={cx(
                'cs-edge-label nopan absolute rounded-md px-1.5 py-0.5 text-[12px] font-medium',
                data.editing ? 'z-20' : 'bg-[var(--cs-bg)] text-[var(--cs-muted)]',
                editable && 'pointer-events-auto cursor-text',
              )}
              style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
              data-edge={id}
            >
              {data.editing ? <Editor id={id} kind="edge" initial={data.label} /> : data.label}
            </div>
          )}
          {data.from && data.to && (
            <>
              <span className="cs-card absolute text-[11px] font-semibold text-[var(--cs-muted)]" style={{ ...cardAt(e.sx, e.sy, e.sp), transform: 'translate(-50%, -50%)' }}>
                {CARD_TEXT[data.from]}
              </span>
              <span className="cs-card absolute text-[11px] font-semibold text-[var(--cs-muted)]" style={{ ...cardAt(e.tx, e.ty, e.tp), transform: 'translate(-50%, -50%)' }}>
                {CARD_TEXT[data.to]}
              </span>
            </>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  )
})
