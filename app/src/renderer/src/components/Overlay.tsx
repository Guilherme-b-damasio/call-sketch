import { PencilLine, X } from 'lucide-react'
import type { AppState } from '@shared/types'
import { api } from '../hooks'
import { Canvas } from './Canvas'
import { ModeIcon, SoundBars } from './ui'

/** Janela flutuante (sempre no topo) pra deixar em cima da call. */
export function Overlay({ state }: { state: AppState }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white/92 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-ink-900/92">
      <header className="drag flex h-9 shrink-0 items-center gap-2 border-b border-zinc-200/70 px-3 dark:border-white/6">
        <PencilLine className="size-3.5 text-accent-500" />
        {state.activeMode ? (
          <span className="flex items-center gap-1 text-xs font-medium capitalize text-zinc-600 dark:text-zinc-300">
            <ModeIcon id={state.activeMode} className="size-3" /> {state.activeMode}
          </span>
        ) : (
          <span className="text-xs font-medium text-zinc-500">Call Sketch</span>
        )}
        {state.activity === 'drawing' ? (
          <span className="shimmer-text text-[11px] font-medium">desenhando</span>
        ) : (
          !state.paused && <SoundBars className="text-emerald-500" />
        )}
        <button
          type="button"
          aria-label="Fechar janela flutuante"
          onClick={() => void api.toggleOverlay()}
          className="no-drag ml-auto grid size-6 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/8 dark:hover:text-zinc-200"
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <Canvas state={state} compact />
      </div>
    </div>
  )
}
