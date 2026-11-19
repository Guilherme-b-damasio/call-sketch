/** Pecas pequenas reutilizadas pela interface. */
import {
  ArrowLeftRight,
  CalendarCheck,
  ChartGantt,
  Database,
  Lightbulb,
  type LucideIcon,
  Network,
  Scale,
  Shapes,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const MODE_ICONS: Record<string, LucideIcon> = {
  auto: Sparkles,
  brainstorm: Lightbulb,
  daily: CalendarCheck,
  arquitetura: Network,
  processo: Workflow,
  sequencia: ArrowLeftRight,
  dados: Database,
  planejamento: ChartGantt,
  decisao: Scale,
}

export function ModeIcon({ id, className }: { id: string; className?: string }) {
  const Icon = MODE_ICONS[id] ?? Shapes
  return <Icon className={className} strokeWidth={2} />
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  shortcut?: string
  active?: boolean
  children: ReactNode
}

export function IconButton({ label, shortcut, active, children, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cx(
        'no-drag grid size-8 place-items-center rounded-lg transition-colors duration-150',
        'text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 active:scale-95',
        'dark:text-zinc-400 dark:hover:bg-white/8 dark:hover:text-zinc-100',
        active && 'bg-accent-500/12 text-accent-600 dark:bg-accent-500/18 dark:text-accent-300',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Barras de audio animadas (so CSS: nao pesa). */
export function SoundBars({ active = true, className }: { active?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex h-3 items-end gap-[2px]', className)} aria-hidden>
      {[0, 0.2, 0.4, 0.1].map((delay, i) => (
        <span
          key={i}
          className={cx('w-[3px] h-full origin-bottom rounded-full bg-current', active ? 'animate-bar' : 'scale-y-[0.35]')}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-zinc-500 dark:border-ink-600 dark:bg-ink-800 dark:text-zinc-400">
      {children}
    </kbd>
  )
}

export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
