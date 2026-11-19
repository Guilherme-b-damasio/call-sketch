/**
 * Abertura do app: o icone se monta contando o que o app faz.
 * A placa aparece, o balao fala (as barras de som mexem e soltam ondas), as ligacoes descem
 * e viram dois blocos de diagrama. Depois o icone e o nome voam para a barra de titulo.
 * Clique ou qualquer tecla pula. Com "reduzir movimento" no sistema, nem aparece.
 */
import { motion } from 'motion/react'
import { useEffect, useId } from 'react'
import { MARK, MarkDefs } from './Logo'

const TOTAL_MS = 2900 // ate comecar a sair
const SPRING = { type: 'spring', stiffness: 380, damping: 22 } as const

/** Fala: cada barra sobe e desce num ritmo proprio e para na altura do icone. */
const TALK: number[][] = [
  [0.2, 1.3, 0.5, 1.6, 0.7, 1.2, 1],
  [0.2, 0.7, 1.3, 0.5, 1.2, 0.8, 1],
  [0.2, 1.1, 0.6, 1.15, 0.45, 1.1, 1],
  [0.2, 0.6, 1.25, 0.8, 1.3, 0.6, 1],
  [0.2, 1.4, 0.8, 1.5, 0.6, 1.3, 1],
]

const STEM = 'M512 396 V500'
const LEFT = 'M512 500 H368 Q300 500 300 568 V640'
const RIGHT = 'M512 500 H656 Q724 500 724 568 V640'

const center = { transformBox: 'fill-box', transformOrigin: 'center' } as const

/** Mostra so na primeira abertura da janela (recarregar a pagina nao repete). */
export function shouldShowSplash(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (sessionStorage.getItem('cs-splash')) return false
    sessionStorage.setItem('cs-splash', '1')
  } catch {
    // sem storage: mostra assim mesmo
  }
  return true
}

export function Splash({ onDone }: { onDone: () => void }) {
  const id = useId().replace(/:/g, '')
  const { tile, pill, bars, barW, barY, boxes, box } = MARK

  useEffect(() => {
    const timer = setTimeout(onDone, TOTAL_MS)
    const skip = () => onDone()
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [onDone])

  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-zinc-50 dark:bg-ink-950"
      exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
    >
      {/* brilho violeta que acende atras */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute size-[720px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.28),transparent_62%)]"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
      />

      <div className="relative flex flex-col items-center">
        <div className="relative size-44">
          {/* ondas de som saindo enquanto o balao fala */}
          {[0.45, 0.85, 1.25].map((delay) => (
            <motion.span
              key={delay}
              aria-hidden
              className="absolute inset-0 rounded-[2.6rem] border-2 border-accent-500/50"
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0, 0.7, 0], scale: [1, 1.25, 1.7] }}
              transition={{ delay, duration: 1.1, ease: 'easeOut' }}
            />
          ))}

          <motion.div layoutId="app-logo" className="relative size-full">
            <svg viewBox="0 0 1024 1024" className="size-full overflow-visible" aria-label="Call Sketch">
              <MarkDefs id={id} />
              {/* a placa */}
              <motion.g
                style={center}
                initial={{ scale: 0.3, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ ...SPRING, delay: 0.05 }}
              >
                <rect x={tile.x} y={tile.y} width={tile.size} height={tile.size} rx={tile.r} fill={`url(#${id}-bg)`} />
                <rect x={tile.x} y={tile.y} width={tile.size} height={tile.size} rx={tile.r} fill={`url(#${id}-glow)`} />
              </motion.g>

              {/* as ligacoes descem do balao e se dividem */}
              <g fill="none" stroke="#fff" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round">
                <motion.path
                  d={STEM}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: 1.2, duration: 0.2, ease: 'easeIn' }}
                />
                {[LEFT, RIGHT].map((d) => (
                  <motion.path
                    key={d}
                    d={d}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 1.38, duration: 0.42, ease: 'easeOut' }}
                  />
                ))}
              </g>

              {/* o balao da fala */}
              <motion.rect
                x={pill.x}
                y={pill.y}
                width={pill.w}
                height={pill.h}
                rx={pill.h / 2}
                fill="#fff"
                style={center}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...SPRING, delay: 0.3 }}
              />
              {bars.map((b, i) => (
                <motion.rect
                  key={b.cx}
                  x={b.cx - barW / 2}
                  y={barY - b.h / 2}
                  width={barW}
                  height={b.h}
                  rx={barW / 2}
                  fill="#7c3aed"
                  style={center}
                  initial={{ scaleY: 0.2, opacity: 0 }}
                  animate={{ scaleY: TALK[i], opacity: 1 }}
                  transition={{
                    scaleY: { delay: 0.42, duration: 1.05, ease: 'easeInOut' },
                    opacity: { delay: 0.42, duration: 0.15 },
                  }}
                />
              ))}

              {/* os blocos do diagrama */}
              {boxes.map((b, i) => (
                <motion.rect
                  key={b.x}
                  x={b.x}
                  y={b.y}
                  width={box.w}
                  height={box.h}
                  rx={box.r}
                  fill="#fff"
                  style={center}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...SPRING, delay: 1.72 + i * 0.09 }}
                />
              ))}
            </svg>
          </motion.div>
        </div>

        <motion.span
          layoutId="app-name"
          className="mt-8 block text-4xl font-semibold tracking-tight"
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 1.95, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
        >
          Call Sketch
        </motion.span>
        <motion.span
          className="mt-2 text-sm text-zinc-500 dark:text-zinc-400"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.15, duration: 0.45, ease: 'easeOut' }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          a conversa vira diagrama
        </motion.span>
      </div>
    </motion.div>
  )
}
