/** Pede ao Claude o diagrama atualizado conforme a conversa anda; troca de modo e anuncia. */
import { AUTO, type Line } from '@shared/types'
import type { LLM } from './claude'
import type { Mode } from './modes'
import { buildSystem, buildUser, parseResponse } from './prompts'
import type { Store } from './store'

export interface SketcherOptions {
  /** Intervalo minimo entre o inicio de dois desenhos, em segundos (protege o limite do plano). */
  gap: () => number
  llm: () => LLM
  modes: () => Map<string, Mode>
  onModeChange: (mode: Mode) => void
  /** Palavras faladas necessarias antes do primeiro desenho (evita desenhar um "oi" solto). */
  minWords?: number
  /** Espera depois da ultima fala antes de desenhar, pra juntar frases seguidas (ms). */
  settleMs?: number
}

const MIN_WORDS = 12
const SETTLE_MS = 1200

function words(lines: readonly Line[]): number {
  return lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0)
}

/**
 * Desenha guiado pela fala: cada frase nova agenda um desenho logo depois (com uma pequena espera
 * pra juntar frases seguidas). Se o Claude ainda esta desenhando, o proximo sai assim que ele termina.
 */
export class Sketcher {
  private drawnUpto = 0
  private drawnMode: string
  private busy = false
  private timer: NodeJS.Timeout | null = null
  private pending: boolean | null = null // null = nada pendente; true/false = forcado ou nao
  private lastStart = 0
  private running = false

  constructor(
    private readonly store: Store,
    private readonly opts: SketcherOptions,
  ) {
    this.drawnMode = store.state.activeMode
    store.on('redraw', () => this.requestNow())
    store.on('line', () => this.running && this.request(false, opts.settleMs ?? SETTLE_MS))
  }

  start(): void {
    this.running = true
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Desenha assim que possivel (botao, nota, troca de modo, erro de render). */
  requestNow(): void {
    this.request(true, 0)
  }

  private request(forced: boolean, delay: number): void {
    if (this.busy) {
      this.pending = (this.pending ?? false) || forced
      return
    }
    const wait = forced ? 0 : Math.max(delay, this.lastStart + this.opts.gap() * 1000 - Date.now())
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.tick(forced)
    }, wait)
  }

  private async tick(forced: boolean): Promise<void> {
    try {
      await this.step(forced)
    } finally {
      const next = this.pending
      this.pending = null
      if (next !== null) this.request(next, 0)
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
    this.lastStart = Date.now()
    this.store.setActivity('drawing')
    const modes = this.opts.modes()
    const epoch = this.store.resetCount
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
      if (this.store.resetCount !== epoch) return true // limparam enquanto desenhava: o desenho velho nao volta
      let [chosen, code] = parseResponse(out)
      if (s.mode !== AUTO || !chosen || !modes.has(chosen)) chosen = s.activeMode || null
      this.drawnUpto = s.lines.length
      this.store.setDiagram(code, chosen)
      console.log(`[desenho] ${chosen ?? '-'} em ${Date.now() - this.lastStart}ms (${s.lines.length} falas)`)
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
