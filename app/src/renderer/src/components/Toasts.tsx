import { TriangleExclamationPoint, Volume2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

function hint(error: string): string | null {
  if (/not logged in|login|authenticat/i.test(error)) return 'Abra um terminal, rode "claude" e digite /login.'
  if (/não encontr|not found|ENOENT/i.test(error)) return 'Instale o Claude Code: npm i -g @anthropic-ai/claude-code'
  if (/api key|401/i.test(error)) return 'Confira a chave da API nas configurações.'
  return null
}

/** Avisos flutuantes no topo do canvas. */
export function Toasts({ error, speaking }: { error: string | null; speaking: string | null }) {
  const [dismissed, setDismissed] = useState<string | null>(null)
  useEffect(() => {
    if (!error) setDismissed(null)
  }, [error])
  const showError = error && error !== dismissed
  const tip = error ? hint(error) : null

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {speaking && (
          <motion.div
            key="speaking"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className="flex items-center gap-2 rounded-full bg-zinc-900 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-lg dark:bg-white dark:text-zinc-900"
          >
            <Volume2 className="size-3.5 animate-pulse" />
            {speaking}
          </motion.div>
        )}
        {showError && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="pointer-events-auto flex max-w-lg items-start gap-2.5 rounded-xl border border-rose-500/25 bg-white px-3.5 py-2.5 shadow-lg dark:border-rose-400/20 dark:bg-ink-850"
          >
            <TriangleExclamationPoint className="mt-0.5 size-4 shrink-0 text-rose-500" />
            <div className="min-w-0 text-[13px]">
              <p className="font-medium text-zinc-800 dark:text-zinc-100">A IA não respondeu</p>
              <p className="line-clamp-2 text-zinc-500 dark:text-zinc-400">{error}</p>
              {tip && <p className="mt-1 font-medium text-accent-600 dark:text-accent-300">{tip}</p>}
            </div>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setDismissed(error)}
              className="grid size-6 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900/5 dark:hover:bg-white/8"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
