/** Botao "Exportar" da barra do desenho: imagem PNG, PDF (so no app) e SVG. */
import { Check as CheckIcon, Download, FileImage, FileText, PenTool } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { canPdf, type ExportKind } from '../export'
import { IconButton } from './ui'

const ITEMS: { kind: ExportKind; label: string; hint: string; icon: typeof FileImage }[] = [
  { kind: 'png', label: 'Imagem PNG', hint: 'pra colar em doc, chat ou slide', icon: FileImage },
  { kind: 'pdf', label: 'PDF', hint: 'uma página do tamanho do desenho', icon: FileText },
  { kind: 'svg', label: 'SVG', hint: 'vetor, aumenta sem perder qualidade', icon: PenTool },
]

export function ExportMenu({ onExport }: { onExport: (kind: ExportKind) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const box = useRef<HTMLDivElement>(null)

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

  const run = async (kind: ExportKind) => {
    setOpen(false)
    setState('busy')
    try {
      const ok = await onExport(kind)
      setState(ok ? 'done' : 'idle')
      if (ok) setTimeout(() => setState('idle'), 1600)
    } catch (e) {
      console.error('exportar', e)
      setState('error')
      setTimeout(() => setState('idle'), 2400)
    }
  }

  const items = ITEMS.filter((i) => i.kind !== 'pdf' || canPdf())
  return (
    <div ref={box} className="relative">
      <IconButton
        label={state === 'error' ? 'Não deu pra exportar' : 'Exportar (PNG, PDF, SVG)'}
        aria-expanded={open}
        disabled={state === 'busy'}
        onClick={() => setOpen((v) => !v)}
      >
        {state === 'busy' ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : state === 'done' ? (
          <CheckIcon className="size-4 text-emerald-500" />
        ) : (
          <Download className={state === 'error' ? 'size-4 text-red-500' : 'size-4'} />
        )}
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute bottom-full right-0 z-40 mb-2 w-64 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-ink-850"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-zinc-400">Exportar o desenho</p>
            {items.map(({ kind, label, hint, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onClick={() => void run(kind)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-zinc-900/5 dark:hover:bg-white/6"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                <span>
                  <span className="block text-[13px] font-medium">{label}</span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
