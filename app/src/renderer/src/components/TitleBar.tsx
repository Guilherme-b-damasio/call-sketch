import { Cpu, Eraser, Pause, PencilLine, PictureInPicture2, Play, Radio, RefreshCw, Settings, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { AppState } from '@shared/types'
import { api } from '../hooks'
import { LogoMark } from './Logo'
import { cx, IconButton, SoundBars } from './ui'

function StatusPill({ state }: { state: AppState }) {
  const { engine, paused, activity } = state
  let tone = 'text-zinc-500 dark:text-zinc-400'
  let content: React.ReactNode

  if (engine.state === 'error') {
    tone = 'text-rose-600 dark:text-rose-400'
    content = 'motor parado'
  } else if (engine.state !== 'ready') {
    content = <span className="shimmer-text">{engine.msg ?? 'iniciando...'}</span>
  } else if (paused) {
    tone = 'text-amber-600 dark:text-amber-400'
    content = (
      <>
        <Pause className="size-3" fill="currentColor" /> pausado
      </>
    )
  } else if (activity === 'drawing') {
    tone = 'text-accent-600 dark:text-accent-300'
    content = (
      <>
        <PencilLine className="size-3.5" /> <span className="shimmer-text">desenhando</span>
      </>
    )
  } else {
    tone = 'text-emerald-600 dark:text-emerald-400'
    content = (
      <>
        <SoundBars /> ouvindo
      </>
    )
  }

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={`${engine.state}-${paused}-${activity}`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.16 }}
        className={cx('inline-flex items-center gap-1.5 text-xs font-medium', tone)}
      >
        {content}
      </motion.span>
    </AnimatePresence>
  )
}

interface TitleBarProps {
  state: AppState
  brand?: boolean // falso durante a abertura: o icone e o nome chegam voando dela
  onSettings: () => void
  onSession: () => void
}

export function TitleBar({ state, brand = true, onSettings, onSession }: TitleBarProps) {
  const sharing = state.share.state === 'on' || state.share.state === 'starting'
  const device = state.engine.device
  return (
    <header className="drag flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200/80 pl-4 pr-[150px] dark:border-white/6">
      <div className="flex items-center gap-2">
        {brand ? (
          <>
            <motion.span layoutId="app-logo" className="block size-6" transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
              <LogoMark className="size-full drop-shadow-sm" />
            </motion.span>
            <motion.span
              layoutId="app-name"
              className="block text-sm font-semibold tracking-tight"
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            >
              Call Sketch
            </motion.span>
          </>
        ) : (
          <span className="invisible flex items-center gap-2" aria-hidden>
            <span className="size-6" />
            <span className="text-sm font-semibold tracking-tight">Call Sketch</span>
          </span>
        )}
      </div>

      <span className="h-4 w-px bg-zinc-200 dark:bg-white/10" />
      <StatusPill state={state} />

      {device && (
        <span
          title={device === 'gpu' ? 'Whisper rodando na placa de vídeo' : 'Whisper rodando no processador'}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400"
        >
          {device === 'gpu' ? <Zap className="size-3" /> : <Cpu className="size-3" />}
          {device}
        </span>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <IconButton
          label={state.paused ? 'Continuar' : 'Pausar'}
          shortcut="Ctrl+Shift+P"
          active={state.paused}
          onClick={() => void api.setPaused(!state.paused)}
        >
          {state.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </IconButton>
        <IconButton
          label="Redesenhar agora"
          shortcut="Ctrl+Shift+D"
          disabled={state.activity === 'drawing'}
          onClick={() => void api.redraw()}
        >
          <RefreshCw className={cx('size-4', state.activity === 'drawing' && 'animate-spin')} />
        </IconButton>
        <ClearButton empty={!state.mermaid && !state.lines.length && !state.checks.length} />
        <IconButton label="Janela flutuante" shortcut="Ctrl+Shift+O" onClick={() => void api.toggleOverlay()}>
          <PictureInPicture2 className="size-4" />
        </IconButton>
        <IconButton
          label={sharing ? `Sessão ao vivo (${state.share.viewers} assistindo)` : 'Sessão ao vivo'}
          active={sharing}
          onClick={onSession}
          className={cx('relative', sharing && '!bg-rose-500/12 !text-rose-600 dark:!text-rose-400')}
        >
          <Radio className={cx('size-4', state.share.state === 'starting' && 'animate-pulse')} />
          <AnimatePresence>
            {sharing && state.share.viewers > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white"
              >
                {state.share.viewers}
              </motion.span>
            )}
          </AnimatePresence>
        </IconButton>
        <IconButton label="Configurações" onClick={onSettings}>
          <Settings className="size-4" />
        </IconButton>
      </div>
    </header>
  )
}

/** Limpa o desenho, a conversa e as notas. Pede um segundo clique para nao apagar sem querer. */
function ClearButton({ empty }: { empty: boolean }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <IconButton
      label={armed ? 'Clique de novo para apagar o desenho e a conversa' : 'Limpar desenho e conversa'}
      disabled={empty && !armed}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        void api.reset()
      }}
      className={cx(armed && '!flex !w-auto items-center gap-1.5 !bg-rose-500/12 px-2 !text-rose-600 dark:!text-rose-400')}
    >
      <Eraser className="size-4" />
      {armed && <span className="text-xs font-medium">Limpar?</span>}
    </IconButton>
  )
}
