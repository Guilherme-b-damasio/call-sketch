import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AUTO, DEFAULT_SETTINGS, type Line } from '@shared/types'
import type { LLM } from './claude'
import { resolveEngine } from './engine'
import { loadModes, parseMode } from './modes'
import { buildSystem, parseChecks, parseResponse } from './prompts'
import { mergePath } from './shellPath'
import { Sketcher } from './sketcher'
import { Store } from './store'

const BUILTIN = resolve(__dirname, '../../resources/modes')
const EXPECTED = ['arquitetura', 'brainstorm', 'dados', 'daily', 'decisao', 'planejamento', 'processo', 'sequencia']

let nextId = 1
const line = (who: Line['who'], text: string): Line => ({ id: nextId++, who, text, t: '10:00:00', ts: 0 })

class FakeLLM implements LLM {
  name = 'fake'
  calls: { system: string; user: string }[] = []
  constructor(public reply: string) {}
  async ask(system: string, user: string): Promise<string> {
    this.calls.push({ system, user })
    return this.reply
  }
}

function sketcher(reply: string, mode = AUTO) {
  const store = new Store(mode)
  const llm = new FakeLLM(reply)
  const announced: string[] = []
  const modes = loadModes(BUILTIN)
  const sk = new Sketcher(store, { gap: () => 0, llm: () => llm, modes: () => modes, onModeChange: (m) => announced.push(m.id), minWords: 0 })
  return { sk, store, llm, announced }
}

describe('modos', () => {
  it('carrega os modos padrao completos', () => {
    const modes = loadModes(BUILTIN)
    expect([...modes.keys()]).toEqual(EXPECTED)
    for (const m of modes.values()) expect(m.name && m.announce && m.description && m.instructions).toBeTruthy()
  })

  it('modos do usuario sobrescrevem e adicionam', () => {
    const dir = mkdtempSync(join(tmpdir(), 'modes-'))
    writeFileSync(join(dir, 'daily.md'), '---\nname: Minha Daily\nannounce: oi\ndescription: x\n---\nfaz assim')
    writeFileSync(join(dir, 'retro.md'), '---\r\nname: Retro\r\nannounce: r\r\ndescription: y\r\n---\r\nmindmap')
    const modes = loadModes(BUILTIN, dir)
    expect(modes.get('daily')?.name).toBe('Minha Daily')
    expect(modes.get('retro')?.instructions).toBe('mindmap')
  })

  it('recusa modo sem campo obrigatorio', () => {
    expect(() => parseMode('x', '---\nname: X\n---\ncorpo')).toThrow(/announce/)
  })
})

describe('prompts', () => {
  const modes = loadModes(BUILTIN)

  it('automatico lista todos os modos e pede a linha MODO', () => {
    const system = buildSystem(modes, AUTO)
    expect(system).toContain('MODO:')
    for (const id of EXPECTED) expect(system).toContain(`### ${id}`)
  })

  it('modo fixo so tem as instrucoes dele', () => {
    const system = buildSystem(modes, 'brainstorm')
    expect(system).toContain('mindmap')
    expect(system).not.toContain('erDiagram')
    expect(system).not.toContain('MODO:')
  })

  it('le modo e codigo da resposta', () => {
    expect(parseResponse('MODO: Arquitetura\n```mermaid\nflowchart LR\n  A --> B\n```')).toEqual([
      'arquitetura',
      'flowchart LR\n  A --> B',
    ])
    expect(parseResponse('flowchart TD\n A-->B')).toEqual([null, 'flowchart TD\n A-->B'])
  })

  it('le as notas do validador', () => {
    const out = 'Aqui:\n- [ERRADO] "404 e erro de servidor" -> e do cliente\nNADA\n- [DUVIDA] "x" -> conferir'
    expect(parseChecks(out)).toEqual([
      { kind: 'errado', text: '[ERRADO] "404 e erro de servidor" -> e do cliente' },
      { kind: 'duvida', text: '[DUVIDA] "x" -> conferir' },
    ])
  })
})

