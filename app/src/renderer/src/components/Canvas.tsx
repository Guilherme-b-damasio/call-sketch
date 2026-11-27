import { Check as CheckIcon, Copy, Download, Maximize, Mic, Settings, ZoomIn, ZoomOut } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Graph } from '@shared/graph'
import type { AppState } from '@shared/types'
import { parseGraph } from '../flow/parse'
import { useDark } from '../hooks'
import { preload, renderDiagram } from '../mermaid'
import { cx, IconButton, ModeIcon, SoundBars } from './ui'

const FlowCanvas = lazy(() => import('../flow/FlowCanvas').then((m) => ({ default: m.FlowCanvas })))

interface View {
  x: number
  y: number
  k: number
}

const PAD = 48
const MAX_FIT = 1.6

/** Texto do estado vazio quando quem usa nao e o app que escuta (ex: quem assiste uma sessao). */
export interface EmptyText {
  title: string
  detail?: string
  waiting?: boolean // mostra o "pulso" de esperando desenho
}

interface CanvasProps {
  state: AppState
  modeName?: string
  onSettings?: () => void
  compact?: boolean
  empty?: EmptyText
  /** Erro de sintaxe do diagrama; no app vai pro Claude corrigir. */
  onRenderError?: (error: string) => void
}

const reportToApp = (error: string) => void window.api?.renderError(error)

/**
 * Area do diagrama. Fluxograma, mapa mental e diagrama de dados abrem no editor visual (caixas que
 * da pra arrastar e editar); os outros tipos sao desenhados pelo mermaid, com zoom e arrastar.
 */
