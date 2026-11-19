import { Check, Copy, Globe, LogIn, Radio, Users, Wifi, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { ShareInfo } from '@shared/types'
import { api } from '../hooks'
import { cx } from './ui'

function CopyField({ icon, label, hint, value }: { icon: React.ReactNode; label: string; hint: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-600 dark:text-zinc-300">
        {icon} {label}
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white pl-2.5 pr-1 dark:border-white/10 dark:bg-ink-900">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 select-text bg-transparent py-1.5 font-mono text-[12px] text-zinc-700 outline-none dark:text-zinc-200"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-accent-700 hover:bg-accent-500/10 dark:text-accent-300"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</p>
    </div>
  )
}

function ShareSection({ share }: { share: ShareInfo }) {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (share.state === 'off' || share.state === 'error') {
    return (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          Gera um link para o pessoal acompanhar o seu desenho ao vivo, no app ou no navegador. Vai{' '}
          <b className="font-semibold">só o diagrama</b>, nunca a conversa. Sem conta e sem custo: o seu próprio app vira o
          servidor.
        </p>
        {share.state === 'error' && (
          <p className="rounded-lg bg-rose-500/8 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">{share.msg}</p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(api.startShare)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm shadow-accent-600/30 hover:bg-accent-500 disabled:opacity-60"
        >
          <Radio className="size-4" /> {share.state === 'error' ? 'Tentar de novo' : 'Começar a compartilhar'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-500 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
        </span>
        <span className="text-[13px] font-semibold">{share.state === 'on' ? 'Compartilhando' : 'Abrindo a sessão'}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-zinc-500 dark:text-zinc-400">
          <Users className="size-3.5" />
          <motion.span key={share.viewers} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="tabular-nums">
            {share.viewers}
          </motion.span>
          assistindo
        </span>
      </div>

      {share.msg && (
        <p className={cx('text-[12px]', share.state === 'starting' ? 'shimmer-text' : 'text-amber-600 dark:text-amber-400')}>
          {share.msg}
        </p>
      )}

      <AnimatePresence initial={false}>
        {share.publicUrl && (
          <motion.div key="pub" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <CopyField
              icon={<Globe className="size-3.5" />}
              label="Link da sessão"
              hint="Funciona de qualquer lugar. Abre no navegador, e quem tem o app pode clicar em “Abrir no app”."
              value={share.publicUrl}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {share.lanUrl && (
        <CopyField
          icon={<Wifi className="size-3.5" />}
          label="Na mesma rede"
          hint="Para quem está no mesmo Wi-Fi ou escritório (mais rápido, não sai da rede)."
          value={share.lanUrl}
        />
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void run(api.stopShare)}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-900/5 disabled:opacity-60 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/6"
      >
        Parar de compartilhar
      </button>
    </div>
  )
}

function JoinSection() {
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const join = async () => {
    setError(null)
    try {
      await api.joinSession(link)
      setLink('')
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void join()
      }}
      className="space-y-2"
    >
      <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
        Cole o link que alguém compartilhou. Enquanto você assiste, a sua escuta fica pausada.
      </p>
      <div className="flex gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://….trycloudflare.com/s/…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] outline-none transition focus:border-accent-400 focus:ring-3 focus:ring-accent-500/15 dark:border-white/10 dark:bg-ink-900"
        />
        <button
          type="submit"
          disabled={!link.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <LogIn className="size-3.5" /> Entrar
        </button>
      </div>
      {error && <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}
    </form>
  )
}

export function SessionDialog({ open, share, onClose }: { open: boolean; share: ShareInfo; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-6 backdrop-blur-sm dark:bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="session-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-2xl dark:border-white/10 dark:bg-ink-850"
          >
            <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-white/8">
              <h2 id="session-title" className="text-[15px] font-semibold tracking-tight">
                Sessão ao vivo
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="grid size-7 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-900/5 dark:hover:bg-white/8"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="space-y-6 px-5 py-5">
              <section className="space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Compartilhar o meu desenho
                </h3>
                <ShareSection share={share} />
              </section>
              <section className="space-y-3 border-t border-zinc-200 pt-5 dark:border-white/8">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Assistir a sessão de alguém
                </h3>
                <JoinSection />
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
