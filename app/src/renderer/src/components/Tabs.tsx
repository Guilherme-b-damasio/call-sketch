/**
 * Varios diagramas da mesma conversa, em abas. Com uma aba so, aparece so o botao "+ Diagrama"
 * no fim da barra de modos; com duas ou mais, aparece a faixa de abas em cima do desenho.
 */
import { Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { AUTO, type ModeInfo, type Tab } from '@shared/types'
import { api } from '../hooks'
import { cx, ModeIcon } from './ui'

export function tabTitle(tab: Tab, modes: ModeInfo[]): string {
  const id = tab.activeMode || tab.mode
  if (id === AUTO || !id) return 'Automático'
  return modes.find((m) => m.id === id)?.name ?? id
}

/** "+ Diagrama": escolhe o modo do diagrama novo. */
export function NewTabButton({ modes, compact = false }: { modes: ModeInfo[]; compact?: boolean }) {
  const [open, setOpen] = useState(false)
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

  const all = [{ id: AUTO, name: 'Automático', description: 'A IA escolhe pelo assunto' }, ...modes]
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        title="Abre outro diagrama da mesma conversa, numa aba nova"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'flex items-center gap-1 rounded-lg text-[13px] font-medium text-zinc-500 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/6 dark:hover:text-zinc-100',
          compact ? 'size-7 justify-center' : 'px-2.5 py-1.5',
        )}
      >
        <Plus className="size-3.5" />
        {!compact && 'Diagrama'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-40 mt-1.5 w-60 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-ink-850"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-zinc-400">Novo diagrama da mesma conversa</p>
            {all.map((m) => (
              <button
                key={m.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  void api.addTab(m.id)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-zinc-900/5 dark:hover:bg-white/6"
              >
                <ModeIcon id={m.id} className="size-3.5 text-zinc-400" />
                {m.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Faixa de abas (so aparece com duas ou mais). */
export function TabStrip({ tabs, active, modes }: { tabs: Tab[]; active: string; modes: ModeInfo[] }) {
  if (tabs.length < 2) return null
  return (
    <div
      role="tablist"
      aria-label="Diagramas"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200/80 px-3 py-1.5 dark:border-white/6"
    >
      <AnimatePresence initial={false}>
        {tabs.map((t) => {
          const selected = t.id === active
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cx(
                'group relative flex shrink-0 items-center rounded-lg text-[12px] font-medium',
                selected
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-ink-800 dark:text-white dark:ring-white/10'
                  : 'text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/6 dark:hover:text-zinc-100',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => void api.selectTab(t.id)}
                className="flex items-center gap-1.5 py-1 pl-2.5 pr-1.5"
              >
                <ModeIcon id={t.activeMode || t.mode} className="size-3.5" />
                {tabTitle(t, modes)}
                {!t.mermaid && <span className="text-zinc-400">· vazio</span>}
              </button>
              <button
                type="button"
                aria-label={`Fechar ${tabTitle(t, modes)}`}
                title="Fechar este diagrama"
                onClick={() => void api.closeTab(t.id)}
                className="mr-1 grid size-5 place-items-center rounded-md text-zinc-400 opacity-60 hover:bg-zinc-900/8 hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              >
                <X className="size-3" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
      <NewTabButton modes={modes} compact />
    </div>
  )
}
