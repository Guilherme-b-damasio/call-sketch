import { CircleQuestionMark, MessageSquareText, SendHorizontal, ShieldCheck, TriangleExclamationPoint } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Check, Line } from '@shared/types'
import { api } from '../hooks'
import { cx } from './ui'

type Tab = 'conversa' | 'validacao'

const WHO_STYLE: Record<Line['who'], { label: string; dot: string }> = {
  call: { label: 'call', dot: 'bg-sky-500' },
  eu: { label: 'você', dot: 'bg-emerald-500' },
  nota: { label: 'nota', dot: 'bg-accent-500' },
}

/** Rola pro fim quando chega item novo, a nao ser que a pessoa tenha subido pra ler. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [dep])
  const onScroll = () => {
    const el = ref.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }
  return { ref, onScroll }
}

export const LineRow = memo(function LineRow({ line }: { line: Line }) {
  const s = WHO_STYLE[line.who]
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.2 }}
      className="group"
    >
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span className={cx('size-1.5 rounded-full', s.dot)} />
        <span className="font-medium">{s.label}</span>
        <span className="tabular-nums opacity-0 transition-opacity group-hover:opacity-100">{line.t}</span>
      </div>
      <p
        className={cx(
          'text-[13px] leading-relaxed',
          line.who === 'nota' ? 'font-medium text-accent-700 dark:text-accent-300' : 'text-zinc-700 dark:text-zinc-300',
        )}
      >
        {line.text}
      </p>
    </motion.li>
  )
})

const CheckRow = memo(function CheckRow({ check }: { check: Check }) {
  const wrong = check.kind === 'errado'
  const Icon = wrong ? TriangleExclamationPoint : CircleQuestionMark
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      className={cx(
        'flex gap-2.5 rounded-xl border p-3',
        wrong
          ? 'border-rose-500/20 bg-rose-500/6 dark:border-rose-400/15 dark:bg-rose-400/6'
          : 'border-amber-500/20 bg-amber-500/6 dark:border-amber-400/15 dark:bg-amber-400/6',
      )}
    >
      <Icon className={cx('mt-0.5 size-4 shrink-0', wrong ? 'text-rose-500' : 'text-amber-500')} />
      <div className="min-w-0">
        <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">{check.text}</p>
        <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{check.t}</span>
      </div>
    </motion.li>
  )
})

function Transcript({ lines }: { lines: Line[] }) {
  const { ref, onScroll } = useStickToBottom(lines.length)
  const shown = lines.slice(-200) // o resto fica so no estado (o Claude usa), aqui nao precisa
  return (
    <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {shown.length === 0 ? (
        <Empty icon={<MessageSquareText className="size-5" />} text="As falas aparecem aqui assim que alguém falar." />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {shown.map((l) => (
              <LineRow key={l.id} line={l} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function Checks({ checks, checking }: { checks: Check[]; checking: boolean }) {
  const { ref, onScroll } = useStickToBottom(checks.length)
  return (
    <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {checks.length === 0 ? (
        <Empty
          icon={<ShieldCheck className="size-5" />}
          text={checking ? 'Conferindo o que foi dito…' : 'Nada suspeito até agora. Uma segunda IA confere as afirmações da conversa.'}
        />
      ) : (
        <ul className="space-y-2">
          {checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-zinc-400 dark:text-zinc-500">
      {icon}
      <p className="text-xs leading-relaxed">{text}</p>
    </div>
  )
}

function NoteInput() {
  const [text, setText] = useState('')
  const send = () => {
    const t = text.trim()
    if (!t) return
    void api.note(t)
    setText('')
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className="border-t border-zinc-200/80 p-3 dark:border-white/6"
    >
      <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white pl-3 pr-1 transition-shadow focus-within:border-accent-400 focus-within:ring-3 focus-within:ring-accent-500/15 dark:border-white/10 dark:bg-ink-900">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Corrigir ou pedir algo pro desenho…"
          className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Enviar nota"
          className="grid size-7 place-items-center rounded-lg bg-accent-600 text-white transition hover:bg-accent-500 disabled:bg-transparent disabled:text-zinc-300 dark:disabled:text-zinc-600"
        >
          <SendHorizontal className="size-3.5" />
        </button>
      </div>
    </form>
  )
}

export function SidePanel({ lines, checks, checking }: { lines: Line[]; checks: Check[]; checking: boolean }) {
  const [tab, setTab] = useState<Tab>('conversa')
  const [seen, setSeen] = useState(checks.length)
  useEffect(() => {
    if (tab === 'validacao') setSeen(checks.length)
  }, [tab, checks.length])
  const unseen = checks.length - seen

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'conversa', label: 'Conversa' },
    { id: 'validacao', label: 'Validação', badge: unseen > 0 ? unseen : undefined },
  ]

  return (
    <aside className="flex min-h-0 w-[340px] shrink-0 flex-col border-l border-zinc-200/80 bg-white/60 dark:border-white/6 dark:bg-ink-900/40">
      <div role="tablist" className="flex gap-4 border-b border-zinc-200/80 px-4 dark:border-white/6">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'relative flex items-center gap-1.5 py-2.5 text-[13px] font-medium transition-colors',
              tab === t.id ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            {t.label}
            {t.id === 'validacao' && checking && <span className="size-1.5 animate-pulse rounded-full bg-accent-500" />}
            <AnimatePresence>
              {t.badge && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white"
                >
                  {t.badge}
                </motion.span>
              )}
            </AnimatePresence>
            {tab === t.id && (
              <motion.span layoutId="tab-underline" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent-500" />
            )}
          </button>
        ))}
      </div>

      {tab === 'conversa' ? <Transcript lines={lines} /> : <Checks checks={checks} checking={checking} />}
      <NoteInput />
    </aside>
  )
}
