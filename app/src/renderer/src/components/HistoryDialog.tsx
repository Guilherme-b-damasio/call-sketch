/**
 * Historico das calls: a lista do que ficou guardado neste PC e o replay de uma call, com o
 * diagrama de cada momento, uma linha do tempo pra ir e voltar e a conversa ate aquele ponto.
 */
import { FolderOpen, History, Pause, Play, SkipBack, SkipForward, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AppState, CallRecord, CallSummary, ModeInfo } from '@shared/types'
import { AUTO } from '@shared/types'
import { api } from '../hooks'
import { Canvas } from './Canvas'
import { LineRow } from './SidePanel'
import { cx, IconButton, ModeIcon } from './ui'

const STEP_MS = 1500

const noop = () => {}

function when(ms: number): string {
  const d = new Date(ms)
  const day = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return `${day} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function duration(a: number, b: number): string {
  const min = Math.round((b - a) / 60000)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR')

/** Estado de mentira pro Canvas mostrar uma versao guardada. */
function replayState(rec: CallRecord, tabId: string, idx: number): AppState {
  const v = rec.versions.filter((x) => x.tabId === tabId)[idx]
  return {
    lines: [],
    checks: [],
    mermaid: v?.mermaid ?? '',
    version: idx + 1,
    mode: AUTO,
    activeMode: v?.mode ?? '',
    renderError: null,
    paused: false,
    activity: 'idle',
    error: null,
    speaking: null,
    engine: { state: 'ready' },
    lastDrawAt: null,
    share: { state: 'off', viewers: 0 },
    tabs: [],
    activeTab: `replay-${rec.id}-${tabId}`,
    layout: v?.layout ?? {},
    locked: [],
  }
}

export function HistoryDialog({ open, onClose, modes }: { open: boolean; onClose: () => void; modes: ModeInfo[] }) {
  const [list, setList] = useState<CallSummary[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [rec, setRec] = useState<CallRecord | null>(null)

  const refresh = useCallback(async () => {
    const l = await api.listCalls()
    setList(l)
    setSel((cur) => (cur && l.some((c) => c.id === cur) ? cur : (l[0]?.id ?? null)))
  }, [])

  useEffect(() => {
    if (open) void refresh()
    else setRec(null)
  }, [open, refresh])

  useEffect(() => {
    if (!open || !sel) return setRec(null)
    let alive = true
    void api.getCall(sel).then((r) => alive && setRec(r))
    return () => {
      alive = false
    }
  }, [open, sel])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const remove = async (id: string) => {
    await api.deleteCall(id)
    setSel(null)
    await refresh()
  }

  const modeName = (id: string) => modes.find((m) => m.id === id)?.name ?? id

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid bg-black/30 p-4 backdrop-blur-sm dark:bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="history-title"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ type: 'spring', stiffness: 480, damping: 38 }}
            className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-2xl dark:border-white/10 dark:bg-ink-900"
          >
            <header className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3 dark:border-white/8">
              <History className="size-4 text-accent-500" />
              <h2 id="history-title" className="text-[15px] font-semibold tracking-tight">
                Histórico das calls
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">fica só neste computador</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void api.openHistoryFolder()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/6"
                >
                  <FolderOpen className="size-3.5" /> Abrir pasta
                </button>
                <IconButton label="Fechar" onClick={onClose}>
                  <X className="size-4" />
                </IconButton>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <nav aria-label="Calls" className="w-72 shrink-0 overflow-y-auto border-r border-zinc-200 p-2 dark:border-white/8">
                {list?.length === 0 && (
                  <p className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Nenhuma call guardada ainda. Assim que o app ouvir e desenhar, a call aparece aqui.
                  </p>
                )}
                {list?.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-current={c.id === sel}
                    onClick={() => setSel(c.id)}
                    className={cx(
                      'mb-1 w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                      c.id === sel
                        ? 'bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-ink-800 dark:ring-white/10'
                        : 'hover:bg-zinc-900/5 dark:hover:bg-white/5',
                    )}
                  >
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      {when(c.startedAt)}
                      {c.live && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                          agora
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {duration(c.startedAt, c.endedAt)} · {c.versions} {c.versions === 1 ? 'versão' : 'versões'} · {c.lines} falas
                    </div>
                    {!!c.modes.length && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.modes.map((m) => (
                          <span key={m} className="inline-flex items-center gap-1 rounded-md bg-zinc-900/5 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-white/6 dark:text-zinc-300">
                            <ModeIcon id={m} className="size-3" />
                            {modeName(m)}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.preview && <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{c.preview}</p>}
                  </button>
                ))}
              </nav>

              <div className="flex min-w-0 flex-1">
                {rec ? (
                  <Replay key={rec.id} rec={rec} modeName={modeName} onDelete={() => void remove(rec.id)} />
                ) : (
                  <div className="grid flex-1 place-items-center text-sm text-zinc-500 dark:text-zinc-400">
                    {list?.length ? 'Escolha uma call na lista.' : ''}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Replay({ rec, modeName, onDelete }: { rec: CallRecord; modeName: (id: string) => string; onDelete: () => void }) {
  const tabIds = useMemo(() => [...new Set(rec.versions.map((v) => v.tabId))], [rec])
  const [tab, setTab] = useState(tabIds[0] ?? '')
  const versions = useMemo(() => rec.versions.filter((v) => v.tabId === tab), [rec, tab])
  const [idx, setIdx] = useState(Math.max(versions.length - 1, 0))
  const [playing, setPlaying] = useState(false)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    setIdx(Math.max(versions.length - 1, 0))
    setPlaying(false)
  }, [versions])

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setIdx((i) => {
        if (i >= versions.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, STEP_MS)
    return () => clearInterval(t)
  }, [playing, versions.length])

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  const v = versions[idx]
  // a conversa ate o momento dessa versao (sem versao nenhuma: a conversa toda)
  const until = v ? v.ts + 500 : Number.POSITIVE_INFINITY
  const lines = useMemo(() => rec.lines.filter((l) => !l.ts || l.ts * 1000 <= until), [rec, until])
  const state = useMemo(() => replayState(rec, tab, idx), [rec, tab, idx])

  const play = () => {
    if (idx >= versions.length - 1) setIdx(0)
    setPlaying((p) => !p)
  }

  const listRef = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    const el = listRef.current?.parentElement
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col">
        {tabIds.length > 1 && (
          <div role="tablist" aria-label="Diagramas da call" className="flex shrink-0 gap-1 border-b border-zinc-200 px-3 py-1.5 dark:border-white/8">
            {tabIds.map((id, i) => {
              const mode = rec.versions.find((x) => x.tabId === id)?.mode ?? ''
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={id === tab}
                  onClick={() => setTab(id)}
                  className={cx(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium',
                    id === tab
                      ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-ink-800 dark:text-white dark:ring-white/10'
                      : 'text-zinc-500 hover:bg-zinc-900/5 dark:text-zinc-400 dark:hover:bg-white/6',
                  )}
                >
                  <ModeIcon id={mode} className="size-3.5" />
                  {mode ? modeName(mode) : `Diagrama ${i + 1}`}
                </button>
              )
            })}
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          <Canvas
            state={state}
            modeName={v ? modeName(v.mode) : undefined}
            readOnly
            onRenderError={noop}
            empty={{ title: 'Essa call não chegou a ter desenho', detail: 'A conversa dela está ao lado.' }}
          />
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-zinc-200 px-4 py-2.5 dark:border-white/8">
          <IconButton label="Versão anterior" disabled={idx <= 0} onClick={() => setIdx((i) => Math.max(i - 1, 0))}>
            <SkipBack className="size-4" />
          </IconButton>
          <IconButton label={playing ? 'Pausar' : 'Tocar a call'} disabled={versions.length < 2} active={playing} onClick={play}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </IconButton>
          <IconButton label="Próxima versão" disabled={idx >= versions.length - 1} onClick={() => setIdx((i) => Math.min(i + 1, versions.length - 1))}>
            <SkipForward className="size-4" />
          </IconButton>
          <input
            type="range"
            aria-label="Linha do tempo"
            min={0}
            max={Math.max(versions.length - 1, 0)}
            value={idx}
            disabled={versions.length < 2}
            onChange={(e) => {
              setPlaying(false)
              setIdx(Number(e.target.value))
            }}
            className="mx-2 min-w-0 flex-1 accent-accent-600"
          />
          <span className="w-56 shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {v ? (
              <>
                {idx + 1} de {versions.length} · {clock(v.ts)} · {v.by === 'mao' ? 'à mão' : 'pela IA'}
              </>
            ) : (
              'sem desenho'
            )}
          </span>
          <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-white/10" />
          <button
            type="button"
            onClick={() => (armed ? onDelete() : setArmed(true))}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium',
              armed ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400' : 'text-zinc-500 hover:bg-zinc-900/5 dark:text-zinc-400 dark:hover:bg-white/6',
            )}
          >
            <Trash2 className="size-3.5" />
            {armed ? 'Apagar mesmo?' : 'Apagar'}
          </button>
        </footer>
      </section>

      <aside aria-label="Conversa" className="flex w-80 shrink-0 flex-col border-l border-zinc-200 dark:border-white/8">
        <div className="border-b border-zinc-200 px-4 py-2.5 text-[13px] font-semibold dark:border-white/8">
          Conversa {v && <span className="font-normal text-zinc-500 dark:text-zinc-400">até {clock(v.ts)}</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {lines.length ? (
            <ol ref={listRef} className="space-y-3">
              {lines.map((l) => (
                <LineRow key={l.id} line={l} />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nada falado até aqui.</p>
          )}
        </div>
        {!!rec.checks.length && (
          <div className="max-h-40 overflow-y-auto border-t border-zinc-200 px-4 py-2.5 text-[12px] dark:border-white/8">
            <p className="mb-1 font-semibold">Validação</p>
            {rec.checks.map((c) => (
              <p key={c.id} className={cx('leading-snug', c.kind === 'errado' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400')}>
                {c.text}
              </p>
            ))}
          </div>
        )}
      </aside>
    </>
  )
}