describe('desenhista', () => {
  it('no automatico desenha e anuncia o modo novo uma vez so', async () => {
    const { sk, store, announced } = sketcher('MODO: brainstorm\n```mermaid\nmindmap\n  root((Ideias))\n```')
    store.addLine(line('call', 'e se a gente fizesse um app de caronas'))
    await sk.step()
    expect(store.state.activeMode).toBe('brainstorm')
    expect(store.state.mermaid.startsWith('mindmap')).toBe(true)
    store.addLine(line('call', 'ou um app de entregas'))
    await sk.step()
    expect(announced).toEqual(['brainstorm'])
  })

  it('sem fala nova nao chama o Claude', async () => {
    const { sk, llm } = sketcher('x')
    expect(await sk.step()).toBe(false)
    expect(llm.calls).toHaveLength(0)
  })

  it('modo fixo ignora o modo que o Claude sugerir', async () => {
    const { sk, store, announced } = sketcher('MODO: dados\n```mermaid\nflowchart TD\n A-->B\n```', 'processo')
    store.addLine(line('call', 'primeiro valida o cpf'))
    await sk.step()
    expect(store.state.activeMode).toBe('processo')
    expect(announced).toEqual([])
  })

  it('pausado nao desenha sozinho, mas desenha quando pedem', async () => {
    const { sk, store, llm } = sketcher('```mermaid\nflowchart TD\n A-->B\n```')
    store.addLine(line('call', 'primeiro valida, depois salva'))
    store.setPaused(true)
    expect(await sk.step(false)).toBe(false)
    expect(await sk.step(true)).toBe(true)
    expect(llm.calls).toHaveLength(1)
  })

  it('limpar no meio de um desenho descarta a resposta atrasada', async () => {
    const { sk, store, llm } = sketcher('')
    let answer!: () => void
    llm.ask = async () => {
      await new Promise<void>((r) => (answer = r))
      return '```mermaid\nflowchart TD\n Velho-->Desenho\n```'
    }
    store.addLine(line('call', 'primeiro valida, depois salva'))
    const drawing = sk.step()
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
    store.reset()
    answer()
    await drawing
    expect(store.state.mermaid).toBe('')
    expect(store.state.lines).toEqual([])
  })

  it('edicao a mao enquanto a IA desenha: a resposta velha nao atropela a edicao', async () => {
    const { sk, store, llm } = sketcher('')
    let answer!: () => void
    llm.ask = async () => {
      await new Promise<void>((r) => (answer = r))
      return '```mermaid\nflowchart TD\n Velho-->Desenho\n```'
    }
    store.addLine(line('call', 'primeiro valida, depois salva'))
    const drawing = sk.step()
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
    store.editTab({ tabId: store.state.activeTab, mermaid: 'flowchart TD\n  A["Meu"] --> B["Jeito"]' })
    answer()
    await drawing
    expect(store.state.mermaid).toBe('flowchart TD\n  A["Meu"] --> B["Jeito"]')
  })

  it('posicoes e travas ficam na aba e as travas vao no pedido pra IA', async () => {
    const { sk, store, llm } = sketcher('```mermaid\nflowchart TD\n A-->B\n```')
    const tab = store.state.activeTab
    const v = store.state.version
    store.editTab({ tabId: tab, layout: { A: { x: 10, y: 20 } }, locked: ['A'] })
    expect(store.state.version).toBe(v + 1) // quem assiste recebe a arrumacao
    expect(store.state.tabs[0]).toMatchObject({ layout: { A: { x: 10, y: 20 } }, locked: ['A'] })
    store.addLine(line('call', 'o cliente chama a api e a api grava no banco'))
    await sk.step()
    expect(llm.calls[0].user).toContain('TRAVADOS pelo usuario')
    expect(llm.calls[0].user).toContain(': A')
    expect(store.state.layout).toEqual({ A: { x: 10, y: 20 } }) // desenho novo da IA nao apaga a arrumacao
    const other = store.addTab('dados')
    expect(store.state.layout).toEqual({})
    store.editTab({ tabId: tab, mermaid: 'flowchart TD\n X-->Y' }) // edita aba que nao esta na tela
    expect(store.state.mermaid).toBe('')
    store.selectTab(tab)
    expect(store.state).toMatchObject({ mermaid: 'flowchart TD\n X-->Y', locked: ['A'] })
    expect(other).not.toBe(tab)
  })

  it('cada aba guarda o seu diagrama', () => {
    const store = new Store()
    store.setDiagram('flowchart TD\n A-->B', 'processo')
    const first = store.state.activeTab
    const second = store.addTab('dados')
    expect(store.state.activeTab).toBe(second)
    expect(store.state.mermaid).toBe('')
    expect(store.state.mode).toBe('dados')
    store.setDiagram('erDiagram\n A ||--o{ B : tem', 'dados')
    store.selectTab(first)
    expect(store.state.mermaid).toBe('flowchart TD\n A-->B')
    expect(store.state.activeMode).toBe('processo')
    expect(store.state.tabs.map((t) => t.mermaid)).toEqual(['flowchart TD\n A-->B', 'erDiagram\n A ||--o{ B : tem'])
    store.closeTab(first)
    expect(store.state.tabs).toHaveLength(1)
    expect(store.state.activeTab).toBe(second)
    expect(store.state.mermaid).toContain('erDiagram')
    store.closeTab(second) // a ultima aba nao fecha
    expect(store.state.tabs).toHaveLength(1)
  })

  it('aba nova desenha a conversa inteira no modo dela', async () => {
    const { sk, store, llm } = sketcher('```mermaid\nerDiagram\n A ||--o{ B : tem\n```')
    store.addLine(line('call', 'o cliente tem varios pedidos'))
    await sk.step()
    expect(llm.calls).toHaveLength(1)
    expect(await sk.step()).toBe(false) // nada novo na mesma aba
    store.addTab('dados')
    expect(await sk.step()).toBe(true)
    expect(llm.calls[1].user).toContain('o cliente tem varios pedidos')
    expect(store.state.mermaid).toContain('erDiagram')
  })

  it('trocar de aba no meio de um desenho manda o desenho para a aba que pediu', async () => {
    const { sk, store, llm } = sketcher('')
    let answer!: () => void
    llm.ask = async () => {
      await new Promise<void>((r) => (answer = r))
      return '```mermaid\nflowchart TD\n Primeira-->Aba\n```'
    }
    store.addLine(line('call', 'primeiro valida, depois salva'))
    const first = store.state.activeTab
    const drawing = sk.step()
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
    store.addTab('dados')
    answer()
    await drawing
    expect(store.state.mermaid).toBe('') // a aba na tela continua vazia
    expect(store.state.tabs.find((t) => t.id === first)?.mermaid).toContain('Primeira-->Aba')
  })

  it('limpar volta para uma aba so', () => {
    const store = new Store()
    store.addTab('dados')
    store.addTab('processo')
    store.reset()
    expect(store.state.tabs).toHaveLength(1)
    expect(store.state.tabs[0].id).toBe(store.state.activeTab)
  })

  it('nota do usuario dispara um desenho na hora', async () => {
    const { store, llm } = sketcher('```mermaid\nflowchart TD\n A-->B\n```')
    store.addNote('desenha um fluxo')
    await vi.waitFor(() => expect(llm.calls).toHaveLength(1))
  })

  it('erro do Claude vira mensagem e nao derruba', async () => {
    const { sk, store } = sketcher('')
    vi.spyOn(FakeLLM.prototype, 'ask').mockRejectedValueOnce(new Error('Not logged in'))
    store.addLine(line('call', 'oi'))
    await sk.step()
    expect(store.state.error).toBe('Not logged in')
    expect(store.state.activity).toBe('idle')
  })

  it('so faz o primeiro desenho com conteudo suficiente', async () => {
    const store = new Store()
    const llm = new FakeLLM('MODO: processo\n```mermaid\nflowchart TD\n A-->B\n```')
    const modes = loadModes(BUILTIN)
    const sk = new Sketcher(store, { gap: () => 0, llm: () => llm, modes: () => modes, onModeChange: () => {} })
    store.addLine(line('call', 'Tchau!'))
    expect(await sk.step()).toBe(false)
    store.addLine(line('call', 'primeiro o pedido entra na fila e depois o worker processa e grava no banco'))
    expect(await sk.step()).toBe(true)
  })
})