export function Canvas({ state, modeName, onSettings, compact = false, empty, onRenderError = reportToApp }: CanvasProps) {
  const dark = useDark()
  const [parsed, setParsed] = useState<{ code: string; graph: Graph | null } | null>(null)
  const [svgShown, setSvgShown] = useState(false)

  useEffect(preload, [])

  useEffect(() => {
    if (!state.mermaid) {
      setParsed(null)
      return
    }
    let alive = true
    void parseGraph(state.mermaid).then((graph) => alive && setParsed({ code: state.mermaid, graph }))
    return () => {
      alive = false
    }
  }, [state.mermaid])

  const graph = state.mermaid && parsed?.graph ? parsed.graph : null
  const shown = !!graph || svgShown
  const editable = !compact && !!window.api?.editDiagram
  const fileName = `call-sketch-${state.activeMode || 'diagrama'}`

  return (
    <div className={cx('relative h-full w-full overflow-hidden', !compact && !graph && 'dot-grid')}>
      {graph && parsed ? (
        <Suspense fallback={null}>
          <FlowCanvas
            key={state.activeTab || 'view'}
            graph={graph}
            code={parsed.code}
            layout={state.layout ?? {}}
            locked={state.locked ?? []}
            tabId={state.activeTab}
            editable={editable}
            compact={compact}
            dark={dark}
            fileName={fileName}
          />
        </Suspense>
      ) : (
        <SvgStage
          code={state.mermaid && parsed && !parsed.graph ? parsed.code : ''}
          version={state.version}
          dark={dark}
          compact={compact}
          fileName={fileName}
          onShown={setSvgShown}
          onRenderError={onRenderError}
        />
      )}

      <AnimatePresence>{!shown && <EmptyState state={state} onSettings={onSettings} compact={compact} override={empty} />}</AnimatePresence>

      {!compact && state.activeMode && shown && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-zinc-600 backdrop-blur dark:border-white/8 dark:bg-ink-900/70 dark:text-zinc-300">
          <ModeIcon id={state.activeMode} className="size-3.5 text-accent-500" />
          <span>{modeName ?? state.activeMode}</span>
        </div>
      )}

      <AnimatePresence>
        {state.renderError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-4 left-4 z-10 rounded-lg bg-amber-500/12 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"
          >
            Diagrama com erro de sintaxe, pedindo correção…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Desenho do mermaid (sequencia, cronograma...): renderiza, faz transicao entre versoes, zoom e arrastar. */
function SvgStage({
  code,
  version,
  dark,
  compact,
  fileName,
  onShown,
  onRenderError,
}: {
  code: string
  version: number
  dark: boolean
  compact: boolean
  fileName: string
  onShown: (shown: boolean) => void
  onRenderError: (error: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const view = useRef<View>({ x: 0, y: 0, k: 1 })
  const userMoved = useRef(false)
  const [layer, setLayer] = useState<{ key: string; html: string; w: number; h: number } | null>(null)
  const size = useRef({ w: 1, h: 1 })
  const [zoom, setZoom] = useState(100)
  const [copied, setCopied] = useState(false)

  useEffect(() => onShown(!!layer), [layer, onShown])
  useEffect(() => () => onShown(false), [onShown])

  const apply = useCallback(() => {
    const { x, y, k } = view.current
    if (stageRef.current) stageRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`
    setZoom(Math.round(k * 100))
  }, [])

  const fit = useCallback(() => {
    const box = boxRef.current
    if (!box || !box.clientWidth) return
    const { w, h } = size.current
    const k = Math.min((box.clientWidth - PAD * 2) / w, (box.clientHeight - PAD * 2) / h, MAX_FIT)
    view.current = { k, x: (box.clientWidth - w * k) / 2, y: (box.clientHeight - h * k) / 2 }
    userMoved.current = false
    apply()
  }, [apply])

  // renderiza quando muda a versao ou o tema
  useEffect(() => {
    if (!code) {
      setLayer(null)
      return
    }
    let alive = true
    renderDiagram(code, dark)
      .then((r) => alive && setLayer({ key: `${version}-${dark}`, html: r.svg, w: r.w, h: r.h }))
      .catch((e: unknown) => {
        if (alive) onRenderError(String(e instanceof Error ? e.message : e).slice(0, 500))
      })
    return () => {
      alive = false
    }
  }, [version, code, dark, onRenderError])

  // enquadra o diagrama novo (a nao ser que a pessoa tenha mexido no zoom)
  useLayoutEffect(() => {
    if (!layer) return
    size.current = { w: layer.w, h: layer.h }
    if (!userMoved.current) fit()
  }, [layer, fit])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(() => !userMoved.current && fit())
    ro.observe(box)
    return () => ro.disconnect()
  }, [fit])

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const v = view.current
    const k = Math.min(Math.max(v.k * factor, 0.15), 6)
    view.current = { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k }
    userMoved.current = true
    apply()
  }

  const onWheel = (e: React.WheelEvent) => {
    const r = boxRef.current!.getBoundingClientRect()
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !layer) return
    const start = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
    const move = (ev: PointerEvent) => {
      view.current = { ...view.current, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y }
      userMoved.current = true
      apply()
    }
    const up = () => {
      el.style.cursor = ''
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const zoomCenter = (factor: number) => {
    const box = boxRef.current!
    zoomAt(factor, box.clientWidth / 2, box.clientHeight / 2)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const saveSvg = () => {
    if (!layer) return
    const url = URL.createObjectURL(new Blob([layer.html], { type: 'image/svg+xml' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${fileName}.svg` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div
      ref={boxRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onDoubleClick={fit}
      className={cx('absolute inset-0 overflow-hidden', layer && 'cursor-grab')}
    >
      <div ref={stageRef} className="absolute left-0 top-0 origin-top-left will-change-transform">
        <AnimatePresence initial={false}>
          {layer && (
            <motion.div
              key={layer.key}
              className="diagram absolute left-0 top-0"
              initial={{ opacity: 0, scale: 0.985, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
              dangerouslySetInnerHTML={{ __html: layer.html }}
            />
          )}
        </AnimatePresence>
      </div>

      {layer && !compact && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white/85 p-1 shadow-lg shadow-black/5 backdrop-blur dark:border-white/8 dark:bg-ink-850/85 dark:shadow-black/40"
        >
          <IconButton label="Diminuir" onClick={() => zoomCenter(1 / 1.2)}>
            <ZoomOut className="size-4" />
          </IconButton>
          <button
            type="button"
            onClick={fit}
            title="Enquadrar (duplo clique)"
            className="w-12 text-center text-xs font-medium tabular-nums text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            {zoom}%
          </button>
          <IconButton label="Aumentar" onClick={() => zoomCenter(1.2)}>
            <ZoomIn className="size-4" />
          </IconButton>
          <IconButton label="Enquadrar" onClick={fit}>
            <Maximize className="size-4" />
          </IconButton>
          <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-white/10" />
          <IconButton label="Copiar código Mermaid" onClick={() => void copy()}>
            {copied ? <CheckIcon className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
          </IconButton>
          <IconButton label="Salvar SVG" onClick={saveSvg}>
            <Download className="size-4" />
          </IconButton>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  state,
  onSettings,
  compact,
  override,
}: {
  state: AppState
  onSettings?: () => void
  compact: boolean
  override?: EmptyText
}) {
  const { engine } = state
  let title: string
  let detail: string | undefined
  let icon: React.ReactNode
  let action: React.ReactNode = null

  if (override) {
    title = override.title
    detail = override.detail
    icon = override.waiting ? (
      <SoundBars className="!h-6 [&>span]:!w-[5px]" />
    ) : (
      <span className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
    )
  } else if (engine.state === 'error') {
    title = 'O motor de áudio parou'
    detail = engine.msg
    icon = <Mic className="size-6" />
    action = onSettings && (
      <button
        type="button"
        onClick={onSettings}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <Settings className="size-3.5" /> Configurações
      </button>
    )
  } else if (engine.state !== 'ready') {
    title = 'Preparando a escuta'
    detail = engine.msg
    icon = <span className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
  } else {
    title = state.paused ? 'Pausado' : 'Falem aí que eu desenho'
    detail = state.paused
      ? 'Continue quando quiser (Ctrl+Shift+P).'
      : 'Converse normalmente. O diagrama aparece aqui conforme o assunto toma forma.'
    icon = <SoundBars active={!state.paused} className="!h-6 [&>span]:!w-[5px]" />
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 grid place-items-center p-6"
    >
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="relative grid size-16 place-items-center rounded-2xl bg-accent-500/10 text-accent-600 dark:text-accent-300">
          {(override ? override.waiting : engine.state === 'ready' && !state.paused) && (
            <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-accent-500/25" />
          )}
          {icon}
        </div>
        <div className={cx('font-semibold tracking-tight', compact ? 'text-sm' : 'text-lg')}>{title}</div>
        {detail && !compact && <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{detail}</p>}
        {action}
      </div>
    </motion.div>
  )
}
