/** Estado da sessao no processo principal. Avisa a interface a cada mudanca (agrupado). */
import { EventEmitter } from 'node:events'
import { AUTO, type AppState, type Check, type EngineInfo, type Line } from '@shared/types'

const MAX_LINES = 1000
const EMIT_DELAY_MS = 40

function hms(d = new Date()): string {
  return d.toTimeString().slice(0, 8)
}

export class Store extends EventEmitter<{ change: [AppState]; redraw: [] }> {
  private s: AppState
  private seq = 1_000_000 // ids das notas/validacoes (as falas usam os ids do motor)
  private timer: NodeJS.Timeout | null = null

  constructor(mode = AUTO) {
    super()
    this.s = {
      lines: [],
      checks: [],
      mermaid: '',
      version: 0,
      mode,
      activeMode: mode === AUTO ? '' : mode,
      renderError: null,
      paused: false,
      activity: 'idle',
      error: null,
      speaking: null,
      engine: { state: 'starting', msg: 'iniciando...' },
      lastDrawAt: null,
    }
  }

  get state(): Readonly<AppState> {
    return this.s
  }

  private update(patch: Partial<AppState>): void {
    this.s = { ...this.s, ...patch }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.emit('change', this.s)
      }, EMIT_DELAY_MS)
    }
  }

  addLine(line: Line): void {
    if (this.s.paused && line.who !== 'nota') return
    this.update({ lines: [...this.s.lines, line].slice(-MAX_LINES) })
  }

  addNote(text: string): void {
    this.addLine({ id: this.seq++, who: 'nota', text, t: hms(), ts: Date.now() / 1000 })
    this.emit('redraw')
  }

  removeLines(ids: number[]): void {
    const drop = new Set(ids)
    this.update({ lines: this.s.lines.filter((l) => !drop.has(l.id)) })
  }

  addChecks(items: Omit<Check, 'id' | 't'>[]): void {
    const t = hms()
    this.update({ checks: [...this.s.checks, ...items.map((c) => ({ ...c, id: this.seq++, t }))] })
  }

  setDiagram(code: string, activeMode: string | null): void {
    const changed = !!code && code !== this.s.mermaid
    this.update({
      mermaid: changed ? code : this.s.mermaid,
      version: changed ? this.s.version + 1 : this.s.version,
      activeMode: activeMode ?? this.s.activeMode,
      renderError: null,
      error: null,
      lastDrawAt: Date.now(),
    })
  }

  setMode(mode: string): void {
    this.update({ mode, activeMode: mode === AUTO ? this.s.activeMode : mode })
    this.emit('redraw')
  }

  setRenderError(err: string | null): void {
    this.update({ renderError: err })
    if (err) this.emit('redraw')
  }

  setPaused(paused: boolean): void {
    this.update({ paused })
  }

  setActivity(activity: AppState['activity']): void {
    this.update({ activity })
  }

  setError(error: string | null): void {
    this.update({ error })
  }

  setSpeaking(text: string | null): void {
    this.update({ speaking: text })
  }

  setEngine(engine: EngineInfo): void {
    this.update({ engine })
  }

  reset(): void {
    this.update({
      lines: [],
      checks: [],
      mermaid: '',
      version: this.s.version + 1,
      renderError: null,
      error: null,
      activeMode: this.s.mode === AUTO ? '' : this.s.mode,
    })
  }
}
