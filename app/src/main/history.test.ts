import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Line } from '@shared/types'
import { History } from './history'
import { Store } from './store'

let id = 1
const line = (text: string): Line => ({ id: id++, who: 'call', text, t: '10:00:00', ts: 0 })

function setup(enabled = true) {
  const dir = mkdtempSync(join(tmpdir(), 'cs-hist-'))
  const store = new Store()
  let t = 1_700_000_000_000
  const history = new History(dir, store, () => enabled, () => (t += 1000))
  return { dir, store, history }
}

describe('historico', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('guarda cada versao do diagrama, quem fez e a conversa', async () => {
    const { store, history } = setup()
    const tab = store.state.activeTab
    store.addLine(line('o cliente chama a api'))
    store.setDiagram('flowchart TD\n A-->B', 'arquitetura')
    store.setDiagram('flowchart TD\n A-->B', 'arquitetura') // igual: nao conta
    store.editTab({ tabId: tab, mermaid: 'flowchart TD\n A-->B\n B-->C' })
    store.editTab({ tabId: tab, layout: { A: { x: 1, y: 2 } } })
    await vi.advanceTimersByTimeAsync(100)
    const [live] = history.list()
    expect(live).toMatchObject({ live: true, lines: 1, versions: 3, modes: ['arquitetura'] })
    expect(live.preview).toBe('o cliente chama a api')
    const rec = history.get(live.id)!
    expect(rec.versions.map((v) => v.by)).toEqual(['ia', 'mao', 'mao'])
    expect(rec.versions[2].layout).toEqual({ A: { x: 1, y: 2 } })
  })

  it('limpar fecha a call num arquivo e comeca outra', async () => {
    const { dir, store, history } = setup()
    store.addLine(line('primeira call'))
    store.setDiagram('flowchart TD\n A-->B', 'processo')
    await vi.advanceTimersByTimeAsync(100)
    store.reset()
    await vi.advanceTimersByTimeAsync(100)
    expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(1)
    store.addLine(line('segunda call'))
    await vi.advanceTimersByTimeAsync(4000) // grava sozinho depois de um tempinho
    const list = history.list()
    expect(list.map((c) => [c.live, c.preview])).toEqual([
      [true, 'segunda call'],
      [false, 'primeira call'],
    ])
    expect(history.get(list[1].id)?.versions).toHaveLength(1)
    history.delete(list[1].id)
    expect(history.list()).toHaveLength(1)
  })

  it('desligado nao grava nada e id estranho nao le arquivo', async () => {
    const { dir, store, history } = setup(false)
    store.addLine(line('segredo'))
    await vi.advanceTimersByTimeAsync(4000)
    history.flush()
    expect(readdirSync(dir)).toEqual([])
    expect(history.get('../../settings')).toBeNull()
  })

  it('versoes de abas diferentes ficam separadas', async () => {
    const { store, history } = setup()
    const first = store.state.activeTab
    store.setDiagram('flowchart TD\n A-->B', 'processo')
    const second = store.addTab('dados')
    store.setDiagram('erDiagram\n A ||--o{ B : tem', 'dados')
    store.setDiagram('flowchart TD\n A-->C', 'processo', first) // a IA terminou a aba que nao esta na tela
    await vi.advanceTimersByTimeAsync(100)
    const rec = history.get(history.list()[0].id)!
    expect(rec.versions.map((v) => [v.tabId, v.mode])).toEqual([
      [first, 'processo'],
      [second, 'dados'],
      [first, 'processo'],
    ])
  })
})
