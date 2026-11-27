/** Pagina de quem assiste uma sessao: no navegador ou numa janela do app. So recebe o desenho. */
import { AppWindow, Maximize2, PencilLine, PictureInPicture2, Radio, WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AUTO, type AppState, type ShareView } from '@shared/types'
import { Canvas, type EmptyText } from './Canvas'
import { LogoMark } from './Logo'
import { cx, ModeIcon, SoundBars } from './ui'

type Link = 'connecting' | 'live' | 'lost' | 'ended'

const insideApp = new URLSearchParams(location.search).has('app')
const noop = () => {}

interface StateReply {
  seq: number
  view: ShareView | null
  ended: boolean
}

const viewerId = Math.random().toString(36).slice(2, 12) // so pra contar quem esta assistindo

/** No app: o preload da janela de quem assiste so sabe deixar a janela pequena e por cima. */
interface ViewerBridge {
  setFloating(on: boolean): Promise<boolean>
}
const bridge = (window as unknown as { callSketchViewer?: ViewerBridge }).callSketchViewer

/** No navegador: Document Picture-in-Picture (Chrome e Edge no computador). */
interface DocumentPiP {
  requestWindow(opts: { width: number; height: number }): Promise<Window>
}
const docPip = (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture

/** Abre uma janela flutuante do navegador com o mesmo visual da pagina; devolve onde desenhar. */
async function openPip(onClose: () => void): Promise<{ win: Window; host: HTMLElement }> {
  const win = await docPip!.requestWindow({ width: 520, height: 360 })
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) win.document.head.append(node.cloneNode(true))
  win.document.title = document.title
  const host = win.document.createElement('div')
  win.document.body.append(host)
  win.addEventListener('pagehide', onClose, { once: true })
  return { win, host }
}

/** Flutuar: no app a propria janela vira mini e fica por cima; no navegador abre a janelinha do PiP. */
function useFloat() {
  const [appFloating, setAppFloating] = useState(false)
  const [pip, setPip] = useState<{ win: Window; host: HTMLElement } | null>(null)
  const canFloat = !!bridge || !!docPip

  const toggle = useCallback(async () => {
    if (bridge) return setAppFloating(await bridge.setFloating(!appFloating))
    if (pip) return pip.win.close()
    try {
      setPip(await openPip(() => setPip(null)))
    } catch {
      // o navegador recusou (sem clique do usuario, ou ja tem uma aberta)
    }
  }, [appFloating, pip])

  useEffect(() => () => pip?.win.close(), [pip]) // fechou a aba: fecha a janelinha junto
  return { canFloat, floating: appFloating || !!pip, compact: appFloating, pipHost: pip?.host ?? null, toggle }
}

/** Pergunta "tem desenho novo?" em sequencia; o host segura a pergunta ate ter novidade. */
function useSession(): { view: ShareView | null; link: Link } {
  const [view, setView] = useState<ShareView | null>(null)
  const [link, setLink] = useState<Link>('connecting')
  useEffect(() => {
    const ctrl = new AbortController()
    let seq = -1
    void (async () => {
      while (!ctrl.signal.aborted) {
        try {
          const res = await fetch(`state?since=${seq}&id=${viewerId}`, { cache: 'no-store', signal: ctrl.signal })
          if (!res.ok) throw new Error(String(res.status))
          const reply = (await res.json()) as StateReply
          if (reply.ended) {
            setLink('ended')
            return
          }
          if (reply.seq !== seq) {
            seq = reply.seq
            setView(reply.view)
          }
          setLink('live')
        } catch {
          if (ctrl.signal.aborted) return
          setLink('lost')
          await new Promise((r) => setTimeout(r, 2500))
        }
      }
    })()
    return () => ctrl.abort()
  }, [])
  return { view, link }
}

/** Monta um AppState so com o que a area de desenho usa. */
function toState(view: ShareView | null): AppState {
  return {
    lines: [],
    checks: [],
    mermaid: view?.mermaid ?? '',
    version: view?.version ?? 0,
    mode: AUTO,
    activeMode: view?.activeMode ?? '',
    renderError: null,
    paused: view?.paused ?? false,
    activity: view?.activity ?? 'idle',
    error: null,
    speaking: null,
    engine: { state: 'ready' },
    lastDrawAt: null,
    share: { state: 'off', viewers: 0 },
    tabs: [],
    layout: view?.layout ?? {},
    locked: [],
    activeTab: '',
  }
}

