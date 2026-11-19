import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AUTO, DEFAULT_SETTINGS, type Line } from '@shared/types'
import type { LLM } from './claude'
import { resolveEngine } from './engine'
import { loadModes, parseMode } from './modes'
import { buildSystem, parseChecks, parseResponse } from './prompts'
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
  const sk = new Sketcher(store, { every: () => 20, llm: () => llm, modes: () => modes, onModeChange: (m) => announced.push(m.id), minWords: 0 })
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
    const sk = new Sketcher(store, { every: () => 20, llm: () => llm, modes: () => modes, onModeChange: () => {} })
    store.addLine(line('call', 'Tchau!'))
    expect(await sk.step()).toBe(false)
    store.addLine(line('call', 'primeiro o pedido entra na fila e depois o worker processa e grava no banco'))
    expect(await sk.step()).toBe(true)
  })
})

describe('motor', () => {
  it('usa o venv do repositorio em dev', () => {
    const cmd = resolveEngine(DEFAULT_SETTINGS, { resourcesPath: 'nada', appPath: resolve(__dirname, '../..') })
    expect(cmd?.args).toEqual(['-m', 'call_sketch_engine'])
  })

  it('respeita o python configurado', () => {
    const cmd = resolveEngine({ ...DEFAULT_SETTINGS, pythonPath: 'C:/py/python.exe' }, { resourcesPath: 'x', appPath: 'y' })
    expect(cmd).toEqual({ cmd: 'C:/py/python.exe', args: ['-m', 'call_sketch_engine'] })
  })
})
