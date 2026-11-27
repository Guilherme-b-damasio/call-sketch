/**
 * Historico das calls, guardado so neste PC (uma pasta com um .json por call). Cada call vai do
 * abrir (ou do Limpar) ate o proximo Limpar, com a conversa, as notas de validacao e todas as
 * versoes de cada diagrama, pra rever depois em replay.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppState, CallRecord, CallSummary, DiagramVersion } from '@shared/types'
import type { Store } from './store'

const KEEP = 100 // calls guardadas (as mais velhas saem)
const MAX_VERSIONS = 2000
const SAVE_DELAY_MS = 3000
const ID = /^[\w-]{6,64}$/

function newId(now: number): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`
}

export function summarize(r: CallRecord, live = false): CallSummary {
  const modes = [...new Set(r.versions.map((v) => v.mode).filter(Boolean))]
  const preview = r.lines
    .filter((l) => l.who !== 'nota')
    .map((l) => l.text)
    .join(' ')
    .slice(0, 140)
  return { id: r.id, startedAt: r.startedAt, endedAt: r.endedAt, lines: r.lines.length, versions: r.versions.length, modes, preview, live }
}

const hasContent = (r: CallRecord) => r.versions.length > 0 || r.lines.length > 0

export class History {
  private cur: CallRecord
  private last = new Map<string, string>() // aba -> ultima versao gravada (texto + posicoes)
  private epoch: number
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly dir: string,
    private readonly store: Store,
    private readonly enabled: () => boolean,
    private readonly now: () => number = Date.now,
  ) {
    this.epoch = store.resetCount
    this.cur = this.fresh()
    store.on('diagram', (tabId, by) => this.onDiagram(tabId, by))
    store.on('change', (s) => this.onChange(s))
  }

  private fresh(): CallRecord {
    const t = this.now()
    this.last.clear()
    return { id: newId(t), startedAt: t, endedAt: t, lines: [], checks: [], versions: [] }
  }

  private onDiagram(tabId: string, by: DiagramVersion['by']): void {
    this.rollIfReset()
    const tab = this.store.state.tabs.find((t) => t.id === tabId)
    if (!tab?.mermaid) return
    const layout = Object.keys(tab.layout).length ? tab.layout : undefined
    const key = tab.mermaid + JSON.stringify(layout ?? null)
    if (this.last.get(tabId) === key) return
    this.last.set(tabId, key)
    if (this.cur.versions.length >= MAX_VERSIONS) return
    this.cur.versions.push({ ts: this.now(), tabId, mode: tab.activeMode || tab.mode, mermaid: tab.mermaid, layout, by })
    this.touch()
  }

  private onChange(s: AppState): void {
    this.rollIfReset()
    if (s.lines === this.cur.lines && s.checks === this.cur.checks) return
    this.cur.lines = s.lines
    this.cur.checks = s.checks
    this.touch()
  }

  /** Limparam: fecha a call de agora e comeca outra. */
  private rollIfReset(): void {
    if (this.store.resetCount === this.epoch) return
    this.epoch = this.store.resetCount
    this.flush()
    this.cur = this.fresh()
  }

  private touch(): void {
    this.cur.endedAt = this.now()
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, SAVE_DELAY_MS)
  }

  /** Grava agora (ao limpar, ao sair do app). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.enabled() || !hasContent(this.cur)) return
    mkdirSync(this.dir, { recursive: true })
    const file = join(this.dir, `${this.cur.id}.json`)
    writeFileSync(`${file}.tmp`, JSON.stringify(this.cur))
    renameSync(`${file}.tmp`, file)
    this.prune()
  }

  private files(): string[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json') && ID.test(f.slice(0, -5)))
      .sort()
      .reverse() // o id comeca pela data: mais nova primeiro
  }

  private prune(): void {
    for (const f of this.files().slice(KEEP)) rmSync(join(this.dir, f), { force: true })
  }

  private read(id: string): CallRecord | null {
    if (!ID.test(id)) return null
    try {
      return JSON.parse(readFileSync(join(this.dir, `${id}.json`), 'utf-8')) as CallRecord
    } catch {
      return null
    }
  }

  list(): CallSummary[] {
    const out: CallSummary[] = []
    if (hasContent(this.cur)) out.push(summarize(this.cur, true))
    for (const f of this.files()) {
      const id = f.slice(0, -5)
      if (id === this.cur.id) continue
      const r = this.read(id)
      if (r) out.push(summarize(r))
    }
    return out
  }

  get(id: string): CallRecord | null {
    return id === this.cur.id ? structuredClone(this.cur) : this.read(id)
  }

  delete(id: string): void {
    if (!ID.test(id)) return
    rmSync(join(this.dir, `${id}.json`), { force: true })
    if (id === this.cur.id) {
      // apagar a call de agora: o que vier daqui pra frente vira outra
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.cur = this.fresh()
    }
  }
}
