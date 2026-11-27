import { motion } from 'motion/react'
import { memo } from 'react'
import { AUTO, type ModeInfo } from '@shared/types'
import { api } from '../hooks'
import { NewTabButton } from './Tabs'
import { cx, ModeIcon } from './ui'

interface Props {
  modes: ModeInfo[]
  mode: string
  activeMode: string
  single?: boolean // so uma aba: o "+ Diagrama" fica aqui
}

export const ModeBar = memo(function ModeBar({ modes, mode, activeMode, single = true }: Props) {
  const all = [{ id: AUTO, name: 'Automático', description: 'A IA escolhe pelo assunto da conversa' }, ...modes]
  return (
    <nav
      aria-label="Modo de desenho"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200/80 px-3 py-2 dark:border-white/6"
    >
      {all.map((m) => {
        const selected = m.id === mode
        const drawing = mode === AUTO && m.id === activeMode
        return (
          <button
            key={m.id}
            type="button"
            title={m.description}
            aria-pressed={selected}
            onClick={() => void api.setMode(m.id)}
            className={cx(
              'relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
              selected
                ? 'text-accent-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            {selected && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-lg bg-accent-500/10 ring-1 ring-accent-500/25 dark:bg-accent-500/16 dark:ring-accent-400/30"
              />
            )}
            <ModeIcon id={m.id} className="relative size-3.5" />
            <span className="relative">{m.name}</span>
            {drawing && (
              <motion.span
                layoutId="auto-dot"
                className="relative size-1.5 rounded-full bg-accent-500 shadow-[0_0_8px] shadow-accent-500"
                title="O automático está usando este modo"
              />
            )}
          </button>
        )
      })}
      {single && (
        <>
          <span className="ml-auto" />
          <NewTabButton modes={modes} />
        </>
      )}
    </nav>
  )
})
