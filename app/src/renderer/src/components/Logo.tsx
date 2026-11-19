/**
 * A marca do Call Sketch: a fala (balao com barras de som) se ramifica num diagrama.
 * Mesmo desenho do build/icon.svg (o icone do instalador), em coordenadas 1024x1024.
 */
import { useId } from 'react'

export const MARK = {
  tile: { x: 32, y: 32, size: 960, r: 224 },
  pill: { x: 292, y: 176, w: 440, h: 220 },
  // barras de som: centro x, altura (todas centradas em y=286)
  bars: [
    { cx: 392, h: 60 },
    { cx: 452, h: 120 },
    { cx: 512, h: 172 },
    { cx: 572, h: 120 },
    { cx: 632, h: 60 },
  ],
  barW: 36,
  barY: 286,
  links: 'M512 396 V500 M300 640 V568 Q300 500 368 500 H656 Q724 500 724 568 V640',
  boxes: [
    { x: 176, y: 640 },
    { x: 600, y: 640 },
  ],
  box: { w: 248, h: 208, r: 56 },
} as const

/** Gradiente do fundo e o brilho de cima; `id` unico por instancia. */
export function MarkDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a78bfa" />
        <stop offset="0.55" stopColor="#7c3aed" />
        <stop offset="1" stopColor="#5b21b6" />
      </linearGradient>
      <radialGradient id={`${id}-glow`} cx="0.3" cy="0.2" r="0.8">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}

/** O icone parado (barra de titulo, pagina de quem assiste). */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  const { tile, pill, bars, barW, barY, links, boxes, box } = MARK
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden>
      <MarkDefs id={id} />
      <rect x={tile.x} y={tile.y} width={tile.size} height={tile.size} rx={tile.r} fill={`url(#${id}-bg)`} />
      <rect x={tile.x} y={tile.y} width={tile.size} height={tile.size} rx={tile.r} fill={`url(#${id}-glow)`} />
      <path d={links} fill="none" stroke="#fff" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={pill.x} y={pill.y} width={pill.w} height={pill.h} rx={pill.h / 2} fill="#fff" />
      {bars.map((b) => (
        <rect key={b.cx} x={b.cx - barW / 2} y={barY - b.h / 2} width={barW} height={b.h} rx={barW / 2} fill="#7c3aed" />
      ))}
      {boxes.map((b) => (
        <rect key={b.x} x={b.x} y={b.y} width={box.w} height={box.h} rx={box.r} fill="#fff" />
      ))}
    </svg>
  )
}
