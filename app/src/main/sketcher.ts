/** Pede ao Claude o diagrama atualizado de tempos em tempos; troca de modo e anuncia. */
import { AUTO, type Line } from '@shared/types'
import type { LLM } from './claude'
import type { Mode } from './modes'
import { buildSystem, buildUser, parseResponse } from './prompts'
import type { Store } from './store'

export interface SketcherOptions {
  every: () => number // segundos
  llm: () => LLM
  modes: () => Map<string, Mode>
  onModeChange: (mode: Mode) => void
  /** Palavras faladas necessarias antes do primeiro desenho (evita desenhar um "oi" solto). */
  minWords?: number
}

const MIN_WORDS = 12

function words(lines: readonly Line[]): number {
  return lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0)
}

export class Sketcher {
  private drawnUpto = 0
  private drawnMode: string
  private busy = false
  private timer: NodeJS.Timeout | null = null
  private pending = false

  constructor(
    private readonly store: Store,
    private readonly opts: SketcherOptions,
  ) {
    this.drawnMode = store.state.activeMode
    store.on('redraw', () => this.requestNow())
  }

  start(): void {
    this.schedule()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Desenha assim que possivel (botao, nota, troca de modo, erro de render). */
  requestNow(): void {
    if (this.busy) {
      this.pending = true
      return
    }
    void this.tick(true)
  }

  private schedule(): void {
    this.stop()
    this.timer = setTimeout(() => void this.tick(false), this.opts.every() * 1000)
  }

  private async tick(forced: boolean): Promise<void> {
    try {
      await this.step(forced)
    } finally {
      if (this.pending) {
        this.pending = false
        void this.tick(true)
      } else this.schedule()
    }
  }

  /** Um ciclo. Retorna true se chamou o Claude. */
  async step(forced = false): Promise<boolean> {
    const s = this.store.state
    if (s.paused && !forced) return false
    if (s.lines.length < this.drawnUpto) this.drawnUpto = 0 // reset
    const modeChanged = s.mode !== AUTO && s.activeMode !== this.drawnMode
    const nothingNew = s.lines.length === this.drawnUpto && !forced && !s.renderError && !modeChanged
    if (!s.lines.length || nothingNew) return false
    const tooLittle = !s.mermaid && words(s.lines) < (this.opts.minWords ?? MIN_WORDS)
    if (tooLittle && !forced) return false

    this.busy = true
    this.store.setActivity('drawing')
    const modes = this.opts.modes()
    try {
      const out = await this.opts.llm().ask(
        buildSystem(modes, s.mode),
        buildUser({
          lines: s.lines.slice(-300),
          current: s.mermaid,
          activeMode: s.activeMode,
          renderError: s.renderError,
          modeChanged,
        }),
      )
      let [chosen, code] = parseResponse(out)
      if (s.mode !== AUTO || !chosen || !modes.has(chosen)) chosen = s.activeMode || null
      this.drawnUpto = s.lines.length
      this.store.setDiagram(code, chosen)
      if (s.mode === AUTO && chosen && chosen !== this.drawnMode) this.opts.onModeChange(modes.get(chosen)!)
      this.drawnMode = chosen ?? ''
    } catch (e) {
      this.store.setError(e instanceof Error ? e.message : String(e))
    } finally {
      this.busy = false
      this.store.setActivity('idle')
    }
    return true
  }
}
