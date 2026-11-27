/**
 * Na pagina de quem assiste: mandar uma sugestao pra quem compartilha. Ela so muda o desenho se
 * quem compartilha aceitar, e aqui aparece o que aconteceu com cada uma.
 */
import { Check, Clock, Lightbulb, SendHorizontal, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { SuggestionStatus } from '@shared/types'
import { cx } from './ui'

export interface MySuggestion {
  id: string
  text: string
  status: SuggestionStatus
}

const MAX = 500
const NAME_KEY = 'cs-suggest-name'

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

const ERRORS: Record<number, string> = {
  429: 'Calma, espera uns segundos antes de mandar outra.',
  403: 'Quem compartilha desligou as sugestões.',
  413: 'Texto grande demais.',
}

const STATUS: Record<SuggestionStatus, { label: string; icon: typeof Check; tone: string }> = {
  pendente: { label: 'esperando', icon: Clock, tone: 'text-zinc-500 dark:text-zinc-400' },
  aceita: { label: 'aceita', icon: Check, tone: 'text-emerald-600 dark:text-emerald-400' },
  recusada: { label: 'recusada', icon: X, tone: 'text-zinc-400 dark:text-zinc-500' },
}

export function SuggestBox({ viewerId, mine, onSent }: { viewerId: string; mine: MySuggestion[]; onSent: (mine: MySuggestion[]) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(savedName)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pending = mine.filter((m) => m.status === 'pendente').length

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    try {
      localStorage.setItem(NAME_KEY, name.trim())
    } catch {
      // sem armazenamento: so nao lembra o nome
    }
    try {
      const res = await fetch('suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: viewerId, name: name.trim(), text: t }),
      })
      if (!res.ok) throw new Error(ERRORS[res.status] ?? 'Não deu pra mandar agora.')
      const body = (await res.json()) as { mine?: MySuggestion[] }
      setText('')
      if (body.mine) onSent(body.mine)
    } catch (e) {
      setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Não deu pra mandar agora.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Mandar uma sugestão pra quem está compartilhando"
        className={cx(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium',
          open
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            : 'border-zinc-200 text-zinc-600 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/6',
        )}
      >
        <Lightbulb className="size-3.5" /> Sugerir
        {pending > 0 && <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold">{pending}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Mandar sugestão"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-40 mt-2 w-[min(340px,calc(100vw-32px))] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-ink-850"
          >
            <p className="text-[13px] font-semibold">Sugerir algo pro desenho</p>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">Quem compartilha vê e decide se entra.</p>
            <form
              className="mt-2.5 space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                placeholder="Seu nome (opcional)"
                aria-label="Seu nome"
                className="w-full rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-accent-400 dark:border-white/10"
              />
              <textarea
                value={text}
                autoFocus
                onChange={(e) => setText(e.target.value.slice(0, MAX))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={3}
                placeholder="Ex.: faltou o cache entre a API e o banco"
                aria-label="Sugestão"
                className="w-full resize-none rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-accent-400 dark:border-white/10"
              />
              {error && (
                <p role="alert" className="text-[12px] text-rose-600 dark:text-rose-400">
                  {error}
                </p>
              )}
              <div className="flex items-center">
                <span className="text-[11px] tabular-nums text-zinc-400">
                  {text.length}/{MAX}
                </span>
                <button
                  type="submit"
                  disabled={!text.trim() || busy}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-500 disabled:opacity-40"
                >
                  <SendHorizontal className="size-3.5" /> Mandar
                </button>
              </div>
            </form>
            {mine.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-zinc-200 pt-2 dark:border-white/8">
                {[...mine].reverse().map((m) => {
                  const st = STATUS[m.status]
                  return (
                    <li key={m.id} className="flex items-start gap-2 text-[12px]">
                      <span className={cx('mt-px inline-flex shrink-0 items-center gap-1 font-medium', st.tone)}>
                        <st.icon className="size-3.5" /> {st.label}
                      </span>
                      <span className="line-clamp-2 text-zinc-600 dark:text-zinc-300">{m.text}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
