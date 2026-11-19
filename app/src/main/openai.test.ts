import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'
import { makeLLM } from './claude'
import { LLMError } from './llm'
import { baseUrl, cleanAnswer, listModels, OpenAICompat } from './openai'

interface Seen {
  path: string
  auth?: string
  body: Record<string, unknown>
}

/** Servidor falso no formato da OpenAI. */
function fake(reply: (seen: Seen) => { status: number; json: unknown }): Promise<{ url: string; seen: Seen[]; server: Server }> {
  const seen: Seen[] = []
  const server = createServer((req: IncomingMessage, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const s: Seen = { path: req.url ?? '', auth: req.headers.authorization, body: raw ? JSON.parse(raw) : {} }
      seen.push(s)
      const r = reply(s)
      res.writeHead(r.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(r.json))
    })
  })
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`, seen, server })),
  )
}

const chat = (content: string) => ({ status: 200, json: { choices: [{ message: { role: 'assistant', content } }] } })

describe('IA no formato da OpenAI', () => {
  let server: Server | null = null
  afterEach(() => {
    server?.close()
    server = null
  })

  it('manda instrucoes, conversa, modelo e chave; devolve o texto', async () => {
    const f = await fake(() => chat('MODO: processo\n```mermaid\nflowchart TD\n A-->B\n```'))
    server = f.server
    const llm = new OpenAICompat(f.url, 'chave-123', 'qwen2.5:7b', 'Ollama')
    expect(llm.name).toBe('Ollama · qwen2.5:7b')
    expect(await llm.ask('sistema', 'conversa')).toContain('A-->B')
    expect(f.seen[0].path).toBe('/v1/chat/completions')
    expect(f.seen[0].auth).toBe('Bearer chave-123')
    expect(f.seen[0].body).toMatchObject({
      model: 'qwen2.5:7b',
      stream: false,
      messages: [
        { role: 'system', content: 'sistema' },
        { role: 'user', content: 'conversa' },
      ],
    })
  })

  it('sem chave nao manda Authorization (Ollama, LM Studio)', async () => {
    const f = await fake(() => chat('ok'))
    server = f.server
    await new OpenAICompat(f.url, '', 'm').ask('s', 'u')
    expect(f.seen[0].auth).toBeUndefined()
  })

  it('tira o raciocinio dos modelos que pensam alto', async () => {
    const f = await fake(() => chat('<think>hmm, um fluxo...</think>\n```mermaid\nflowchart TD\n A-->B\n```'))
    server = f.server
    expect(await new OpenAICompat(f.url, '', 'm').ask('s', 'u')).toBe('```mermaid\nflowchart TD\n A-->B\n```')
  })

  it('explica chave recusada, modelo inexistente e limite', async () => {
    for (const [status, expected] of [
      [401, /Chave recusada \(401\)\. invalid key/],
      [404, /Modelo "m" não encontrado/],
      [429, /Limite de uso/],
    ] as const) {
      const f = await fake(() => ({ status, json: { error: { message: 'invalid key' } } }))
      await expect(new OpenAICompat(f.url, 'x', 'm').ask('s', 'u')).rejects.toThrow(expected)
      f.server.close()
    }
  })

  it('servidor local fechado: diz pra abrir o Ollama', async () => {
    const f = await fake(() => chat(''))
    const url = f.url
    await new Promise((r) => f.server.close(r))
    const err = await new OpenAICompat(url, '', 'm').ask('s', 'u').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LLMError)
    expect((err as Error).message).toMatch(/Ollama\/LM Studio está aberto/)
  })

  it('resposta vazia vira erro', async () => {
    const f = await fake(() => chat('<think>so pensou</think>'))
    server = f.server
    await expect(new OpenAICompat(f.url, '', 'm').ask('s', 'u')).rejects.toThrow(/vazio/)
  })

  it('lista os modelos, sem o prefixo models/ do Gemini', async () => {
    const f = await fake(() => ({ status: 200, json: { data: [{ id: 'models/gemini-2.5-flash' }, { id: 'llama3' }, { id: 'llama3' }] } }))
    server = f.server
    expect(await listModels(f.url, 'k')).toEqual(['gemini-2.5-flash', 'llama3'])
    expect(f.seen[0].path).toBe('/v1/models')
  })
})

describe('ajustes da resposta e do endereco', () => {
  it('limpa o endereco colado de qualquer jeito', () => {
    expect(baseUrl('localhost:11434/v1/')).toBe('http://localhost:11434/v1')
    expect(baseUrl(' https://api.groq.com/openai/v1/chat/completions ')).toBe('https://api.groq.com/openai/v1')
  })

  it('tira <think> mesmo sem a abertura', () => {
    expect(cleanAnswer('pensando...</think>\nresposta')).toBe('resposta')
    expect(cleanAnswer('sem raciocinio')).toBe('sem raciocinio')
  })

  it('cria o conector certo e reclama do que falta', () => {
    const s = { ...DEFAULT_SETTINGS, backend: 'openai' as const }
    expect(makeLLM(s).name).toBe('Ollama (no seu PC) · qwen2.5:7b')
    expect(makeLLM({ ...s, llmPreset: 'custom', llmUrl: 'http://10.0.0.5:8000/v1', llmModel: 'x' }).name).toBe('10.0.0.5:8000 · x')
    expect(() => makeLLM({ ...s, llmModel: ' ' })).toThrow(/modelo/)
    expect(() => makeLLM({ ...s, llmUrl: '' })).toThrow(/endereço/)
  })
})
