/** Estado da sessao no processo principal. Avisa a interface a cada mudanca (agrupado). */
import { EventEmitter } from 'node:events'
import { MAX_SPEAKER_NAME } from '@shared/speakers'
import { AUTO, type AppState, type Check, type Suggestion, type DiagramEdit, type EngineInfo, type Line, type ShareInfo, type Tab } from '@shared/types'

const MAX_LINES = 1000
const MAX_SUGGESTIONS = 30
const EMIT_DELAY_MS = 40

function hms(d = new Date()): string {
  return d.toTimeString().slice(0, 8)
}

function newTab(id: string, mode: string): Tab {
  return { id, mode, activeMode: mode === AUTO ? '' : mode, mermaid: '', layout: {}, locked: [] }
}

export class Store extends EventEmitter<{ change: [AppState]; redraw: []; line: []; diagram: [tabId: string, by: 'ia' | 'mao'] }> {
  private s: AppState
  private resets = 0
  private seq = 1_000_000 // ids das notas/validacoes (as falas usam os ids do motor)
  private timer: NodeJS.Timeout | null = null
  private tabSeq = 1

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
      share: { state: 'off', viewers: 0 },
      tabs: [newTab('t1', mode)],
      activeTab: 't1',
      layout: {},
      locked: [],
      suggestions: [],
      speakers: {},
    }
  }

  get state(): Readonly<AppState> {
    return this.s
  }

  private update(patch: Partial<AppState>): void {
    const s = { ...this.s, ...patch }
    // a aba ativa espelha os campos do topo
    s.tabs = s.tabs.map((t) =>
      t.id === s.activeTab &&
      (t.mode !== s.mode || t.activeMode !== s.activeMode || t.mermaid !== s.mermaid || t.layout !== s.layout || t.locked !== s.locked)
        ? { ...t, mode: s.mode, activeMode: s.activeMode, mermaid: s.mermaid, layout: s.layout, locked: s.locked }
        : t,
    )
    this.s = s
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
    if (line.who !== 'nota') this.emit('line') // nota ja pede redesenho na hora
  }

  addNote(text: string): void {
    this.addLine({ id: this.seq++, who: 'nota', text, t: hms(), ts: Date.now() / 1000 })
    this.emit('redraw')
  }

  removeLines(ids: number[]): void {
    const drop = new Set(ids)
    this.update({ lines: this.s.lines.filter((l) => !drop.has(l.id)) })
  }

  /** Sugestao de quem assiste. Falso = fila cheia ou repetida. */
  addSuggestion(sug: Omit<Suggestion, 't'>): boolean {
    const q = this.s.suggestions
    if (q.length >= MAX_SUGGESTIONS) return false
    if (q.some((x) => x.text.toLowerCase() === sug.text.toLowerCase())) return false
    this.update({ suggestions: [...q, { ...sug, t: hms() }] })
    return true
  }

  /** Tira da fila; aceita vira nota (a IA leva em conta no proximo desenho). */
  resolveSuggestion(id: string, accept: boolean): Suggestion | null {
    const sug = this.s.suggestions.find((x) => x.id === id)
    if (!sug) return null
    this.update({ suggestions: this.s.suggestions.filter((x) => x.id !== id) })
    if (accept) this.addNote(sug.name ? `Sugestão de ${sug.name}: ${sug.text}` : `Sugestão: ${sug.text}`)
    return sug
  }

  renameSpeaker(n: number, name: string): void {
    const speakers = { ...this.s.speakers }
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_SPEAKER_NAME)
    if (clean) speakers[n] = clean
    else delete speakers[n]
    this.update({ speakers })
  }

  clearSuggestions(): void {
    if (this.s.suggestions.length) this.update({ suggestions: [] })
  }

  addChecks(items: Omit<Check, 'id' | 't'>[]): void {
    const t = hms()
    this.update({ checks: [...this.s.checks, ...items.map((c) => ({ ...c, id: this.seq++, t }))] })
  }

  /**
   * Desenho novo. `tabId` e a aba que pediu: se a pessoa trocou de aba enquanto a IA desenhava,
   * o desenho vai para a aba certa, e nao para a que esta na tela.
   */
  setDiagram(code: string, activeMode: string | null, tabId = this.s.activeTab): void {
    if (tabId !== this.s.activeTab) {
      if (!code) return
      this.update({
        tabs: this.s.tabs.map((t) => (t.id === tabId ? { ...t, mermaid: code, activeMode: activeMode ?? t.activeMode } : t)),
        lastDrawAt: Date.now(),
      })
      this.emit('diagram', tabId, 'ia')
      return
    }
    const changed = !!code && code !== this.s.mermaid
    this.update({
      mermaid: changed ? code : this.s.mermaid,
      version: changed ? this.s.version + 1 : this.s.version,
      activeMode: activeMode ?? this.s.activeMode,
      renderError: null,
      error: null,
      lastDrawAt: Date.now(),
    })
    if (changed) this.emit('diagram', tabId, 'ia')
  }

  setMode(mode: string): void {
    this.update({ mode, activeMode: mode === AUTO ? this.s.activeMode : mode })
    this.emit('redraw')
  }

  /** Abre uma aba nova (outro diagrama da mesma conversa) e vai para ela. */
  addTab(mode: string): string {
    const id = `t${++this.tabSeq}`
    this.update({ tabs: [...this.s.tabs, newTab(id, mode)] })
    this.selectTab(id)
    return id
  }

  selectTab(id: string): void {
    const tab = this.s.tabs.find((t) => t.id === id)
    if (!tab || id === this.s.activeTab) return
    this.update({
      activeTab: id,
      mode: tab.mode,
      activeMode: tab.activeMode,
      mermaid: tab.mermaid,
      layout: tab.layout,
      locked: tab.locked,
      version: this.s.version + 1, // a tela redesenha mesmo se as duas abas tiverem a mesma versao
      renderError: null,
    })
    if (!tab.mermaid) this.emit('redraw') // aba vazia: desenha a conversa ate aqui
  }

  /** Edicao a mao (texto do diagrama, posicoes das caixas e travas). A IA desenha em cima dela. */
  editTab(edit: DiagramEdit): void {
    const tab = this.s.tabs.find((t) => t.id === edit.tabId)
    if (!tab) return
    const patch: Partial<Tab> = {}
    if (edit.mermaid !== undefined && edit.mermaid.trim() && edit.mermaid !== tab.mermaid) patch.mermaid = edit.mermaid
    if (edit.layout) patch.layout = edit.layout
    if (edit.locked) patch.locked = edit.locked
    if (!Object.keys(patch).length) return
    if (edit.tabId !== this.s.activeTab) {
      this.update({ tabs: this.s.tabs.map((t) => (t.id === edit.tabId ? { ...t, ...patch } : t)) })
    } else {
      // a versao sobe ate so com posicao nova: quem assiste a sessao recebe a arrumacao
      this.update({ ...patch, version: this.s.version + 1, renderError: null })
    }
    if (patch.mermaid || patch.layout) this.emit('diagram', edit.tabId, 'mao')
  }

  closeTab(id: string): void {
    const i = this.s.tabs.findIndex((t) => t.id === id)
    if (i < 0 || this.s.tabs.length === 1) return
    const next = this.s.tabs[i + 1] ?? this.s.tabs[i - 1]
    if (id === this.s.activeTab) this.selectTab(next.id)
    this.update({ tabs: this.s.tabs.filter((t) => t.id !== id) })
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

  setShare(share: Partial<ShareInfo>): void {
    this.update({ share: { ...this.s.share, ...share } })
  }

  /** Muda a cada limpeza: quem pediu algo a IA antes dela descarta a resposta. */
  get resetCount(): number {
    return this.resets
  }

  /** Comeca do zero: sem conversa, sem notas e so com uma aba vazia no modo atual. */
  reset(): void {
    this.resets++
    const id = `t${++this.tabSeq}`
    const activeMode = this.s.mode === AUTO ? '' : this.s.mode
    this.update({
      lines: [],
      checks: [],
      speakers: {},
      mermaid: '',
      version: this.s.version + 1,
      renderError: null,
      error: null,
      activeMode,
      tabs: [newTab(id, this.s.mode)],
      activeTab: id,
      layout: {},
      locked: [],
    })
  }
}
