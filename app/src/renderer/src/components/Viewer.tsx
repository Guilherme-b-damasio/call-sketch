/** Pagina de quem assiste uma sessao: no navegador ou numa janela do app. So recebe o desenho. */
import { AppWindow, PencilLine, Radio, WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { AUTO, type AppState, type ShareView } from '@shared/types'
import { Canvas, type EmptyText } from './Canvas'
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

  useEffect(() => {
    document.title = view?.modeName ? `${view.modeName} · Call Sketch` : 'Call Sketch · ao vivo'
  }, [view?.modeName])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200/80 px-4 dark:border-white/6">
        <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-sm shadow-accent-600/30">
          <PencilLine className="size-3.5" strokeWidth={2.5} />
        </span>
        <span className="text-sm font-semibold tracking-tight">Call Sketch</span>
        <span className="h-4 w-px bg-zinc-200 dark:bg-white/10" />
        <LinkPill link={link} view={view} />
        {view?.activeMode && (
          <span className="hidden items-center gap-1.5 text-xs font-medium text-zinc-500 sm:flex dark:text-zinc-400">
            <ModeIcon id={view.activeMode} className="size-3.5" /> {view.modeName}
          </span>
        )}
        {!insideApp && (
          <a
            href={`callsketch://join?url=${encodeURIComponent(location.origin + location.pathname)}`}
            title="Abre esta sessão no Call Sketch instalado"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/6"
          >
            <AppWindow className="size-3.5" /> Abrir no app
          </a>
        )}
      </header>
      <main className="relative min-h-0 flex-1">
        <Canvas state={state} modeName={view?.modeName} empty={empty} onRenderError={noop} />
      </main>
    </div>
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