describe('desenho guiado pela fala', () => {
  const REPLY = '```mermaid\nflowchart TD\n A-->B\n```'

  function live(gap = 0) {
    vi.useFakeTimers()
    const store = new Store()
    let release: () => void = () => {}
    const llm = new FakeLLM(REPLY)
    const ask = vi.spyOn(llm, 'ask').mockImplementation(async (system, user) => {
      llm.calls.push({ system, user })
      await new Promise<void>((r) => (release = r))
      return REPLY
    })
    const modes = loadModes(BUILTIN)
    const sk = new Sketcher(store, { gap: () => gap, llm: () => llm, modes: () => modes, onModeChange: () => {}, minWords: 0, settleMs: 1000 })
    sk.start()
    return { store, llm, ask, finish: () => release() }
  }

  it('fala nova desenha logo depois de uma pausa curta', async () => {
    const { store, llm } = live()
    store.addLine(line('call', 'o gateway chama o auth'))
    await vi.advanceTimersByTimeAsync(900)
    expect(llm.calls).toHaveLength(0)
    store.addLine(line('call', 'e depois o backend')) // junta frases seguidas
    await vi.advanceTimersByTimeAsync(1000)
    expect(llm.calls).toHaveLength(1)
    vi.useRealTimers()
  })

  it('falas durante o desenho viram um unico desenho logo em seguida', async () => {
    const { store, llm, finish } = live()
    store.addLine(line('call', 'um'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(llm.calls).toHaveLength(1)
    store.addLine(line('call', 'dois'))
    store.addLine(line('call', 'tres'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(llm.calls).toHaveLength(1) // ainda desenhando
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[1].user).toContain('tres')
    vi.useRealTimers()
  })

  it('respeita o intervalo minimo entre desenhos', async () => {
    const { store, llm, finish } = live(10)
    store.addLine(line('call', 'um'))
    await vi.advanceTimersByTimeAsync(1000)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    store.addLine(line('call', 'dois'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(llm.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(llm.calls).toHaveLength(2)
    vi.useRealTimers()
  })
})

describe('motor', () => {
  it('usa o venv do repositorio em dev', () => {
    // repositorio falso: <raiz>/app e <raiz>/engine/.venv (no CI o motor nao tem venv)
    const root = mkdtempSync(join(tmpdir(), 'cs-repo-'))
    const python = join(root, 'engine', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    mkdirSync(dirname(python), { recursive: true })
    writeFileSync(python, '')
    const cmd = resolveEngine(DEFAULT_SETTINGS, { resourcesPath: 'nada', appPath: join(root, 'app') })
    expect(cmd).toEqual({ cmd: resolve(python), args: ['-m', 'call_sketch_engine'] })
  })

  it('sem venv e sem motor empacotado avisa que nao achou', () => {
    const root = mkdtempSync(join(tmpdir(), 'cs-repo-'))
    expect(resolveEngine(DEFAULT_SETTINGS, { resourcesPath: root, appPath: join(root, 'app') })).toBeNull()
  })

  it('respeita o python configurado', () => {
    const cmd = resolveEngine({ ...DEFAULT_SETTINGS, pythonPath: 'C:/py/python.exe' }, { resourcesPath: 'x', appPath: 'y' })
    expect(cmd).toEqual({ cmd: 'C:/py/python.exe', args: ['-m', 'call_sketch_engine'] })
  })
})

describe('PATH', () => {
  it('junta sem repetir e na ordem', () => {
    const d = process.platform === 'win32' ? ';' : ':'
    expect(mergePath(`a${d}b`, `b${d}c`, undefined, `${d}a${d}d`)).toBe(['a', 'b', 'c', 'd'].join(d))
  })
})
