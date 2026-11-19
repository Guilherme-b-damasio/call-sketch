/** Backends: o Claude Code logado de cada pessoa (assinatura), uma chave da Anthropic ou outra IA no formato da OpenAI. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { LLM_PRESETS, type Settings } from '@shared/types'
import { type LLM, LLMError } from './llm'
import { OpenAICompat } from './openai'

export { type LLM, LLMError }

/** Acha o executavel do Claude Code. No Windows o `claude` do npm e um .cmd que chama um .exe. */
export function findClaude(env: NodeJS.ProcessEnv = process.env): string | null {
  const win = process.platform === 'win32'
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    if (win) {
      const exe = join(dir, 'claude.exe')
      if (existsSync(exe)) return exe
      if (existsSync(join(dir, 'claude.cmd'))) {
        const inner = join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
        if (existsSync(inner)) return inner
      }
    } else if (existsSync(join(dir, 'claude'))) {
      return join(dir, 'claude')
    }
  }
  const home = env.USERPROFILE ?? env.HOME ?? ''
  const local = join(home, '.local', 'bin', win ? 'claude.exe' : 'claude') // instalador nativo
  return existsSync(local) ? local : null
}

export class ClaudeCLI implements LLM {
  readonly name: string
  constructor(
    private readonly bin: string,
    private readonly model: string,
  ) {
    this.name = `Claude Code · ${model}`
  }

  ask(system: string, user: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const p = spawn(
        this.bin,
        ['-p', '--model', this.model, '--system-prompt', system, '--strict-mcp-config', '--no-session-persistence'],
        { cwd: tmpdir(), windowsHide: true }, // fora de projetos: nada de CLAUDE.md alheio no contexto
      )
      let out = ''
      let err = ''
      const timer = setTimeout(() => p.kill(), 180_000)
      p.stdout.setEncoding('utf-8').on('data', (d: string) => (out += d))
      p.stderr.setEncoding('utf-8').on('data', (d: string) => (err += d))
      p.on('error', (e) => reject(new LLMError(e.message)))
      p.on('close', (code) => {
        clearTimeout(timer)
        out = out.trim()
        if (code !== 0 || out.includes('Not logged in')) {
          reject(new LLMError((out || err).trim().slice(0, 300) || `claude saiu com codigo ${code}`))
        } else resolve(out)
      })
      p.stdin.end(user, 'utf-8')
    })
  }
}

export class ClaudeAPI implements LLM {
  readonly name: string
  private readonly client: Anthropic
  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey: apiKey || undefined })
    this.name = `API · ${model}`
  }

  async ask(system: string, user: string): Promise<string> {
    try {
      const resp = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 8000,
        system,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: user }],
      })
      if (resp.stop_reason === 'refusal') throw new LLMError('o Claude recusou esse trecho')
      return resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    } catch (e) {
      if (e instanceof LLMError) throw e
      throw new LLMError(e instanceof Error ? e.message : String(e))
    }
  }
}

export function makeLLM(s: Settings): LLM {
  if (s.backend === 'openai') {
    if (!s.llmUrl.trim()) throw new LLMError('Falta o endereço da IA nas configurações.')
    if (!s.llmModel.trim()) throw new LLMError('Escolha um modelo da IA nas configurações.')
    const preset = LLM_PRESETS.find((p) => p.id === s.llmPreset && p.id !== 'custom')
    return new OpenAICompat(s.llmUrl, s.llmKey, s.llmModel.trim(), preset?.name)
  }
  if (s.backend === 'api') return new ClaudeAPI(s.apiKey, s.model.startsWith('claude-') ? s.model : 'claude-opus-5-5')
  const bin = findClaude()
  if (!bin) throw new LLMError('Claude Code nao encontrado. Instale com: npm i -g @anthropic-ai/claude-code')
  return new ClaudeCLI(bin, s.model.startsWith('claude-') ? 'sonnet' : s.model || 'sonnet')
}