function emptyText(link: Link, view: ShareView | null): EmptyText {
  if (link === 'ended') return { title: 'A sessão terminou', detail: 'Quem estava compartilhando parou.' }
  if (link === 'connecting') return { title: 'Entrando na sessão…' }
  if (link === 'lost') return { title: 'Reconectando…', detail: 'A conexão com quem compartilha caiu.' }
  if (view?.paused) return { title: 'Pausado', detail: 'Quem compartilha pausou a escuta.' }
  return { title: 'Aguardando o primeiro desenho', detail: 'O diagrama aparece aqui conforme a conversa anda.', waiting: true }
}

export function Viewer() {
  const { view, link } = useSession()
  const state = useMemo(() => toState(view), [view])
  const empty = emptyText(link, view)
  const float = useFloat()
  const canvas = <Canvas state={state} modeName={view?.modeName} empty={empty} onRenderError={noop} />

  useEffect(() => {
    document.title = view?.modeName ? `${view.modeName} · Call Sketch` : 'Call Sketch · ao vivo'
  }, [view?.modeName])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header
        className={cx(
          'flex shrink-0 items-center gap-3 border-b border-zinc-200/80 dark:border-white/6',
          float.compact ? 'h-9 px-3' : 'h-12 px-4',
        )}
      >
        {!float.compact && (
          <>
            <LogoMark className="size-6 drop-shadow-sm" />
            <span className="text-sm font-semibold tracking-tight">Call Sketch</span>
            <span className="h-4 w-px bg-zinc-200 dark:bg-white/10" />
          </>
        )}
        <LinkPill link={link} view={view} />
        {!float.compact && view?.activeMode && (
          <span className="hidden items-center gap-1.5 text-xs font-medium text-zinc-500 sm:flex dark:text-zinc-400">
            <ModeIcon id={view.activeMode} className="size-3.5" /> {view.modeName}
          </span>
        )}
        <span className="ml-auto" />
        {float.canFloat && <FloatButton floating={float.floating} onClick={() => void float.toggle()} />}
        {!insideApp && (
          <a
            href={`callsketch://join?url=${encodeURIComponent(location.origin + location.pathname)}`}
            title="Abre esta sessão no Call Sketch instalado"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/6"
          >
            <AppWindow className="size-3.5" /> Abrir no app
          </a>
        )}
      </header>
      <main className="relative min-h-0 flex-1">
        {float.pipHost ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="space-y-3">
              <PictureInPicture2 className="mx-auto size-8 text-zinc-400" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">O diagrama está na janela flutuante.</p>
              <button
                type="button"
                onClick={() => void float.toggle()}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-900/5 dark:border-white/10 dark:hover:bg-white/6"
              >
                Trazer de volta
              </button>
            </div>
          </div>
        ) : (
          canvas
        )}
      </main>
      {float.pipHost &&
        createPortal(
          <div className="flex h-screen flex-col overflow-hidden">
            <div className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-200/80 px-3 dark:border-white/6">
              <LinkPill link={link} view={view} />
              <span className="ml-auto" />
              <FloatButton floating onClick={() => void float.toggle()} />
            </div>
            <div className="relative min-h-0 flex-1">{canvas}</div>
          </div>,
          float.pipHost,
        )}
    </div>
  )
}

function FloatButton({ floating, onClick }: { floating: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={floating ? 'Volta ao tamanho normal' : 'Deixa o diagrama numa janelinha sempre por cima'}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/6"
    >
      {floating ? <Maximize2 className="size-3.5" /> : <PictureInPicture2 className="size-3.5" />}
      {floating ? 'Voltar' : 'Flutuar'}
    </button>
  )
}

function LinkPill({ link, view }: { link: Link; view: ShareView | null }) {
  let tone: string
  let content: React.ReactNode
  if (link === 'live' && view?.activity === 'drawing') {
    tone = 'text-accent-600 dark:text-accent-300'
    content = (
      <>
        <PencilLine className="size-3.5" /> <span className="shimmer-text">desenhando</span>
      </>
    )
  } else if (link === 'live') {
    tone = 'text-rose-600 dark:text-rose-400'
    content = (
      <>
        <Radio className="size-3.5" /> ao vivo {!view?.paused && <SoundBars className="text-rose-500" />}
      </>
    )
  } else if (link === 'connecting') {
    tone = 'text-zinc-500'
    content = <span className="shimmer-text">conectando…</span>
  } else {
    tone = 'text-amber-600 dark:text-amber-400'
    content = (
      <>
        <WifiOff className="size-3.5" /> {link === 'ended' ? 'encerrada' : 'reconectando'}
      </>
    )
  }
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={`${link}-${view?.activity}`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.16 }}
        className={cx('inline-flex items-center gap-1.5 text-xs font-medium', tone)}
      >
        {content}
      </motion.span>
    </AnimatePresence>
  )
}
